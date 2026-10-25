# -*- coding: utf-8 -*-
"""Build agent_x.py from agent_w.py: goal-line predictive keeper + 1v1 unchanged."""
src = open('agent_w.py', encoding='utf-8').read()

NEW_KEEPER = r'''
KBASE = float(os.environ.get('SOC2_KBASE', '2.6'))


def keeper_target(st, my_team, ball_x, ball_y, kp=None):
    """v40 门将：浅站位守住球门口 + 对来球做路径预测拦截。"""
    if kp is None:
        for u in st.units:
            if u.team == my_team and u.index == 0:
                kp = u
                break
    gx = MY_GOAL_X[my_team]
    cx, cy = gx, 13.0
    inward = 1.0 if my_team == 0 else -1.0
    owner = st.units[st.owner] if st.owner >= 0 else None
    sp = math.hypot(st.bvx, st.bvy)
    base = KBASE
    if owner is None and sp > 1.6 and kp is not None:
        path = ball_future(st, 60)
        best = None
        fallback = None
        for k, (px, py) in enumerate(path):
            if (px - gx) * inward < 0.8:
                continue
            if (px - gx) * inward > 24.0 and abs(py - 13.0) > 12.0:
                continue
            t = (k + 1) / float(HZ)
            d = hyp(px - kp.x, py - kp.y)
            need = max(0.0, d - CR) / SPD
            if need <= t:
                best = (px, py)
                break
            if fallback is None:
                fallback = (px, py)
        if best is not None:
            return best
        if fallback is not None and math.hypot(ball_x - kp.x, ball_y - kp.y) < 6.0:
            return fallback
    dx, dy = ball_x - cx, ball_y - cy
    D = hyp(dx, dy) or 0.01
    if owner is not None and owner.team != my_team:
        if D < 14.0:
            depth = clamp(0.55 * D, 2.0, 7.0)
        else:
            depth = clamp(base + 0.06 * D, base, base + 2.1)
    elif owner is not None:
        depth = base
    else:
        depth = base + 0.5
    ux, uy = dx / D, dy / D
    x = cx + ux * depth
    y = cy + uy * depth
    if depth < 4.0:
        y = clamp(y, 10.7, 15.3)
    x = clamp(x, 0.6, FIELD_W - 0.6)
    y = clamp(y, 1.2, FIELD_H - 1.2)
    return x, y
'''

start = src.index("def keeper_target(st, my_team, ball_x, ball_y):")
end = src.index("# ---------------------------------------------------------------- 角色", start)
src = src[:start] + NEW_KEEPER + "\n\n" + src[end:]

# keeper_target now takes the unit; fix call site
src = src.replace("tx, ty = keeper_target(st, me, bx, by)",
                  "tx, ty = keeper_target(st, me, bx, by, u)")

# 1v1: keep the old solo carrier behaviour (wall-run is bad without a keeper)
old = "    if owner is not None and owner.team == me:\n        return carrier_cmd(st, u, opp, me)"
assert old in src, 'solo call not found'
src = src.replace(old, "    if owner is not None and owner.team == me:\n        return carrier_cmd_v21(st, u, opp, me)")

open('agent_x.py', 'w', encoding='utf-8').write(src)
print('built agent_x.py', len(src))
