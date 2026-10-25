# -*- coding: utf-8 -*-
"""Analyze recorded match JSON (dev/rec.js): per-death context, killer ownership,
equipment, position shape, and the last few decision windows."""
import json, sys, os
W, H = 19, 17

def load(p):
    with open(p, encoding='utf-8') as f:
        return json.load(f)

def evkey(e):
    return (e.get('id'), e.get('frame'), e.get('type'), e.get('owner'), e.get('x'), e.get('y'))

def all_events(d):
    seen = set(); out = []
    for wi, s in enumerate(d['frames']):
        for e in s.get('events', []):
            k = evkey(e)
            if k in seen: continue
            seen.add(k)
            out.append((wi, e))
    return out

def exits(tiles, x, y):
    n = 0
    for dx, dy in ((0,-1),(0,1),(-1,0),(1,0)):
        nx, ny = x+dx, y+dy
        if 0 <= nx < W and 0 <= ny < H and tiles[ny*W+nx] == 0: n += 1
    return n

def cell_type(tiles, x, y):
    if not (0 <= x < W and 0 <= y < H): return 'OOB'
    return {0:'open',1:'hard',2:'soft'}.get(tiles[y*W+x], '?')

def desc_frame(s):
    out = []
    for f in s.get('fighters', []):
        out.append('P%d@(%s,%s)%s %d/%d/%d act=%d' % (
            f['owner'], f['x'], f['y'], '' if f['alive'] else 'DEAD',
            f['bombs'], f['blast'], f['speed'], f['activeBombs']))
    bombs = ','.join('P%d@(%d,%d)f%d/b%d' % (b['owner'], b['x'], b['y'], b['fuse'], b['blast']) for b in s.get('bombs', []))
    blasts = ','.join('(%d,%d)' % (c['x'], c['y']) for c in s.get('blasts', []))
    return ' | '.join(out) + '  B[' + bombs + '] F[' + blasts + ']'

def runstr(inp):
    runs = []; cur = None; n = 0
    for fr in inp:
        tok = (fr.get('dir','N') or 'N') + ('*' if fr.get('btn') == 'BOMB' else '')
        if tok == cur: n += 1
        else:
            if cur is not None: runs.append('%s%d' % (cur, n))
            cur, n = tok, 1
    if cur is not None: runs.append('%s%d' % (cur, n))
    return ' '.join(runs)

def main():
    for p in sys.argv[1:]:
        d = load(p)
        seats = [d['a'], d['b']]
        print('='*110)
        print('FILE', p, 'seed', d['seed'], 'A=', d['a'], 'B=', d['b'], 'status', d.get('status'), 'winner', d.get('winner'))
        evs = all_events(d)
        deaths = [(wi, e) for (wi, e) in evs if e.get('type') == 'death']
        expl = []
        bombplace = []
        for wi, e in evs:
            if e.get('type') == 'explode':
                expl.append((d['frames'][wi]['round'], e.get('frame'), e.get('owner'), e.get('x'), e.get('y')))
            if e.get('type') == 'bomb':
                bombplace.append((d['frames'][wi]['round'], e.get('frame'), e.get('owner'), e.get('x'), e.get('y')))
        for wi, e in deaths:
            owner = e['owner']; rf = e.get('frame')
            # death occurred during window (wi-1)'s inputs; first snapshot after it is wi.
            ctx = max(0, wi-1)
            # find the round of the death: round_frame rf. Search backwards for last snapshot of that round before wi
            rnd = None
            for j in range(wi, -1, -1):
                if d['frames'][j]['round'] == d['frames'][wi]['round']:
                    rnd = d['frames'][j]['round']; break
            # snapshots are per-round counters; identify death round by looking at the last snapshot with round_frame < rf
            rnd = d['frames'][wi]['round']
            candidates = [(rr, fr, ow, x, y) for (rr, fr, ow, x, y) in expl if abs(fr - rf) <= 12]
            # restrict to same round using frames where the explosion was first seen
            print('\n--- death O=%d(%s) at (%s,%s) round=%d round_frame=%s abs_snapshot=%d' % (
                owner, os.path.basename(str(seats[owner])) if owner < len(seats) else '?',
                e.get('x'), e.get('y'), d['frames'][wi]['round'], rf, wi))
            print('    near explodes:', candidates)
            ko = set(c[2] for c in candidates)
            print('    killer:', 'SELF' if owner in ko else ('OPPONENT' if ko else 'UNKNOWN'))
            for j in range(max(0, ctx-2), min(len(d['frames']), ctx+1)):
                sj = d['frames'][j]
                print('  [w%d tick=%s r%d tl=%.1f] %s' % (j, sj['tick'], sj['round'], sj['timeLeft'], desc_frame(sj)))
                if j < len(d['windows']):
                    for oi in range(2):
                        inp = d['windows'][j]['inputs'][oi]
                        if not inp: continue
                        note = (d['windows'][j].get('notes') or ['',''])[oi]
                        print('       s%d %-10s %s   note=%r' % (oi, os.path.basename(str(seats[oi])), runstr(inp), note))
            tiles = d['frames'][ctx]['map']['tiles']
            print('    death cell opens=%d type=%s' % (exits(tiles, e.get('x',0), e.get('y',0)), cell_type(tiles, e.get('x',0), e.get('y',0))))
        print('\nroundLog:')
        for r in d.get('roundLog', []):
            print('  R%d frames=%-5d winner=%-2s reason=%s fighters=%s' % (
                r['round'], r['frames'], str(r['winner']), r['reason'],
                [(f['owner'], f['alive'], f['bombs'], f['blast'], f['speed']) for f in r['fighters']]))

if __name__ == '__main__':
    main()
