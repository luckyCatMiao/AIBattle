#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""把已验证的防守改造移植到 v21 基线上。"""
import pathlib

p = pathlib.Path('agent.py')
s = p.read_text(encoding='utf-8')


def replace_func(src, name, new_code, next_marker):
    a = src.index('def %s(' % name)
    b = src.index(next_marker, a)
    return src[:a] + new_code + src[b:]


# ---------- 1) move_dir：硬性禁区避让 ----------
MOVE_DIR = '''def move_dir(u, tx, ty, my_team, forbid_box=True, lookahead=3):
    dx, dy = tx - u.x, ty - u.y
    d = hyp(dx, dy)
    if d < 0.12:
        return 'N'
    ux, uy = dx / d, dy / d
    best, bestv = 'N', -2.0
    safe_best, safe_v = 'N', -2.0
    for name in DIR8:
        vx, vy = DIR_VEC[name]
        v = vx * ux + vy * uy
        bad = False
        if forbid_box:
            nx = u.x + vx * SPD * DT * lookahead
            ny = u.y + vy * SPD * DT * lookahead
            b = opp_box_of(my_team)
            if (b[0] - 0.45) <= nx <= (b[2] + 0.45) and (b[1] - 0.45) <= ny <= (b[3] + 0.45):
                bad = True
        if not bad and v > safe_v:
            safe_v, safe_best = v, name
        if v > bestv:
            bestv, best = v, name
    if safe_v > -2.0:
        return safe_best
    return best


'''
s = replace_func(s, 'move_dir', MOVE_DIR, 'def sim_pos(')

# ---------- 2) 门将 / 对手瞄准预测 ----------
KEEPER = '''def ball_cross_at(st, plane_x):
    """球自由飞行时在 x=plane_x 平面处的 y；只有最终射正（过门线在门框内）才有意义。"""
    gx = 1.0 if plane_x < 20 else (FIELD_W - 1.0)
    x, y = st.bx, st.by
    vx, vy = st.bvx, st.bvy
    if gx > 20:
        if vx <= 0.1:
            return None
    else:
        if vx >= -0.1:
            return None
    yplane = None
    for _ in range(200):
        for _s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if y - R_B < 1.0:
                y = 1.0 + R_B
                vy = -vy * WALLR
            elif y + R_B > FIELD_H - 1.0:
                y = FIELD_H - 1.0 - R_B
                vy = -vy * WALLR
            if yplane is None and ((plane_x > 20 and x >= plane_x)
                                   or (plane_x < 20 and x <= plane_x)):
                yplane = y
            if (gx > 20 and x >= gx) or (gx < 20 and x <= gx):
                if GOAL_TOP <= y <= GOAL_BOT:
                    return yplane if yplane is not None else y
                return None
            if x - R_B < 1.0 and not (GOAL_TOP <= y <= GOAL_BOT):
                x = 1.0 + R_B
                vx = -vx * WALLR
            elif x + R_B > FIELD_W - 1.0 and not (GOAL_TOP <= y <= GOAL_BOT):
                x = FIELD_W - 1.0 - R_B
                vx = -vx * WALLR
        vx *= FRIC
        vy *= FRIC
        if abs(vx) + abs(vy) < 0.02:
            return None
    return None


def predict_opp_shot_y(ky, gx, plane, bx, by):
    """预测对手射门落点与门将平面的交点 y（来自 230 个失球回放统计的瞄准规则）。"""
    if 12.2 <= ky <= 13.8:
        ty = 10.6 if by < 13.0 else 15.4
    else:
        ty = 15.4 if ky < 13.0 else 10.6
    dx = gx - bx
    if abs(dx) < 0.6:
        return clamp(ty, 8.2, 17.8)
    t = (plane - bx) / dx
    if t <= 0.0 or t > 1.6:
        return clamp(ty, 8.2, 17.8)
    return clamp(by + (ty - by) * t, 7.8, 18.2)


def keeper_target(st, my_team, ball_x, ball_y):
    """门线门将。pred_y 在决策窗口开始时锁定，整窗不变。"""
    gx = MY_GOAL_X[my_team]
    inward = 1.0 if gx < 20 else -1.0
    if in_box(my_team, ball_x, ball_y) and st.owner < 0 and math.hypot(st.bvx, st.bvy) < 7.0:
        return ball_x, ball_y
    plane = gx + inward * 0.85
    py = GAME_CTX.get('pred_y')
    if py is not None:
        return plane, clamp(py, 7.8, 18.2)
    return plane, 12.95


'''
s = replace_func(s, 'keeper_target', KEEPER, '# ---------------------------------------------------------------- 角色')

# ---------- 3) 常量 ----------
s = s.replace("KICK_MIN = float(os.environ.get('SOC2_KICKMIN', '0.8'))",
              "KICK_MIN = float(os.environ.get('SOC2_KICKMIN', '0.8'))\n"
              "OPP_SHOT_R = float(os.environ.get('SOC2_OPPSHOTR', '17.0'))", 1)

# ---------- 4) 对手模型 ----------
OPP = '''def opp_default_cmd(st, o):
    """内部模拟用的对手模型：持球进入我方 17 格即起脚，瞄准我方门将另一侧。"""
    bx, by = st.bx, st.by
    owner = st.units[st.owner] if st.owner >= 0 else None
    gx = OPP_GOAL_X[o.team]
    if owner is not None and owner.team == o.team and owner.index == o.index:
        D = hyp(gx - o.x, 13.0 - o.y)
        if o.kickCd <= 0 and o.controlLock <= 0 and D < OPP_SHOT_R \\
                and not in_box(1 - o.team, o.x, o.y):
            ky = GAME_CTX.get('kY0', 13.0)
            if 12.2 <= ky <= 13.8:
                ty = 10.6 if o.y < 13.0 else 15.4
            else:
                ty = 15.4 if ky < 13.0 else 10.6
            ang = math.degrees(math.atan2(ty - o.y, gx - o.x)) % 360.0
            return Cmd('N', ang, True)
        d = move_dir(o, gx, 13.0, o.team, forbid_box=True)
        return Cmd(d, None, False)
    if owner is not None and owner.team == o.team:
        tx = clamp(gx + ATK[o.team] * 9.0, 2.0, FIELD_W - 2.0)
        ty = clamp(13.0 + (by - 13.0) * 0.5, 3.0, FIELD_H - 3.0)
        d = move_dir(o, tx, ty, o.team, forbid_box=True)
        return Cmd(d, None, False)
    d = move_dir(o, bx, by, o.team, forbid_box=True)
    return Cmd(d, None, False)


'''
s = replace_func(s, 'opp_default_cmd', OPP, 'def frame_commands_impl(')
p.write_text(s, encoding='utf-8')
print('patched move_dir/keeper/opp/const')
