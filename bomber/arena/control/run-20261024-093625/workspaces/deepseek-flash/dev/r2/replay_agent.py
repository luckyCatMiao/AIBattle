# -*- coding: utf-8 -*-
"""Replay recorded observations through agent.py and compare its outputs with the
inputs actually recorded by the referee.  Own tool, not submitted."""
import gzip, json, os, subprocess, sys, io

BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', '..'))
AGENT = os.path.join(os.path.dirname(__file__), '..', '..', 'agent.py')


def main():
    name = sys.argv[1]
    with gzip.open(os.path.join(BASE, name + '.json.gz'), 'rt', encoding='utf-8') as f:
        d = json.load(f)
    seat = int(sys.argv[2]) if len(sys.argv) > 2 else d['seats'].index('deepseek-flash')
    frames, windows = d['frames'], d['windows']
    p = subprocess.Popen([sys.executable, '-I', os.path.abspath(AGENT), '--debug'],
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                         stderr=open(os.path.join(os.path.dirname(__file__), name + '_agent_err.txt'), 'w', encoding='utf-8'),
                         text=True, encoding='utf-8', bufsize=1)
    out_lines = []
    mismatches = 0
    for i in range(len(windows)):
        obs = dict(frames[i])
        obs['yourPlayer'] = seat
        p.stdin.write(json.dumps(obs, ensure_ascii=False) + '\n')
        p.stdin.flush()
        line = p.stdout.readline()
        try:
            res = json.loads(line)
        except Exception:
            print('BAD OUT at', i, repr(line[:200])); break
        got = [(x.get('dir'), x.get('btn')) for x in res.get('inputs', [])]
        want = [(x.get('dir'), x.get('btn')) for x in windows[i]['inputs'][seat]]
        same = got == want
        if not same:
            mismatches += 1
        out_lines.append('W%d tick=%s round=%s same=%s note=%r' % (
            i, frames[i]['tick'], frames[i]['round'], same, res.get('note')))
        if not same:
            out_lines.append('  got : ' + ' '.join('%s%s' % (a, '*' if b else '') for a, b in got))
            out_lines.append('  want: ' + ' '.join('%s%s' % (a, '*' if b else '') for a, b in want))
    p.stdin.close()
    p.wait()
    with open(os.path.join(os.path.dirname(__file__), name + '_replay.txt'), 'w', encoding='utf-8') as f:
        f.write('mismatches=%d/%d\n' % (mismatches, len(windows)))
        f.write('\n'.join(out_lines))
    print('mismatches', mismatches, 'of', len(windows))


if __name__ == '__main__':
    main()
