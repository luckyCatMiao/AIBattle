import io
src = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v19.py'
dst = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v20.py'
s = io.open(src, encoding='utf-8').read()

anchor = 'def carrier_cmd(st, u, opp, me, mates=None, mate_targets=None):'
add = '''def fly_path(bx, by, ang, maxf=140):
    a = math.radians(ang)
    vx, vy = KICKP * math.cos(a), KICKP * math.sin(a)
    x, y = bx, by
    path = []
    for f in range(maxf):
        for _ in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if in_goal_mouth(x, y):
                if x <= 1.0:
                    return path, f + 1, 1
                if x >= W - 1.0:
                    return path, f + 1, 0
            if ball_hits_wall(x, y):
                px, py = x - vx * DT / 4.0, y - vy * DT / 4.0
                if ball_hits_wall(x, py):
                    x = px
                    vx = -vx * WALLR
                if ball_hits_wall(px, y):
                    y = py
                    vy = -vy * WALLR
                if ball_hits_wall(x, y):
                    x, y = px, py
                    vx = -vx * WALLR
                    vy = -vy * WALLR
        vx *= FRIC
        vy *= FRIC
        if abs(vx) + abs(vy) < 0.02:
            vx = vy = 0.0
        path.append((x, y))
        if vx == 0.0 and vy == 0.0:
            break
    return path, None, -1


def best_through_pass(st, u, opp, mates, me):
    best = None
    gx = OPP_GOAL_X[me]
    for ang in range(0, 360, 6):
        a = math.radians(ang)
        ox = u.x + math.cos(a) * KICK_OFF
        oy = u.y + math.sin(a) * KICK_OFF
        if ball_hits_wall(ox, oy):
            ox, oy = u.x, u.y
        path, gf, gt = fly_path(ox, oy, ang)
        if gf is not None:
            if gt == me:
                return (500.0, ang, 0, 0.0)
            continue
        if not path:
            continue
        opp_f = None
        mate_f = None
        mate = None
        lim = min(len(path), 70)
        for f in range(lim):
            bx, by = path[f]
            t = (f + 1) / float(HZ)
            if opp_f is None:
                for o in opp:
                    if hyp(o.x - bx, o.y - by) <= CR + SPD * t:
                        opp_f = f
                        break
            if mate_f is None:
                for m in mates:
                    if hyp(m.x - bx, m.y - by) <= CR + SPD * t:
                        mate_f = f
                        mate = m
                        break
            if opp_f is not None and mate_f is not None:
                break
        if mate_f is None:
            continue
        if opp_f is not None and opp_f <= mate_f:
            continue
        bx, by = path[mate_f]
        prog = (bx - u.x) * ATK[me]
        if prog < 4.0:
            continue
        if in_box(1 - me, bx, by):
            continue
        sc = 6.0 + prog * 0.32 + (40 - mate_f) * 0.05
        sc += (30.0 - hyp(gx - bx, 13.0 - by)) * 0.03
        if best is None or sc > best[0]:
            best = (sc, ang, mate.index, (bx, by))
    return best


'''
assert anchor in s
s = s.replace(anchor, add + anchor)

old = '''        bestk = None
        for ang in range(0, 360, 15):
            sc = eval_kick(st, u, ang, opp, mates, me, mate_targets)
            if bestk is None or sc > bestk[0]:
                bestk = (sc, float(ang))
        if bestk is not None:
            cands.append(bestk)
'''
new = '''        bestk = None
        for ang in range(0, 360, 15):
            sc = eval_kick(st, u, ang, opp, mates, me, mate_targets)
            if bestk is None or sc > bestk[0]:
                bestk = (sc, float(ang))
        if bestk is not None:
            cands.append(bestk)
        if mates:
            tp = best_through_pass(st, u, opp, mates, me)
            if tp is not None:
                cands.append((tp[0], tp[1]))
'''
assert old in s
s = s.replace(old, new)
io.open(dst, 'w', encoding='utf-8').write(s)
print('built v20')
