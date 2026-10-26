#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""校准射门模型：用回放中我方的射正球（进球或被扑），以真实门将位置为起点，
在 pysim 里模拟不同门将反应模型，比较预测与实际的一致性。

用法: python -I work/shot_model.py <dir> ...
"""
import gzip
import json
import math
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))
import agent as ag  # noqa: E402

W, H = 44, 26
GOAL_CX = {0: 1.0, 1: 43.0}


def goal_cross(bx, by, ang, gx):
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = bx, by
    vx, vy = 11.0 * ux, 11.0 * uy
    for _ in range(200):
        for _s in range(4):
            px += vx * 0.05 / 4.0
            py += vy * 0.05 / 4.0
            if py < 0.22:
                py = 0.22
                vy = -vy * 0.72
            elif py > H - 0.22:
                py = H - 0.22
                vy = -vy * 0.72
            if (gx > 20 and px >= gx) or (gx < 20 and px <= gx):
                return py if 10.0 <= py <= 16.0 else None
            if px < 0.22 or px > W - 0.22:
                return None
        vx *= 0.978
        vy *= 0.978
        if abs(vx) + abs(vy) < 0.02:
            return None
    return None


def k_depth(D):
    """拟合出的 Sol 门将深度（距门中心）。"""
    if D < 6:
        return 5.1
    if D < 9:
        return 4.7
    if D < 12:
        return 4.3
    if D < 15:
        return 3.3
    if D < 18:
        return 3.1
    return 3.8


def make_shot(team, bx, by, ang, kx, ky):
    s = ag.St()
    s.n = 1
    ku = ag.Unit(1 - team, 0)
    ku.x, ku.y = kx, ky
    s.units = [ku]
    s.bx, s.by = bx, by
    s.bvx = math.cos(ang) * ag.KICKP
    s.bvy = math.sin(ang) * ag.KICKP
    s.owner = -1
    s.lastTouch = None
    s.lastTeam = team
    s.score = [0, 0]
    s.frame = 0
    s.freeze = 0
    s.golden = False
    s.goldenEnd = 0
    s.kickoffTeam = 1 - team
    s.status = 'playing'
    s.half = 1
    return s, ku


def sim(team, bx, by, ang, kx, ky, mode, maxf=160):
    gx = GOAL_CX[1 - team]
    s, ku = make_shot(team, bx, by, ang, kx, ky)
    for f in range(maxf):
        if mode == 'stay':
            tx, ty = kx, ky
        elif mode == 'line':
            D = math.hypot(s.bx - gx, s.by - 13.0)
            k = k_depth(D)
            dx, dy = s.bx - gx, s.by - 13.0
            dd = math.hypot(dx, dy) or 1.0
            tx, ty = gx + dx / dd * k, ag.clamp(13.0 + dy / dd * k, 9.2, 16.8)
        elif mode == 'track':
            tx, ty = gx + (0.9 if gx < 20 else -0.9), ag.clamp(s.by, 9.0, 17.0)
        elif mode == 'line_slow':
            D = math.hypot(s.bx - gx, s.by - 13.0)
            k = k_depth(D)
            dx, dy = s.bx - gx, s.by - 13.0
            dd = math.hypot(dx, dy) or 1.0
            tx, ty = gx + dx / dd * k, ag.clamp(13.0 + dy / dd * k, 9.2, 16.8)
            # 只移动 60% 的时间
            if f % 5 < 2:
                tx, ty = ku.x, ku.y
        d = ag.move_dir(ku, tx, ty, ku.team, forbid_box=False)
        g = ag.step(s, [(d, None, False)], s.kickoffTeam)
        if g >= 0:
            return 'goal'
        if s.owner == 0:
            return 'save'
        if s.bvx == 0 and s.bvy == 0:
            return 'dead'
    return 'timeout'


def main():
    dirs = sys.argv[1:]
    samples = []
    for dd in dirs:
        for p in pathlib.Path(dd).glob('r*-g*.json.gz'):
            try:
                d = json.load(gzip.open(str(p), 'rt', encoding='utf-8'))
            except Exception:
                continue
            seats = d['seats']
            our = seats.index('deepseek-g1')
            opp = 1 - our
            gx = GOAL_CX[opp]
            frames = d['frames']
            ev = d['final'].get('events', [])
            last = {}
            outcomes = {}
            for e in ev:
                et = e.get('type')
                if et == 'kick':
                    last[e.get('team')] = e
                elif et == 'goal':
                    team = e.get('team')
                    if e.get('ownGoal'):
                        team = 1 - team
                    lk = last.get(team)
                    if lk is not None:
                        outcomes[id(lk)] = 'goal'
                elif et == 'save' and e.get('team') == opp:
                    cand = [q for q in ev if q.get('type') == 'kick' and q.get('team') == our
                            and (q.get('t') or 0) <= (e.get('t') or 0)]
                    if cand:
                        outcomes[id(cand[-1])] = 'save'
            for e in ev:
                if e.get('type') != 'kick' or e.get('team') != our:
                    continue
                oc = outcomes.get(id(e))
                if oc is None:
                    continue
                ang, bx, by = e.get('angle'), e.get('x'), e.get('y')
                if ang is None:
                    continue
                fr = e.get('frame')
                if fr is None or fr - 1 < 0 or fr - 1 >= len(frames):
                    continue
                ry = goal_cross(bx, by, ang, gx)
                if ry is None:
                    continue
                kp = None
                for u in frames[fr - 1]['units']:
                    if u['team'] == opp and u.get('keeper'):
                        kp = (u['x'], u['y'])
                if kp is None:
                    continue
                samples.append((d['teamSize'], our, bx, by, ang, kp[0], kp[1], oc))
    print('samples', len(samples), 'goals', sum(1 for s in samples if s[-1] == 'goal'))
    for mode in ('stay', 'track', 'line', 'line_slow'):
        conf = {}
        byts = {}
        for (ts, our, bx, by, ang, kx, ky, oc) in samples:
            pr = sim(our, bx, by, ang, kx, ky, mode)
            pr = 'goal' if pr == 'goal' else 'save'
            key = (oc, pr)
            conf[key] = conf.get(key, 0) + 1
            b = byts.setdefault(ts, [0, 0])
            b[0] += 1
            b[1] += pr == oc
        acc = sum(v for (a, b), v in conf.items() if a == b) / len(samples)
        print('\n## mode', mode, 'acc=%.1f%%' % (100 * acc), conf)
        # 预测进球率 vs 实际
        pred_goal = sum(v for (a, b), v in conf.items() if b == 'goal') / len(samples)
        act_goal = sum(v for (a, b), v in conf.items() if a == 'goal') / len(samples)
        print('   pred_goal=%.1f%% actual_goal=%.1f%%' % (100 * pred_goal, 100 * act_goal))
        for ts in sorted(byts):
            print('   ts=%d n=%d acc=%.0f%%' % (ts, byts[ts][0], 100.0 * byts[ts][1] / byts[ts][0]))


if __name__ == '__main__':
    main()
