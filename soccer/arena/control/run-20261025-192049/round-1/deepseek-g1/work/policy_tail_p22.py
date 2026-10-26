# ------------------------------------------------------------------ plan
POST_Y1, POST_Y2 = 10.9, 15.1
SIDE_TOP, SIDE_BOT = 2.6, 23.4


def role_table(n, me):
    rt = {0: 'keeper'}
    if n == 2:
        rt[1] = 'striker'
    elif n == 3:
        rt[1] = 'post0'
        rt[2] = 'striker'
    elif n == 4:
        rt[1] = 'post0'
        rt[2] = 'post1'
        rt[3] = 'striker'
    elif n == 5:
        rt.update({1: 'post0', 2: 'post1', 3: 'striker', 4: 'striker'})
    else:
        for i in range(1, n):
            rt[i] = 'striker'
        rt[1] = 'post0'
        rt[2] = 'post1'
    return rt


def near_far_y(by):
    if by < 13.0:
        return POST_Y1, POST_Y2
    return POST_Y2, POST_Y1


def post_spot(me, which, by):
    gx = own_gx(me)
    sgn = atk(me)
    near, far = near_far_y(by)
    y = far if which == 0 else 13.0
    return gx + sgn * 0.55, y


def keeper_rest_spot(st, me):
    gx = own_gx(me)
    sgn = atk(me)
    sp = math.hypot(st.bvx, st.bvy)
    near, far = near_far_y(st.by)
    ty = near
    depth = 0.8
    moving_to_goal = (gx - st.bx) * st.bvx > 0.6 and sp > 0.8
    if moving_to_goal:
        pts = ball_future(st, 60)
        cross = None
        for (x, y) in pts:
            if (sgn > 0 and x <= gx + 0.3) or (sgn < 0 and x >= gx - 0.3):
                cross = y
                break
        if cross is not None:
            ty = cross
            depth = 0.5
        else:
            ty = 13.0
    return gx + sgn * depth, clamp(ty, 10.2, 15.8)


def choose_side(me, opp):
    """Corridor farther from the opponents (weighted)."""
    score_top = score_bot = 0.0
    for o in opp:
        score_top += 1.0 / (1.0 + math.hypot(o.x - 30.0, o.y - 3.0))
        score_bot += 1.0 / (1.0 + math.hypot(o.x - 30.0, o.y - 23.0))
    return SIDE_TOP if score_top <= score_bot else SIDE_BOT


def stage_spot(me, side):
    """Staging point just inside our own box, on the chosen wing."""
    gx = own_gx(me)
    a = atk(me)
    if side == SIDE_TOP:
        y = 6.9
    else:
        y = 19.1
    return gx + a * 8.9, y


def winger_spot(me, bx, side, slot):
    """Absolute attacking stations: two box-edge poachers + one corner winger."""
    a = atk(me)
    gx = opp_gx(me)
    xmax = gx - a * 9.2
    if slot == 0:
        return xmax, 10.9
    if slot == 1:
        return xmax, 15.1
    if slot == 2:
        return xmax + a * 4.0, (4.4 if side == SIDE_TOP else 21.6)
    return xmax, 13.0


_GC = {'me': None, 'side': None, 'bx': None, 'frame': -999, 'spots': None, 'near_goal': None}


def attacker_spots(me, opp, striker_list, bx, by, side, frame, near_goal):
    """Stable attacker spots: refreshed only when the ball moves >7.5 units,
    the open side flips, the phase changes, or 4 s pass."""
    global _GC
    fresh = (_GC['me'] == me and _GC['side'] == side and _GC['spots'] is not None
             and 0 <= frame - _GC['frame'] <= 400)
    if fresh:
        return dict(_GC['spots'])
    out = {}
    for slot, u in enumerate(striker_list):
        if near_goal and slot == len(striker_list) - 1 and slot > 0:
            sp = pick_spot(me, u, opp, list(out.values()), poacher_spots(me), (bx, by))
        else:
            sp = winger_spot(me, bx, side, slot)
            sp = safe_pt(me, sp[0], sp[1], 0.95)
        out[u.index] = sp
    _GC = {'me': me, 'side': side, 'bx': bx, 'frame': frame, 'spots': out,
           'near_goal': near_goal}
    return dict(out)


def poacher_spots(me):
    gx = opp_gx(me)
    a = atk(me)
    xmax = gx - a * 9.2
    return [(xmax, 10.8), (xmax, 15.2), (xmax, 13.0),
            (xmax + a * 4.0, 4.4), (xmax + a * 4.0, 21.6)]


def pick_spot(me, u, opp, taken, spots, ball_xy=None):
    best, bsc = None, -1e18
    for (sx, sy) in spots:
        sx, sy = safe_pt(me, sx, sy, 0.95)
        crowd = sum(max(0.0, 3.5 - math.hypot(sx - t[0], sy - t[1])) for t in taken)
        od = min([math.hypot(o.x - sx, o.y - sy) for o in opp] or [9.0])
        travel = math.hypot(sx - u.x, sy - u.y)
        lead = (sx - u.x) * atk(me)
        sc = min(od, 3.5) * 0.9 + min(5.0, lead) * 0.15 - crowd * 1.1 - travel * 0.02
        if ball_xy is not None:
            bd = math.hypot(sx - ball_xy[0], sy - ball_xy[1])
            if bd > 15.0:
                sc -= (bd - 15.0) * 0.7
            if bd < 4.0:
                sc -= (4.0 - bd) * 0.25
        if best is None or sc > bsc:
            bsc, best = sc, (sx, sy)
    return best


def build_plan(st, me, n):
    my = [u for u in st.units if u.team == me]
    opp = [u for u in st.units if u.team != me]
    rush = bool(st.golden) or (st.frame >= 2100 and st.score[0] == st.score[1])
    plan = {'mode': 'loose', 'carrier': None, 'roles': role_table(n, me),
            'spots': {}, 'chaser': None, 'side': choose_side(me, opp), 'rush': rush}
    if not my:
        return plan
    owner = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    bx, by = st.bx, st.by
    side = plan['side']
    if n == 1:
        if owner is not None and owner.team == me:
            plan['mode'] = 'solo_off'
        elif owner is not None:
            plan['mode'] = 'solo_def'
        else:
            plan['mode'] = 'solo_loose'
        return plan
    fielders = [u for u in my if u.index != 0]
    d_def = (bx - own_gx(me)) * atk(me)
    d_atk = (opp_gx(me) - bx) * atk(me)
    striker_list = [u for u in fielders if plan['roles'].get(u.index) == 'striker']

    if owner is not None and owner.team == me:
        plan['mode'] = 'off'
        plan['carrier'] = owner.index
        near_goal = d_atk < 22.0
        striker_list.sort(key=lambda z: z.index)
        plan['spots'].update(attacker_spots(me, opp, striker_list, bx, by, side,
                                            st.frame, near_goal))
        for u in fielders:
            role = plan['roles'].get(u.index)
            if role == 'post0':
                plan['spots'][u.index] = post_spot(me, 0, by)
            elif role == 'post1':
                plan['spots'][u.index] = post_spot(me, 1, by)
        return plan
    if owner is not None:
        plan['mode'] = 'def'
        d_def = (bx - own_gx(me)) * atk(me)
        for u in fielders:
            role = plan['roles'].get(u.index)
            if role == 'striker' and n == 2 and d_def < 26.0:
                role = 'post0'
            if role == 'post0':
                plan['spots'][u.index] = post_spot(me, 0, by)
            elif role == 'post1':
                plan['spots'][u.index] = post_spot(me, 1, by)
            else:
                rs = [winger_spot(me, bx, side, 0), winger_spot(me, bx, side, 1),
                      (opp_gx(me) - atk(me) * 9.4, 13.0)]
                sp = pick_spot(me, u, opp, [], rs, (bx, by))
                plan['spots'][u.index] = sp
        return plan
    plan['mode'] = 'loose'
    if fielders:
        pts = ball_future(st, 80)

        def itime(unit):
            for kk, pt in enumerate(pts):
                if math.hypot(pt[0] - unit.x, pt[1] - unit.y) <= MOV * (kk + 1) * DT + CR * 0.9:
                    return kk
            return 999
        ranked = sorted(fielders, key=itime)
        mine_t = itime(ranked[0])
        opp_t = min([itime(o) for o in opp] or [999])
        plan['chaser'] = ranked[0].index
        taken = []
        for u in fielders:
            role = plan['roles'].get(u.index)
            if role == 'post0':
                plan['spots'][u.index] = post_spot(me, 0, by)
            elif role == 'post1':
                plan['spots'][u.index] = post_spot(me, 1, by)
            else:
                sp = pick_spot(me, u, opp, taken, [winger_spot(me, bx, side, 0), winger_spot(me, bx, side, 1),
                                                   (opp_gx(me) - atk(me) * 9.4, 13.0)], (bx, by))
                plan['spots'][u.index] = sp
                taken.append(sp)
        if d_def < 18.0 and opp_t + 2 < mine_t:
            plan['chaser'] = None
    return plan


def lane_clear_short(bx, by, px, py, opps):
    dx, dy = px - bx, py - by
    D = math.hypot(dx, dy)
    if D < 1e-6:
        return 9.0
    ux, uy = dx / D, dy / D
    best = 9.0
    for o in opps:
        ex, ey = o.x - bx, o.y - by
        proj = ex * ux + ey * uy
        if proj < -0.3 or proj > D + 0.6:
            continue
        perp = abs(ex * uy - ey * ux)
        if perp - 0.82 < best:
            best = perp - 0.82
    return best


def punt_aim(st, u, me):
    a = atk(me)
    best, bsc = None, -1e18
    for deg in range(-80, 81, 8):
        base = 0.0 if a > 0 else 180.0
        ang = math.radians(base + deg)
        fx, fy = math.cos(ang), math.sin(ang)
        sx, sy = u.x + fx * KICK_OFF + 0.5 * fx, u.y + fy * KICK_OFF + 0.5 * fy
        if not (0.3 < sx < W - 0.3 and 0.3 < sy < H - 0.3):
            continue
        pts, gt, end = sim_ball(sx, sy, ang, 90)
        if gt is not None or not pts:
            continue
        adv = (pts[-1][0] - u.x) * a
        risk = lane_risk(pts, [o for o in st.units if o.team != me], 0.7, skip=(u,), delay=0.5)
        sc = adv * 0.10 + min(risk, 3.0) * 0.55
        if best is None or sc > bsc:
            bsc, best = sc, ang
    return best


def keeper_hold_cmd(st, u, me, mates, opp, plan):
    spots = plan.get('spots', {})
    roles = plan.get('roles', {})
    side = plan.get('side', SIDE_BOT)
    strikers = [m for m in mates if roles.get(m.index) == 'striker']
    stg = stage_spot(me, side)
    at_stage = math.hypot(stg[0] - u.x, stg[1] - u.y) < 1.2
    if at_stage:
        bp = best_pass(st, u, me, strikers, st.units, spots, k=0.5)
        if bp is not None and bp[0] > -0.8:
            return ('N', math.degrees(bp[1]) % 360.0, True)
        ang = punt_aim(st, u, me)
        if ang is not None:
            return ('N', math.degrees(ang) % 360.0, True)
        return ('N', None, False)
    bp = best_pass(st, u, me, strikers, st.units, spots, k=0.5)
    if bp is not None and bp[0] > 0.6:
        return ('N', math.degrees(bp[1]) % 360.0, True)
    return (move_dir(u, stg[0], stg[1], me, allow_box=True), None, False)


def keeper_cmd(st, u, me, opp):
    if st.owner < 0:
        d = math.hypot(st.bx - u.x, st.by - u.y)
        sp = math.hypot(st.bvx, st.bvy)
        in_own = in_box(OWNBOX[me], st.bx, st.by)
        opp_closer = any(math.hypot(o.x - st.bx, o.y - st.by) < d - 0.35 for o in opp)
        if (d < 1.6 or (in_own and sp < 6.0 and d < 4.5 and not opp_closer)):
            return (move_dir(u, st.bx, st.by, me, allow_box=True), None, False)
    tx, ty = keeper_rest_spot(st, me)
    return (move_dir(u, tx, ty, me, allow_box=True), None, False)


# ------------------------------------------------------------- exec
def move_dir_avoid(u, tx, ty, me, opp, allow_box=False, m=SAFE_M, speed=MOV, avoid_r=2.6):
    dx, dy = tx - u.x, ty - u.y
    d = math.hypot(dx, dy)
    if d < 0.06:
        return 'N'
    ux, uy = dx / d, dy / d
    best, bestv = None, -1e18
    for name in DIR_KEYS:
        vx, vy = DIRS[name]
        if vx == 0.0 and vy == 0.0:
            continue
        if not allow_box and not step_ok(me, u.x, u.y, vx, vy, 5, m, speed):
            continue
        v = vx * ux + vy * uy
        for o in opp:
            ox, oy = o.x - u.x, o.y - u.y
            od = math.hypot(ox, oy)
            if od < avoid_r and od > 1e-6:
                dot = (vx * ox + vy * oy) / od
                if dot > 0.0:
                    v -= dot * (avoid_r - od) / avoid_r * 1.5
        if v > bestv:
            bestv, best = v, name
    return best or 'N'


def chase_ball(st, u, me, allow_box=True, maxf=60):
    pts = ball_future(st, maxf)
    idx = 999
    for kk, pt in enumerate(pts):
        if math.hypot(pt[0] - u.x, pt[1] - u.y) <= MOV * (kk + 1) * DT + CR * 0.9:
            idx = kk
            break
    tgt = pts[min(idx, len(pts) - 1)] if pts else (st.bx, st.by)
    return (move_dir(u, tgt[0], tgt[1], me, allow_box=allow_box), None, False)


def striker_move(u, sp, opp, me):
    """Route through the touchline corridor when the direct lane is blocked."""
    a = atk(me)
    corridor = 2.6 if sp[1] < 13.0 else 23.4
    # if we are inside the middle band and still need to gain ground, hug the line
    need_ground = (sp[0] - u.x) * a > 3.0
    in_band = 5.5 < u.y < 20.5
    if need_ground and in_band and abs(u.y - corridor) > 1.6:
        # check whether an opponent blocks the vertical slide
        blocked = any(math.hypot(o.x - u.x, o.y - corridor) < 1.6 for o in opp)
        if not blocked:
            return move_dir_avoid(u, u.x, corridor, me, opp, allow_box=False)
    if need_ground and not in_band:
        ty = corridor
    else:
        ty = sp[1]
    return move_dir_avoid(u, sp[0], ty, me, opp, allow_box=False)


def exec_plan(st, me, n, plan, A):
    my = [u for u in st.units if u.team == me]
    opp = [u for u in st.units if u.team != me]
    if not my:
        return {}
    cmds = {}
    owner = st.units[st.owner] if 0 <= st.owner < len(st.units) else None
    mode = plan['mode']

    if n == 1:
        u = my[0]
        if mode == 'solo_off' and owner is u:
            cmds[0] = carrier_cmd(st, u, me, [], st.units, {}, None)
        elif mode == 'solo_def' or (mode == 'solo_off' and owner is not u):
            dx, dy = own_gx(me) - st.bx, 13.0 - st.by
            dd = math.hypot(dx, dy) or 1.0
            k = clamp(0.30 * math.hypot(st.bx - own_gx(me), st.by - 13.0), 0.7, 5.0)
            tx, ty = st.bx + dx / dd * k, st.by + dy / dd * k
            cmds[0] = (move_dir(u, tx, ty, me, allow_box=True), None, False)
        else:
            cmds[0] = chase_ball(st, u, me, True, 80)
        return cmds

    keeper = my[0]
    fielders = [u for u in my if u.index != 0]
    roles = plan['roles']
    carrier = owner if (owner is not None and owner.team == me) else None

    if keeper is carrier:
        cmds[0] = keeper_hold_cmd(st, keeper, me, fielders, opp, plan)
    elif carrier is not None:
        idx = carrier.index
        role = roles.get(idx, 'striker')
        mates = [u for u in fielders if u is not carrier] + [keeper]
        # deep post defender: prefer a safe pass back to the keeper
        if role in ('post0', 'post1') and in_box(OWNBOX[me], carrier.x, carrier.y):
            km = [keeper]
            bp = best_pass(st, carrier, me, km, st.units, {}, k=0.5)
            if bp is not None and bp[0] > -0.6:
                cmds[carrier.index] = ('N', math.degrees(bp[1]) % 360.0, True)
            else:
                cmds[carrier.index] = carrier_cmd(st, carrier, me, mates, st.units, plan['spots'], None)
        else:
            cmds[carrier.index] = carrier_cmd(st, carrier, me, mates, st.units, plan['spots'], None)
    for u in fielders:
        if u.index in cmds:
            continue
        role = roles.get(u.index, 'striker')
        if owner is u:
            continue
        if role in ('post0', 'post1'):
            which = 0 if role == 'post0' else 1
            p = plan['spots'].get(u.index)
            if p is None:
                p = post_spot(me, which, st.by)
            if plan.get('rush'):
                p = winger_spot(me, st.bx, plan.get('side', SIDE_BOT), 0 if which == 0 else 1)
                p = safe_pt(me, p[0], p[1], 0.95)
            cmds[u.index] = (move_dir(u, p[0], p[1], me, allow_box=True), None, False)
        else:
            sp = plan['spots'].get(u.index)
            if sp is None:
                sp = winger_spot(me, st.bx, plan.get('side', SIDE_BOT), 0)
            if owner is not None and owner.team != me and math.hypot(owner.x - u.x, owner.y - u.y) < 9.0:
                tx, ty = press_target(st, u, me, owner)
                cmds[u.index] = (move_dir(u, tx, ty, me, allow_box=False), None, False)
            else:
                cmds[u.index] = (striker_move(u, sp, opp, me),
                                 math.degrees(math.atan2(13.0 - u.y, opp_gx(me) - u.x)) % 360.0, False)
    if 0 not in cmds:
        cmds[0] = keeper_cmd(st, keeper, me, opp)
    if owner is None and mode == 'loose' and plan.get('chaser') is not None:
        cidx = plan['chaser']
        c = next((u for u in my if u.index == cidx), None)
        if c is not None and c.index != 0:
            cmds[c.index] = chase_ball(st, c, me, False, 60)
    return cmds


def opp_model(st, o, me):
    pts = ball_future(st, 40)
    tx, ty = (pts[min(len(pts) - 1, 10)] if pts else (st.bx, st.by))
    return (move_dir(o, tx, ty, 1 - me), None, False)


def decide(s0, me, n, A):
    frames = []
    st = s0.clone()
    plan = build_plan(st, me, n)
    for f in range(20):
        if st.status != 'playing':
            break
        cmds = exec_plan(st, me, n, plan, A)
        inp = []
        for u in st.units:
            if u.team == me:
                c = cmds.get(u.index, ('N', None, False))
                aim = None
                if c[1] is not None:
                    a = math.radians(c[1] % 360.0)
                    aim = (math.cos(a), math.sin(a))
                inp.append((c[0], aim, bool(c[2])))
            else:
                inp.append(opp_model(st, u, me))
        frames.append(dict(((u.team, u.index), inp[i]) for i, u in enumerate(st.units)))
        g = A.step(st, inp, st.kickoffTeam)
        if g >= 0:
            st.score[g] += 1
            if st.golden:
                st.status = 'finished'
                break
            A.kickoff(st, 1 - g)
    while len(frames) < 20:
        frames.append({})
    return frames
