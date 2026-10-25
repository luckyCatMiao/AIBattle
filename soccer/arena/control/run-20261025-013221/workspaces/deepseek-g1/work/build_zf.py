# -*- coding: utf-8 -*-
"""Build agent_zf.py: agent_z + aggressive final-third passing to a shooting mate."""
s = open('agent_z.py', encoding='utf-8').read()

BLOCK = r'''

def best_pass2(st, u, opp, mates, me, mate_targets=None, maxd=28.0):
    """v50 传球：按飞行净空/接球后射门质量选长传。"""
    mate_targets = mate_targets or {}
    bx, by = u.x, u.y
    best = None
    for m in mates:
        if m.index == u.index:
            continue
        tgt = mate_targets.get(m.index)
        for lead in (0, 5, 10, 15):
            if tgt is not None:
                px, py = predict_pos(m.x, m.y, tgt[0], tgt[1], lead, SPD)
            else:
                px, py = predict_pos(m.x, m.y, m.x + ATK[me] * 8.0, m.y, lead, SPD)
            dx, dy = px - bx, py - by
            D = math.hypot(dx, dy)
            if D < 4.0 or D > maxd:
                continue
            ux, uy = dx / D, dy / D
            worst = 9.0
            blocked = False
            for o in opp:
                rx, ry = o.x - bx, o.y - by
                proj = rx * ux + ry * uy
                if proj < -0.3 or proj > D + 0.9:
                    continue
                perp = abs(rx * uy - ry * ux)
                t = max(0.0, proj) / KICKP
                worst = min(worst, perp - (CR + 0.18 + SPD * max(0.0, t - 1.1) * 0.35))
            if worst < 0.12:
                continue
            for o in st.units:
                if o.team != me or o is u or o.index == m.index:
                    continue
                rx, ry = o.x - bx, o.y - by
                proj = rx * ux + ry * uy
                if proj < 0.6 or proj > D - 0.9:
                    continue
                if abs(rx * uy - ry * ux) < CR + 0.22:
                    blocked = True
                    break
            if blocked:
                continue
            od = min([hyp(o.x - px, o.y - py) for o in opp] or [9.0])
            if od < 0.95:
                continue
            prog = (px - bx) * ATK[me]
            if prog < 3.0:
                continue
            if in_box(1 - me, px, py):
                continue
            pot = 0.0
            gx = OPP_GOAL_X[me]
            for ty in _MOUTH[::4]:
                qq = lane_q(px, py, ty, opp, me)
                if qq > pot:
                    pot = qq
            sc = prog * 0.30 + min(worst, 1.5) * 0.9 + max(0.0, pot) * 1.2 - D * 0.015
            if best is None or sc > best[0]:
                best = (sc, math.degrees(math.atan2(dy, dx)) % 360.0, m.index, (px, py), D, pot)
    return best
'''

marker = "def wallrun_cmd(st, u, opp, me, mates, mate_targets):"
assert marker in s
s = s.replace(marker, BLOCK + "\n\n" + marker, 1)

old = """        if mates and press < 1.7:
            ps = best_pass(st, u, opp, mates, me, mate_targets)
            if ps is not None and ps[0] > 1.3:
                cmd.aim = ps[1]
                cmd.kick = True
                return cmd"""
new = """        if mates:
            ps2 = best_pass2(st, u, opp, mates, me, mate_targets)
            if ps2 is not None and ps2[5] > 0.02 and (
                    press < 2.3 or ps2[0] >= 5.2 or ps2[4] > 9.0):
                RECV['idx'] = ps2[2]
                RECV['pos'] = ps2[3]
                RECV['frame'] = st.frame
                cmd.aim = ps2[1]
                cmd.kick = True
                return cmd
            if press < 1.7:
                ps = best_pass(st, u, opp, mates, me, mate_targets)
                if ps is not None and ps[0] > 1.3:
                    cmd.aim = ps[1]
                    cmd.kick = True
                    return cmd"""
assert old in s
s = s.replace(old, new)
open('agent_zf.py', 'w', encoding='utf-8').write(s)
print('built agent_zf.py')
