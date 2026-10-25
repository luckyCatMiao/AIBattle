#!/usr/bin/env python3
"""Generate experimental copies of the round-1 agent. Tooling only."""
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent
SRC = (ROOT / 'agent_round1.py').read_text()

SOLO_BLOCK = '''        # n<=2: the only field player has no passing option.  Use the direct
        # solo attacking logic (shoot from range / kick past the last defender)
        # instead of the conservative multi-player carrier logic.
        if len(field) == 1:
            u = carrier
            bx, by = b['x'], b['y']
            ax2 = attack_goal_x(my_team)
            dgoal2 = math.hypot(ax2 - bx, 13.0 - by)
            sx, sy, sc = best_shot(w, u['id'], my_team, w.units)
            if dgoal2 < 23.0 and sc > -0.5:
                ang = angle_deg(sx - bx, sy - by)
                out[u['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
            else:
                nf = None
                dfoe = 99.0
                if foes:
                    nf = min(foes, key=lambda o: math.hypot(o['x'] - bx, o['y'] - by))
                    dfoe = math.hypot(nf['x'] - bx, nf['y'] - by)
                if nf is not None and dfoe < 5.5:
                    ang = solo_kick_aim(w, my_team, bx, by, foes, boxes)
                    if ang is not None:
                        out[u['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
                    else:
                        aim = angle_deg(u['y'] - nf['y'], u['x'] - nf['x'])
                        out[u['index']] = {'dir': 'N', 'aim': aim, 'kick': True}
                else:
                    side = 1.0 if u['y'] >= 13.0 else -1.0
                    ty = clamp(13.0 + side * 6.0, 3.0, 23.0)
                    aim = None
                    if nf is not None and dfoe < 4.5:
                        aim = angle_deg(u['y'] - nf['y'], u['x'] - nf['x'])
                    tx = edge - att * (BOX_MARGIN + 0.2)
                    tx, ty = safe_target(my_team, tx, ty, boxes, BOX_MARGIN)
                    out[u['index']] = {'dir': go_to_dir(w, u, (tx, ty), my_team, boxes),
                                       'aim': aim, 'kick': False}
            return out
'''

ANCHOR = '''    if owner_is_my_field:
        carrier = my_owner
        # ---- carrier action
'''
assert SRC.count(ANCHOR) == 1

v1 = SRC.replace(ANCHOR, ANCHOR.replace('        # ---- carrier action\n',
                                        SOLO_BLOCK + '        # ---- carrier action\n'))
assert v1 != SRC

PRESS_OLD = '            if d_home < 7.0:\n'
PRESS_NEW = '            if d_home < 11.0:\n'
assert SRC.count(PRESS_OLD) == 1
v2 = SRC.replace(PRESS_OLD, PRESS_NEW)

v3 = v1.replace(PRESS_OLD, PRESS_NEW)
assert v3 != v1

for name, text in [('agent_v1_solo2.py', v1), ('agent_v2_press11.py', v2), ('agent_v3_both.py', v3)]:
    (ROOT / name).write_text(text)
    print('wrote', name)
