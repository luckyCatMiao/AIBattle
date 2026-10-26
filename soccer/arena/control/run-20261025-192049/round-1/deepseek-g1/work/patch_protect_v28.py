#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""给 v28 加领先保护：领先后持球/回传门将，禁区内对手抢不到。"""
import pathlib

p = pathlib.Path('agent_v28.py')
s = p.read_text(encoding='utf-8')

# 1) GAME_CTX 增加 lead 字段
s = s.replace("GAME_CTX = {'desp': False}", "GAME_CTX = {'desp': False, 'lead': False}", 1)

# 2) main() 里设置 lead
old = '''            GAME_CTX['desp'] = (int(sc[me]) <= int(sc[1 - me])) and (golden or tl < DESP_T)'''
new = '''            GAME_CTX['desp'] = (int(sc[me]) <= int(sc[1 - me])) and (golden or tl < DESP_T)
            GAME_CTX['lead'] = int(sc[me]) > int(sc[1 - me])'''
assert old in s
s = s.replace(old, new, 1)

# 3) carrier_cmd 开头插入保护逻辑
old2 = '''def carrier_cmd(st, u, opp, me, mates=None, mate_targets=None):
    cmd = Cmd()
    bx, by = st.bx, st.by
    gx = OPP_GOAL_X[me]
    can_kick = (u.kickCd <= 0 and u.controlLock <= 0)
    mates = mates or []
    mate_targets = mate_targets or {}
'''
new2 = '''def carrier_cmd(st, u, opp, me, mates=None, mate_targets=None):
    cmd = Cmd()
    bx, by = st.bx, st.by
    gx = OPP_GOAL_X[me]
    can_kick = (u.kickCd <= 0 and u.controlLock <= 0)
    mates = mates or []
    mate_targets = mate_targets or {}
    if GAME_CTX.get('lead'):
        ogx = MY_GOAL_X[me]
        if in_box(me, u.x, u.y):
            cmd.dir = 'N'
            cmd.aim = math.degrees(math.atan2(13.0 - u.y, ogx - u.x)) % 360.0
            return cmd
        kp = None
        for m in st.units:
            if m.team == me and m.index == 0:
                kp = m
        if kp is not None and can_kick:
            dx, dy = kp.x - u.x, kp.y - u.y
            D = hyp(dx, dy)
            if 3.0 < D < 24.0:
                ux, uy = dx / D, dy / D
                f, hit = line_hit(bx, by, ux, uy, st.units, maxd=D + 2.0, skip=u)
                if hit is None or (hit.team == me and hit.index == 0):
                    cmd.aim = math.degrees(math.atan2(dy, dx)) % 360.0
                    cmd.kick = True
                    return cmd
        tx = ogx + ATK[me] * 6.0
        ty = 13.0 + (u.y - 13.0) * 0.3
        cmd.dir = move_dir(u, clamp(tx, 1.0, FIELD_W - 1.0),
                           clamp(ty, 1.0, FIELD_H - 1.0), me, forbid_box=False)
        cmd.aim = math.degrees(math.atan2(13.0 - u.y, ogx - u.x)) % 360.0
        return cmd
'''
assert old2 in s
s = s.replace(old2, new2, 1)

# 4) solo_cmd 领先时护球
old3 = '''    if owner is not None and owner.team == me:
        return carrier_cmd(st, u, opp, me)'''
new3 = '''    if owner is not None and owner.team == me:
        return carrier_cmd(st, u, opp, me)'''
# solo 走 carrier_cmd，已在 3) 覆盖

pathlib.Path('agent_v29.py').write_text(s, encoding='utf-8')
print('wrote agent_v29.py (v28 + protect)')
