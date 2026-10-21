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


def cell_exits(tiles, bombcells, cell):
    """Number of static walkable neighbours (soft walls / hard walls counted out)."""
    x, y = cell
    n = 0
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        if walkable(tiles, bombcells, x + dx, y + dy):
            n += 1
    return n


def cell_mouth(tiles, bombcells, cell):
    """The only walkable neighbour of a one-exit cell (None if zero/many)."""
    x, y = cell
    mouth = None
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        if walkable(tiles, bombcells, x + dx, y + dy):
            if mouth is not None:
                return None
            mouth = (x + dx, y + dy)
    return mouth


def pocket_risky(tiles, bombcells, cell, enemy, enemy_blast):
    """A dead end is a death trap if the opponent can bomb its mouth."""
    if enemy is None:
        return False
    mouth = cell_mouth(tiles, bombcells, cell)
    if mouth is None:
        return False
    man = abs(enemy["x"] - mouth[0]) + abs(enemy["y"] - mouth[1])
    return man <= min(enemy_blast, 6) + 1


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

def plan(tiles, bombcells, danger, start, start_ready, speed, horizon=24, K=109, avoid=None):
    """Dijkstra over (cell, frame-ready). Returns (dist, parent, states).

    ``avoid`` cells are hard-blocked (used for the live opponent's cell: it can
    drop a bomb there on the very same frame we would step in, so routing
    through it is a trap even though the engine allows fighters to overlap).
    """
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
            if avoid and (nx, ny) in avoid:
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


def reach_cells(tiles, blocked, src, cost, frames):
    """Cells a fighter can stand on within ``frames`` frames from ``src``."""
    seen = {src: 0}
    pq = [(0, src[0], src[1])]
    while pq:
        t, x, y = heapq.heappop(pq)
        if t != seen.get((x, y)):
            continue
        for _, dx, dy in DIRV:
            nx, ny = x + dx, y + dy
            if not inb(nx, ny):
                continue
            if tiles[ny * W + nx] != EMPTY or (nx, ny) in blocked:
                continue
            nt = 1 if t == 0 else t + cost
            if nt > frames:
                continue
            if nt < seen.get((nx, ny), 10 ** 9):
                seen[(nx, ny)] = nt
                heapq.heappush(pq, (nt, nx, ny))
    return set(seen)


def escape_field(tiles, blocked, hzone, speed):
    """Frames needed to reach a cell outside ``hzone`` (an enemy-bomb blast
    cross) from every walkable cell.  ``blocked`` cells (bombs, the enemy's
    own cell where the hypothetical bomb sits) are impassable.

    Used to recognise corridor/pocket positions that the opponent can seal
    with one bomb: if we cannot get out of the blast cross before the fuse
    runs out, standing there is a potential death trap.
    """
    tc = tile_cost(speed)
    INF = 10 ** 9
    dist = {}
    pq = []
    for y in range(H):
        for x in range(W):
            if tiles[y * W + x] != EMPTY:
                continue
            if (x, y) in blocked:
                continue
            if (x, y) not in hzone:
                dist[(x, y)] = 0
                heapq.heappush(pq, (0, x, y))
    while pq:
        d, x, y = heapq.heappop(pq)
        if d != dist.get((x, y)):
            continue
        for _, dx, dy in DIRV:
            nx, ny = x + dx, y + dy
            if not inb(nx, ny):
                continue
            if tiles[ny * W + nx] != EMPTY or (nx, ny) in blocked:
                continue
            nd = d + tc
            if nd < dist.get((nx, ny), INF):
                dist[(nx, ny)] = nd
                heapq.heappush(pq, (nd, nx, ny))
    return dist


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

    def __init__(self, hunt=None, always_aggro=False, hunt_start=0.0):
        self.last_btn = None
        self.tr = None
        self.always_aggro = always_aggro
        self.hunt_start = hunt_start
        self.hunt = self.HUNT if hunt is None else hunt
        self.info = {}

    # ------------------------------------------------------------------
    def escape_plan(self, P, tb, tiles, bombs, blasts, bombcells, speed, blast,
                    K=109, prefer_avoid=None, enemy_cell=None, enemy_blast=None,
                    allow_risky=False):
        """Place a bomb at P on frame tb; return (danger2, edges) if we can survive.

        The candidate escape cell must stay safe until our blast is over, and a
        one-exit pocket is rejected while the opponent is close: the opponent's
        next bomb (which we cannot see, decisions are simultaneous) would seal
        the pocket and the fuse would do the rest.

        Decisions are simultaneous, so the opponent may drop a bomb on their
        current cell on the very same frame.  That bomb can also be chained
        early by one of our existing bombs, so the whole potential blast shape
        is projected as if it were already there; if no waiting cell is safe
        from it, bombing here is a mutual kill and is refused.
        """
        extra = [{"x": P[0], "y": P[1], "fuse": FUSE, "blast": blast, "place": tb}]
        if enemy_cell is not None and enemy_blast is not None:
            extra.append({"x": enemy_cell[0], "y": enemy_cell[1], "fuse": FUSE,
                          "blast": enemy_blast, "place": tb})
        danger2, _ = project(tiles, bombs, blasts, K, extra)
        bc2 = set(bombcells)
        bc2.add(P)
        blocked = set([enemy_cell]) if enemy_cell is not None else set()
        deg_bc = bc2 | blocked
        end = tb + 53
        dist, parent, _states = plan(tiles, bc2, danger2, P, tb, speed,
                                     horizon=tb + 44, K=K,
                                     avoid=blocked or None)
        cands = []
        for cell, t in dist.items():
            ok = True
            for k in range(t, end + 1):
                if k > K or cell in dng(danger2, k):
                    ok = False
                    break
            if not ok:
                continue
            deg = cell_exits(tiles, deg_bc, cell)
            # A one-exit pocket is a death trap when the opponent is close
            # enough to bomb its mouth on the next (unseen) decision window.
            if deg <= 1 and enemy_cell is not None:
                man = abs(cell[0] - enemy_cell[0]) + abs(cell[1] - enemy_cell[1])
                if man <= 3:
                    continue
            cands.append((0 if not (prefer_avoid and cell in prefer_avoid) else 1,
                          0 if deg >= 2 else 1, t, cell))
        if not cands:
            return None
        # The opponent's bomb is placed simultaneously and can be chained
        # early by our own fuse, so a waiting cell inside the blast shape of
        # a bomb dropped where the opponent currently stands is a mutual
        # kill.  If every escape cell is inside that shape, do not bomb.
        if prefer_avoid and enemy_cell is not None and not allow_risky:
            outside = [c for c in cands if c[3] not in prefer_avoid]
            if not outside:
                return None
        cands.sort()
        _, _, t, cell = cands[0]
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
        frame = obs.get("frame", obs.get("roundFrames", 0))
        if not isinstance(frame, (int, float)):
            frame = 0
        # A new round / new game resets the engine's held-input history, so
        # the stale "last button was BOMB" edge tracking must reset too.
        if self.tr is not None and (self.tr.get("seed") != seed
                                    or self.tr.get("round") != rnd
                                    or frame <= self.tr.get("fr", -1)):
            self.last_btn = None

        speed = me.get("speed", 0)
        blast = me.get("blast", 1)
        maxb = me.get("bombs", 1)
        active = me.get("activeBombs", 0)
        cur = (me["x"], me["y"])
        if me.get("alive", True) and self.tr is not None and self.tr.get("seed") == seed \
                and self.tr.get("round") == rnd and self.tr.get("fr", -1) == frame \
                and self.tr.get("x") == cur[0] \
                and self.tr.get("y") == cur[1] and self.tr.get("speed") == speed:
            prog = self.tr["prog"]
        else:
            prog = estimate_progress(me)
            if not me.get("alive", True):
                prog = 1.0
        ready = frames_to_ready(prog, speed) if prog < 1.0 else 1
        bombcells = set((b["x"], b["y"]) for b in bombs)
        ecell = (enemy["x"], enemy["y"]) if enemy is not None else None
        enemy_blast = enemy.get("blast", 1) if enemy is not None else None
        enemy_can_bomb = (enemy is not None
                          and enemy.get("activeBombs", 0) < enemy.get("bombs", 1))
        ethreat = set()
        if enemy is not None:
            ethreat = set(blast_shape(tiles, enemy["x"], enemy["y"], enemy_blast)[0])
        # The opponent acts simultaneously and may drop a bomb on the cell they
        # currently occupy.  Our own blasts can chain it early, so its whole
        # blast shape is treated as a real, already-ticking bomb.
        hype = None
        if enemy_can_bomb:
            hype = [{"x": ecell[0], "y": ecell[1], "fuse": FUSE,
                     "blast": enemy_blast, "place": 1}]
        danger, burn = project(tiles, bombs, blasts, K=109, extra=hype)

        drops_by_cell = {}
        for d in drops:
            drops_by_cell[(d["x"], d["y"])] = d

        etc = tile_cost(enemy.get("speed", 0)) if enemy is not None else 5
        emoves = max(1, (FUSE - 2) // max(1, etc) + 1)

        # ---- enemy one-bomb trap model -----------------------------------
        # The opponent moves during the coming window too and may place a bomb
        # on any cell it can reach.  A cell is a death trap when, for some such
        # bomb position, we cannot reach a cell outside that bomb's blast cross
        # before its fuse runs out (the bomb itself blocks the only exit).
        ESC_LIMIT = 40
        INF = 10 ** 9
        trap_cells = set()
        esc_best = {}
        enemy_reach = set()
        cur_esc_ok = True
        if enemy_can_bomb and ecell is not None:
            enemy_reach = reach_cells(tiles, set(bombcells), ecell, etc, 20)
            hz0 = set(blast_shape(tiles, ecell[0], ecell[1], enemy_blast)[0])
            for b in enemy_reach:
                if b in bombcells:
                    continue
                hz = set(blast_shape(tiles, b[0], b[1], enemy_blast)[0]) | hz0
                blocked_b = set(bombcells) | {b, ecell}
                esc = escape_field(tiles, blocked_b, hz, speed)
                if b not in bombcells:
                    best_b = INF
                    for _, dx, dy in DIRV:
                        nb = (b[0] + dx, b[1] + dy)
                        if not inb(nb[0], nb[1]) or tiles[nb[1] * W + nb[0]] != EMPTY:
                            continue
                        if nb in blocked_b:
                            continue
                        dn = esc.get(nb)
                        if dn is not None and dn + 1 < best_b:
                            best_b = dn + 1
                    esc[b] = best_b
                for y in range(H):
                    base = y * W
                    for x in range(W):
                        if tiles[base + x] != EMPTY:
                            continue
                        cell = (x, y)
                        d = esc.get(cell, INF)
                        if d > ESC_LIMIT:
                            trap_cells.add(cell)
                        if d < esc_best.get(cell, INF):
                            esc_best[cell] = d
            cur_esc_ok = cur not in trap_cells

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

        def attack_cells(P):
            """Cells covered by a bomb at P, chain reactions included."""
            extra = [{"x": P[0], "y": P[1], "fuse": FUSE, "blast": blast, "place": 1}]
            d2, _ = project(tiles, bombs, blasts, 60, extra)
            cells = set()
            for k in range(1, 61):
                cells |= d2[k]
            return cells

        def attack_val(P):
            """How good is bombing at P to kill the enemy standing at ecell."""
            if ecell is None:
                return 0.0
            cells = attack_cells(P)
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

        round_no = rnd if isinstance(rnd, (int, float)) else 1
        # Endgame: a draw scores nothing, so once the clock is short the agent
        # stops touring the map for power-ups and commits to contact.
        late = float(time_left) <= 45.0
        drop_scale = 1.0
        desperate = False

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
                        v += drop_scale * (22.0 + 0.6 * DROP_VALUE.get(pd, 0.0))
                else:
                    # Even a wall without a predicted drop opens the map: on
                    # sealed spawn pockets it can be the only way out.
                    v += 8.0
            for (x, y) in cells:
                dd = drops_by_cell.get((x, y))
                if dd is not None and not maxed(dd["type"]):
                    v -= 80.0 * drop_scale
            if ecell is not None and ecell in cells:
                av = attack_val((x0, y0))
                if aggro > 0:
                    bonus = 60.0 if desperate else 45.0
                    v += aggro * (bonus + 2.0 * av)
                elif av >= 50.0:
                    # Clear kill opportunity: take it even while farming.
                    v += 40.0
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
        weak = enemy is not None and my_strength + 5.0 < es
        retreat = bool(enemy is not None and weak and dist_e <= 7
                       and float(time_left) > 15.0 and farm_left)
        if self.hunt and enemy is not None:
            # Match-aware timing: a draw is worth nothing, so when behind we
            # must force contact earlier; when ahead, patience is fine.
            hs = self.hunt_start
            if my_wins < opp_wins:
                hs = min(hs, 22.0)
            elif my_wins > opp_wins and time_left > 20:
                hs = max(hs, 60.0)
            if my_strength >= es + 2.0:
                hunt = True
            if dist_e <= 5:
                hunt = True
            if elapsed >= hs and my_strength >= es - 1.0:
                hunt = True
            if time_left <= 30 and (my_wins <= opp_wins or my_strength >= es - 2.0):
                hunt = True
            if time_left <= 15:
                hunt = True
            if not farm_left:
                hunt = True
        if self.always_aggro:
            hunt = True
        # A drawn round is worth zero for both sides, but a lost one gives the
        # opponent a point, so we only relax safety when a win is genuinely
        # required to keep the match alive.
        if enemy is not None and float(time_left) <= 30.0:
            if my_wins < opp_wins:
                desperate = True
            elif round_no >= 5 and my_wins == opp_wins:
                desperate = True
        if desperate:
            hunt = True
        if late and hunt:
            drop_scale = 0.25
        aggro = 1.0 if hunt else 0.0

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
                # Never walk into the live opponent's cell: it can drop a bomb
                # there on the same frame we arrive and step away.
                if ecell is not None and key == ecell:
                    continue
                v = 0.0
                d = drops_by_cell.get(key)
                if d is not None:
                    dt = d["type"]
                    if maxed(dt):
                        v += 4.0
                    else:
                        base = 100.0 if aggro <= 0 else 65.0
                        v += drop_scale * base + DROP_VALUE.get(dt, 0.0)
                if active < maxb:
                    bv = bomb_value(x, y)
                    if bv > v:
                        v = bv
                else:
                    # Bomb is on cooldown: still drift towards the next good
                    # bomb spot instead of idling away the two-second fuse.
                    bv = 0.55 * bomb_value(x, y)
                    if bv > v:
                        v = bv
                # One-exit pockets are death traps once the opponent is close:
                # their next unseen bomb can seal the only mouth.  While the
                # opponent can still bomb, do not pick such a cell at all.
                deg = cell_exits(tiles, bombcells, key)
                if deg <= 1:
                    if enemy_can_bomb and pocket_risky(tiles, bombcells, key,
                                                       enemy, enemy_blast):
                        continue
                    close = 99
                    if enemy is not None:
                        close = abs(enemy["x"] - x) + abs(enemy["y"] - y)
                    v -= 1.0 if (aggro > 0 and close <= 3) else 0.3
                # Corridor-trap avoidance: if the opponent could drop a bomb
                # on their current cell and we have no route out of its blast
                # cross before the fuse ends, that cell is a death trap.  Once
                # we are already in one, move towards the nearest escape.
                if enemy_can_bomb:
                    if key in trap_cells:
                        if cur_esc_ok:
                            continue
                        v -= 120.0 + 0.5 * min(esc_best.get(key, 300), 300)
                    elif not cur_esc_ok:
                        v += 20.0
                if enemy is not None and aggro > 0:
                    dd = efield.get(key)
                    if dd is not None:
                        v += aggro * max(0.0, 150.0 - 1.9 * dd) * (1.35 if late else 1.0)
                    if key in ethreat:
                        v -= 18.0 * aggro
                if retreat:
                    dd = abs(x - ecell[0]) + abs(y - ecell[1])
                    v += 4.0 * min(dd, 8)
                    if key in ethreat:
                        v -= 40.0
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
                av = ((70.0 if desperate else 55.0) + 2.0 * attack_val((px, py))) * aggro
                if (px, py) not in ethreat:
                    av += 25.0 * aggro
                if av > valmap.get((px, py), 0.0):
                    valmap[(px, py)] = av

        # ---------------- option A: bomb where we stand -------------------
        bomb_opt = None
        force_bomb = False
        bv_now = 0.0
        bomb_try = False
        if ready == 1 and active < maxb and cur not in bombcells:
            bv_now = bomb_value(cur[0], cur[1])
            if enemy is not None:
                ecells = blast_shape(tiles, cur[0], cur[1], blast)[0]
                if (enemy["x"], enemy["y"]) in ecells:
                    precious = any((c in drops_by_cell and not maxed(drops_by_cell[c]["type"]))
                                   for c in ecells)
                    # A clear kill (enemy has no reachable cell outside our
                    # blast) is worth taking even when we are not hunting.
                    if (aggro >= 0.8 or attack_val(cur) >= 50.0) and not precious:
                        force_bomb = True
            if bv_now >= 0.9:
                bomb_try = True
                esc = self.escape_plan(cur, 1, tiles, bombs, blasts, bombcells,
                                       speed, blast, prefer_avoid=ethreat,
                                       enemy_cell=ecell,
                                       enemy_blast=enemy_blast if enemy_can_bomb else None,
                                       allow_risky=desperate)
                if esc is not None:
                    danger2, edges = esc
                    inputs = build_inputs(edges, bombs_at=[1])
                    if window_safe(cur[0], cur[1], prog, speed, tiles,
                                   set(bombcells) | {cur}, inputs, danger2):
                        bomb_opt = (bv_now + 2.0, inputs, bv_now)
        # A cell can look attractive because of its bomb_value yet have no
        # provable escape.  Standing on it forever is the classic late-game
        # stall; in that case treat it as a non-goal and walk somewhere else.
        cur_unbombable = bomb_try and bomb_opt is None

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
        blocked = set([ecell]) if ecell is not None else None
        maxdeg = (lambda c: cell_exits(tiles, bombcells, c)) if blocked else None
        enemy_close = False
        if enemy is not None:
            man = abs(enemy["x"] - cur[0]) + abs(enemy["y"] - cur[1])
            enemy_close = man <= 7
        if valmap:
            mf = tile_cost(speed)
            dist, parent, _st = plan(tiles, bombcells, danger, cur, ready, speed,
                                     horizon=HORIZON, K=109, avoid=blocked)
            if len(dist) <= 1 and blocked:
                blocked = None
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
                # Do not finish a move inside a one-exit pocket right next to
                # the opponent (its next bomb can seal the mouth).
                deg = maxdeg(cell) if maxdeg else cell_exits(tiles, bombcells, cell)
                if enemy_close and deg <= 1 and cell != cur:
                    if enemy is not None and abs(enemy["x"] - cell[0]) + abs(enemy["y"] - cell[1]) <= 2:
                        continue
                if not terminal_ok(cell, t):
                    continue
                sc = v - 0.35 * t + min(deg, 3) * 1.5
                if enemy_can_bomb:
                    if cell in trap_cells:
                        if cur_esc_ok:
                            continue
                        sc -= 100.0 + 0.5 * min(esc_best.get(cell, 300), 300)
                    elif not cur_esc_ok:
                        sc += 20.0
                if cell == cur and cur_unbombable:
                    sc -= 6.0
                if best is None or sc > best[0]:
                    best = (sc, t, cell, v)
            if best is not None and best[2] == cur and cur_unbombable:
                # No second-best goal: fall through to the exploration
                # fallback instead of idling on an unbombable cell.
                best = None
            if best is not None:
                edges = reconstruct(parent, (best[2][0], best[2][1], best[1]))
                inputs = build_inputs(edges)
                if window_safe(cur[0], cur[1], prog, speed, tiles, bombcells, inputs, danger):
                    move_opt = (best[0], inputs, best[2], best[1])
                else:
                    log("goal unsafe", best[2], best[1])
            else:
                log("no goal", len(valmap), len(dist))
        else:
            log("valmap empty")
        if move_opt is None:
            # Survival / progress fallback: physical movement is allowed
            # through the opponent's cell here -- staying put in a sealed
            # pocket is worse than a risky step.
            mf2 = tile_cost(speed)
            dist, parent, _st = plan(tiles, bombcells, danger, cur, ready, speed,
                                     horizon=20 + mf2, K=109)
            best = None
            for cell, t in dist.items():
                su = safe_until(cell, max(t, 20))
                deg = cell_exits(tiles, bombcells, cell)
                risky = 1 if (enemy_can_bomb and deg <= 1
                              and pocket_risky(tiles, bombcells, cell,
                                               enemy, enemy_blast)) else 0
                # When everything is equally safe, keep making progress
                # (exploring / opening the map) instead of standing still.
                if enemy_can_bomb:
                    ef = esc_best.get(cell, 10 ** 9)
                    bad = 1 if cell in trap_cells else 0
                else:
                    ef = 0
                    bad = 0
                if not cur_esc_ok:
                    key = (bad, ef, risky, su,
                           1 if cell != cur else 0, deg, -t)
                else:
                    key = (risky, bad, su,
                           1 if cell != cur else 0, deg, -t)
                if best is None or key > best[0]:
                    best = (key, t, cell)
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
        self.tr = {"seed": seed, "round": rnd, "speed": speed, "x": ex, "y": ey, "prog": ep,
                   "fr": frame + 20}
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
            # Never skip a line: the judge expects exactly one response per
            # observation.  A malformed line gets a neutral window.
            obs = None
        if obs is None:
            out = {"inputs": [{"dir": "N", "btn": None} for _ in range(20)],
                   "note": "badjson"}
        else:
            out = ag.decide(obs)
        sys.stdout.write(json.dumps(out, ensure_ascii=False) + "\n")
        sys.stdout.flush()


if __name__ == "__main__":
    main()
