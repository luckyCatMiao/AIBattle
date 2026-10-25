import io, re
p = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v3.py'
s = io.open(p, encoding='utf-8').read()

# ---------------------------------------------------------------- 1. move_dir
old = '''def move_dir(u, tx, ty, my_team, forbid_box=True):
    dx, dy = tx - u.x, ty - u.y
    d = hyp(dx, dy)
    if d < 0.12:
        return 'N'
    ux, uy = dx / d, dy / d
    best, bestv = 'N', -2.0
    for name in DIR8:
        vx, vy = DIR_VEC[name]
        v = vx * ux + vy * uy
        if forbid_box:
            nx, ny = u.x + vx * SPD * DT * 1.5, u.y + vy * SPD * DT * 1.5
            if in_box(1 - my_team, nx, ny):
                v -= 1.5
        if v > bestv:
            bestv, best = v, name
    return best
'''
new = '''BOX_MARGIN = 0.55


def infl_box(team, m=BOX_MARGIN):
    b = PBOX2[team]
    return (b[0] - m, b[2] + m, b[1] - m, b[3] + m)


def in_infl(team, x, y, m=BOX_MARGIN):
    x1, x2, y1, y2 = infl_box(team, m)
    return x1 <= x <= x2 and y1 <= y <= y2


def push_out(team, x, y, m=BOX_MARGIN):
    x = clamp(x, 0.45, FIELD_W - 0.45)
    y = clamp(y, 0.45, FIELD_H - 0.45)
    if not in_infl(team, x, y, m):
        return x, y
    b = PBOX2[team]
    cands = []
    if b[0] > 1.5:
        cands.append((b[0] - m - 0.05, y))
    if b[2] < FIELD_W - 1.5:
        cands.append((b[2] + m + 0.05, y))
    cands.append((x, b[1] - m - 0.05))
    cands.append((x, b[3] + m + 0.05))
    best = None
    for cx, cy in cands:
        cx = clamp(cx, 0.45, FIELD_W - 0.45)
        cy = clamp(cy, 0.45, FIELD_H - 0.45)
        if in_infl(team, cx, cy, m):
            continue
        d = (cx - x) ** 2 + (cy - y) ** 2
        if best is None or d < best[0]:
            best = (d, cx, cy)
    if best is None:
        return x, y
    return best[1], best[2]


def seg_blocked(team, x1, y1, x2, y2, m=BOX_MARGIN):
    dx, dy = x2 - x1, y2 - y1
    n = max(4, int(hyp(dx, dy) / 0.25))
    for i in range(n + 1):
        t = i / float(n)
        if in_infl(team, x1 + dx * t, y1 + dy * t, m):
            return True
    return False


def route_point(team, ux, uy, tx, ty, m=BOX_MARGIN):
    """Return next waypoint that avoids the opponent penalty box."""
    tx, ty = push_out(team, tx, ty, m)
    if not seg_blocked(team, ux, uy, tx, ty, m):
        return tx, ty
    b = PBOX2[team]
    if b[0] > 1.5:
        xg = b[0] - m - 0.05
    else:
        xg = b[2] + m + 0.05
    cands = []
    for gy in (5.05, 20.95):
        a = seg_blocked(team, ux, uy, xg, gy, m)
        c = seg_blocked(team, xg, gy, tx, ty, m)
        d = hyp(xg - ux, gy - uy) + hyp(tx - xg, ty - gy)
        cands.append((a + c, d, xg, gy))
    cands.sort()
    return cands[0][2], cands[0][3]


def move_dir(u, tx, ty, my_team, forbid_box=True):
    box_team = 1 - my_team
    if forbid_box:
        tx, ty = push_out(box_team, tx, ty)
        wx, wy = route_point(box_team, u.x, u.y, tx, ty)
        dx, dy = wx - u.x, wy - u.y
    else:
        dx, dy = tx - u.x, ty - u.y
    d = hyp(dx, dy)
    if d < 0.10:
        if forbid_box:
            dx, dy = tx - u.x, ty - u.y
            d = hyp(dx, dy)
            if d < 0.06:
                return 'N'
        else:
            return 'N'
    ux, uy = dx / d, dy / d
    best, bestv = 'N', -2.0
    for name in DIR8:
        vx, vy = DIR_VEC[name]
        v = vx * ux + vy * uy
        if forbid_box:
            nx, ny = u.x + vx * SPD * DT * 4.0, u.y + vy * SPD * DT * 4.0
            if in_infl(box_team, nx, ny):
                v -= 2.5
        if v > bestv:
            bestv, best = v, name
    return best
'''
assert old in s
s = s.replace(old, new)

# ---------------------------------------------------------------- 2. corner_spot
old = '''def corner_spot(st, me, opp, bx, by, idx):
    """前场支点：优先对方球门两个「死角区」（禁区外侧的 y<6 / y>20 走廊），
    那里门将够不着、对手又常常被球吸引走。"""
    gx = OPP_GOAL_X[me]
    atk = ATK[me]
    cands = [
        (gx - atk * 4.5, 4.5),
        (gx - atk * 4.5, 21.5),
        (gx - atk * 7.0, 4.0),
        (gx - atk * 7.0, 22.0),
        (gx - atk * 11.5, 13.0),
        (gx - atk * 11.5, 8.5),
        (gx - atk * 11.5, 17.5),
    ]
    best = None
    for (x, y) in cands:
        x, y = safe_spot(me, x, y, 0.9)
        lane = lane_clear(bx, by, x, y, opp)
        pot = shot_potential(x, y, opp, me)
        od = min([hyp(o.x - x, o.y - y) for o in opp] or [9.0])
        sc = lane * 1.6 + pot * 2.2 + min(od, 3.0) * 0.3
        if best is None or sc > best[0]:
            best = (sc, x, y)
    return best[1], best[2]
'''
new = '''def corner_spot(st, me, opp, bx, by, idx):
    """前场支点：球在本方半场时留在可接应距离内；进入前场后再去禁区外死角区。"""
    gx = OPP_GOAL_X[me]
    atk = ATK[me]
    ogx = MY_GOAL_X[me]
    prog = (bx - ogx) * atk
    cands = []
    if prog < 20.0:
        for dp in (9.0, 13.0, 17.0):
            px = ogx + atk * (prog + dp)
            if 1.0 <= px <= FIELD_W - 1.0:
                for off in (-6.0, -2.5, 0.0, 2.5, 6.0):
                    cands.append((px, by + off))
    else:
        cands = [
            (gx - atk * 4.5, 4.5),
            (gx - atk * 4.5, 21.5),
            (gx - atk * 7.0, 4.0),
            (gx - atk * 7.0, 22.0),
            (gx - atk * 11.5, 13.0),
            (gx - atk * 11.5, 8.5),
            (gx - atk * 11.5, 17.5),
        ]
    best = None
    for (x, y) in cands:
        x, y = push_out(1 - me, x, y, 0.9)
        lane = lane_clear(bx, by, x, y, opp)
        pot = shot_potential(x, y, opp, me)
        od = min([hyp(o.x - x, o.y - y) for o in opp] or [9.0])
        sc = lane * 1.6 + pot * 2.2 + min(od, 3.0) * 0.3
        if prog < 20.0:
            sc += (x - bx) * atk * 0.05 - hyp(x - bx, y - by) * 0.02
        if best is None or sc > best[0]:
            best = (sc, x, y)
    return best[1], best[2]
'''
assert old in s
s = s.replace(old, new)

# ---------------------------------------------------------------- 3. best_pass
old = '''            # 队友周围有没有对手
            od = min([math.hypot(o.x - px, o.y - py) for o in opp] or [9.0])
            if od < 0.95:
                continue
            pot = shot_potential(px, py, opp, me)
            prog = (px - bx) * ATK[me]
            if prog < 2.0 and pot < 0.15:
                continue
            sc = 1.5 + pot * 3.0 + prog * 0.18 + min(od, 3.0) * 0.3 - D * 0.02
'''
new = '''            # 队友周围有没有对手
            od = min([math.hypot(o.x - px, o.y - py) for o in opp] or [9.0])
            if od < 0.95:
                continue
            pot = shot_potential(px, py, opp, me)
            prog = (px - bx) * ATK[me]
            press = min([math.hypot(o.x - bx, o.y - by) for o in opp] or [9.0])
            if prog < 1.0 and pot < 0.15 and press > 1.7:
                continue
            if m.index == 0 and press > 1.7:
                continue
            sc = 1.5 + pot * 3.0 + prog * 0.30 + min(od, 3.0) * 0.3 - D * 0.02
'''
assert old in s
s = s.replace(old, new)

# ---------------------------------------------------------------- 4. carrier_cmd
old = '''    if can_kick:
        cands = []
        sh = best_shot_at(u.x, u.y, opp, me)
        if sh is not None and sh[1] > SHOT_TH:
            cands.append((60.0 + sh[1], sh[2]))
        ps = best_pass(st, u, opp, mates, me, mate_targets) if mates else None
        if ps is not None:
            cands.append((ps[0], ps[1]))
        bestk = None
        for ang in range(0, 360, 15):
'''
new = '''    if can_kick:
        cands = []
        sh = best_shot_at(u.x, u.y, opp, me)
        dgoal = hyp(gx - u.x, 13.0 - u.y)
        kp = pick_keeper(opp, me)
        keeper_out = False
        if kp is not None:
            kd = hyp(kp.x - gx, kp.y - 13.0)
            keeper_out = kd > 4.2
        if sh is not None and sh[1] > SHOT_TH and (dgoal < 13.5 or keeper_out):
            cands.append((60.0 + sh[1], sh[2]))
        ps = best_pass(st, u, opp, mates, me, mate_targets) if mates else None
        if ps is not None:
            cands.append((ps[0], ps[1]))
        bestk = None
        for ang in range(0, 360, 10):
'''
assert old in s
s = s.replace(old, new)

old = '''        sc = pot * 4.0 + prog * 0.09 + min(nd, 3.0) * 0.22
        if hyp(px - gx, py - 13.0) < dgoal:
            sc += 0.05
'''
new = '''        sc = pot * 3.0 + prog * 0.30 + min(nd, 2.5) * 0.20
        if hyp(px - gx, py - 13.0) < dgoal:
            sc += 0.12
'''
assert old in s
s = s.replace(old, new)

# ---------------------------------------------------------------- 5. solo defence
old = '''    if owner is not None:
        dx, dy = bx - ogx, by - 13.0
        dd = hyp(dx, dy) or 1.0
        tx = bx - dx / dd * 0.42
        ty = by - dy / dd * 0.42
        tx, ty = safe_spot(me, tx, ty, 0.5)
        cmd.dir = move_dir(u, tx, ty, me)
        cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
        return cmd
'''
new = '''    if owner is not None:
        dx, dy = ogx - bx, 13.0 - by
        dd = hyp(dx, dy) or 1.0
        # goal-side: stand on the ball-goal line, close enough to block shots
        D = hyp(bx - ogx, by - 13.0)
        goal_side = ((u.x - bx) * dx + (u.y - by) * dy) > 0.0
        db = hyp(u.x - bx, u.y - by)
        if goal_side and D < 16.0:
            k = 2.2 if db > 2.4 else 0.0
            tx = bx + dx / dd * k
            ty = by + dy / dd * k
        else:
            k = min(max(2.4, 0.55 * D), 6.5) if D < 24.0 else 3.0
            tx = ogx + (bx - ogx) / (D or 1.0) * k
            ty = 13.0 + (by - 13.0) / (D or 1.0) * k
        tx = clamp(tx, 0.7, FIELD_W - 0.7)
        ty = clamp(ty, 0.9, FIELD_H - 0.9)
        cmd.dir = move_dir(u, tx, ty, me, forbid_box=False)
        cmd.aim = math.degrees(math.atan2(by - u.y, bx - u.x)) % 360.0
        return cmd
'''
assert old in s
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8').write(s)
print('patched agent_v3')
