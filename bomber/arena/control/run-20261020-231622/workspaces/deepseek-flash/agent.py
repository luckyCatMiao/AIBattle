#!/usr/bin/env python3
"""Bubble-fight 1v1 agent (program mode).

Every observation is one decision window (20 frames).  The agent
  * projects the exact blast timeline of every known bomb (chains included),
  * plans frame-exact movement (including the engine's float tile-time quirk),
  * farms soft walls whose drops are pre-determined by (seed, round, x, y),
  * only ever places a bomb when a safe escape route is proven to exist.
"""
import sys
import json
import heapq

W, H = 19, 17
EMPTY, HARD, SOFT = 0, 1, 2
DIRV = (("R", 1, 0), ("L", -1, 0), ("D", 0, 1), ("U", 0, -1))
DELTA = {"R": (1, 0), "L": (-1, 0), "D": (0, 1), "U": (0, -1)}
FUSE = 40
BLAST_FRAMES = 12
POWERUP_CHANCE = 0.55
PW_TYPES = ("bomb", "blast", "speed")
PW_WEIGHT = {"bomb": 0.40, "blast": 0.35, "speed": 0.25}
DROP_VALUE = {"speed": 14.0, "blast": 12.0, "bomb": 9.0}

DEBUG = False


def log(*a):
    if DEBUG:
        print(*a, file=sys.stderr)


def inb(x, y):
    return 0 <= x < W and 0 <= y < H


def move_frames(level):
    return max(3, 6 - level)


_EFF = {}


def tile_cost(speed):
    """Frames a full tile move really takes (mirrors IEEE double accumulation)."""
    mf = move_frames(speed)
    if mf not in _EFF:
        p = 0.0
        n = 0
        while p < 1.0:
            p = min(1.0, p + 1.0 / mf)
            n += 1
        _EFF[mf] = n
    return _EFF[mf]


def frames_to_ready(prog, speed):
    mf = move_frames(speed)
    p = prog
    n = 0
    while p < 1.0 and n < 20:
        p = min(1.0, p + 1.0 / mf)
        n += 1
    return n + 1 if n > 0 else 1


def predicted_drop(seed, rnd, x, y):
    s = (seed * 31 + rnd * 977 + x * 131 + y * 17) & 0xFFFFFFFF
    if s == 0:
        s = 1

    def nxt():
        nonlocal s
        s = (s * 1664525 + 1013904223) & 0xFFFFFFFF
        return s / 4294967296.0

    if nxt() >= POWERUP_CHANCE:
        return None
    pick = nxt()
    if pick <= 0.40:
        return "bomb"
    if pick <= 0.75:
        return "blast"
    return "speed"


def walkable(tiles, bombcells, x, y):
    if not inb(x, y):
        return False
    if tiles[y * W + x] != EMPTY:
        return False
    return (x, y) not in bombcells


def dng(danger, k):
    if 0 <= k < len(danger):
        return danger[k]
    return ()


# ---------------------------------------------------------------------------
# blast projection for known bombs (frame exact, chain reactions included)
# ---------------------------------------------------------------------------

def _explode(tl, bombs, blasts, bomb, burn, frame):
    bomb["exploded"] = True
    cells = [(bomb["x"], bomb["y"])]
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for step in range(1, bomb["blast"] + 1):
            x, y = bomb["x"] + dx * step, bomb["y"] + dy * step
            if not inb(x, y):
                break
            t = tl[y * W + x]
            if t == HARD:
                break
            cells.append((x, y))
            if t == SOFT:
                tl[y * W + x] = EMPTY
                break
            other = None
            for ob in bombs:
                if not ob["exploded"] and ob["x"] == x and ob["y"] == y:
                    other = ob
                    break
            if other is not None:
                _explode(tl, bombs, blasts, other, burn, frame)
    for (x, y) in cells:
        blasts.append({"x": x, "y": y, "frames": BLAST_FRAMES})
        if (x, y) not in burn:
            burn[(x, y)] = frame


def project(tiles, bombs, blasts, K, extra=None):
    """danger[k] = flame cells during engine frame k; burn[cell] = first blast frame."""
    tl = bytearray(tiles)
    bs = [{"x": b["x"], "y": b["y"], "fuse": b["fuse"], "blast": b["blast"],
           "exploded": False, "place": None} for b in bombs]
    if extra:
        for b in extra:
            bs.append({"x": b["x"], "y": b["y"], "fuse": b["fuse"], "blast": b["blast"],
                       "exploded": False, "place": b.get("place", 0)})
    bl = [{"x": c["x"], "y": c["y"], "frames": c["frames"]} for c in blasts]
    danger = [set() for _ in range(K + 1)]
    burn = {}
    for k in range(1, K + 1):
        for b in bs:
            if b["exploded"]:
                continue
            if b["place"] is not None and k <= b["place"]:
                continue
            b["fuse"] -= 1
            if b["fuse"] <= 0:
                _explode(tl, bs, bl, b, burn, k)
        bs = [b for b in bs if not b["exploded"]]
        for c in bl:
            c["frames"] -= 1
        bl = [c for c in bl if c["frames"] > 0]
        danger[k] = set((c["x"], c["y"]) for c in bl)
    return danger, burn


# ---------------------------------------------------------------------------
# path planning
# ---------------------------------------------------------------------------

def plan(tiles, bombcells, danger, start, start_ready, speed, horizon=24, K=109):
    """Dijkstra over (cell, frame-ready). Returns (dist, parent, states)."""
    tc = tile_cost(speed)
    dist = {}
    parent = {}
    states = {}
    states[(start[0], start[1], start_ready)] = start_ready
    pq = [(start_ready, start[0], start[1])]
    while pq:
        t, x, y = heapq.heappop(pq)
        if states.get((x, y, t)) != t:
            continue
        if (x, y) not in dist or t < dist[(x, y)]:
            dist[(x, y)] = t
        if t > horizon:
            continue
        if t + 1 <= horizon and (x, y) not in dng(danger, t):
            key = (x, y, t + 1)
            if states.get(key, 10 ** 9) > t + 1:
                states[key] = t + 1
                parent[key] = (x, y, t, "N")
                heapq.heappush(pq, (t + 1, x, y))
        for d, dx, dy in DIRV:
            nx, ny = x + dx, y + dy
            if not walkable(tiles, bombcells, nx, ny):
                continue
            ok = True
            for k in range(t, t + tc):
                if k > K or (nx, ny) in dng(danger, k):
                    ok = False
                    break
            if not ok:
                continue
            nt = t + tc
            if nt > horizon:
                continue
            key = (nx, ny, nt)
            if states.get(key, 10 ** 9) > nt:
                states[key] = nt
                parent[key] = (x, y, t, d)
                heapq.heappush(pq, (nt, nx, ny))
    return dist, parent, states


def reconstruct(parent, node):
    edges = []
    guard = 0
    while node in parent and guard < 2000:
        px, py, pt, d = parent[node]
        edges.append((pt, px, py, d, node[0], node[1]))
        node = (px, py, pt)
        guard += 1
    edges.reverse()
    return edges


def build_inputs(edges, bombs_at=None):
    inp = [{"dir": "N", "btn": None} for _ in range(20)]
    for (t, px, py, d, nx, ny) in edges:
        if 1 <= t <= 20 and d != "N":
            inp[t - 1]["dir"] = d
    if bombs_at:
        for t in bombs_at:
            if 1 <= t <= 20:
                inp[t - 1]["btn"] = "BOMB"
    return inp


def advance_self(x, y, prog, speed, tiles, bombcells, inputs):
    """Exact movement replay for our own fighter over 20 frames."""
    mf = move_frames(speed)
    for k in range(1, 21):
        inp = inputs[k - 1]
        if prog < 1.0:
            prog = min(1.0, prog + 1.0 / mf)
        else:
            d = inp["dir"]
            if d != "N":
                dx, dy = DELTA[d]
                nx, ny = x + dx, y + dy
                if walkable(tiles, bombcells, nx, ny):
                    x, y = nx, ny
                    prog = 1.0 / mf
    return x, y, prog


def window_safe(x, y, prog, speed, tiles, bombcells, inputs, danger):
    mf = move_frames(speed)
    for k in range(1, 21):
        inp = inputs[k - 1]
        if prog < 1.0:
            prog = min(1.0, prog + 1.0 / mf)
        else:
            d = inp["dir"]
            if d != "N":
                dx, dy = DELTA[d]
                nx, ny = x + dx, y + dy
                if walkable(tiles, bombcells, nx, ny):
                    x, y = nx, ny
                    prog = 1.0 / mf
        if (x, y) in dng(danger, k):
            return False
    return True


def estimate_progress(me):
    x, y = me["x"], me["y"]
    px, py = me.get("px", x), me.get("py", y)
    if abs(px - x) < 1e-9 and abs(py - y) < 1e-9:
        return 1.0
    if abs(px - x) > abs(py - y):
        fx = x - 1 if px < x else x + 1
        fy = y
    else:
        fx = x
        fy = y - 1 if py < y else y + 1
    if x != fx:
        p_obs = (px - fx) / float(x - fx)
    else:
        p_obs = (py - fy) / float(y - fy)
    mf = move_frames(me.get("speed", 0))
    p = 0.0
    best = None
    while True:
        p = min(1.0, p + 1.0 / mf)
        if p >= 1.0:
            break
        if best is None or abs(p - p_obs) < abs(best - p_obs):
            best = p
    return best if best is not None else 1.0


def blast_shape(tiles, x0, y0, blast):
    cells = [(x0, y0)]
    walls = []
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        for step in range(1, blast + 1):
            x, y = x0 + dx * step, y0 + dy * step
            if not inb(x, y):
                break
            t = tiles[y * W + x]
            if t == HARD:
                break
            cells.append((x, y))
            if t == SOFT:
                walls.append((x, y))
                break
    return cells, walls


class Agent:
    HUNT = True

    def __init__(self, hunt=None, always_aggro=False, hunt_start=40.0):
        self.last_btn = None
        self.tr = None
        self.always_aggro = always_aggro
        self.hunt_start = hunt_start
        self.hunt = self.HUNT if hunt is None else hunt
        self.info = {}

    # ------------------------------------------------------------------
    def escape_plan(self, P, tb, tiles, bombs, blasts, bombcells, speed, blast,
                    K=109, avoid=None):
        """Place a bomb at P on frame tb; return (danger2, edges) if we can survive."""
        extra = [{"x": P[0], "y": P[1], "fuse": FUSE, "blast": blast, "place": tb}]
        danger2, _ = project(tiles, bombs, blasts, K, extra)
        bc2 = set(bombcells)
        bc2.add(P)
        end = tb + 53
        dist, parent, _states = plan(tiles, bc2, danger2, P, tb, speed,
                                     horizon=tb + 44, K=K)
        cands = []
        for cell, t in dist.items():
            ok = True
            for k in range(t, end + 1):
                if k > K or cell in dng(danger2, k):
                    ok = False
                    break
            if ok:
                # Prefer an escape cell outside the opponent's potential blast.
                cands.append((0 if (avoid and cell in avoid) else 1, t, cell))
        if not cands:
            return None
        cands.sort()
        _, t, cell = cands[0]
        edges = reconstruct(parent, (cell[0], cell[1], t))
        return danger2, edges

    # ------------------------------------------------------------------
    def _decide(self, obs):
        if obs.get("status") != "playing":
            return {"inputs": [{"dir": "N", "btn": None} for _ in range(20)], "note": "over"}
        try:
            tiles = list(obs["map"]["tiles"])
        except Exception:
            return {"inputs": [{"dir": "N", "btn": None} for _ in range(20)], "note": "nomap"}
        if len(tiles) != W * H:
            return {"inputs": [{"dir": "N", "btn": None} for _ in range(20)], "note": "badmap"}
        fs = obs.get("fighters") or []
        if not fs:
            return {"inputs": [{"dir": "N", "btn": None} for _ in range(20)], "note": "nof"}
        myo = obs.get("yourPlayer", 0)
        me = None
        for f in fs:
            if f.get("owner") == myo:
                me = f
                break
        if me is None:
            me = fs[0]
        enemy = None
        for f in fs:
            if f.get("owner") != me.get("owner") and f.get("alive", True):
                delta = abs(f["x"] - me["x"]) + abs(f["y"] - me["y"])
                if enemy is None or delta < enemy[0]:
                    enemy = (delta, f)
        enemy = enemy[1] if enemy else None

        bombs = obs.get("bombs") or []
        blasts = obs.get("blasts") or []
        drops = obs.get("drops") or []
        seed = obs.get("seed", 1)
        rnd = obs.get("round", 1)
        time_left = obs.get("timeLeft", 150)

        speed = me.get("speed", 0)
        blast = me.get("blast", 1)
        maxb = me.get("bombs", 1)
        active = me.get("activeBombs", 0)
        cur = (me["x"], me["y"])
        if me.get("alive", True) and self.tr is not None and self.tr.get("seed") == seed \
                and self.tr.get("round") == rnd and self.tr.get("x") == cur[0] \
                and self.tr.get("y") == cur[1] and self.tr.get("speed") == speed:
            prog = self.tr["prog"]
        else:
            prog = estimate_progress(me)
            if not me.get("alive", True):
                prog = 1.0
        ready = frames_to_ready(prog, speed) if prog < 1.0 else 1
        bombcells = set((b["x"], b["y"]) for b in bombs)

        danger, burn = project(tiles, bombs, blasts, K=109)

        drops_by_cell = {}
        for d in drops:
            drops_by_cell[(d["x"], d["y"])] = d

        ecell = (enemy["x"], enemy["y"]) if enemy is not None else None
        etc = tile_cost(enemy.get("speed", 0)) if enemy is not None else 5
        emoves = max(1, (FUSE + 10) // max(1, etc))

        def enemy_bfs(blocked, src):
            seen = {src: 0}
            dq = [src]
            qi = 0
            while qi < len(dq):
                cx, cy = dq[qi]
                qi += 1
                d = seen[(cx, cy)]
                for _, dx, dy in DIRV:
                    nx, ny = cx + dx, cy + dy
                    if (nx, ny) in seen or (nx, ny) in blocked:
                        continue
                    if not inb(nx, ny) or tiles[ny * W + nx] != EMPTY:
                        continue
                    seen[(nx, ny)] = d + 1
                    dq.append((nx, ny))
            return seen

        def attack_val(P):
            """How good is bombing at P to kill the enemy standing at ecell."""
            if ecell is None:
                return 0.0
            cells = set(blast_shape(tiles, P[0], P[1], blast)[0])
            if ecell not in cells:
                return 0.0
            seen = enemy_bfs(set(bombcells) | {P}, ecell)
            safe = [(d, c) for c, d in seen.items() if c not in cells]
            if not safe:
                return 60.0
            mind = min(d for d, c in safe)
            if mind > emoves:
                return 60.0
            n = sum(1 for d, c in safe if d <= emoves)
            return max(0.0, 16.0 - 1.5 * n)

        def maxed(t):
            return (t == "bomb" and maxb >= 6) or (t == "blast" and blast >= 6) \
                or (t == "speed" and speed >= 3)

        def bomb_value(x0, y0):
            cells, walls = blast_shape(tiles, x0, y0, blast)
            v = 0.0
            for (x, y) in walls:
                pd = predicted_drop(seed, rnd, x, y)
                if pd:
                    if maxed(pd):
                        v += 1.0
                    else:
                        v += 22.0 + 0.6 * DROP_VALUE.get(pd, 0.0)
                else:
                    v += 1.2
            for (x, y) in cells:
                dd = drops_by_cell.get((x, y))
                if dd is not None and not maxed(dd["type"]):
                    v -= 80.0
            if ecell is not None and ecell in cells and aggro > 0:
                v += aggro * (45.0 + 2.0 * attack_val((x0, y0)))
            return v

        # ---- mode: farm or hunt -----------------------------------------
        elapsed = 150.0 - float(time_left)
        my_wins, opp_wins = 0, 0
        for p in (obs.get("players") or []):
            if p.get("id") == me.get("owner"):
                my_wins = p.get("wins", 0)
            else:
                opp_wins = max(opp_wins, p.get("wins", 0))
        behind = my_wins <= opp_wins
        my_strength = blast * 2 + maxb + speed * 1.5
        es = 0.0
        if enemy is not None:
            es = enemy.get("blast", 1) * 2 + enemy.get("bombs", 1) + enemy.get("speed", 0) * 1.5
        dist_e = 99
        if enemy is not None:
            dist_e = abs(enemy["x"] - cur[0]) + abs(enemy["y"] - cur[1])
        farm_left = any(t == SOFT for t in tiles)
        hunt = False
        if self.hunt and enemy is not None:
            if my_strength >= es + 2.0:
                hunt = True
            if dist_e <= 5:
                hunt = True
            if elapsed >= self.hunt_start and my_strength >= es - 1.0:
                hunt = True
            if time_left <= 30 and my_strength >= es - 2.0:
                hunt = True
            if not farm_left:
                hunt = True
        if self.always_aggro:
            hunt = True
        aggro = 1.0 if hunt else 0.0

        ethreat = set()
        if enemy is not None:
            ethreat = set(blast_shape(tiles, enemy["x"], enemy["y"],
                                      enemy.get("blast", 1))[0])

        # Weighted distance field from the enemy: the gradient leads toward the
        # target without saturating behind a few soft walls.
        efield = {}
        if enemy is not None and aggro > 0:
            ex0, ey0 = enemy["x"], enemy["y"]
            efield[(ex0, ey0)] = 0
            epq = [(0, ex0, ey0)]
            while epq:
                d0, cx, cy = heapq.heappop(epq)
                if d0 != efield.get((cx, cy)):
                    continue
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, ny = cx + dx, cy + dy
                    if not inb(nx, ny):
                        continue
                    t2 = tiles[ny * W + nx]
                    if t2 == HARD:
                        continue
                    if (nx, ny) in bombcells:
                        step = 5
                    elif t2 == SOFT:
                        step = 4
                    else:
                        step = 1
                    nd = d0 + step
                    if nd < efield.get((nx, ny), 10 ** 9):
                        efield[(nx, ny)] = nd
                        heapq.heappush(epq, (nd, nx, ny))

        # cell values
        valmap = {}
        for y in range(H):
            for x in range(W):
                if tiles[y * W + x] != EMPTY:
                    continue
                key = (x, y)
                if key in bombcells:
                    continue
                v = 0.0
                d = drops_by_cell.get(key)
                if d is not None:
                    dt = d["type"]
                    if maxed(dt):
                        v += 4.0
                    else:
                        v += (100.0 if aggro <= 0 else 65.0) + DROP_VALUE.get(dt, 0.0)
                if active < maxb:
                    bv = bomb_value(x, y)
                    if bv > v:
                        v = bv
                if enemy is not None and aggro > 0:
                    dd = efield.get(key)
                    if dd is not None:
                        v += aggro * max(0.0, 150.0 - 1.9 * dd)
                    if key in ethreat:
                        v -= 18.0 * aggro
                if v >= 0.5:
                    valmap[key] = v

        # hunting: positions from which our blast reaches the enemy
        if enemy is not None and aggro > 0:
            ex, ey = enemy["x"], enemy["y"]
            cands = []
            for _, dx, dy in DIRV:
                for step in range(1, blast + 1):
                    px, py = ex + dx * step, ey + dy * step
                    if not inb(px, py):
                        break
                    t2 = tiles[py * W + px]
                    if t2 != EMPTY:
                        break
                    cands.append((px, py))
            for (px, py) in cands:
                if (px, py) in bombcells:
                    continue
                av = (55.0 + 2.0 * attack_val((px, py))) * aggro
                if (px, py) not in ethreat:
                    av += 25.0 * aggro
                if av > valmap.get((px, py), 0.0):
                    valmap[(px, py)] = av

        # ---------------- option A: bomb where we stand -------------------
        bomb_opt = None
        force_bomb = False
        if ready == 1 and active < maxb and cur not in bombcells:
            bv_now = bomb_value(cur[0], cur[1])
            if enemy is not None and aggro > 0:
                ecells = blast_shape(tiles, cur[0], cur[1], blast)[0]
                if (enemy["x"], enemy["y"]) in ecells:
                    precious = any((c in drops_by_cell and not maxed(drops_by_cell[c]["type"]))
                                   for c in ecells)
                    if aggro >= 0.8 and not precious:
                        force_bomb = True
            if bv_now >= 0.9:
                esc = self.escape_plan(cur, 1, tiles, bombs, blasts, bombcells,
                                       speed, blast, avoid=ethreat)
                if esc is not None:
                    danger2, edges = esc
                    inputs = build_inputs(edges, bombs_at=[1])
                    if window_safe(cur[0], cur[1], prog, speed, tiles,
                                   set(bombcells) | {cur}, inputs, danger2):
                        bomb_opt = (bv_now + 2.0, inputs, bv_now)

        # ---------------- option B: walk to the best goal ------------------
        HORIZON = 44

        def terminal_ok(cell, t, guard=14):
            end = max(20, t) + guard
            for k in range(t, min(end, 108) + 1):
                if cell in dng(danger, k):
                    return False
            return True

        def safe_until(cell, t):
            k = t
            while k <= 108 and cell not in dng(danger, k):
                k += 1
            return k

        move_opt = None
        if valmap:
            mf = tile_cost(speed)
            dist, parent, _st = plan(tiles, bombcells, danger, cur, ready, speed,
                                     horizon=HORIZON, K=109)
            best = None
            for cell, v in valmap.items():
                t = dist.get(cell)
                if t is None or t > HORIZON:
                    continue
                if cell in drops_by_cell:
                    bt = burn.get(cell)
                    if bt is not None and t >= bt:
                        continue
                if not terminal_ok(cell, t):
                    continue
                sc = v - 0.35 * t
                if best is None or sc > best[0]:
                    best = (sc, t, cell, v)
            if best is not None:
                edges = reconstruct(parent, (best[2][0], best[2][1], best[1]))
                inputs = build_inputs(edges)
                if window_safe(cur[0], cur[1], prog, speed, tiles, bombcells, inputs, danger):
                    move_opt = (best[0], inputs, best[2], best[1])
            if move_opt is None:
                dist, parent, _st = plan(tiles, bombcells, danger, cur, ready, speed,
                                         horizon=20 + mf, K=109)
                best = None
                for cell, t in dist.items():
                    su = safe_until(cell, max(t, 20))
                    if best is None or su > best[0] or (su == best[0] and t < best[1]):
                        best = (su, t, cell)
                if best is not None:
                    edges = reconstruct(parent, (best[2][0], best[2][1], best[1]))
                    inputs = build_inputs(edges)
                    if window_safe(cur[0], cur[1], prog, speed, tiles, bombcells, inputs, danger):
                        move_opt = (-100.0, inputs, best[2], best[1])

        # If walking cannot improve our position this window, open the map.
        if bomb_opt is not None and move_opt is not None and move_opt[2] == cur:
            force_bomb = True

        # ---------------- decision ----------------------------------------
        if bomb_opt is not None and (force_bomb or move_opt is None or bomb_opt[0] >= move_opt[0]):
            use = bomb_opt[1]
            note = "bomb"
        elif move_opt is not None:
            use = move_opt[1]
            note = "move"
        else:
            use = [{"dir": "N", "btn": None} for _ in range(20)]
            note = "wait"

        self.info = {"cur": (cur[0], cur[1]),
                     "enemy": (enemy["x"], enemy["y"]) if enemy is not None else None,
                     "aggro": round(aggro, 2), "note": note, "hunt": hunt,
                     "bomb": bomb_opt is not None, "move": move_opt is not None,
                     "stats": (maxb, blast, speed), "active": active,
                     "drops": len(drops),
                     "bs": round(bomb_opt[0], 1) if bomb_opt else None,
                     "ms": round(move_opt[0], 1) if move_opt else None,
                     "mt": move_opt[2] if move_opt else None,
                     "ready": ready,
                     "dirs": "".join(u["dir"] for u in use)}
        if self.last_btn == "BOMB" and use[0]["btn"] == "BOMB":
            shifted = [{"dir": "N", "btn": None}]
            shifted += [dict(u) for u in use[:-1]]
            use = shifted
        self.last_btn = use[-1]["btn"]

        ex, ey, ep = advance_self(cur[0], cur[1], prog, speed, tiles, bombcells, use)
        self.tr = {"seed": seed, "round": rnd, "speed": speed, "x": ex, "y": ey, "prog": ep}
        return {"inputs": use, "note": note}

    def decide(self, obs):
        try:
            return self._decide(obs)
        except Exception as e:
            log("ERR", repr(e))
            return {"inputs": [{"dir": "N", "btn": None} for _ in range(20)], "note": "error"}


def main():
    global DEBUG
    DEBUG = bool(__import__("os").environ.get("AGENT_DEBUG"))
    ag = Agent()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            obs = json.loads(line)
        except Exception:
            continue
        sys.stdout.write(json.dumps(ag.decide(obs), ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
