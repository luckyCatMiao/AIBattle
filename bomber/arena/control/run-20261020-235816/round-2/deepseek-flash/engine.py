"""Frame-exact Python port of the provided simulation.js rules (no bots).

Used both for offline validation and by the agent's planner (a subset).
"""
import math

W = 19
H = 17
EMPTY, HARD, SOFT = 0, 1, 2
FUSE = 40
BLAST_FRAMES = 12
FRAMES_PER_TILE = 6
FRAMES_PER_TILE_MIN = 3
BOMBS_MAX = 6
BLAST_MAX = 6
SPAWN_CLEAR = 1
POWERUP_CHANCE = 0.55
SOFT_DENSITY = 0.68
ROUND_TIME_LIMIT = 150
FRAMES_PER_DECISION = 20
HZ = 20
POWERUP_TYPES = ["bomb", "blast", "speed"]
POWERUP_WEIGHT = {"bomb": 0.40, "blast": 0.35, "speed": 0.25}


def move_frames(level):
    return max(FRAMES_PER_TILE_MIN, FRAMES_PER_TILE - level)


class Rng:
    def __init__(self, seed):
        self.s = (seed & 0xFFFFFFFF) or 1

    def next(self):
        self.s = (self.s * 1664525 + 1013904223) & 0xFFFFFFFF
        return self.s / 4294967296.0


DIR_DELTA = {"N": (0, 0), "U": (0, -1), "D": (0, 1), "L": (-1, 0), "R": (1, 0)}


def in_bounds(x, y):
    return 0 <= x < W and 0 <= y < H


def tile_index(x, y):
    return y * W + x


class Fighter:
    def __init__(self, owner, x, y, fid):
        self.id = fid
        self.owner = owner
        self.x = x
        self.y = y
        self.fromX = x
        self.fromY = y
        self.progress = 1.0
        self.movingTo = None
        self.facing = 1 if owner % 2 == 0 else -1
        self.bombs = 1
        self.blast = 1
        self.speed = 0
        self.activeBombs = 0
        self.alive = True
        self.invulnUntil = 0
        self.deathCause = None
        self.held = {"dir": "N", "btn": None}
        self.history = []

    def move_frames(self):
        return move_frames(self.speed)


class Game:
    def __init__(self, players, seed=1, round=1, tiles=None):
        """players: list of kind strings (unused beyond count); tiles optional."""
        self.seed = seed
        self.round = round
        self.players = [{"id": i, "wins": 0, "alive": True} for i in range(len(players))]
        self.roundFrames = 0
        self.tick = 0
        self.now = 0.0
        self.nextId = 1
        self.eventId = 0
        self.status = "playing"
        self.winner = None
        self.reason = ""
        self.events = []
        self.roundLog = []
        self.spawns = spawns_for(len(players), round)
        if tiles is None:
            self.tiles = build_map(seed, round)
        else:
            self.tiles = list(tiles)
        self.bombs = []
        self.blasts = []
        self.drops = []
        self.fighters = [Fighter(i, sx, sy, "p%d" % (i + 1)) for i, (sx, sy) in enumerate(self.spawns)]
        self.nextId += len(self.fighters)

    # ---------- helpers ----------
    def tile_at(self, x, y):
        if not in_bounds(x, y):
            return HARD
        return self.tiles[y * W + x]

    def set_tile(self, x, y, v):
        if in_bounds(x, y):
            self.tiles[y * W + x] = v

    def bomb_at(self, x, y):
        for b in self.bombs:
            if b["x"] == x and b["y"] == y:
                return b
        return None

    def walkable(self, x, y, ignore_bomb_id=None):
        if not in_bounds(x, y):
            return False
        if self.tile_at(x, y) != EMPTY:
            return False
        b = self.bomb_at(x, y)
        if b is not None and b["id"] != ignore_bomb_id:
            return False
        return True

    def emit(self, typ, **data):
        self.eventId += 1
        ev = {"id": self.eventId, "t": round(self.now * 1000) / 1000.0, "frame": self.roundFrames, "type": typ}
        ev.update(data)
        self.events.append(ev)

    # ---------- bombs ----------
    def place_bomb(self, f):
        if not f.alive:
            raise ValueError("dead")
        if f.activeBombs >= f.bombs:
            raise ValueError("limit")
        if self.bomb_at(f.x, f.y):
            raise ValueError("occupied")
        self.nextId += 1
        b = {"id": self.nextId, "owner": f.owner, "x": f.x, "y": f.y, "fuse": FUSE, "blast": f.blast, "exploded": False}
        self.bombs.append(b)
        f.activeBombs += 1
        self.emit("bomb", owner=f.owner, x=f.x, y=f.y)
        return b

    def explode(self, bomb):
        if bomb.get("exploded"):
            return
        bomb["exploded"] = True
        cells = [(bomb["x"], bomb["y"])]
        brokenWalls = []
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            for step in range(1, bomb["blast"] + 1):
                x, y = bomb["x"] + dx * step, bomb["y"] + dy * step
                if not in_bounds(x, y):
                    break
                t = self.tile_at(x, y)
                if t == HARD:
                    break
                cells.append((x, y))
                if t == SOFT:
                    self.set_tile(x, y, EMPTY)
                    brokenWalls.append((x, y))
                    break
                other = None
                for ob in self.bombs:
                    if not ob.get("exploded") and ob["x"] == x and ob["y"] == y:
                        other = ob
                        break
                if other is not None:
                    self.explode(other)
        for (x, y) in cells:
            self.blasts.append({"x": x, "y": y, "frames": BLAST_FRAMES, "owner": bomb["owner"]})
        self.drops = [d for d in self.drops if not any(d["x"] == c[0] and d["y"] == c[1] for c in cells)]
        for (x, y) in brokenWalls:
            self.roll_drop(x, y)
        self.emit("explode", owner=bomb["owner"], x=bomb["x"], y=bomb["y"], cells=len(cells))

    def roll_drop(self, x, y):
        rng = Rng(self.seed * 31 + self.round * 977 + x * 131 + y * 17)
        if rng.next() >= POWERUP_CHANCE:
            return None
        pick = rng.next()
        acc = 0.0
        chosen = POWERUP_TYPES[0]
        for t in POWERUP_TYPES:
            acc += POWERUP_WEIGHT[t]
            if pick <= acc:
                chosen = t
                break
        self.nextId += 1
        d = {"id": self.nextId, "x": x, "y": y, "type": chosen}
        self.drops.append(d)
        return d

    # ---------- movement ----------
    def _pressed_edge(self, f, btn):
        h = f.history
        if not h or h[-1]["btn"] != btn:
            return False
        return len(h) < 2 or h[-2]["btn"] != btn

    def step_fighter(self, f):
        if not f.alive:
            return
        inp = f.held
        if not f.history:
            return
        if f.progress < 1:
            f.progress = min(1.0, f.progress + 1.0 / f.move_frames())
            if f.progress >= 1:
                f.fromX, f.fromY = f.x, f.y
                f.movingTo = None
            return
        # pickup
        drop = None
        for d in self.drops:
            if d["x"] == f.x and d["y"] == f.y:
                drop = d
                break
        if drop is not None:
            self.drops = [d for d in self.drops if d is not drop]
            if drop["type"] == "bomb":
                f.bombs = min(BOMBS_MAX, f.bombs + 1)
            elif drop["type"] == "blast":
                f.blast = min(BLAST_MAX, f.blast + 1)
            elif drop["type"] == "speed":
                f.speed = min(FRAMES_PER_TILE - FRAMES_PER_TILE_MIN, f.speed + 1)
            self.emit("pickup", owner=f.owner, x=f.x, y=f.y, type=drop["type"])
        # bomb
        if inp["btn"] == "BOMB" and self._pressed_edge(f, "BOMB"):
            if f.activeBombs < f.bombs and not self.bomb_at(f.x, f.y):
                try:
                    self.place_bomb(f)
                except ValueError:
                    pass
        delta = DIR_DELTA.get(inp["dir"])
        if not delta or (delta[0] == 0 and delta[1] == 0):
            return
        dx, dy = delta
        if dx != 0:
            f.facing = dx
        nx, ny = f.x + dx, f.y + dy
        own = None
        for b in self.bombs:
            if b["owner"] == f.owner and b["x"] == f.x and b["y"] == f.y:
                own = b
                break
        if self.walkable(nx, ny, own["id"] if own else None):
            f.fromX, f.fromY = f.x, f.y
            f.movingTo = {"x": nx, "y": ny}
            f.progress = 1.0 / f.move_frames()
            f.x, f.y = nx, ny

    # ---------- step ----------
    def step(self):
        if self.status != "playing":
            return self
        self.roundFrames += 1
        self.tick += 1
        self.now = self.tick / HZ
        # bomb fuses
        for b in self.bombs:
            if b.get("exploded"):
                continue
            b["fuse"] -= 1
            if b["fuse"] <= 0:
                self.explode(b)
                owner = self.fighters[b["owner"]] if b["owner"] < len(self.fighters) else None
                if owner is not None:
                    owner.activeBombs = max(0, owner.activeBombs - 1)
        self.bombs = [b for b in self.bombs if not b.get("exploded")]
        # blast timers
        for c in self.blasts:
            c["frames"] -= 1
        self.blasts = [c for c in self.blasts if c["frames"] > 0]
        # movement
        for f in self.fighters:
            self.step_fighter(f)
        # damage
        for f in self.fighters:
            if not f.alive or self.roundFrames <= f.invulnUntil:
                continue
            hit = None
            for c in self.blasts:
                if c["x"] == f.x and c["y"] == f.y:
                    hit = c
                    break
            if hit is not None:
                f.alive = False
                f.deathCause = "blast:%d" % hit.get("owner", -1)
                self.emit("death", owner=f.owner, x=f.x, y=f.y, blastOwner=hit.get("owner", -1))
        # resolution
        if self.status == "playing":
            alive = [f for f in self.fighters if f.alive]
            if len(alive) <= 1:
                if len(alive) == 1:
                    self.end_round(alive[0].owner, "last")
                else:
                    self.end_round(None, "mutual")
            elif self.roundFrames >= ROUND_TIME_LIMIT * HZ:
                self.end_round(None, "timeout")
        return self

    def end_round(self, winner, reason):
        self.roundLog.append({"round": self.round, "frames": self.roundFrames, "winner": winner, "reason": reason})
        self.emit("roundEnd", owner=winner)
        if winner is not None:
            self.players[winner]["wins"] += 1
        decided = any(p["wins"] >= 3 for p in self.players) or self.round >= 5
        if decided:
            self.status = "finished"
            best = max(p["wins"] for p in self.players)
            leaders = [p for p in self.players if p["wins"] == best]
            self.winner = leaders[0]["id"] if len(leaders) == 1 else None
        else:
            self.round += 1
            self.start_round()

    def start_round(self):
        rng = Rng(self.seed * 7919 + self.round * 104729)
        self.bombs = []
        self.blasts = []
        self.drops = []
        self.roundFrames = 0
        self.spawns = spawns_for(len(self.players), self.round)
        self.tiles = build_map_with_rng(rng, self.spawns)
        self.fighters = [Fighter(i, sx, sy, "p%d" % (self.nextId + i)) for i, (sx, sy) in enumerate(self.spawns)]
        self.nextId += len(self.fighters)
        self.emit("round")

    def push_input(self, f, inp):
        f.history.append(inp)
        if len(f.history) > 8:
            f.history.pop(0)
        f.held = inp

    def advance_window(self, window_inputs):
        for i in range(FRAMES_PER_DECISION):
            if self.status != "playing":
                break
            for owner, f in enumerate(self.fighters):
                if not f.alive:
                    continue
                w = window_inputs[owner] if owner < len(window_inputs) else None
                inp = w[i] if w and i < len(w) else {"dir": "N", "btn": None}
                self.push_input(f, inp)
            self.step()
        return self


def spawns_for(count, round_):
    corners = [(1, 1), (W - 2, 1), (W - 2, H - 2), (1, H - 2)]
    base = ((round_ - 1) % 4 + 4) % 4
    if count == 2:
        order = [base, (base + 2) % 4]
    elif count == 3:
        order = [base, (base + 1) % 4, (base + 2) % 4]
    else:
        order = [base, (base + 1) % 4, (base + 2) % 4, (base + 3) % 4]
    return [corners[i] for i in order]


def build_map_with_rng(rng, spawns):
    tiles = [0] * (W * H)
    for y in range(H):
        for x in range(W):
            tiles[tile_index(x, y)] = HARD if (x % 2 == 0 and y % 2 == 0) else EMPTY
    protected = set()
    for sx, sy in [(1, 1), (W - 2, 1), (W - 2, H - 2), (1, H - 2)]:
        for dy in range(-SPAWN_CLEAR, SPAWN_CLEAR + 1):
            for dx in range(-SPAWN_CLEAR, SPAWN_CLEAR + 1):
                x, y = sx + dx, sy + dy
                if in_bounds(x, y):
                    protected.add(tile_index(x, y))
    for y in range(H):
        for x in range(W):
            rx = min(x, W - 1 - x)
            ry = min(y, H - 1 - y)
            if x != rx or y != ry:
                continue
            orbit = {tile_index(rx, ry), tile_index(W - 1 - rx, ry),
                     tile_index(rx, H - 1 - ry), tile_index(W - 1 - rx, H - 1 - ry)}
            cells = list(orbit)
            if any(tiles[i] != EMPTY or i in protected for i in cells):
                continue
            if rng.next() < SOFT_DENSITY:
                for i in cells:
                    tiles[i] = SOFT
    return tiles


def build_map(seed, round_):
    rng = Rng(seed * 7919 + round_ * 104729)
    return build_map_with_rng(rng, spawns_for(2, round_))


def snapshot(g):
    return {
        "round": g.round, "roundFrames": g.roundFrames, "status": g.status,
        "tiles": list(g.tiles),
        "fighters": [{"owner": f.owner, "x": f.x, "y": f.y, "fromX": f.fromX, "fromY": f.fromY,
                      "progress": f.progress, "alive": f.alive, "bombs": f.bombs, "blast": f.blast,
                      "speed": f.speed, "activeBombs": f.activeBombs} for f in g.fighters],
        "bombs": [dict(b) for b in g.bombs],
        "blasts": [dict(c) for c in g.blasts],
        "drops": [dict(d) for d in g.drops],
        "events": list(g.events),
    }
