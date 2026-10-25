# -*- coding: utf-8 -*-
"""Build agent_w.py: v21 (+freeze fix) with wall-run carrier."""
import io, re, sys

src = open('agent_f.py', encoding='utf-8').read()

BLOCK = r'''
# ================================================================ wall-run attack
WR = os.environ.get('SOC2_WR', '1') != '0'
_MOUTH = [10.62 + 0.12 * i for i in range(42)]
_PREV_U = {}
_VEL = {}
_WRS = {}


def update_vel_cache(obs):
    global _PREV_U, _VEL
    cur = {}
    frame = int(obs.get('frame') or 0)
    for u in obs.get('units') or []:
        cur[(int(u['team']), int(u['index']))] = (float(u['x']), float(u['y']))
    nv = {}
    if _PREV_U:
        pf, prev = _PREV_U
        dt = (frame - pf) / float(HZ)
        if 0.0 < dt <= 2.5:
            for k, (x, y) in cur.items():
                if k in prev:
                    nv[k] = ((x - prev[k][0]) / dt, (y - prev[k][1]) / dt)
    _PREV_U = (frame, cur)
    _VEL = nv


def lane_q(x, y, ty, opp, me, mates=None, shooter=None):
    gx = OPP_GOAL_X[me]
    dx, dy = gx - x, ty - y
    D = math.hypot(dx, dy)
    if D < 1.5:
        return -9.0
    ux, uy = dx / D, dy / D
    ox, oy = x + ux * KICK_OFF, y + uy * KICK_OFF
    worst = 9.0
    for o in opp:
        rx, ry = o.x - ox, o.y - oy
        proj = rx * ux + ry * uy
        if proj < -0.3 or proj > D + 1.0:
            continue
        perp = abs(rx * uy - ry * ux)
        t = max(0.0, proj) / KICKP
        if o.index == 0 and abs(ux) > 1e-6:
            s = (o.x - ox) / ux
            if -0.3 <= s <= D + 0.6:
                y_at = oy + uy * s
                t_arr = frames_for(max(0.1, s)) / float(HZ)
                vx, vy = _VEL.get((o.team, o.index), (0.0, 0.0))
                pred_y = o.y + vy * min(t_arr, 1.0)
                reach = SPD * max(0.0, t_arr - 1.0) * 0.55
                gap = abs(pred_y - y_at)
                worst = min(worst, gap - (CR + 0.28 + min(2.6, reach)))
                continue
        reach = SPD * max(0.0, t - 1.1) * 0.30
        worst = min(worst, perp - (CR + 0.15 + min(1.2, reach)))
    if mates:
        for m in mates:
            if m is shooter:
                continue
            rx, ry = m.x - ox, m.y - oy
            proj = rx * ux + ry * uy
            if proj < 0.6 or proj > D - 0.9:
                continue
            worst = min(worst, abs(rx * uy - ry * ux) - (CR + 0.32))
    return worst


def best_open_shot(st, u, opp, me, mates=None, maxd=24.0):
    gx = OPP_GOAL_X[me]
    best = None
    for ty in _MOUTH:
        D = math.hypot(gx - u.x, ty - u.y)
        if D > maxd:
            continue
        q = lane_q(u.x, u.y, ty, opp, me, mates=mates, shooter=u)
        if q < 0.0:
            continue
        sc = q + max(0.0, 16.0 - D) * 0.02
        if best is None or sc > best[0]:
            best = (sc, math.degrees(math.atan2(ty - u.y, gx - u.x)) % 360.0, ty, D)
    return best


def choose_wall(st, u, opp, me, force=None):
    gx = OPP_GOAL_X[me]
    if force is not None:
        return force
    best = None
    lo, hi = min(u.x, gx), max(u.x, gx)
    for side, y0 in (('top', 1.75), ('bot', 24.25)):
        dmin = 9.0
        for o in opp:
            if lo - 2.0 <= o.x <= hi + 2.0:
                dmin = min(dmin, abs(o.y - y0))
        sc = dmin
        if best is None or sc > best[0]:
            best = (sc, side, y0)
    return best[1], best[2]


def shield_facing(u, opp, me, pref_ang=None):
    best, bs = None, -1.0
    for name in DIR8:
        vx, vy = DIR_VEC[name]
        bxp, byp = u.x + vx * DRIBD, u.y + vy * DRIBD
        if ball_hits_wall(bxp, byp):
            d = 98.0
        else:
            d = min([hyp(o.x - bxp, o.y - byp) for o in opp] or [9.0])
        if d > bs:
            bs, best = d, name
    if pref_ang is not None:
        a = math.radians(pref_ang % 360.0)
        vx, vy = math.cos(a), math.sin(a)
        bxp, byp = u.x + vx * DRIBD, u.y + vy * DRIBD
        pd = 98.0 if ball_hits_wall(bxp, byp) else min([hyp(o.x - bxp, o.y - byp) for o in opp] or [9.0])
        if pd > 2.1:
            return pref_ang
    return DIR_ANGLE[best] if best else 0.0


def wallrun_cmd(st, u, opp, me, mates, mate_targets):
    """沿墙推进：朝向墙时球回到脚下（对手抢不到），到射程内再转向射门。"""
    cmd = Cmd()
    gx = OPP_GOAL_X[me]
    atk = ATK[me]
    can_kick = (u.kickCd <= 0 and u.controlLock <= 0)
    press = min([hyp(o.x - u.x, o.y - u.y) for o in opp] or [9.0])
    if can_kick:
        sh = best_open_shot(st, u, opp, me, mates=mates, maxd=24.0)
        if sh is not None:
            q, ang, ty_t, D = sh
            req = 0.0 if D <= 13.0 else (0.10 if D <= 18.0 else 0.22)
            if q >= req:
                cmd.aim = ang
                cmd.kick = True
                return cmd
        if mates and press < 1.7:
            ps = best_pass(st, u, opp, mates, me, mate_targets)
            if ps is not None and ps[0] > 1.3:
                cmd.aim = ps[1]
                cmd.kick = True
                return cmd
    w = _WRS.get(u.index)
    if w is None:
        side, wy = choose_wall(st, u, opp, me)
        w = (st.frame, side, wy, u.x, 0)
        _WRS[u.index] = w
    last_t, side, wy, lastx, stuck = w
    if st.frame - last_t >= 30:
        adv = (u.x - lastx) * atk
        if adv < 1.2:
            stuck += 1
            if stuck >= 1:
                side = 'bot' if side == 'top' else 'top'
                wy = 24.25 if side == 'bot' else 1.75
                stuck = 0
        else:
            stuck = 0
        w = (st.frame, side, wy, u.x, stuck)
        _WRS[u.index] = w
    in_lane = abs(u.y - wy) < 3.2
    if in_lane:
        tx = gx - atk * 2.6
        ty = wy
    else:
        tx = u.x + atk * 5.0
        ty = wy
    tx = clamp(tx, 1.0, FIELD_W - 1.0)
    ty = clamp(ty, 1.0, FIELD_H - 1.0)
    best = None
    for name in DIR8 + ('N',):
        px, py = sim_pos(u.x, u.y, name, 8, SPD * DRIBF, me)
        d = hyp(px - tx, py - ty)
        nd = min([hyp(o.x - px, o.y - py) for o in opp] or [9.0])
        sc = -d * 1.0 + min(nd, 1.6) * 0.15 + (0.25 if abs(py - wy) < 2.8 else 0.0)
        if best is None or sc > best[0]:
            best = (sc, name)
    cmd.dir = best[1] if best else 'N'
    if abs(u.y - wy) < 1.5:
        cmd.aim = 270.0 if side == 'top' else 90.0
    else:
        pref = math.degrees(math.atan2(ty - u.y, tx - u.x)) % 360.0
        cmd.aim = shield_facing(u, opp, me, pref)
    return cmd


def carrier_cmd(st, u, opp, me, mates=None, mate_targets=None):
    if not WR:
        return carrier_cmd_v21(st, u, opp, me, mates, mate_targets)
    return wallrun_cmd(st, u, opp, me, mates or [], mate_targets or {})
'''

marker = "def carrier_cmd(st, u, opp, me, mates=None, mate_targets=None):"
assert marker in src
src = src.replace(marker, BLOCK + "\n\ndef carrier_cmd_v21(st, u, opp, me, mates=None, mate_targets=None):", 1)

old = "            st = state_from_obs(obs)\n            sc = obs.get('score') or [0, 0]"
new = ("            st = state_from_obs(obs)\n"
       "            try:\n                update_vel_cache(obs)\n            except Exception:\n                pass\n"
       "            sc = obs.get('score') or [0, 0]")
assert old in src
src = src.replace(old, new, 1)

open('agent_w.py', 'w', encoding='utf-8').write(src)
print('built agent_w.py', len(src))
