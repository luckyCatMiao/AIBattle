#!/usr/bin/env python3
"""Round-3 post-match scan: record every death with stats/positions.

Usage: round3_scan.py CAND OPP START NSEEDS [--seats 0,1] [--procs 8]
Outputs one JSON object per match to stdout and an aggregate summary to stderr.
"""
import sys, os, json, argparse
from multiprocessing import Pool
sys.path.insert(0, '/workspace')
import engine
from tools.bench import make_obs, load_agent


def play(job):
    Apath, Bpath, seed, cand_seat = job
    A = load_agent(Apath); B = load_agent(Bpath)
    a, b = A(), B()
    bots = [a, b]
    g = engine.Game(['A', 'B'], seed=seed)
    # Capture the true end-of-round state *before* end_round() resets the board
    # for the next round.  Death events are emitted in the same step that ends
    # the round, so this is also the victim's state at death.
    end_states = {}
    _orig_end = g.end_round
    def _end(winner, reason):
        end_states[g.round] = {
            'round': g.round, 'frames': g.roundFrames, 'winner': winner,
            'reason': reason,
            'stats': [(f.bombs, f.blast, f.speed) for f in g.fighters],
            'pos': [(f.x, f.y) for f in g.fighters],
            'alive': [f.alive for f in g.fighters],
        }
        return _orig_end(winner, reason)
    g.end_round = _end
    deaths = []
    evi = 0
    rounds = []
    while g.status == 'playing':
        ws = []
        for o in range(2):
            if not g.fighters[o].alive:
                ws.append([{'dir': 'N', 'btn': None}] * 20)
                continue
            try:
                r = bots[o].decide(make_obs(g, o))
                ins = r.get('inputs') or []
            except Exception:
                ins = []
            norm = [dict(x) for x in ([{'dir': 'N', 'btn': None}] * 20)]
            for i in range(min(20, len(ins))):
                norm[i] = ins[i]
            ws.append(norm)
        # Remember the round active when this window starts.
        win_round = g.round
        g.advance_window(ws)
        for ev in g.events[evi:]:
            if ev['type'] == 'death':
                v = ev['owner']
                st = end_states.get(win_round)
                if st is None or not (st['winner'] is not None or not st['alive'][v]):
                    # Normally the death is the round-ending event; fall back to
                    # the post-window state only if no end snapshot exists.
                    st = {'stats': [(f.bombs, f.blast, f.speed) for f in g.fighters],
                          'pos': [(f.x, f.y) for f in g.fighters],
                          'winner': None}
                deaths.append({
                    'round': win_round, 'frame': ev['frame'],
                    'victim': v, 'victim_is_cand': (v == cand_seat),
                    'victim_pos': [ev['x'], ev['y']],
                    'victim_stats': list(st['stats'][v]),
                    'other_pos': list(st['pos'][1 - v]) if 'pos' in st else None,
                    'other_stats': list(st['stats'][1 - v]),
                    'blast_owner': ev.get('blastOwner'),
                    'self_kill': ev.get('blastOwner') == v,
                })
        evi = len(g.events)
    for r in g.roundLog:
        st = end_states.get(r['round'], {})
        rounds.append({'round': r['round'], 'frames': r['frames'],
                       'winner': r['winner'], 'reason': r['reason'],
                       'end_stats': st.get('stats'), 'end_pos': st.get('pos'),
                       'end_alive': st.get('alive')})
    return {'seed': seed, 'cand_seat': cand_seat,
            'wins': [p['wins'] for p in g.players],
            'finished_winner': g.winner, 'rounds': rounds, 'deaths': deaths}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('cand'); ap.add_argument('opp')
    ap.add_argument('start', type=int); ap.add_argument('nseeds', type=int)
    ap.add_argument('--seats', default='0,1')
    ap.add_argument('--procs', type=int, default=8)
    ap.add_argument('--out', default=None)
    ns = ap.parse_args()
    seats = [int(x) for x in ns.seats.split(',')]
    jobs = []
    for i in range(ns.nseeds):
        for s in seats:
            if s == 0:
                jobs.append((ns.cand, ns.opp, ns.start + i, 0))
            else:
                jobs.append((ns.opp, ns.cand, ns.start + i, 1))
    with Pool(ns.procs) as p:
        res = p.map(play, jobs)
    if ns.out:
        json.dump(res, open(ns.out, 'w'), ensure_ascii=False)
    import collections
    agg = collections.Counter()
    starved = []
    for r in res:
        cw, ow = r['wins'][r['cand_seat']], r['wins'][1 - r['cand_seat']]
        agg['series_win' if cw > ow else 'series_loss' if cw < ow else 'series_draw'] += 1
        agg['round_win'] += cw
        agg['round_loss'] += ow
        agg['round_draw'] += sum(1 for x in r['rounds'] if x['winner'] is None)
        for d in r['deaths']:
            if not d['victim_is_cand']:
                continue
            agg['cand_deaths'] += 1
            if d['self_kill']:
                agg['cand_selfkills'] += 1
            s = sum(d['victim_stats'])
            if s <= 5 and d['frame'] < 2200:
                starved.append({'seed': r['seed'], 'seat': r['cand_seat'],
                                'round': d['round'], 'frame': d['frame'],
                                'pos': d['victim_pos'], 'stats': d['victim_stats'],
                                'other': d['other_stats'],
                                'other_pos': d['other_pos'],
                                'by': d['blast_owner'], 'self': d['self_kill']})
    print(json.dumps({'summary': dict(agg), 'starved_cand_deaths': starved}, ensure_ascii=False))


if __name__ == '__main__':
    main()
