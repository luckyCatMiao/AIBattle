"""HTTP transport only for real CLI requests; never creates model tasks.

Forwards request bodies untouched. Optionally drops duplicate closed-block
events and remaps reused block indices. Content text/tool arguments are not
edited. Diagnostics contain event structure only, never auth or reasoning.
"""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import threading
import time
import urllib.request
import urllib.error


class Blocks:
    def __init__(self):
        self.mapping = {}
        self.closed = set()
        self.next_index = 0

    def transform(self, event):
        kind = event.get('type')
        if kind == 'message_start':
            self.__init__()
        if kind not in ('content_block_start', 'content_block_delta', 'content_block_stop'):
            return event
        original = event['index']
        if kind == 'content_block_start':
            self.mapping[original] = self.next_index
            self.next_index += 1
            self.closed.discard(original)
        elif original in self.closed:
            # A stop/signature delta repeated after a block completed is a
            # gateway framing defect, not new model content.
            if kind == 'content_block_stop' or (event.get('delta') or {}).get('type') == 'signature_delta':
                return None
            raise ValueError('Late content-bearing delta after block close: cannot safely discard')
        if original not in self.mapping:
            raise ValueError('Delta/stop without a block start: cannot infer missing model content')
        result = dict(event, index=self.mapping[original])
        if kind == 'content_block_stop':
            self.closed.add(original)
        return result


class OrderedBlocks:
    """Keep premature stop pending until the next block/message boundary.

    Some gateways close the thinking block before its later deltas arrive.
    Delaying that close retains every content delta and restores SSE ordering.
    """
    def __init__(self):
        self.blocks = Blocks()
        self.pending = {}

    def transform(self, event):
        kind = event.get('type')
        if kind == 'content_block_stop':
            self.pending[event['index']] = event
            return []
        output = []
        if kind in ('content_block_start', 'message_delta', 'message_stop', 'message_start'):
            for stop in self.pending.values():
                fixed = self.blocks.transform(stop)
                if fixed is not None:
                    output.append(fixed)
            self.pending.clear()
        fixed = self.blocks.transform(event)
        if fixed is not None:
            output.append(fixed)
        return output


def server(base, port, log, normalize):
    guard = threading.Lock()

    def record(value):
        with guard, log.open('a', encoding='utf-8') as out:
            out.write(json.dumps(value, ensure_ascii=False) + '\n')

    class Handler(BaseHTTPRequestHandler):
        protocol_version = 'HTTP/1.0'

        def log_message(self, *args):
            pass

        def do_GET(self):
            self.forward()

        def do_POST(self):
            self.forward()

        def forward(self):
            rid = str(time.time_ns())
            body = self.rfile.read(int(self.headers.get('Content-Length', 0))) if self.command == 'POST' else None
            headers = {k: v for k, v in self.headers.items()
                       if k.lower() not in ('host', 'connection', 'accept-encoding', 'transfer-encoding')}
            headers['Accept-Encoding'] = 'identity'
            request = urllib.request.Request(base.rstrip('/') + self.path, data=body, headers=headers, method=self.command)
            try:
                upstream = urllib.request.urlopen(request)
            except urllib.error.HTTPError as error:
                upstream = error
            except Exception as error:
                record(dict(request=rid, error=type(error).__name__))
                self.send_error(502)
                return
            with upstream:
                self.send_response(upstream.status)
                content_type = upstream.headers.get('Content-Type', '')
                stream = 'text/event-stream' in content_type
                for key, value in upstream.headers.items():
                    if key.lower() not in ('connection', 'transfer-encoding', 'content-length', 'content-encoding'):
                        self.send_header(key, value)
                self.end_headers()
                if not stream:
                    self.wfile.write(upstream.read())
                    return
                blocks = OrderedBlocks()
                event_lines = []
                for raw in upstream:
                    if raw.strip():
                        event_lines.append(raw)
                        continue
                    packet = b''.join(event_lines)
                    event_lines.clear()
                    data_lines = [line[5:].strip() for line in packet.splitlines() if line.startswith(b'data:')]
                    try:
                        value = json.loads(b'\n'.join(data_lines)) if data_lines else None
                    except ValueError:
                        value = None
                    if isinstance(value, dict):
                        meta = dict(request=rid, event=value.get('type'), index=value.get('index'),
                                    block=(value.get('content_block') or {}).get('type'),
                                    delta=(value.get('delta') or {}).get('type'))
                        if normalize:
                            try:
                                fixed_events = blocks.transform(value)
                            except ValueError as error:
                                record(dict(meta, error=str(error)))
                                return  # Never manufacture or discard unknown model content.
                            meta['emitted_events'] = [item['type'] for item in fixed_events]
                            meta['emitted_indices'] = [item.get('index') for item in fixed_events]
                            record(meta)
                            if not fixed_events:
                                continue
                            packet = b'\n'.join(('event: ' + fixed['type'] + '\ndata: ' + json.dumps(fixed, ensure_ascii=False) + '\n').encode()
                                                for fixed in fixed_events)
                        else:
                            record(meta)
                    try:
                        self.wfile.write(packet + b'\n')
                        self.wfile.flush()
                    except (BrokenPipeError, ConnectionResetError):
                        return
                if event_lines:
                    record(dict(request=rid, error='unterminated SSE packet'))

    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--port', type=int, default=8899)
    parser.add_argument('--log', type=Path, required=True)
    parser.add_argument('--normalize', action='store_true')
    args = parser.parse_args()
    server(args.base, args.port, args.log, args.normalize)
