import io
p = 'agent.py'
s = io.open(p, encoding='utf-8').read()

old = """def manhattan(a, b):"""
new = """def route_cost_map(tiles, bomb_cells, goal):
    \"\"\"从 goal 出发的「破墙路线代价」：空地 1、软墙 5（得先炸开）、硬墙阻挡。
    用曼哈顿距离当接近度会骗人：直线很近但中间隔着三面软墙时，agent 会贴着墙原地打转。\"\"\"
    INF = 10 ** 9
    cost = [INF] * (W * H)
    gx, gy = goal
    if not (0 <= gx < W and 0 <= gy < H):
        return cost
    start = gy * W + gx
    cost[start] = 0
    pq = [(0, start)]
    while pq:
        c, i = heapq.heappop(pq)
        if c != cost[i]:
            continue
        x, y = i % W, i // W
        for dx, dy in DIRS4:
            nx, ny = x + dx, y + dy
            if not (0 <= nx < W and 0 <= ny < H):
                continue
            j = ny * W + nx
            t = tiles[j]
            if t == HARD or (nx, ny) in bomb_cells:
                continue
            nc = c + (5 if t == SOFT else 1)
            if nc < cost[j]:
                cost[j] = nc
                heapq.heappush(pq, (nc, j))
    return cost


def manhattan(a, b):"""
assert old in s
s = s.replace(old, new, 1)

old = """    best = None
    for C, t in arrive.items():
        if t > 22 or not term_ok(C, t):
            continue
        d = manhattan(C, oppcell)
        if d < 2:
            d += 6  # 贴脸有风险
        if best is None or d < best[0]:
            best = (d, C, t)
    if best is not None:
        pth = path_to(best[1])
        sc = 0.30 + max(0.0, (6 - best[0]) * 0.10)
        if best[0] <= 3:
            sc += 0.25"""
new = """    best = None
    bestkey = None
    try:
        rcost = route_cost_map(tiles, bomb_cells, oppcell)
    except Exception:
        rcost = None
    for C, t in arrive.items():
        if t > 22 or not term_ok(C, t):
            continue
        d = manhattan(C, oppcell)
        if d < 2:
            d += 6  # 贴脸有风险
        key = d
        if rcost is not None:
            rc = rcost[C[1] * W + C[0]]
            if rc < 10 ** 9:
                key = min(d, 0.6 * rc)   # 「破墙才走得到」的路线更短，才算真的更近
        if best is None or key < bestkey:
            best = (d, C, t)
            bestkey = key
    if best is not None:
        pth = path_to(best[1])
        sc = 0.30 + max(0.0, (6 - best[0]) * 0.10)
        if best[0] <= 3:
            sc += 0.25"""
assert old in s
s = s.replace(old, new, 1)

io.open(p, 'w', encoding='utf-8').write(s)
print('ok')
