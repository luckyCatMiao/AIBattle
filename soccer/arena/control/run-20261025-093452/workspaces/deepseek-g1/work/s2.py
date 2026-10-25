

# ---------------------------------------------------------------- decisions
def choose_shot(st, u, me, w, risky=False):
    ci = _find_uidx(st, u)
    if ci < 0 or st.owner != ci or u.kickCd > 0 or u.controlLock > 0:
        return None
    key = (u.index, int(round(u.x * 2.0)), int(round(u.y * 2.0)))
    if key in w.shot_cache:
        return w.shot_cache[key]
    gx = OPP_GOAL_X[me]
    cx, cy = u.x, u.y
    D = math.hypot(gx - cx, 13.0 - cy)
    if D > 26.5 or D < 1.2:
        w.shot_cache[key] = None
        return None
    base = math.atan2(13.0 - cy, gx - cx)
    spread = math.atan2(3.4, max(2.2, D))
    best = None
    best_risk = None
    N = 30
    for i in range(N + 1):
        t = -1.14 + 2.28 * i / N
        ang = (math.degrees(base) + math.degrees(spread) * t) % 360.0
        ox, oy, fx, fy = kick_origin(u, ang)
        path, gf, gteam = flight(ox, oy, ang)
        if gf is None:
            continue
        block, margin = opp_reach_block(path, st, w, me, shooter=u, extra=0.12)
        if block is None and margin >= 0.55:
            q = 1000.0 - gf * 2.0 + min(margin, 3.0) * 4.0 - D * 0.25
            if best is None or q > best[1]:
                best = (ang, q, gf, margin)
        elif block is None:
            sc = margin - gf * 0.02
            if best_risk is None or sc > best_risk[1]:
                best_risk = (ang, sc, gf, margin)
        else:
            sc = margin - gf * 0.02
            if best_risk is None or sc > best_risk[1]:
                best_risk = (ang, sc, gf, margin)
    if best is not None:
        w.shot_cache[key] = best
        return best
    if best_risk is not None:
        # near-clear shot: take it when close, when desperate, or when the keeper is far out
        kx, ky = keeper_pred(w)
        keeper_out = (math.hypot(kx - OPP_GOAL_X[me], ky - 13.0) > 4.2) or \
                     (abs(kx - OPP_GOAL_X[me]) > 3.2)
        if best_risk[1] > 0.02 or (D < 12.5 and best_risk[1] > -0.15) or \
                (risky and best_risk[1] > -0.55) or (keeper_out and best_risk[1] > -0.25):
            w.shot_cache[key] = best_risk
            return best_risk
    w.shot_cache[key] = None
    return None


def choose_pass(st, u, me, w, pressure):
    ci = _find_uidx(st, u)
    if ci < 0 or st.owner != ci or u.kickCd > 0 or u.controlLock > 0:
        return None
    mates = [m for m in st.units if m.team == me and m is not u]
    if not mates:
        return None
    gx = OPP_GOAL_X[me]
    best = None
    for m in mates:
        mdx, mdy = gx - m.x, 13.0 - m.y
        ml = math.hypot(mdx, mdy) or 1.0
        for lead in (0.0, 6.0, 12.0, 18.0):
            px = clamp(m.x + mdx / ml * SPD * lead / 20.0, 0.8, FIELD_W - 0.8)
            py = clamp(m.y + mdy / ml * SPD * lead / 20.0, 0.8, FIELD_H - 0.8)
            # do not lead a mate into the opponent box
            if in_infl(me, px, py, 0.25):
                px, py = push_out(me, px, py, 0.25)
            ang = ang_to(u.x, u.y, px, py)
            ox, oy, fx, fy = kick_origin(u, ang)
            path, gf, gteam = flight(ox, oy, ang)
            if gf is not None:
                continue
            # first frame our mate can reach the ball
            catch_f = None
            for f in range(1, min(len(path), 60) + 1):
                bx, by = path[f - 1]
                if math.hypot(bx - m.x, by - m.y) <= CR + SPD * f / 20.0 - 0.05:
                    catch_f = f
                    break
            if catch_f is None:
                continue
            # nobody may intercept before the mate
            bad = False
            for f in range(1, catch_f + 1):
                bx, by = path[f - 1]
                if f <= 20:
                    for o in w.opps:
                        oxx, oyy = o['committed'][f - 1]
                        if math.hypot(oxx - bx, oyy - by) <= CR + 0.05:
                            bad = True
                            break
                else:
                    for o in w.opps:
                        oxx, oyy = o['pos20']
                        if math.hypot(oxx - bx, oyy - by) <= CR + SPD * (f - 20) / 20.0 + 0.05:
                            bad = True
                            break
                if bad:
                    break
            if bad:
                continue
            prog = (px - u.x) * ATK[me]
            if not pressure and prog < 3.0:
                continue
            mate_shot = shot_spot_score(me, px, py, m, st, w)
            sc = prog * 0.22 + mate_shot * 2.2 + (6.0 if pressure else 0.0) - catch_f * 0.02
            if best is None or sc > best[0]:
                best = (sc, ang, m.index, path[catch_f - 1], catch_f, prog)
    return best


def shot_spot_score(me, x, y, u, st, w):
    """Cheap estimate of shot quality from a spot (no flight sim)."""
    gx = OPP_GOAL_X[me]
    D = math.hypot(gx - x, 13.0 - y)
    if D < 2.0:
        return 0.0
    kx, ky = keeper_pred(w)
    # best target = mouth corner farther from keeper
    t1 = math.hypot(gx - x, 10.6 - y)
    t2 = math.hypot(gx - x, 15.4 - y)
    # lateral gap of keeper to each shot line at its distance
    def gap(ty):
        dx, dy = gx - x, ty - y
        L = math.hypot(dx, dy) or 1.0
        ux, uy = dx / L, dy / L
        ex, ey = kx - x, ky - y
        perp = abs(ex * uy - ey * ux)
        return perp - CR - SPD * (L / KICKP) * 0.55
    g = max(gap(10.6), gap(15.4))
    # teammates / opponents crowding the lane
    best = g * 1.6 + max(0.0, 18.0 - D) * 0.05 - max(0.0, D - 16.0) * 0.15
    return best


def keeper_pred(w):
    for o in w.opps:
        if o['keeper']:
            return o['pos20']
    return (FIELD_W / 2.0, 13.0)


def _find_uidx(st, u):
    for i, x in enumerate(st.units):
        if x is u:
            return i
    return -1


# ---------------------------------------------------------------- movement
def attack_spots(me):
    gx = OPP_GOAL_X[me]
    a = ATK[me]
    raw = [
        (gx - a * 9.8, 13.0),
        (gx - a * 9.8, 7.4),
        (gx - a * 9.8, 18.6),
        (gx - a * 7.2, 4.9),
        (gx - a * 7.2, 21.1),
        (gx - a * 3.2, 4.6),
        (gx - a * 3.2, 21.4),
        (gx - a * 13.5, 13.0),
        (gx - a * 13.5, 6.5),
        (gx - a * 13.5, 19.5),
        (gx - a * 17.5, 13.0),
    ]
    return [push_out(me, x, y, 0.35) for x, y in raw]


def choose_attack_spot(st, u, me, w, taken, role='support'):
    best = None
    bx, by = st.bx, st.by
    ogx = MY_GOAL_X[me]
    prog = (bx - ogx) * ATK[me]
    cands = []
    if role == 'striker' and prog > 17.0:
        cands = attack_spots(me)
    elif role == 'cover':
        base = max(3.0, prog - 5.0) if prog > 13.0 else prog + 6.0
        cands = [(ogx + ATK[me] * base, 13.0 + (by - 13.0) * 0.5),
                 (ogx + ATK[me] * base, 7.5), (ogx + ATK[me] * base, 18.5)]
    else:
        for dp in (7.0, 10.0, 13.0, 16.0):
            px = ogx + ATK[me] * (prog + dp)
            if px < 0.6 or px > FIELD_W - 0.6:
                continue
            for off in (-8.0, -4.0, 0.0, 4.0, 8.0):
                cands.append((px, by + off))
        if prog > 17.0:
            cands = cands[:12] + attack_spots(me)
    if not cands:
        cands = attack_spots(me)
    for (x, y) in cands:
        x, y = push_out(me, x, y, 0.30)
        d = math.hypot(x - u.x, y - u.y)
        crowd = 0.0
        for tx, ty in taken:
            dd = math.hypot(x - tx, y - ty)
            if dd < 4.5:
                crowd += 4.5 - dd
        if role == 'cover' and (x - ogx) * ATK[me] > prog + 3.0:
            continue
        # pass lane from ball to spot
        lane = 9.0
        for o in w.opps:
            ox, oy = o['pos']
            dx, dy = x - bx, y - by
            L = math.hypot(dx, dy) or 1.0
            ex, ey = ox - bx, oy - by
            proj = ex * dx / L + ey * dy / L
            if proj < 0 or proj > L:
                continue
            perp = abs(ex * dy / L - ey * dx / L)
            lane = min(lane, perp)
        reachable = 1.0 if d < 22.0 else 0.0
        sc = -d * 0.09 + min(lane, 3.0) * 0.60 - crowd * 0.55 + reachable * 0.8
        sc += ((x - bx) * ATK[me]) * 0.035
        if role == 'cover':
            sc += (bx - x) * ATK[me] * 0.02
        if role == 'striker':
            sc += shot_spot_score(me, x, y, u, st, w) * 0.9
        if best is None or sc > best[0]:
            best = (sc, x, y)
    if best is None:
        return push_out(me, OPP_GOAL_X[me] - ATK[me] * 12.0, 13.0, 0.5)
    return best[1], best[2]


def choose_dribble_target(st, u, me, w):
    bx, by = st.bx, st.by
    gx = OPP_GOAL_X[me]
    ogx = MY_GOAL_X[me]
    prog = (bx - ogx) * ATK[me]
    cands = []
    for dp in (8.0, 12.0, 16.0):
        px = ogx + ATK[me] * (prog + dp)
        if px < 0.6 or px > FIELD_W - 0.6:
            continue
        for off in (-9.0, -4.5, 0.0, 4.5, 9.0):
            cands.append((px, by + off))
    if prog > 14.0:
        cands += attack_spots(me)
    best = None
    for (x, y) in cands:
        x, y = push_out(me, x, y, 0.30)
        d = math.hypot(x - u.x, y - u.y)
        if d > 30.0:
            continue
        if seg_blocked(me, u.x, u.y, x, y):
            xg, yt, yb = gateways(me)
            gy = yt if abs(y - yt) < abs(y - yb) else yb
            d = math.hypot(xg - u.x, gy - u.y) + math.hypot(x - xg, y - gy)
        pot = shot_spot_score(me, x, y, u, st, w)
        od = min([math.hypot(o['pos'][0] - x, o['pos'][1] - y) for o in w.opps] or [9.0])
        sc = pot * 1.9 - d * 0.16 + min(od, 3.0) * 0.25
        if best is None or sc > best[0]:
            best = (sc, x, y)
    if best is None:
        return push_out(me, gx - ATK[me] * 10.0, 13.0, 0.4)
    return best[1], best[2]


def ball_pred(st, frames):
    x, y = st.bx, st.by
    vx, vy = st.bvx, st.bvy
    out = []
    for _ in range(frames):
        for _s in range(4):
            x += vx * DT / 4.0
            y += vy * DT / 4.0
            if MOUTH_LO <= y <= MOUTH_HI and (x <= 1.0 or x >= FIELD_W - 1.0):
                out.append((x, y))
                return out
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
        out.append((x, y))
        if vx == 0.0 and vy == 0.0:
            break
    return out


def chase_target(st, u, ahead=0.0):
    path = ball_pred(st, 50)
    if not path:
        return st.bx, st.by
    for k, (px, py) in enumerate(path):
        t = (k + 1) / 20.0
        if math.hypot(px - u.x, py - u.y) <= CR + SPD * t + ahead:
            return px, py
    return path[-1]


def keeper_cmd(st, u, me, w):
    bx, by = st.bx, st.by
    gx = MY_GOAL_X[me]
    owner = st.units[st.owner] if st.owner >= 0 else None
    ci = _find_uidx(st, u)
    # loose ball inside our box: go get it
    if st.owner < 0 and in_box(me, bx, by):
        d = math.hypot(bx - u.x, by - u.y)
        if d < 9.0:
            tx, ty = chase_target(st, u)
            return Cmd(move_dir_to(u.x, u.y, tx, ty, me, allow_box=True), ang_to(u.x, u.y, bx, by), False)
    if ci >= 0 and st.owner == ci:
        # keeper with the ball: pass / clear
        return keeper_distribute(st, u, me, w)
    dx, dy = bx - gx, by - 13.0
    D = math.hypot(dx, dy) or 1.0
    k = min(KEEPER_TRACK, max(0.7, 0.55 * D))
    tx, ty = gx + dx / D * k, 13.0 + dy / D * k
    # lead fast incoming balls a little
    sp = math.hypot(st.bvx, st.bvy)
    if sp > 3.0 and D < 22.0:
        tx += st.bvx * 0.06
        ty += st.bvy * 0.06
    tx = clamp(tx, 0.6, FIELD_W - 0.6)
    ty = clamp(ty, 1.0, FIELD_H - 1.0)
    d = move_dir_to(u.x, u.y, tx, ty, me, allow_box=True)
    return Cmd(d, ang_to(u.x, u.y, bx, by), False)


def keeper_distribute(st, u, me, w):
    ps = choose_pass(st, u, me, w, pressure=True)
    if ps is not None and ps[5] > -4.0:
        return Cmd('N', ps[1], True)
    # clear towards the far half, away from the nearest opponent
    gx = OPP_GOAL_X[me]
    best = None
    for ang in range(0, 360, 10):
        ox, oy, fx, fy = kick_origin(u, ang)
        path, gf, gt = flight(ox, oy, ang)
        if gf is not None and gt == 1 - me:
            continue
        # avoid kicking toward our own goal
        tx, ty = ox + fx * 14.0, oy + fy * 14.0
        if (tx - MY_GOAL_X[me]) * ATK[me] < 2.0:
            continue
        block, margin = opp_reach_block(path, st, w, me, shooter=u, extra=0.3)
        if block is None and margin > 0.5:
            sc = margin + (tx - u.x) * ATK[me] * 0.1
            if best is None or sc > best[0]:
                best = (sc, ang)
    if best is not None:
        return Cmd('N', best[1], True)
    ang = ang_to(u.x, u.y, gx, 13.0)
    return Cmd('N', ang, True)
