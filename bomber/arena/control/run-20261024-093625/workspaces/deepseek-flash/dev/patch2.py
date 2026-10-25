import io
p = 'agent.py'
s = io.open(p, encoding='utf-8').read()

old = """W_OPEN = float(_os.environ.get('AG_OPENW', '0.55'))     # 开图增益（log1p 新空间）的权重"""
new = """W_OPEN = float(_os.environ.get('AG_OPENW', '0.55'))     # 开图增益（log1p 新空间）的权重
# 放弹目标的最大「走过去」帧数。旧值 12 在速度 0（7 帧/格）时只覆盖不到 2 格，
# 于是 agent 只能在脚边炸墙：明明 4 格外就有一面会掉火力的墙，它也走不过去。
TRAVEL_T = int(_os.environ.get('AG_TRAVEL', '12'))
ARRIVE_T = int(_os.environ.get('AG_ARRIVE', '30'))      # dijkstra 的搜索上限（帧）
W_TRAV = float(_os.environ.get('AG_TRAV', '0.03'))      # 每帧赶路成本"""
assert old in s
s = s.replace(old, new)

old = """    arrive, prev, _ = dijkstra(fire, tiles, bomb_cells, mycell, t0, me.speed, 30)"""
new = """    arrive, prev, _ = dijkstra(fire, tiles, bomb_cells, mycell, t0, me.speed, ARRIVE_T)"""
assert old in s
s = s.replace(old, new)

old = """        for C, t in arrive.items():
            if t > 12:
                continue"""
new = """        for C, t in arrive.items():
            if t > TRAVEL_T:
                continue"""
assert old in s
s = s.replace(old, new)

old = """            pre.append((bv + (W_HIT if hit else 0.0) - 0.03 * t, C, t, hit, opens))"""
new = """            pre.append((bv + (W_HIT if hit else 0.0) - W_TRAV * t, C, t, hit, opens))"""
assert old in s
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8').write(s)
print('patched')
