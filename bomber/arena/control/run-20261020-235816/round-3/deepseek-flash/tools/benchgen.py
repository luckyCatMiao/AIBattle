#!/usr/bin/env python3
"""Parallel match benchmark with development/lethality metrics.

Usage: benchgen.py CAND OPPONENT SEEDS NSEEDS [--seats 0,1]
Each job runs one match of up to 5 rounds; both seats are covered when
--seats 0,1 is passed, so the candidate plays each seat.
"""
import sys, os, json, itertools, argparse
from multiprocessing import Pool
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent


def play(job):
    Apath, Bpath, seed, cand_seat = job
    A = load_agent(Apath)(); B = load_agent(Bpath)()
    g = engine.Game(['A', 'B'], seed=seed)
    midstats = []   # (round, owner stats at ~55s)
    deaths = []
    evi = 0
    snap_round = None
    while g.status == 'playing':
        ws = []
        for o in range(2):
            bot = A if o == 0 else B
            try:
                r = bot.decide(make_obs(g, o))
                ins = r.get('inputs') or []
            except Exception:
                ins = []
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        g.advance_window(ws)
        for ev in g.events[evi:]:
            if ev['type'] == 'death':
                deaths.append((g.round, ev['frame'], ev['owner'], ev.get('blastOwner')))
        evi = len(g.events)
        # snapshot stats once per round after frame 1100
        if g.status == 'playing' or g.roundFrames >= 1100:
            if g.roundFrames >= 1100 and snap_round != g.round:
                snap_round = g.round
                midstats.append((g.round, tuple((f.bombs, f.blast, f.speed) for f in g.fighters)))
    cw = g.players[cand_seat]['wins']
    ow = g.players[1 - cand_seat]['wins']
    # candidate death events: owner == cand_seat
    cdeaths = sum(1 for d in deaths if d[2] == cand_seat)
    odeath = sum(1 for d in deaths if d[2] == 1 - cand_seat)
    selfkill = sum(1 for d in deaths if d[3] == d[2])
    rounds = [(r['round'], r['frames'], r['winner'], r['reason']) for r in g.roundLog]
    # midstats indexed by owner
    dev = []
    for rnd, st in midstats:
        c = st[cand_seat]
        o = st[1 - cand_seat]
        dev.append((rnd, c, o))
    return {'seed': seed, 'cand_seat': cand_seat, 'cw': cw, 'ow': ow,
            'rounds': rounds, 'cdeaths': cdeaths, 'odeaths': odeath,
            'selfkill': selfkill, 'dev': dev, 'status': g.status, 'deaths': deaths,
            'finished_winner': g.winner}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cand'); ap.add_argument('opp'); ap.add_argument('start', type=int)
    ap.add_argument('nseeds', type=int); ap.add_argument('--seats', default='0,1')
    ap.add_argument('--procs', type=int, default=8)
    ap.add_argument('--out', default=None)
    a = ap.parse_args()
    seats = [int(x) for x in a.seats.split(',')]
    jobs = []
    for i in range(a.nseeds):
        for s in seats:
            # candidate as `s`: if s==0 cand is A, else A is opponent
            if s == 0:
                jobs.append((a.cand, a.opp, a.start + i, 0))
            else:
                jobs.append((a.opp, a.cand, a.start + i, 1))
    with Pool(a.procs) as p:
        res = p.map(play, jobs)
    ser = [0, 0, 0]; rw = [0, 0]; draws = 0; cdeaths = 0; odeaths = 0; selfk = 0
    devlow = 0; devn = 0
    for r in res:
        if r['cw'] > r['ow']:
            ser[0] += 1
        elif r['cw'] < r['ow']:
            ser[1] += 1
        else:
            ser[2] += 1
        rw[0] += r['cw']; rw[1] += r['ow']
        draws += sum(1 for x in r['rounds'] if x[2] is None)
        cdeaths += r['cdeaths']; odeaths += r['odeaths']; selfk += r['selfkill']
        for rnd, c, o in r['dev']:
            devn += 1
            if c[0] + c[1] + c[2] < o[0] + o[1] + o[2] - 3:
                devlow += 1
    summary = {'jobs': len(res), 'series': ser, 'rounds': rw, 'draws': draws,
               'cdeaths': cdeaths, 'odeaths': odeaths, 'selfkills': selfk,
               'dev_low': devlow, 'dev_n': devn,
               'midsum_cand': sum(sum(c) for r in res for _, c, o in r['dev']),
               'midsum_opp': sum(sum(o) for r in res for _, c, o in r['dev'])}
    print(json.dumps(summary))
    if a.out:
        json.dump(res, open(a.out, 'w'))


if __name__ == '__main__':
    main()
