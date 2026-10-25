#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""在 pr5 基线上加“领先保护”模式：领先时持球拖延/回传门将，禁区内不可被抢。"""
import pathlib

p = pathlib.Path('agent_pr5.py')
s = p.read_text(encoding='utf-8')

# 1) 阈值略降，增加射门量（团队局）
s = s.replace("KICK2_TH = float(os.environ.get('SOC2_K2TH', '0.60'))",
              "KICK2_TH = float(os.environ.get('SOC2_K2TH', '0.50'))", 1)

# 2) keeper_carry_cmd 开头：领先即原地持球
old = '''def keeper_carry_cmd(st, u, opp, me, mates, mate_targets, cmd):
    gx = OPP_GOAL_X[me]
    bx, by = st.bx, st.by'''
new = '''def keeper_carry_cmd(st, u, opp, me, mates, mate_targets, cmd):
    gx = OPP_GOAL_X[me]
    bx, by = st.bx, st.by
    if GAME_CTX.get('lead'):
        # 领先保护：门将在禁区内持球，对手进禁区即犯规，抢不到
        cmd.dir = 'N'
        cmd.aim = math.degrees(math.atan2(13.0 - u.y, gx - u.x)) % 360.0
        return cmd'''
assert old in s
s = s.replace(old, new, 1)

# 3) carrier_cmd 开头：领先时回传/护球（在 keeper 分支之前）
old2 = '''    n = st.n

    if u.index == 0 and n >= 2:'''
new2 = '''    n = st.n

    if GAME_CTX.get('lead'):
        ogx = MY_GOAL_X[me]
        if in_box(me, u.x, u.y):
            cmd.dir = 'N'
            cmd.aim = math.degrees(math.atan2(13.0 - u.y, ogx - u.x)) % 360.0
            return cmd
        # 回传门将（他在禁区内，安全）
        kp = None
        for m in st.units:
            if m.team == me and m.index == 0:
                kp = m
        if kp is not None and can_kick:
            dx, dy = kp.x - u.x, kp.y - u.y
            D = hyp(dx, dy)
            if D < 24.0 and D > 3.0:
                ux, uy = dx / D, dy / D
                f, hit = line_hit(u.x, u.y, ux, uy, st.units, maxd=D + 2.0, skip=u)
                if hit is None or (hit.team == me and hit.index == 0):
                    cmd.aim = math.degrees(math.atan2(dy, dx)) % 360.0
                    cmd.kick = True
                    return cmd
        # 无回传线路：朝本方球门方向带球
        tx = ogx + ATK[me] * 6.0
        ty = 13.0 + (u.y - 13.0) * 0.3
        cmd.dir = move_dir(u, clamp(tx, 1.0, FIELD_W - 1.0),
                           clamp(ty, 1.0, FIELD_H - 1.0), me, forbid_box=False)
        cmd.aim = math.degrees(math.atan2(13.0 - u.y, ogx - u.x)) % 360.0
        return cmd

    if u.index == 0 and n >= 2:'''
assert old2 in s
s = s.replace(old2, new2, 1)

# 4) solo_cmd：领先时回本方禁区护球
old3 = '''    if owner is not None and owner.team == me:
        if u.kickCd <= 0 and u.controlLock <= 0:
            sh = best_shot2(st, u, opp, me)'''
new3 = '''    if owner is not None and owner.team == me:
        if GAME_CTX.get('lead'):
            if in_box(me, u.x, u.y):
                cmd.dir = 'N'
                cmd.aim = math.degrees(math.atan2(13.0 - u.y, ogx - u.x)) % 360.0
                return cmd
            tx = ogx + ATK[me] * 3.0
            ty = 13.0 + (u.y - 13.0) * 0.3
            cmd.dir = move_dir(u, clamp(tx, 1.0, FIELD_W - 1.0),
                               clamp(ty, 1.0, FIELD_H - 1.0), me, forbid_box=False)
            cmd.aim = math.degrees(math.atan2(13.0 - u.y, ogx - u.x)) % 360.0
            return cmd
        if u.kickCd <= 0 and u.controlLock <= 0:
            sh = best_shot2(st, u, opp, me)'''
assert old3 in s
s = s.replace(old3, new3, 1)

# 5) main(): 记录领先状态
old4 = '''            GAME_CTX['desp'] = (int(sc[me]) <= int(sc[1 - me])) and (golden or tl < DESP_T)'''
new4 = '''            GAME_CTX['desp'] = (int(sc[me]) <= int(sc[1 - me])) and (golden or tl < DESP_T)
            GAME_CTX['lead'] = int(sc[me]) > int(sc[1 - me])'''
assert old4 in s
s = s.replace(old4, new4, 1)

# 6) GAME_CTX 初始化加 lead
s = s.replace("GAME_CTX = {'desp': False}", "GAME_CTX = {'desp': False, 'lead': False}", 1)

pathlib.Path('agent.py').write_text(s, encoding='utf-8')
print('protect mode applied to agent.py')
