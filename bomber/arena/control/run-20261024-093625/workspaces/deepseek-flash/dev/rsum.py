# -*- coding: utf-8 -*-
"""Summarize rounds of a recorded match: duration, deaths, equipment curves, distance.
usage: python -I dev/rsum.py dev/rec/x.json"""
import json, sys, os
W, H = 19, 17

def main():
    for p in sys.argv[1:]:
        d = json.load(open(p, encoding='utf-8'))
        frames = d['frames']
        print('=' * 100)
        print(p, 'winner', d.get('winner'), 'rounds', len(d.get('roundLog', [])))
        for r in d.get('roundLog', []):
            print(' R%d frames=%d (%.1fs) winner=%s reason=%s' % (
                r['round'], r['frames'], r['frames'] / 20.0, r['winner'], r['reason']))
        # group frames by round (frames snapshot indices)
        rounds = {}
        for i, s in enumerate(frames):
            rounds.setdefault(s['round'], []).append(i)
        for rnd, idxs in sorted(rounds.items()):
            if len(idxs) < 20:
                continue
            print('--- round %d, %d snapshots' % (rnd, len(idxs)))
            # sample every ~10s (200 frames = 10 snapshots)
            for k in range(0, len(idxs), 10):
                i = idxs[k]
                s = frames[i]
                fs = s['fighters']
                if len(fs) < 2:
                    continue
                a, b = fs[0], fs[1]
                dist = abs(a['x'] - b['x']) + abs(a['y'] - b['y'])
                print('  t=%5.1fs P0@(%2d,%2d)%s %d/%d/%d act%d | P1@(%2d,%2d)%s %d/%d/%d act%d  d=%2d bombs=%d drops=%d' % (
                    s['tick'] / 20.0, a['x'], a['y'], '' if a['alive'] else 'X', a['bombs'], a['blast'], a['speed'], a['activeBombs'],
                    b['x'], b['y'], '' if b['alive'] else 'X', b['bombs'], b['blast'], b['speed'], b['activeBombs'],
                    dist, len(s.get('bombs', [])), len(s.get('drops', []))))

if __name__ == '__main__':
    main()
