import io
p = 'agent.py'
s = io.open(p, encoding='utf-8').read()

# 1) choose_action 增加 allow_bomb 开关
old = """def choose_action(w, my):
    me = None
    opp = None"""
new = """def choose_action(w, my, allow_bomb=True):
    me = None
    opp = None"""
assert old in s
s = s.replace(old, new)

old = """    # ---- 1.5) 必杀 / 压制：把所有「能覆盖对手」的可达格单独枚举一遍。"""
new = """    # ---- 1.5) 必杀 / 压制：把所有「能覆盖对手」的可达格单独枚举一遍。
    if not allow_bomb:
        me_bombs_allowed = False
    else:
        me_bombs_allowed = True"""
assert old in s
s = s.replace(old, new)

old = """    if me.active_bombs < me.bombs and opp.alive:
        hit_cells = set(blast_cells(tiles, oppcell[0], oppcell[1], me.blast)[0])"""
new = """    if me_bombs_allowed and me.active_bombs < me.bombs and opp.alive:
        hit_cells = set(blast_cells(tiles, oppcell[0], oppcell[1], me.blast)[0])"""
assert old in s
s = s.replace(old, new)

old = """    # ---- 2) 放弹（farm / 开图 / 压制 / 击杀）
    if me.active_bombs < me.bombs:"""
new = """    # ---- 2) 放弹（farm / 开图 / 压制 / 击杀）
    if me_bombs_allowed and me.active_bombs < me.bombs:"""
assert old in s
s = s.replace(old, new)

# 2) decide：局末窗口改为「禁弹重规划」，不再截断已经验证过的走位
old = """    cands = []
    try:
        cands = choose_action(w, my)
    except Exception as e:
        if DEBUG:
            sys.stderr.write('choose err %r\\n' % (e,))"""
new = """    near_end = False
    try:
        near_end = round_may_end(w)
    except Exception:
        near_end = False
    cands = []
    try:
        cands = choose_action(w, my, allow_bomb=not near_end)
    except Exception as e:
        if DEBUG:
            sys.stderr.write('choose err %r\\n' % (e,))"""
assert old in s, 'decide head'
s = s.replace(old, new)

old = """    # 本窗口内可能局末：新一局会把地图和位置全部重置，旧计划里的放弹＝在出生点埋雷
    try:
        if frames is not None and round_may_end(w):
            frames = [(d, None) for (d, b) in frames]
            frames = frames[:-8] + [('N', None)] * 8
            note = (note + ' |noroundend').strip()
    except Exception:
        pass"""
new = """    # 本窗口内可能局末：新一局会把地图和位置全部重置，计划里的放弹＝在出生点埋雷。
    # 旧版是「把炸弹按钮抹掉 + 最后 8 帧改成原地」，但那样会跳过 run_script 的安全校验，
    # 实测 6 次自炸里有 4 次就是被这一步坑死的（走位被截断，人停在自家炸弹的十字里）。
    # 现在改成：整条计划在「本窗口禁止放弹」的前提下重新生成并重新校验，走位保持原样。
    # 走位在新一局里最多是撞墙（引擎忽略），不会致死。
    if near_end:
        note = (note + ' |noend').strip()"""
assert old in s, 'tail'
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
