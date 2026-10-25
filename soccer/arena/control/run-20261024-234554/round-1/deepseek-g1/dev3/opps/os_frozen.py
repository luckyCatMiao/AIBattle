# -*- coding: utf-8 -*-
"""自测用「搜索型」对手：在 agent_core 的候选动作集上用 pysim 做 1 窗口 rollout 选择。
   结构与「用官方引擎做 50 帧 rollout」的 Sol 类似，用来压力测试 agent_core。
   仅用于离线对局，不参与提交。"""
import os
import sys
import math
import json

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
sys.path.insert(0, HERE)
import pysim
import ac_frozen as AC


def obs_from_state(s, me, meta):
    units = []
    for u in s.units:
        units.append({'id': 't%du%d' % (u.team, u.index), 'team': u.team, 'index': u.index,
                      'x': round(u.x, 3), 'y': round(u.y, 3),
                      'facing': {'x': round(u.fx, 3), 'y': round(u.fy, 3)},
                      'kickCd': round(u.kickCd / 20.0, 3), 'controlLock': round(u.controlLock / 20.0, 3),
                      'hasBall': s.owner >= 0 and s.units[s.owner] is u, 'keeper': u.index == 0})
    owner = None
    if s.owner >= 0:
        ou = s.units[s.owner]
        owner = 't%du%d' % (ou.team, ou.index)
    ball = {'x': round(s.bx, 3), 'y': round(s.by, 3), 'vx': round(s.bvx, 3), 'vy': round(s.bvy, 3), 'owner': owner}
    return {'yourTeam': me, 'teamSize': s.n, 'units': units, 'ball': ball,
            'score': list(s.score), 'timeLeft': meta.get('timeLeft', 60.0),
            'golden': meta.get('golden', False), 'half': meta.get('half', 1),
            'freeze': 0.0, 'frame': meta.get('frame', 0)}


def to_frames(inp, s):
    out = []
    src = inp['inputs'] if isinstance(inp, dict) else inp
    for f in range(20):
        fr = [None] * len(s.units)
        for idx, u in enumerate(s.units):
            d = src[f][u.index]
            a = d.get('aim')
            if isinstance(a, (int, float)):
                r = a * math.pi / 180.0
                a = (math.cos(r), math.sin(r))
            elif isinstance(a, str):
                a = pysim.DIRV.get(a)
            else:
                a = None
            fr[idx] = (d.get('dir') or 'N', a, bool(d.get('kick')))
        out.append(fr)
    return out


def rollout(s0, framesA, framesB, me, horizon=26):
    s = s0.clone()
    my_g = opp_g = 0
    neutral = ('N', None, False)
    for f in range(horizon):
        inp = [None] * len(s.units)
        for idx, u in enumerate(s.units):
            src = framesA if u.team == me else framesB
            inp[idx] = src[f][u.index] if f < len(src) else neutral
        g = pysim.step(s, inp, 0)
        if g >= 0:
            if g == me:
                my_g += 1
            else:
                opp_g += 1
            break
    return s, my_g, opp_g


def shap(s, me):
    sg = 1.0 if me == 0 else -1.0
    GL = 43.0 if me == 0 else 1.0
    opps = [(u.x, u.y, 0.0, 0.0) for u in s.units if u.team != me]
    mine = [(u.x, u.y, 0.0, 0.0) for u in s.units if u.team == me]
    v = 0.0
    v += (s.bx - 22.0) * sg * 0.55
    own = s.owner
    if own >= 0 and s.units[own].team == me:
        v += 3.0
    elif own >= 0:
        v -= 3.0
    # 我能不能射、对手能不能射
    sh = AC.best_shot((s.bx, s.by), GL, mine, react_t=0.8, ty_grid=AC._TY_FINE, trust=0.5)
    if sh is not None:
        v += 2.5 + min(sh[1], 3.0)
    ol = 1.0 if me == 0 else 43.0
    op_sh = AC.best_shot((s.bx, s.by), ol, opps, react_t=0.8, ty_grid=AC._TY_FINE, trust=0.5)
    if op_sh is not None:
        v -= 3.5 + min(op_sh[1], 3.0)
    return v


def decide(obs, meta=None):
    me = int(obs.get('yourTeam', 0))
    n = int(obs.get('teamSize', 3))
    meta = meta or {}
    s0 = pysim.state_from_obs(obs)
    base = AC.decide(obs)
    baseA = to_frames(base, s0)
    opp_obs = obs_from_state(s0, 1 - me, meta)
    oppA = to_frames(AC.decide(opp_obs), s0)

    cands = [(base, baseA)]
    # 射门候选：持球者第 0 帧起脚，改不同落点
    oid = obs['ball'].get('owner')
    mine = [u for u in obs['units'] if int(u['team']) == me]
    carrier = next((u for u in mine if u['id'] == oid), None)
    if carrier is not None:
        GL = 43.0 if me == 0 else 1.0
        bx = float(obs['ball']['x'])
        by = float(obs['ball']['y'])
        ci = int(carrier['index'])
        for ty in (10.7, 11.4, 12.1, 12.8, 13.4, 14.1, 14.8, 15.3):
            deg = AC.ang_deg(bx, by, GL, ty)
            inp = json.loads(json.dumps(base))
            inp['inputs'][0][ci] = {'dir': 'N', 'aim': deg, 'kick': True}
            cands.append((inp, to_frames(inp, s0)))
        # 传球候选
        sg = 1.0 if me == 0 else -1.0
        opps = [(u.x, u.y, 0.0, 0.0) for u in s0.units if u.team != me]
        mates = [(int(u['index']), (float(u['x']), float(u['y']))) for u in mine if u['index'] != carrier['index']]
        try:
            opts = AC.pass_options((float(carrier['x']), float(carrier['y'])), mates, opps, GL, sg, da_step=10, da_max=40)
        except Exception:
            opts = []
        for o in opts[:5]:
            inp = json.loads(json.dumps(base))
            inp['inputs'][0][ci] = {'dir': 'N', 'aim': o['pass_deg'], 'kick': True}
            if o.get('shot') is not None:
                inp['inputs'][o['recv_frame']][o['mate']] = {'dir': 'N', 'aim': o['shot'][3], 'kick': True}
            cands.append((inp, to_frames(inp, s0)))

    best = None
    for inp, A in cands:
        s1, mg, og = rollout(s0, A, oppA, me)
        v = 100.0 * (mg - og) + shap(s1, me)
        if best is None or v > best[0]:
            best = (v, inp)
    return best[1]


def main():
    last_n = 3
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
            last_n = int(obs.get('teamSize', last_n))
            out = decide(obs, {'timeLeft': obs.get('timeLeft'), 'golden': obs.get('golden'),
                               'half': obs.get('half'), 'frame': obs.get('frame')})
        except Exception as e:
            sys.stderr.write('ERR %s\n' % e)
            out = AC.neutral(last_n)
        sys.stdout.write(json.dumps(out, separators=(',', ':')) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
