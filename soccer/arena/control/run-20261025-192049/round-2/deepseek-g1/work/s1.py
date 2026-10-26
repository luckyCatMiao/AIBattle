

# ======================================================================
#  v2 strategy: model-based planner
# ======================================================================

FIELD_W = 44.0
FIELD_H = 26.0
MY_GOAL_X = {0: 1.0, 1: 43.0}
OPP_GOAL_X = {0: 43.0, 1: 1.0}
ATK = {0: 1.0, 1: -1.0}
PBOX2 = {0: (1.0, 6.0, 10.0, 20.0), 1: (34.0, 6.0, 43.0, 20.0)}
MOUTH_LO = 10.5
MOUTH_HI = 15.5
CR = 0.82
SPD = 3.15
DRIBF = 0.58
KICKP = 11.0
FRIC = 0.978
WALLR = 0.72
R_B = 0.22
R_U = 0.34
KICK_OFF = 0.59
KEEPER_TRACK = 2.6
BOX_M = 0.62
DIR8 = ('R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR')
S2 = 0.7071067811865476
DIRV8 = {'R': (1, 0), 'DR': (S2, S2), 'D': (0, 1), 'DL': (-S2, S2),
         'L': (-1, 0), 'UL': (-S2, -S2), 'U': (0, -1), 'UR': (S2, -S2)}
DEBUG = bool(os.environ.get('SOC3_DEBUG'))
_LOG = os.environ.get('SOC3_LOG')


def dbg(o):
    if _LOG:
        try:
            with open(_LOG, 'a', encoding='utf-8') as fh:
                fh.write(json.dumps(o, ensure_ascii=False) + '\n')
        except Exception:
            pass


class Cmd(object):
    __slots__ = ('dir', 'aim', 'kick')

    def __init__(self, d='N', aim=None, kick=False):
        self.dir = d
        self.aim = aim
        self.kick = kick


def clamp(v, a, b):
    return a if v < a else (b if v > b else v)


def in_box(team, x, y):
    b = PBOX2[team]
    return b[0] <= x <= b[2] and b[1] <= y <= b[3]


def infl_box(me, m=BOX_M):
    b = PBOX2[1 - me]
    return (b[0] - m, b[2] + m, b[1] - m, b[3] + m)


def in_infl(me, x, y, m=BOX_M):
    x1, x2, y1, y2 = infl_box(me, m)
    return x1 <= x <= x2 and y1 <= y <= y2


def push_out(me, x, y, m=BOX_M):
    x = clamp(x, 0.45, FIELD_W - 0.45)
    y = clamp(y, 0.45, FIELD_H - 0.45)
    if not in_infl(me, x, y, m):
        return x, y
    b = PBOX2[1 - me]
    cands = []
    if b[0] > 1.5:
        cands.append((b[0] - m - 0.05, y))
    if b[2] < FIELD_W - 1.5:
        cands.append((b[2] + m + 0.05, y))
    cands.append((x, b[1] - m - 0.05))
    cands.append((x, b[3] + m + 0.05))
    best = None
    for cx, cy in cands:
        cx = clamp(cx, 0.45, FIELD_W - 0.45)
        cy = clamp(cy, 0.45, FIELD_H - 0.45)
        if in_infl(me, cx, cy, m):
            continue
        d = (cx - x) ** 2 + (cy - y) ** 2
        if best is None or d < best[0]:
            best = (d, cx, cy)
    if best is None:
        return x, y
    return best[1], best[2]


def seg_blocked(me, x1, y1, x2, y2, m=BOX_M):
    dx, dy = x2 - x1, y2 - y1
    n = max(4, int(math.hypot(dx, dy) / 0.25))
    for i in range(n + 1):
        t = i / float(n)
        if in_infl(me, x1 + dx * t, y1 + dy * t, m):
            return True
    return False


def gateways(me):
    if ATK[me] > 0:
        xg = 34.0 - BOX_M - 0.05
    else:
        xg = 10.0 + BOX_M + 0.05
    return xg, 5.1, 20.9


def route_point(me, ux, uy, tx, ty):
    tx, ty = push_out(me, tx, ty)
    if not seg_blocked(me, ux, uy, tx, ty):
        return tx, ty
    xg, yt, yb = gateways(me)
    cands = []
    for gy in (yt, yb):
        a = seg_blocked(me, ux, uy, xg, gy)
        b = seg_blocked(me, xg, gy, tx, ty)
        d = math.hypot(xg - ux, gy - uy) + math.hypot(tx - xg, ty - gy)
        cands.append((a + b, d, xg, gy))
    cands.sort()
    if cands[0][0] > 0:
        # fall back: whichever gateway has fewer blocked samples
        return cands[0][2], cands[0][3]
    return cands[0][2], cands[0][3]


def move_dir_to(ux, uy, tx, ty, me, allow_box=False, m=BOX_M):
    if allow_box:
        dx, dy = tx - ux, ty - uy
        d = math.hypot(dx, dy)
        if d < 1e-6:
            return 'N'
        ux2, uy2 = dx / d, dy / d
        best, bv = 'N', -2.0
        for nm in DIR8:
            vx, vy = DIRV8[nm]
            v = vx * ux2 + vy * uy2
            if v > bv:
                bv, best = v, nm
        return best
    wx, wy = route_point(me, ux, uy, tx, ty)
    dx, dy = wx - ux, wy - uy
    d = math.hypot(dx, dy)
    if d < 0.10:
        dx, dy = tx - ux, ty - uy
        d = math.hypot(dx, dy)
        if d < 0.06:
            return 'N'
    ux2, uy2 = dx / d, dy / d
    best, bv = 'N', -2.0
    for nm in DIR8:
        vx, vy = DIRV8[nm]
        v = vx * ux2 + vy * uy2
        nx, ny = ux + vx * SPD * DT * 3.0, uy + vy * SPD * DT * 3.0
        if in_infl(me, nx, ny, m):
            v -= 2.0
        if v > bv:
            bv, best = v, nm
    return best


def ang_to(ux, uy, tx, ty):
    return math.degrees(math.atan2(ty - uy, tx - ux)) % 360.0


def kick_origin(u, ang):
    a = math.radians(ang)
    fx, fy = math.cos(a), math.sin(a)
    ox, oy = u.x + fx * KICK_OFF, u.y + fy * KICK_OFF
    if ball_hits_wall(ox, oy):
        ox, oy = u.x, u.y
    return ox, oy, fx, fy


def flight(bx, by, ang, maxf=150):
    """Exact ball physics (same as engine); returns (path, goal_frame, goal_team)."""
    a = math.radians(ang)
    vx, vy = KICKP * math.cos(a), KICKP * math.sin(a)
    x, y = bx, by
    path = []
    for f in range(maxf):
        for _ in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if MOUTH_LO <= y <= MOUTH_HI:
                if x <= 1.0:
                    return path, f + 1, 1
                if x >= FIELD_W - 1.0:
                    return path, f + 1, 0
            if ball_hits_wall(x, y):
                px, py = x - vx * DT / 4.0, y - vy * DT / 4.0
                if ball_hits_wall(x, py):
                    x = px
                    vx = -vx * WALLR
                if ball_hits_wall(px, y):
                    y = py
                    vy = -vy * WALLR
                if ball_hits_wall(x, y):
                    x, y = px, py
                    vx = -vx * WALLR
                    vy = -vy * WALLR
        vx *= FRIC
        vy *= FRIC
        if abs(vx) + abs(vy) < 0.02:
            vx = vy = 0.0
        path.append((x, y))
        if vx == 0.0 and vy == 0.0:
            break
    return path, None, -1


class WCtx(object):
    __slots__ = ('ball0', 'opps', 'prev', 'frame0', 'me', 'mode', 'passp', 'shot_cache')

    def __init__(self):
        self.ball0 = (FIELD_W / 2.0, FIELD_H / 2.0)
        self.opps = []
        self.prev = {}
        self.frame0 = 0
        self.me = 0
        self.mode = 'normal'
        self.passp = None
        self.shot_cache = {}


def build_wctx(st, prev_obs, me, mode):
    w = WCtx()
    w.ball0 = (st.bx, st.by)
    w.frame0 = st.frame
    w.me = me
    w.mode = mode
    mygx = MY_GOAL_X[me]
    prev_pos = {}
    if prev_obs:
        for u in prev_obs.get('units', []):
            prev_pos[(int(u['team']), int(u['index']))] = (float(u['x']), float(u['y']))
    for u in st.units:
        if u.team == me:
            continue
        o = {'pos': (u.x, u.y), 'keeper': (u.index == 0), 'committed': [],
             'pos20': (u.x, u.y), 'key': (u.team, u.index)}
        vx = vy = 0.0
        pp = prev_pos.get((u.team, u.index))
        if pp is not None:
            dx, dy = u.x - pp[0], u.y - pp[1]
            if math.hypot(dx, dy) < 3.6:
                vx, vy = dx, dy
        ln = math.hypot(vx, vy)
        if ln > SPD:
            vx *= SPD / ln
            vy *= SPD / ln
        if u.index == 0 and not (st.owner >= 0 and st.units[st.owner] is u):
            # Sol-style goalkeeper: fixed depth on the ball-goal centre line
            dx, dy = w.ball0[0] - mygx, w.ball0[1] - 13.0
            D = math.hypot(dx, dy) or 1.0
            k = min(KEEPER_TRACK, max(0.6, D * 0.6))
            tgt = (mygx + dx / D * k, 13.0 + dy / D * k)
            px, py = u.x, u.y
            for f in range(20):
                ddx, ddy = tgt[0] - px, tgt[1] - py
                dd = math.hypot(ddx, ddy)
                if dd > 1e-6:
                    stp = min(SPD * DT, dd)
                    px += ddx / dd * stp
                    py += ddy / dd * stp
                o['committed'].append((px, py))
            o['pos20'] = (px, py)
        else:
            for f in range(1, 21):
                px = clamp(u.x + vx * f / 20.0, R_U, FIELD_W - R_U)
                py = clamp(u.y + vy * f / 20.0, R_U, FIELD_H - R_U)
                o['committed'].append((px, py))
            o['pos20'] = o['committed'][-1]
        w.opps.append(o)
    return w


def opp_reach_block(path, st, w, me, shooter=None, extra=0.10, include_mates=True):
    """Return (block_frame, worst_margin)."""
    worst = 1e9
    for i, (bx, by) in enumerate(path):
        f = i + 1
        for o in w.opps:
            if f <= 20:
                ox, oy = o['committed'][f - 1]
                reach = 0.0
            else:
                ox, oy = o['pos20']
                reach = SPD * (f - 20) / 20.0
            m = math.hypot(ox - bx, oy - by) - CR - reach - extra
            if m < worst:
                worst = m
            if m <= 0.0:
                return f, worst
        if include_mates:
            for p in st.units:
                if p.team != me or p is shooter:
                    continue
                m = math.hypot(p.x - bx, p.y - by) - CR - extra
                if m < worst:
                    worst = m
                if m <= 0.0:
                    return f, worst
    return None, worst
