"""Transport only. Does not find, score, suggest, or select any move."""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--url', default='http://127.0.0.1:8787')
parser.add_argument('--token', required=True)
subs = parser.add_subparsers(dest='command', required=True)
observe = subs.add_parser('observe')
observe.add_argument('--wait', type=float, default=0)
move = subs.add_parser('move')
move.add_argument('--match', required=True)
move.add_argument('--ply', type=int, required=True)
move.add_argument('--at', required=True, help='A1..O15')
move.add_argument('--note', default='')
args = parser.parse_args()

def request(route, body=None):
    raw = None if body is None else json.dumps(body).encode('utf-8')
    req = urllib.request.Request(args.url + route, data=raw, headers={
        'Authorization': 'Bearer ' + args.token, 'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as response:
        return json.load(response)

try:
    if args.command == 'observe':
        deadline = time.monotonic() + min(max(args.wait, 0), 25)
        while True:
            result = request('/api/agent/state')
            if result['yourTurn'] or result['seriesStatus'] == 'finished' or result['status'] == 'finished' or time.monotonic() >= deadline:
                break
            time.sleep(1)
        # The board array duplicates the ASCII board. Omit it to keep context small.
        del result['board']
        result['moves'] = ' '.join(f"{m['ply']}:{m['coordinate']}" for m in result['moves'])
        print(json.dumps(result, ensure_ascii=False, indent=2))
    else:
        cell = args.at.upper()
        if len(cell) < 2 or cell[0] not in 'ABCDEFGHIJKLMNO' or not cell[1:].isdigit() or not 1 <= int(cell[1:]) <= 15:
            raise ValueError('Use A1..O15')
        result = request('/api/move', {'matchId': args.match, 'ply': args.ply,
            'x': ord(cell[0]) - 65, 'y': int(cell[1:]) - 1, 'note': args.note})
        print(json.dumps(result, ensure_ascii=False))
except urllib.error.HTTPError as e:
    print(e.read().decode('utf-8'), file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(str(e), file=sys.stderr)
    sys.exit(1)
