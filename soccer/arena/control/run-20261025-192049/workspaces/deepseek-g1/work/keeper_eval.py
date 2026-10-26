#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""用引擎级 pysim 评估门将策略：固定回放中 Sol 射正的球，改变门将初始位置与策略。

用法: python -I work/keeper_eval.py <practice_dir> ...
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


def goal_cross_y(x, y, ang, gx):
    ux, uy = math.cos(ang), math.sin(ang)
    px, py = x, y
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


def ball_cross(st, gx):
    x, y = st.bx, st.by
    vx, vy = st.bvx, st.bvy
    for _ in range(200):
        for _s in range(4):
            x += vx * 0.05 / 4.0
            y += vy * 0.05 / 4.0
            if y < 0.22:
                y = 0.22
                vy = -vy * 0.72
            elif y > H - 0.22:
                y = H - 0.22
                vy = -vy * 0.72
            if (gx > 20 and x >= gx) or (gx < 20 and x <= gx):
                return y
        vx *= 0.978
        vy *= 0.978
        if abs(vx) + abs(vy) < 0.02:
            return None
    return None


def make_state(own_team, kx, ky, bx, by, ang):
    s = ag.St()
    s.n = 1
    u = ag.Unit(own_team, 0)
    u.x, u.y = kx, ky
    s.units = [u]
    s.bx, s.by = bx, by
    s.bvx = math.cos(ang) * ag.KICKP
    s.bvy = math.sin(ang) * ag.KICKP
    s.owner = -1
    s.lastTouch = None
    s.lastTeam = 1 - own_team
    s.score = [0, 0]
    s.frame = 0
    s.freeze = 0
    s.golden = False
    s.goldenEnd = 0
    s.kickoffTeam = 1 - own_team
    s.status = 'playing'
    s.half = 1
    return s, u


# 策略工厂：start(s0) 决定门将初始位置；target(s,u,gx) 决定每帧目标
def mk_stay(gx):
    def start(s, rec):
        return gx + (0.9 if gx < 20 else -0.9), 13.0
    def target(s, u, gx2):
        return gx + (0.9 if gx < 20 else -0.9), 13.0
    return start, target


def mk_track(gx):
    def start(s, rec):
        return gx + (0.9 if gx < 20 else -0.9), 13.0
    def target(s, u, gx2):
        return gx + (0.9 if gx < 20 else -0.9), ag.clamp(s.by, 9.2, 16.8)
    return start, target


def mk_predict(gx):
    def start(s, rec):
        return gx + (0.9 if gx < 20 else -0.9), 13.0
    def target(s, u, gx2):
        gy = ball_cross(s, gx)
        if gy is None:
            gy = 13.0 + (s.by - 13.0) * 0.2
        return gx + (0.9 if gx < 20 else -0.9), ag.clamp(gy, 9.0, 17.0)
    return start, target


def mk_predict_home(gx, hx=0.9, hy=13.0):
    def start(s, rec):
        return gx + (hx if gx < 20 else -hx), hy
    def target(s, u, gx2):
        gy = ball_cross(s, gx)
        if gy is None:
            gy = 13.0 + (s.by - 13.0) * 0.2
        return gx + (hx if gx < 20 else -hx), ag.clamp(gy, 9.0, 17.0)
    return start, target


def mk_recorded(gx):
    def start(s, rec):
        return rec
    def target(s, u, gx2):
        return ag.keeper_target(s, own_team_of(gx), s.bx, s.by)
    return start, target


def own_team_of(gx):
    return 0 if gx < 20 else 1


def mk_lineball(gx, k=1.3):
    def start(s, rec):
        return gx + (0.9 if gx < 20 else -0.9), 13.0
    def target(s, u, gx2):
        cx, cy = gx, 13.0
        dx, dy = s.bx - cx, s.by - cy
        D = math.hypot(dx, dy) or 0.01
        kk = min(k, D)
        return cx + dx / D * kk, ag.clamp(cy + dy / D * kk, 9.0, 17.0)
    return start, target


def run_policy(sample, factory, maxf=140):
    ts, own, rec_kx, rec_ky, bx, by, ang = sample
    gx = GOAL_CX[own]
    s, u = make_state(own, rec_kx, rec_ky, bx, by, ang)
    start, target = factory(gx)
    u.x, u.y = start(s, (rec_kx, rec_ky))
    for f in range(maxf):
        tx, ty = target(s, u, gx)
        d = ag.move_dir(u, tx, ty, own, forbid_box=False)
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
            gx = GOAL_CX[our]
            frames = d['frames']
            for e in d['final'].get('events', []):
                if e.get('type') != 'kick' or e.get('team') == our:
                    continue
                bx, by, ang = e.get('x'), e.get('y'), e.get('angle')
                if ang is None or bx is None:
                    continue
                if (gx > 20 and math.cos(ang) <= 0.05) or (gx < 20 and math.cos(ang) >= -0.05):
                    continue
                if goal_cross_y(bx, by, ang, gx) is None:
                    continue
                fr = e.get('frame')
                if fr is None or fr - 1 < 0 or fr - 1 >= len(frames):
                    continue
                pre = frames[fr - 1]
                kp = None
                for u2 in pre['units']:
                    if u2['team'] == our and u2.get('keeper'):
                        kp = (u2['x'], u2['y'])
                if kp is None:
                    continue
                samples.append((d['teamSize'], our, kp[0], kp[1], bx, by, ang))
    print('samples', len(samples))
    factories = {
        'recorded(current)': mk_recorded,
        'stay_line': mk_stay,
        'track_line': mk_track,
        'predict_line': mk_predict,
        'predict_home_x2': lambda gx: mk_predict_home(gx, 2.0, 13.0),
        'predict_home_x3': lambda gx: mk_predict_home(gx, 3.0, 13.0),
        'predict_home_y115': lambda gx: mk_predict_home(gx, 1.5, 11.5),
        'lineball_k13': mk_lineball,
    }
    for name, fac in factories.items():
        res = {}
        by_ts = {}
        for smp in samples:
            r = run_policy(smp, fac)
            res[r] = res.get(r, 0) + 1
            b = by_ts.setdefault(smp[0], {'n': 0, 'save': 0, 'goal': 0})
            b['n'] += 1
            b['save'] += r == 'save'
            b['goal'] += r == 'goal'
        tot = sum(res.values())
        print('\n## %-18s %s save=%.1f%% goal=%.1f%%' %
              (name, {k: v for k, v in sorted(res.items())},
               100.0 * res.get('save', 0) / tot, 100.0 * res.get('goal', 0) / tot))
        for ts in sorted(by_ts):
            b = by_ts[ts]
            print('   ts=%d n=%d save=%.0f%% goal=%.0f%%' %
                  (ts, b['n'], 100.0 * b['save'] / b['n'], 100.0 * b['goal'] / b['n']))


if __name__ == '__main__':
    main()
