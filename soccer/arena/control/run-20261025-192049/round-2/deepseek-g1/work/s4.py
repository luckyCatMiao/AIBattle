

# ======================================================================
#  v3: 1 Hz plan execution (robust to opponent model error)
# ======================================================================


def select_mode(st, me):
    sc = st.score
    my, op = sc[me], sc[1 - me]
    tl = st.tl
    if my > op and tl <= 30.0:
        return 'park'
    if my < op and (st.golden or tl <= 50.0):
        return 'desperate'
    return 'normal'


def park_spot(me):
    return MY_GOAL_X[me] + ATK[me] * 4.2, 13.0


def nearest_opp(st, me, x, y):
    best = None
    bd = 1e9
    for o in st.units:
        if o.team == me:
            continue
        d = math.hypot(o.x - x, o.y - y)
        if d < bd:
            bd, best = d, o
    return best, bd


def make_plan_inner(st, me, w):
    """Return plan dict for next 20 frames, based on the observed state."""
    my = [u for u in st.units if u.team == me]
    owner = st.units[st.owner] if st.owner >= 0 else None
    plan = {'act': None, 'targets': {}, 'carrier': -1, 'pass': None, 'mode': w.mode, 'aims': {}}
    if not my:
        return plan
    n = st.n
    bx, by = st.bx, st.by
    if n == 1:
        u = my[0]
        if owner is not None and owner.team == me:
            plan['carrier'] = u.index
            plan['act'] = carrier_action(st, u, me, w)
        elif owner is not None:
            # jockey goal-side
            ogx = MY_GOAL_X[me]
            dx, dy = ogx - bx, 13.0 - by
            dl = math.hypot(dx, dy) or 1.0
            db = math.hypot(u.x - bx, u.y - by)
            if db < 2.6:
                tx, ty = bx, by
            else:
                tx, ty = bx + dx / dl * 2.0, by + dy / dl * 2.0
            plan['targets'][u.index] = (clamp(tx, 0.7, FIELD_W - 0.7), clamp(ty, 0.9, FIELD_H - 0.9))
        else:
            plan['targets'][u.index] = chase_target(st, u)
        return plan

    # keeper
    plan['targets'][0] = keeper_target_v3(st, my[0], me)
    fielders = [u for u in my if u.index != 0]

    if owner is not None and owner.team == me:
        plan['carrier'] = owner.index
        plan['act'] = carrier_action(st, owner, me, w)
        if plan['act'].get('pass'):
            plan['pass'] = plan['act']['pass']
        elif plan['act']['kind'] == 'kick':
            # follow the kick: move toward the box edge / rebound area
            gx = OPP_GOAL_X[me]
            fx = clamp(gx - ATK[me] * 8.0, 2.0, FIELD_W - 2.0)
            fy = clamp(13.0 + (owner.y - 13.0) * 0.4, 2.5, FIELD_H - 2.5)
            plan['targets'][owner.index] = (fx, fy)
        others = [u for u in fielders if u is not owner]
        if w.mode == 'park' and owner.index != 0:
            gx = MY_GOAL_X[me]
            spots = [(gx + ATK[me] * 1.8, 10.8), (gx + ATK[me] * 1.8, 15.2),
                     (gx + ATK[me] * 5.5, 8.0), (gx + ATK[me] * 5.5, 18.0)]
            for i, u in enumerate(others):
                plan['targets'][u.index] = spots[i % len(spots)]
        else:
            taken = []
            osrt = sorted(others, key=lambda z: (z.x - MY_GOAL_X[me]) * ATK[me])
            if len(osrt) == 1:
                roles = ['support']
            elif len(osrt) == 2:
                roles = ['cover', 'support']
            else:
                roles = ['cover', 'support'] + ['striker'] * (len(osrt) - 2)
            for u, role in zip(osrt, roles):
                if plan['pass'] is not None and plan['pass'][0] == u.index:
                    tx, ty = plan['pass'][1]
                else:
                    tx, ty = choose_attack_spot(st, u, me, w, taken, role)
                taken.append((tx, ty))
                plan['targets'][u.index] = (tx, ty)
        return plan

    if owner is not None and owner.team != me:
        defend_targets(st, me, fielders, w, plan['targets'])
        return plan

    # loose ball
    if fielders:
        sf = sorted(fielders, key=lambda u: math.hypot(u.x - bx, u.y - by))
        plan['targets'][sf[0].index] = chase_target(st, sf[0])
        if len(sf) >= 2 and math.hypot(sf[1].x - bx, sf[1].y - by) < 12.0:
            plan['targets'][sf[1].index] = chase_target(st, sf[1])
        taken = []
        for u in fielders:
            if u.index in plan['targets']:
                continue
            tx, ty = choose_attack_spot(st, u, me, w, taken, 'support')
            taken.append((tx, ty))
            plan['targets'][u.index] = (tx, ty)
    return plan


def keeper_target_v3(st, u, me):
    bx, by = st.bx, st.by
    gx = MY_GOAL_X[me]
    ci = _find_uidx(st, u)
    if st.owner < 0 and in_box(me, bx, by):
        d = math.hypot(bx - u.x, by - u.y)
        if d < 9.0:
            return chase_target(st, u)
    if ci >= 0 and st.owner == ci:
        return (gx + ATK[me] * 3.0, 13.0)
    dx, dy = bx - gx, by - 13.0
    D = math.hypot(dx, dy) or 1.0
    k = min(KEEPER_TRACK, max(0.8, 0.55 * D))
    tx, ty = gx + dx / D * k, 13.0 + dy / D * k
    sp = math.hypot(st.bvx, st.bvy)
    if sp > 3.0 and D < 22.0:
        tx += st.bvx * 0.05
        ty += st.bvy * 0.05
    return (clamp(tx, 0.7, FIELD_W - 0.7), clamp(ty, 1.0, FIELD_H - 1.0))


def defend_targets(st, me, fielders, w, targets):
    bx, by = st.bx, st.by
    ogx = MY_GOAL_X[me]
    cx, cy = ogx, 13.0
    dx, dy = bx - cx, by - cy
    D = math.hypot(dx, dy) or 1.0
    ux, uy = dx / D, dy / D
    sf = sorted(fielders, key=lambda u: math.hypot(u.x - bx, u.y - by))
    presser = sf[0]
    ddx, ddy = cx - bx, cy - by
    dl = math.hypot(ddx, ddy) or 1.0
    db = math.hypot(presser.x - bx, presser.y - by)
    if db < 2.7:
        px, py = bx, by
    else:
        px, py = bx + ddx / dl * 2.0, by + ddy / dl * 2.0
    targets[presser.index] = (clamp(px, 0.6, FIELD_W - 0.6), clamp(py, 0.9, FIELD_H - 0.9))
    rest = [u for u in sf if u is not presser]
    if w.mode == 'desperate':
        n_block = 1 if rest else 0
    elif D > 28.0:
        n_block = 0
    elif D > 18.0:
        n_block = 1 if len(rest) >= 2 else 0
    else:
        n_block = min(len(rest), 2)
    kbase = clamp(0.55 * D, 3.2, 7.6)
    for i in range(n_block):
        u = rest[i]
        k = kbase - 1.7 * i
        off = 1.45 if (i % 2 == 0) else -1.45
        tx = cx + ux * k - uy * off
        ty = cy + uy * k + ux * off
        targets[u.index] = (clamp(tx, 0.7, FIELD_W - 0.7), clamp(ty, 0.8, FIELD_H - 0.8))
    marked = []
    for u in rest[n_block:]:
        tgt = None
        bd = 1e9
        for o in st.units:
            if o.team == me or o.index == 0:
                continue
            d = math.hypot(o.x - u.x, o.y - u.y)
            if d < bd and o.index not in marked:
                bd, tgt = d, o
        if tgt is not None:
            marked.append(tgt.index)
            ddx, ddy = ogx - tgt.x, 13.0 - tgt.y
            dl = math.hypot(ddx, ddy) or 1.0
            tx = tgt.x + ddx / dl * 1.5
            ty = tgt.y + ddy / dl * 1.5
            tx, ty = push_out(me, tx, ty, 0.5)
            targets[u.index] = (tx, ty)
        else:
            targets[u.index] = (clamp(bx - ATK[me] * 6.0, 2.0, FIELD_W - 2.0),
                                clamp(13.0 + (by - 13.0) * 0.6, 2.0, FIELD_H - 2.0))


def carrier_action(st, u, me, w):
    """Decide the carrier's action at the window start."""
    bx, by = st.bx, st.by
    if u.index == 0:
        ps = choose_pass(st, u, me, w, pressure=True)
        if ps is not None and ps[5] > -6.0:
            return {'kind': 'kick', 'ang': ps[1], 'pass': (ps[2], ps[3])}
        gx = OPP_GOAL_X[me]
        best = None
        for ang in range(0, 360, 8):
            ox, oy, fx, fy = kick_origin(u, ang)
            path, gf, gt = flight(ox, oy, ang)
            if gf is not None and gt == 1 - me:
                continue
            tx, ty = ox + fx * 13.0, oy + fy * 13.0
            if (tx - MY_GOAL_X[me]) * ATK[me] < 4.0:
                continue
            if in_infl(me, tx, ty, 0.0):
                continue
            block, margin = opp_reach_block(path, st, w, me, shooter=u, extra=0.25)
            if block is None:
                sc = margin + (tx - u.x) * ATK[me] * 0.12
                if best is None or sc > best[0]:
                    best = (sc, ang)
        if best is not None:
            return {'kind': 'kick', 'ang': best[1]}
        return {'kind': 'kick', 'ang': ang_to(u.x, u.y, OPP_GOAL_X[me], 13.0)}
    nd_owner, nd = nearest_opp(st, me, bx, by)
    pressured = nd < 1.7
    if w.mode == 'park':
        return {'kind': 'dribble', 'target': park_spot(me), 'park': True}
    risky = (w.mode == 'desperate')
    sh = choose_shot(st, u, me, w, risky)
    if sh is not None:
        return {'kind': 'kick', 'ang': sh[0]}
    ps = choose_pass(st, u, me, w, pressured)
    if ps is not None and (pressured or ps[0] > 2.6 or ps[5] > 10.0):
        return {'kind': 'kick', 'ang': ps[1], 'pass': (ps[2], ps[3])}
    # dribble
    tx, ty = choose_dribble_target(st, u, me, w)
    return {'kind': 'dribble', 'target': (tx, ty)}


def plan_frames(st0, me, plan):
    """Generate 20 frames following plan; only our units are tracked."""
    units = {}
    for u in st0.units:
        if u.team == me:
            units[u.index] = [u.x, u.y, u.index]
    opp_pos = [(o.x, o.y) for o in st0.units if o.team != me]
    frames = []
    carrier = plan.get('carrier', -1)
    act = plan.get('act')
    for f in range(20):
        row = []
        for u in st0.units:
            if u.team != me:
                continue
            idx = u.index
            pos = units[idx]
            tx, ty = plan['targets'].get(idx, (pos[0], pos[1]))
            aim = None
            kick = False
            if idx == carrier and act is not None:
                kind = act['kind']
                if f == 0 and kind == 'kick':
                    d = 'N'
                    aim = act['ang']
                    kick = True
                else:
                    if kind == 'dribble':
                        tx, ty = act['target']
                    else:
                        # after kicking, follow toward the goal / loose ball
                        tx, ty = plan['targets'].get(idx, (pos[0], pos[1]))
                    d = move_dir_to(pos[0], pos[1], tx, ty, me)
                    if act.get('park'):
                        aim = ang_to(pos[0], pos[1], OPP_GOAL_X[me], 13.0)
                        if opp_pos:
                            no = min(opp_pos, key=lambda q: (q[0] - pos[0]) ** 2 + (q[1] - pos[1]) ** 2)
                            if math.hypot(no[0] - pos[0], no[1] - pos[1]) < 1.7:
                                aim = ang_to(pos[0], pos[1], pos[0] * 2 - no[0], pos[1] * 2 - no[1])
                    else:
                        no = min(opp_pos, key=lambda q: (q[0] - pos[0]) ** 2 + (q[1] - pos[1]) ** 2) if opp_pos else None
                        if no is not None and math.hypot(no[0] - pos[0], no[1] - pos[1]) < 1.5:
                            aim = ang_to(pos[0], pos[1], pos[0] * 2 - no[0], pos[1] * 2 - no[1])
                        else:
                            aim = ang_to(pos[0], pos[1], OPP_GOAL_X[me], 13.0)
            else:
                d = move_dir_to(pos[0], pos[1], tx, ty, me, allow_box=(idx == 0))
            # advance our own unit position
            if d != 'N':
                dv = DIRV8[d]
                if idx == carrier and act is not None and act['kind'] == 'dribble':
                    speed = SPD * DRIBF
                else:
                    speed = SPD
                # wall-aware move
                nx = pos[0] + dv[0] * speed * DT
                ny = pos[1] + dv[1] * speed * DT
                if not circle_hits_wall(nx, pos[1], R_U):
                    pos[0] = nx
                if not circle_hits_wall(pos[0], ny, R_U):
                    pos[1] = ny
                pos[0] = clamp(pos[0], R_U, FIELD_W - R_U)
                pos[1] = clamp(pos[1], R_U, FIELD_H - R_U)
            row.append((d, aim, kick))
        frames.append(row)
    return frames


def make_plan(st, me, w):
    plan = make_plan_inner(st, me, w)
    for u in st.units:
        if u.team == me:
            plan['aims'][u.index] = best_kick_aim(st, u, me, w)
    return plan


def decide_window_v3(st0, me, prev_obs):
    mode = select_mode(st0, me)
    w = build_wctx(st0, prev_obs, me, mode)
    plan = make_plan(st0, me, w)
    return plan_frames_kick(st0, me, plan), plan


# ---------------------------------------------------------------------
#  one-touch kick engine: every unit kicks on first touch, aim precomputed
# ---------------------------------------------------------------------
def kick_eval(st, u, me, w, ang):
    ox, oy, fx, fy = kick_origin(u, ang)
    path, gf, gteam = flight(ox, oy, ang)
    if gf is not None:
        if gteam == me:
            return 900.0 - gf * 0.5
        return -900.0
    if not path:
        return -100.0
    gx = OPP_GOAL_X[me]
    mates = [m for m in st.units if m.team == me and m is not u]
    first_opp = None
    first_mate = None
    for i, (bx, by) in enumerate(path):
        f = i + 1
        if first_opp is None:
            for o in w.opps:
                if f <= 20:
                    qx, qy = o['committed'][f - 1]
                    reach = 0.0
                else:
                    qx, qy = o['pos20']
                    reach = SPD * (f - 20) / 20.0
                if math.hypot(qx - bx, qy - by) <= CR + reach + 0.05:
                    first_opp = (f, bx, by)
                    break
        if first_mate is None:
            for m in mates:
                if math.hypot(m.x - bx, m.y - by) <= CR + SPD * f / 20.0 - 0.05:
                    first_mate = (f, bx, by)
                    break
        if first_opp is not None and first_mate is not None:
            break
    atk = ATK[me]
    ogx = MY_GOAL_X[me]
    if first_mate is not None and (first_opp is None or first_mate[0] <= first_opp[0]):
        f, bx, by = first_mate
        prog = (bx - ogx) * atk
        return 28.0 + prog * 0.32 + (30.0 - f) * 0.15
    if first_opp is not None:
        f, bx, by = first_opp
        prog = (bx - ogx) * atk
        return prog * 0.12 - 4.0 + (20.0 - f) * 0.05
    bx, by = path[-1]
    prog = (bx - ogx) * atk
    od = min([math.hypot(o['pos'][0] - bx, o['pos'][1] - by) for o in w.opps] or [9.0])
    md = min([math.hypot(m.x - bx, m.y - by) for m in mates] or [9.0])
    return prog * 0.24 + min(od, 4.0) * 0.8 + (0.0 if md < 2 else 1.0)


def best_kick_aim(st, u, me, w):
    gx = OPP_GOAL_X[me]
    D = math.hypot(gx - u.x, 13.0 - u.y)
    if D < 26.5:
        sh = choose_shot(st, u, me, w, risky=False)
        if sh is not None:
            return sh[0]
        sh = choose_shot(st, u, me, w, risky=True)
        if sh is not None and sh[1] > -0.30:
            return sh[0]
    # candidate directions: toward the opponent goal half + a spread
    base = math.atan2(13.0 - u.y, gx - u.x)
    best = None
    for i in range(36):
        ang = (math.degrees(base) + (i - 18) * 9.0) % 360.0
        sc = kick_eval(st, u, me, w, ang)
        if best is None or sc > best[0]:
            best = (sc, ang)
    # also consider straightforward upfield clears
    for ang in (0.0, 45.0, 315.0, 90.0, 270.0, 180.0):
        sc = kick_eval(st, u, me, w, ang)
        if best is None or sc > best[0]:
            best = (sc, ang)
    return best[1] if best is not None else ang_to(u.x, u.y, gx, 13.0)


def plan_frames_kick(st0, me, plan):
    """Every unit kicks on first touch; movement per plan targets."""
    units = {}
    for u in st0.units:
        if u.team == me:
            units[u.index] = [u.x, u.y]
    opp_pos = [(o.x, o.y) for o in st0.units if o.team != me]
    frames = []
    carrier = plan.get('carrier', -1)
    act = plan.get('act')
    kick_all = (plan.get('mode') != 'park')
    for f in range(20):
        row = []
        for u in st0.units:
            if u.team != me:
                continue
            idx = u.index
            pos = units[idx]
            tx, ty = plan['targets'].get(idx, (pos[0], pos[1]))
            if idx == carrier and act is not None and act['kind'] == 'dribble':
                tx, ty = act['target']
            d = move_dir_to(pos[0], pos[1], tx, ty, me, allow_box=(idx == 0))
            aim = plan['aims'].get(idx)
            kick = bool(kick_all and aim is not None)
            if d != 'N':
                dv = DIRV8[d]
                speed = SPD * (DRIBF if (idx == carrier and act is not None and act['kind'] == 'dribble') else 1.0)
                nx = pos[0] + dv[0] * speed * DT
                ny = pos[1] + dv[1] * speed * DT
                if not circle_hits_wall(nx, pos[1], R_U):
                    pos[0] = nx
                if not circle_hits_wall(pos[0], ny, R_U):
                    pos[1] = ny
                pos[0] = clamp(pos[0], R_U, FIELD_W - R_U)
                pos[1] = clamp(pos[1], R_U, FIELD_H - R_U)
            row.append((d, aim, kick))
        frames.append(row)
    return frames


def neutral_frame(n):
    return [{"dir": "N", "aim": None, "kick": False} for _ in range(n)]


LAST = {'obs': None}


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        n = 1
        try:
            obs = json.loads(line)
            n = int(obs.get('teamSize') or 1)
            me = int(obs.get('yourTeam') or 0)
            if obs.get('status') not in (None, 'playing', 'live'):
                print(json.dumps({"inputs": [neutral_frame(n) for _ in range(20)]}), flush=True)
                LAST['obs'] = None
                continue
            st = state_from_obs(obs)
            if not math.isfinite(st.tl):
                st.tl = 120.0
            prev = LAST['obs']
            if prev is not None:
                pf = int(prev.get('frame') or -100)
                if abs(st.frame - pf) > 60:
                    prev = None
            frames, plan = decide_window_v3(st, me, prev)
            our_units = [u for u in st.units if u.team == me]
            out = []
            for fr in frames:
                row = []
                for k, u in enumerate(our_units):
                    d, aim, kick = fr[u.index]
                    deg = None
                    if aim is not None:
                        deg = round(aim % 360.0, 2)
                        if deg >= 360.0:
                            deg = 0.0
                    row.append({"dir": d, "aim": deg, "kick": bool(kick)})
                out.append(row)
            LAST['obs'] = obs
            dbg({'f': st.frame, 'mode': plan.get('mode'), 'act': plan.get('act'),
                 'carrier': plan.get('carrier')})
            print(json.dumps({"inputs": out}), flush=True)
        except Exception as e:
            if DEBUG:
                import traceback
                traceback.print_exc()
            else:
                sys.stderr.write('ERR %r\n' % (e,))
            print(json.dumps({"inputs": [neutral_frame(n) for _ in range(20)]}), flush=True)


if __name__ == '__main__':
    main()
