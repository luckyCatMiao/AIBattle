from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import mimetypes
from pathlib import Path
from urllib.parse import urlparse, unquote
import argparse
import bench

STATIC = Path(__file__).parent / 'public'


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):
        pass

    def send(self, data, status=200, mime='application/json; charset=utf-8', attachment=None):
        body = json.dumps(data, ensure_ascii=False).encode() if mime.startswith('application/json') else data
        self.send_response(status)
        self.send_header('Content-Type', mime)
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Cache-Control', 'no-store')
        self.send_header('X-Content-Type-Options', 'nosniff')
        if attachment:
            self.send_header('Content-Disposition', 'attachment; filename="' + attachment + '"')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.headers.get('Host', '').split(':')[0] not in ('127.0.0.1', 'localhost'):
            return self.send({'error': 'Local host required'}, 403)
        path = urlparse(self.path).path
        try:
            if path == '/api/config':
                return self.send({'models': bench.model_ids(), 'judge': bench.JUDGE, 'rubric': bench.RUBRIC, 'default_prompt': bench.DEFAULT_PROMPT,
                                  'profiles': {'writing': {'label': '故事与对白', 'prompt': bench.DEFAULT_PROMPT, 'rubric': bench.RUBRIC},
                                               'svg': {'label': 'SVG 绘画', 'prompt': bench.svg_task.PROMPT, 'rubric': bench.svg_task.RUBRIC}}})
            if path == '/api/runs':
                runs = []
                for p in sorted(bench.RUNS.glob('run-*/run.json'), reverse=True):
                    d = bench.load_run(p.parent.name)
                    runs.append({k: d.get(k) for k in ('id', 'title', 'created_at', 'state', 'kind')})
                    runs[-1].update(total=len(d['entries']), scored=sum(e['status'] == 'scored' for e in d['entries']))
                return self.send(runs)
            if path.startswith('/api/runs/'):
                parts = path.removeprefix('/api/runs/').split('/')
                d = bench.public_run(parts[0])
                if len(parts) == 1:
                    return self.send(d)
                if len(parts) == 2 and parts[1] == 'reference' and d.get('reference'):
                    import svg_reference
                    return self.send(svg_reference.reference_bytes(d), mime=d['reference']['media_type'])
                if len(parts) == 4 and parts[1] == 'entries':
                    entry_id = unquote(parts[2])
                    entry = next((e for e in d['entries'] if e['id'] == entry_id), None)
                    if not entry or d.get('kind') != 'svg':
                        return self.send({'error': 'Not found'}, 404)
                    folder = bench.run_path(d['id']) / 'entries' / entry_id
                    if parts[3] == 'preview.png' and entry.get('render_status') == 'ready':
                        return self.send((folder/'preview.png').read_bytes(), mime='image/png')
                    if parts[3] == 'artwork.svg' and entry.get('render_status') == 'ready':
                        return self.send((folder/'artwork.svg').read_bytes(), mime='application/octet-stream', attachment='artwork-'+entry_id.split('-')[-1]+'.svg')
                    return self.send({'error': 'Artwork is not renderable'}, 404)
                if len(parts) == 2 and parts[1] == 'report':
                    if not d['ranking_unlocked']:
                        return self.send({'error': '请先完成自己的评分并揭晓全场，再导出裁判报告'}, 403)
                    with bench.LOCK:
                        bench.report(d)
                    return self.send((bench.run_path(d['id']) / 'REPORT.md').read_bytes(), mime='text/markdown; charset=utf-8')
                return self.send({'error': 'Not found'}, 404)
            name = {'/': 'index.html', '/app.js': 'app.js', '/style.css': 'style.css'}.get(path)
            if name and (STATIC / name).is_file():
                mime = {'.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css'}[Path(name).suffix]
                return self.send((STATIC / name).read_bytes(), mime=mime + '; charset=utf-8')
            return self.send({'error': 'Not found'}, 404)
        except FileNotFoundError:
            return self.send({'error': 'Not found'}, 404)
        except (ValueError, KeyError) as exc:
            return self.send({'error': str(exc)}, 400)

    def do_POST(self):
        try:
            if self.headers.get('Host', '').split(':')[0] not in ('127.0.0.1', 'localhost'):
                return self.send({'error': 'Local host required'}, 403)
            origin = self.headers.get('Origin')
            expected = 'http://' + self.headers.get('Host', '')
            if origin and origin != expected:
                return self.send({'error': 'Origin rejected'}, 403)
            if self.headers.get('Sec-Fetch-Site') == 'cross-site':
                return self.send({'error': 'Cross-site request rejected'}, 403)
            if 'application/json' not in self.headers.get('Content-Type', ''):
                return self.send({'error': 'JSON required'}, 415)
            size = int(self.headers.get('Content-Length', 0))
            if not 0 < size <= 100000:
                return self.send({'error': 'Invalid request size'}, 400)
            body = json.loads(self.rfile.read(size))
            path = urlparse(self.path).path
            with bench.LOCK:
                if path.startswith('/api/runs/'):
                    parts = path.removeprefix('/api/runs/').split('/')
                    if len(parts) == 2 and parts[1] == 'human-grade':
                        return self.send(bench.save_human(parts[0], body.get('entry_id'), body.get('score'), body.get('note', '')))
                    if len(parts) == 2 and parts[1] == 'reveal':
                        return self.send(bench.reveal(parts[0], body.get('entry_id')))
                if bench.ACTIVE:
                    return self.send({'error': '已有一轮正在运行，请等本轮结束'}, 409)
                if path == '/api/runs':
                    if any(bench.load_run(p.parent.name)['state'] in ('queued', 'writing', 'judging') for p in bench.RUNS.glob('run-*/run.json')):
                        return self.send({'error': '已有一轮正在运行，请等本轮结束'}, 409)
                    data = bench.make_run(body.get('prompt'), body.get('title'), body.get('models'), body.get('kind', 'writing'))
                elif path.startswith('/api/runs/') and path.endswith('/resume'):
                    data = bench.load_run(path.split('/')[3])
                    for e in data['entries']:
                        if e['status'] == 'writer_failed':
                            e['status'] = 'queued'
                        elif e['status'] == 'judge_failed':
                            e['status'] = 'written'
                    bench.save_run(data)
                else:
                    return self.send({'error': 'Not found'}, 404)
                bench.start_run(data)
                return self.send({'id': data['id']}, 202)
        except (ValueError, KeyError, TypeError) as exc:
            return self.send({'error': str(exc)}, 400)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--port', type=int, default=8804)
    parser.add_argument('--start-default', action='store_true')
    parser.add_argument('--reader', action='store_true', help='Read a live run owned by another process')
    args = parser.parse_args()
    bench.initialize_credentials()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), Handler)
    # A stopped process cannot still own jobs. Make interrupted runs resumable,
    # without automatically launching paid requests on an ordinary page open.
    for saved in ([] if args.reader else bench.RUNS.glob('run-*/run.json')):
        data = bench.load_run(saved.parent.name)
        if data['state'] in ('queued', 'writing', 'judging'):
            data.update(state='error', error='服务曾中断；可继续未完成项，已完成结果会保留。')
            bench.save_run(data)
    if args.start_default:
        data = bench.make_run(bench.DEFAULT_PROMPT, '旅店等晚饭 · JRPG 队伍闲聊')
        bench.start_run(data)
        print('STARTED ' + data['id'], flush=True)
    print(f'Writing Bench http://127.0.0.1:{args.port}', flush=True)
    server.serve_forever()


if __name__ == '__main__':
    main()
