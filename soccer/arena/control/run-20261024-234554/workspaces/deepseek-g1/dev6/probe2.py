# -*- coding: utf-8 -*-
"""打印持球人 8 方向评分 + 射门点选择。"""
import sys, os, json, gzip, math
HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, HERE)
import agent as A

def load(p):
    return json.load(gzip.open(p,'rt',encoding='utf-8')) if p.endswith('.gz') else json.load(open(p,encoding='utf-8'))

d = load(sys.argv[1]); me = d['seats'].index('deepseek-g1')
frames = [int(x) for x in sys.argv[2].split(',')]
for fno in frames:
    obs = d['frames'][fno]; st = A.state_from_obs(obs)
    owner = st.units[st.owner] if st.owner >= 0 else None
    print('=== f%d ball(%.1f,%.1f) owner=%s' % (fno, st.bx, st.by, None if owner is None else (owner.team, owner.index)))
    opp = [u for u in st.units if u.team != me]
    gx = A.OPP_GOAL_X[me]
    A.GAME_CTX['kreact'] = A.KREACT_SMALL if st.n <= A.EKK_NMAX else A.KREACT
    if owner is None or owner.team != me:
        print('   (not our carrier)')
        continue
    u = owner
    spot = A.best_shoot_spot(st, me, u, opp)
    print('   carrier (%.1f,%.1f) distGoal=%.1f  spot=%s  pot_now=%.3f' % (
        u.x, u.y, math.hypot(u.x-gx, u.y-13), None if spot is None else (round(spot[1],1), round(spot[2],1), round(spot[3],2)),
        A.shot_potential(u.x, u.y, opp, me)))
    sh = A.best_shot_at(u.x, u.y, opp, me)
    print('   best_shot=%s' % (None if sh is None else (round(sh[1],2), round(sh[2],1), round(sh[3],1))))
    for name in A.DIR8 + ('N',):
        px, py = A.sim_pos(u.x, u.y, name, 8, A.SPD * A.DRIBF, me)
        px, py = A.safe_spot(me, px, py, 0.55)
        pot = A.shot_potential(px, py, opp, me)
        vx, vy = A.DIR_VEC[name]
        danger = 0.0
        for o in opp:
            rx, ry = o.x - px, o.y - py
            dd = math.hypot(rx, ry)
            if dd > A.M_RAD: continue
            if vx*rx + vy*ry > -0.3: danger += (A.M_RAD - dd)
        sc = -math.hypot(px-spot[1], py-spot[2])*A.M_SPOT_W + pot*A.M_POT*0.5 - danger*A.M_DANGER
        print('     %-2s -> (%.2f,%.2f) pot=%.3f danger=%.2f sc=%.3f' % (name, px, py, pot, danger, sc))

# 追加：eval_kick 最佳角度
for fno in frames:
    obs = d['frames'][fno]; st = A.state_from_obs(obs)
    owner = st.units[st.owner] if st.owner >= 0 else None
    if owner is None or owner.team != me: continue
    opp = [u for u in st.units if u.team != me]
    mates = [u for u in st.units if u.team == me and u.index != 0]
    best = None
    for ang in range(0, 360, 15):
        sc = A.eval_kick(st, owner, ang, opp, mates, me, {})
        if best is None or sc > best[0]: best = (sc, ang)
    print('   eval_kick best: sc=%.2f ang=%d  (KICK_MIN_SMALL=%.1f)' % (best[0], best[1], A.KICK_MIN_SMALL))
