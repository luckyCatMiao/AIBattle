# -*- coding: utf-8 -*-
"""Analyze a practice/arena replay dir (r*-g*.json.gz) for our own metrics."""
import gzip, json, glob, math, os, sys

ME = 'deepseek-g1'
OPP = 'sol'

def load(path):
    return json.load(gzip.open(path, 'rt', encoding='utf-8'))

def ray_goal(me, x, y, ang, maxd=40):
    """Does the straight ray from (x,y) at ang (rad) cross the opponent goal mouth
    (|x - gx| <= maxd, y in [10.5,15.5]) before hitting a wall? crude."""
    gx = 43.0 if me == 0 else 1.0
    dx, dy = math.cos(ang), math.sin(ang)
    if abs(dx) < 1e-6:
        return False
    t = (gx - x) / dx
    if t <= 0:
        return False
    yy = y + dy * t
    dist = abs(t) * math.hypot(dx, dy)
    if dist > maxd:
        return False
    return 10.5 <= yy <= 15.5

def main():
    d = sys.argv[1]
    files = sorted(glob.glob(os.path.join(d, 'r*-g*.json.gz')),
                   key=lambda p: (int(os.path.basename(p).split('-')[0][1:]), int(os.path.basename(p).split('-')[1][1:].split('.')[0])))
    agg = []
    for p in files:
        r = load(p)
        seats = r['seats']
        n = r['teamSize']
        names = r['names']
        # team index of ME
        mi = seats.index(ME) if ME in seats else None
        if mi is None:
            continue
        oi = 1 - mi
        me = mi
        fx = r['frames']
        # possession / thirds
        pos = [0, 0]; third = [[0,0,0],[0,0,0]]   # third 0=own(defensive) 1=mid 2=attacking, per team's attack dir
        own_keeper_frames = 0; maxk = 0; curk = 0
        boxes = [0,0]
        for f in fx:
            b = f['ball']; ow = b.get('owner')
            if ow:
                team = int(ow[1])
                pos[team] += 1
                a = 1 if team == 0 else -1
                x = b['x']
                # own goal is at 1 if team 0, 43 if team1; attack toward opp
                if team == 0:
                    th = 0 if x < 15.67 else (1 if x < 29.33 else 2)
                else:
                    th = 0 if x > 28.33 else (1 if x < 15.67 else 2)
                    th = 0 if x > 28.33 else (1 if x >= 15.67 else 2)
                third[team][th] += 1
                if ow.endswith('u0'):
                    idx = int(ow[3])
                    if idx == 0 and ((team == 0 and x < 10) or (team == 1 and x > 34)):
                        own_keeper_frames += 1
                        curk += 1
                        maxk = max(maxk, curk)
                    else:
                        curk = 0
                else:
                    curk = 0
            else:
                curk = 0
        # kicks
        kicks = [e for e in r['events'] if e['type'] == 'kick']
        shots = [e for e in kicks if ray_goal(e['team'], e['x'], e['y'], e['angle'])]
        goals = [e for e in r['events'] if e['type'] == 'goal']
        saves = [e for e in r['events'] if e['type'] == 'save']
        tackles = [e for e in r['events'] if e['type'] == 'tackle']
        score = r['scores']
        row = dict(game=os.path.basename(p), n=n, seat=mi, score=(score[seats[mi]], score[seats[oi]]),
                   poss=tuple(pos), third=(tuple(third[me]), tuple(third[oi])),
                   kicks=(sum(1 for e in kicks if e['team']==me), sum(1 for e in kicks if e['team']==oi)),
                   shots=(sum(1 for e in shots if e['team']==me), sum(1 for e in shots if e['team']==oi)),
                   goals=(sum(1 for e in goals if e['team']==me), sum(1 for e in goals if e['team']==oi)),
                   saves=(sum(1 for e in saves if e['team']==me), sum(1 for e in saves if e['team']==oi)),
                   tackles=(sum(1 for e in tackles if e['team']==me), sum(1 for e in tackles if e['team']==oi)),
                   keeper_poss=own_keeper_frames, keeper_maxrun=maxk, frames=len(fx),
                   winner=r['winner'])
        agg.append(row)
        print(json.dumps(row, ensure_ascii=False))
    print('--- totals')
    tot = lambda k, i: sum(a[k][i] for a in agg)
    print('games', len(agg), 'wins', sum(1 for a in agg if a['winner']==a['seat']),
          'draws', sum(1 for a in agg if a['winner'] is None),
          'losses', sum(1 for a in agg if a['winner'] is not None and a['winner']!=a['seat']))
    print('score', sum(a['score'][0] for a in agg), sum(a['score'][1] for a in agg))
    print('poss', tot('poss',0), tot('poss',1))
    print('kicks', tot('kicks',0), tot('kicks',1))
    print('shots', tot('shots',0), tot('shots',1))
    print('goals', tot('goals',0), tot('goals',1))
    print('saves', tot('saves',0), tot('saves',1))
    print('tackles', tot('tackles',0), tot('tackles',1))
    for i,a in enumerate(agg):
        print(i, a['game'], a['n'], 'seat', a['seat'], a['score'], 'poss', a['poss'], 'third_us', a['third'][0], 'k', a['kicks'], 'sh', a['shots'], 'sv', a['saves'], 'tk', a['tackles'], 'kpr', a['keeper_poss'], a['keeper_maxrun'])

if __name__ == '__main__':
    main()
