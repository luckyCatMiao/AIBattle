import io
src = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v21.py'
dst = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v23.py'
s = io.open(src, encoding='utf-8').read()

# global switch
old = "GAME_CTX = {'desp': False}"
new = "GAME_CTX = {'desp': False}\nRUSH2 = bool(int(os.environ.get('SOC2_RUSH2', '1')))"
assert old in s
s = s.replace(old, new, 1)

# plan_roles: rush system for n==2
old = '''    ci = owner.index if (owner is not None and owner.team == me) else None

    # 门将
    k = my[0]
'''
new = '''    ci = owner.index if (owner is not None and owner.team == me) else None

    if n == 2 and RUSH2:
        # rush-keeper: index 0 attacks, index 1 covers the goal
        if ci == 0:
            roles[0] = ('carrier', None)
        elif owner is not None and owner.team != me:
            roles[0] = ('press', owner.index)
        else:
            roles[0] = ('striker', corner_spot(st, me, opp, bx, by, 0))
        if ci == 1:
            roles[1] = ('carrier', None)
        else:
            roles[1] = ('keep', None)
        return roles, my, opp, owner

    # 门将
    k = my[0]
'''
assert old in s
s = s.replace(old, new, 1)

io.open(dst, 'w', encoding='utf-8').write(s)
print('built v23')
