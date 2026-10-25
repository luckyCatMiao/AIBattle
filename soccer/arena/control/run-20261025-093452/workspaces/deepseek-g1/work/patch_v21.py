import io
src = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v20.py'
dst = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v21.py'
s = io.open(src, encoding='utf-8').read()

# RECV global
old = 'def best_through_pass(st, u, opp, mates, me):'
new = '''RECV = {'idx': None, 'pos': None, 'frame': -999}


def best_through_pass(st, u, opp, mates, me):'''
assert old in s
s = s.replace(old, new, 1)

# record through-ball choice
old = '''        if mates:
            tp = best_through_pass(st, u, opp, mates, me)
            if tp is not None:
                cands.append((tp[0], tp[1]))
'''
new = '''        tp_sel = None
        if mates:
            tp = best_through_pass(st, u, opp, mates, me)
            if tp is not None:
                cands.append((tp[0], tp[1]))
                tp_sel = tp
'''
assert old in s
s = s.replace(old, new)

old = '''        cands.sort(reverse=True)
        if cands and cands[0][0] >= KICK_MIN:
            cmd.aim = cands[0][1]
            cmd.kick = True
'''
new = '''        cands.sort(reverse=True)
        if cands and cands[0][0] >= KICK_MIN:
            if tp_sel is not None and abs((cands[0][1] - tp_sel[1] + 180.0) % 360.0 - 180.0) < 0.01:
                RECV['idx'] = tp_sel[2]
                RECV['pos'] = tp_sel[3]
                RECV['frame'] = st.frame
            cmd.aim = cands[0][1]
            cmd.kick = True
'''
assert old in s
s = s.replace(old, new)

# wrap frame_commands to apply the receiver chase
old = '''def frame_commands(st, me):
    n = st.n
'''
new = '''def frame_commands_impl(st, me):
    n = st.n
'''
assert old in s
s = s.replace(old, new)

# add wrapper right after the impl function ends: insert before decide_window
anchor = 'def decide_window(s0, me, n):'
wrap = '''def frame_commands(st, me):
    cmds, my, opp, owner = frame_commands_impl(st, me)
    if RECV['idx'] is not None and st.owner < 0 and st.lastTeam == me \\
            and st.frame - RECV['frame'] <= 45:
        tx, ty = RECV['pos']
        tx, ty = safe_spot(me, tx, ty, 0.35)
        cmd = Cmd()
        # find the designated unit
        for u in my:
            if u.index == RECV['idx']:
                cmd.dir = move_dir(u, tx, ty, me)
                cmd.aim = math.degrees(math.atan2(ty - u.y, tx - u.x)) % 360.0
                cmds[u.index] = cmd
                break
    if st.owner >= 0:
        RECV['idx'] = None
    return cmds, my, opp, owner


'''
assert anchor in s
s = s.replace(anchor, wrap + anchor)
io.open(dst, 'w', encoding='utf-8').write(s)
print('built v21')
