#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""离线探针：复现某个窗口的搜索决策，并前向验证“搜到的方案”是否真能存活。"""
import sys, os, json, io, math
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent as A

def make_obs(seed, rnd, t0, runners, monsters=None):
    lvl_seed = seed * 131 + rnd * 977
    gen = A.generate_level(lvl_seed)
    w = gen['w']
    obs = {
        'seed': seed, 'round': rnd, 'time': t0, 'yourPlayer': 1,
        'level': {'width': w, 'height': A.H, 'goalX': gen['goalX'], 'startX': gen['startX'],
                  'tiles': gen['tiles']},
        'platforms': [], 'plants': [], 'saws': [],
        'monsters': monsters or [], 'crumbling': [], 'gone': [],
        'runners': runners,
    }
    for pf in gen['platforms']:
        r = A.platform_rect(pf, t0, t0)
        obs['platforms'].append({'x': round(r['x'], 2), 'y': round(r['y'], 2), 'w': pf['w'], 'h': pf['h'], 'dx': 0})
    for pl in gen['plants']:
        obs['plants'].append({'x': round(pl['x'], 2), 'y': pl['y'], 'height': round(A.plant_height(pl, t0), 2),
                              'period': pl['period'], 'phase': round(pl['phase'], 2)})
    for s in gen['saws']:
        p = A.saw_pos(s, t0)
        obs['saws'].append({'x': round(p[0], 2), 'y': round(p[1], 2), 'r': A.SAW_R})
    return obs, gen

def search_air_full(geom, fds, start, init, horizon, mask, beam=600):
    """agent.search_survive_air 的副本，但返回完整动作序列。"""
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, (), x)]
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        nxt = {}
        for (sx, sy, svx, svy, sog, acts, mx) in states:
            moves = (1.0,) if sog else (1.0, 0.0, -1.0)
            opts = (0, 1) if sog else (0,)
            for mv in moves:
                for jump in opts:
                    r = A.step_player(sx, sy, svx, svy, sog, mv, jump, geom, prects, gone)
                    if r is None:
                        continue
                    if A.hazard_hit(r[0], r[1], geom, fd, mask):
                        continue
                    key = A._key(r[0], r[1], r[2], r[3], r[4])
                    old = nxt.get(key)
                    nmx = mx if mx > r[0] else r[0]
                    if old is not None and old[6] >= nmx:
                        continue
                    na = acts + ((mv, jump),)
                    nxt[key] = (r[0], r[1], r[2], r[3], r[4], na, nmx)
        states = list(nxt.values())
        if not states:
            return None
        if len(states) > beam:
            states.sort(key=lambda s: (s[6], s[0]), reverse=True)
            states = states[:beam]
    best = max(states, key=lambda s: (s[6], s[0]))
    return best



def search_wait_full(geom, fds, start, init, horizon, mask, beam=420):
    x, y, vx, vy, og = init
    states = [(x, y, vx, vy, og, (), x)]
    for k in range(horizon):
        fd = fds[start + k]
        prects = fd['prects']; gone = fd['gone']
        nxt = {}
        for (sx, sy, svx, svy, sog, acts, mx) in states:
            for mv in (1.0, 0.0, -1.0):
                for jump in ((0, 1) if sog else (0,)):
                    r = A.step_player(sx, sy, svx, svy, sog, mv, jump, geom, prects, gone)
                    if r is None or A.hazard_hit(r[0], r[1], geom, fd, mask):
                        continue
                    key = A._key(r[0], r[1], r[2], r[3], r[4])
                    old = nxt.get(key)
                    nmx = mx if mx > r[0] else r[0]
                    if old is not None and old[6] >= nmx:
                        continue
                    nxt[key] = (r[0], r[1], r[2], r[3], r[4], acts + ((mv, jump),), nmx)
        states = list(nxt.values())
        if not states:
            return None
        if len(states) > beam:
            states.sort(key=lambda s: (s[6], s[0]), reverse=True)
            states = states[:beam]
    return max(states, key=lambda s: (s[0], 1 if s[4] else 0, s[2]))

def simulate(geom, fds, state, acts):
    x, y, vx, vy, og = state
    traj = []
    for i, (m, j) in enumerate(acts):
        fd = fds[i]
        r = A.step_player(x, y, vx, vy, og, float(m), 1 if j else 0, geom, fd['prects'], fd['gone'])
        if r is None:
            return traj, ('FALL', i)
        x, y, vx, vy, og = r
        if A.hazard_hit(x, y, geom, fd, None):
            return traj, ('HAZ', i)
        traj.append((round(x, 3), round(y, 3), round(vx, 2), round(vy, 2), og))
    return traj, None

if __name__ == '__main__':
    seed = int(sys.argv[1]); rnd = int(sys.argv[2]); t0 = float(sys.argv[3])
    x = float(sys.argv[4]); y = float(sys.argv[5]); vx = float(sys.argv[6]); vy = float(sys.argv[7]); og = sys.argv[8] == '1'
    runners = [{'id': 'p0', 'x': 0, 'y': 3, 'vx': 6.8, 'vy': 0, 'onGround': True, 'facing': 1, 'invuln': 0, 'deaths': 0, 'finished': False, 'maxX': 0},
               {'id': 'p1', 'x': x, 'y': y, 'vx': vx, 'vy': vy, 'onGround': og, 'facing': 1, 'invuln': 0, 'deaths': 0, 'finished': False, 'maxX': x}]
    obs, gen = make_obs(seed, rnd, t0, runners)
    ctx = A.reset_ctx(obs)
    geom = ctx['geom']
    fds, mask = A.build_frame_data(ctx, obs, t0, 200)
    init = (x, y, vx, vy, og)
    for name, fn, args in [
        ('survive40', A.search_survive, (geom, fds, 0, init, 40, mask)),
        ('air34', A.search_survive_air, (geom, fds, 0, init, 34, mask)),
        ('air26', A.search_survive_air, (geom, fds, 0, init, 26, mask)),
    ]:
        st = fn(*args)
        if st is None:
            print(name, 'None')
            continue
        if name == 'survive40':
            acts = [(1.0, bool(j)) for j in st[5]]
        else:
            acts = [(float(m), bool(j)) for (m, j) in st]
        traj, fail = simulate(geom, fds, init, acts)
        print(name, 'acts', acts, 'simfail', fail, 'end', traj[-1] if traj else None)
    full = search_air_full(geom, fds, 0, init, 34, mask)
    print('air34_full acts', full[5])
    traj, fail = simulate(geom, fds, init, [(float(m), bool(j)) for (m, j) in full[5]])
    print('air34_full simfail', fail, 'end', traj[-1] if traj else None)
