

# ---------------------------------------------------------------- roles
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


def opp_pred_dir(st, u, w, f):
    o = None
    for q in w.opps:
        if q.get('key') == (u.team, u.index):
            o = q
            break
    if o is None:
        return 'N'
    fi = min(f, 19)
    tx, ty = o['committed'][fi]
    return move_dir_to(u.x, u.y, tx, ty, 1 - w.me, allow_box=True)


def carrier_cmd_v2(st, u, me, w):
    if u.index == 0:
        return keeper_distribute(st, u, me, w)
    bx, by = st.bx, st.by
    opp = [o for o in st.units if o.team != me]
    nd = 9.0
    near = None
    for o in opp:
        d = math.hypot(o.x - bx, o.y - by)
        if d < nd:
            nd, near = d, o
    pressured = nd < 2.0

    if w.mode == 'park':
        px, py = park_spot(me)
        d = math.hypot(px - u.x, py - u.y)
        if d > 0.7:
            return Cmd(move_dir_to(u.x, u.y, px, py, me), ang_to(u.x, u.y, OPP_GOAL_X[me], 13.0), False)
        aim = ang_to(u.x, u.y, OPP_GOAL_X[me], 13.0)
        if near is not None and nd < 1.6:
            aim = ang_to(u.x, u.y, u.x * 2 - near.x, u.y * 2 - near.y)
        return Cmd('N', aim, False)

    risky = (w.mode == 'desperate')
    sh = choose_shot(st, u, me, w, risky)
    if sh is not None:
        dbg({'k': 'shot', 'f': st.frame, 'a': round(sh[0], 1), 'x': round(u.x, 1),
             'y': round(u.y, 1), 'm': round(sh[3], 2), 'gf': sh[2]})
        return Cmd('N', sh[0], True)
    ps = choose_pass(st, u, me, w, pressured)
    if ps is not None:
        if pressured or ps[5] > 6.0 or ps[0] > 3.0:
            w.passp = (ps[2], ps[3], st.frame + ps[4])
            dbg({'k': 'pass', 'f': st.frame, 'to': ps[2], 'prog': round(ps[5], 1),
                 'at': (round(ps[3][0], 1), round(ps[3][1], 1))})
            return Cmd('N', ps[1], True)
    tx, ty = choose_dribble_target(st, u, me, w)
    d = move_dir_to(u.x, u.y, tx, ty, me)
    if near is not None and nd < 1.5:
        aim = ang_to(u.x, u.y, u.x * 2 - near.x, u.y * 2 - near.y)
    else:
        aim = ang_to(u.x, u.y, OPP_GOAL_X[me], 13.0)
    return Cmd(d, aim, False)


def defend_assign(st, me, fielders, owner, w, cmds):
    bx, by = st.bx, st.by
    ogx = MY_GOAL_X[me]
    cx, cy = ogx, 13.0
    dx, dy = bx - cx, by - cy
    D = math.hypot(dx, dy) or 1.0
    ux, uy = dx / D, dy / D
    sf = sorted(fielders, key=lambda u: math.hypot(u.x - bx, u.y - by))
    presser = sf[0]
    # jockey goal-side of the ball: blocks the shot cone, steps in when close
    ddx, ddy = cx - bx, cy - by
    dl = math.hypot(ddx, ddy) or 1.0
    db = math.hypot(presser.x - bx, presser.y - by)
    if db < 2.7:
        px, py = bx, by
    else:
        px, py = bx + ddx / dl * 2.0, by + ddy / dl * 2.0
    px = clamp(px, 0.6, FIELD_W - 0.6)
    py = clamp(py, 0.9, FIELD_H - 0.9)
    cmds[presser.index] = Cmd(move_dir_to(presser.x, presser.y, px, py, me, allow_box=True),
                              ang_to(presser.x, presser.y, bx, by), False)
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
        tx = clamp(tx, 0.7, FIELD_W - 0.7)
        ty = clamp(ty, 0.8, FIELD_H - 0.8)
        cmds[u.index] = Cmd(move_dir_to(u.x, u.y, tx, ty, me, allow_box=True),
                            ang_to(u.x, u.y, bx, by), False)
    marked = []
    for u in rest[n_block:]:
        tgt = None
        bd = 1e9
        for o in [q for q in st.units if q.team != me]:
            if o.index == 0:
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
            cmds[u.index] = Cmd(move_dir_to(u.x, u.y, tx, ty, me, allow_box=True),
                                ang_to(u.x, u.y, bx, by), False)
        else:
            tx = clamp(bx - ATK[me] * 6.0, 2.0, FIELD_W - 2.0)
            ty = 13.0 + (by - 13.0) * 0.6
            cmds[u.index] = Cmd(move_dir_to(u.x, u.y, tx, ty, me, allow_box=True),
                                ang_to(u.x, u.y, bx, by), False)


def frame_commands_v2(st, me, w):
    my = [u for u in st.units if u.team == me]
    owner = st.units[st.owner] if st.owner >= 0 else None
    cmds = {}
    if not my:
        return cmds
    n = st.n
    if n == 1:
        u = my[0]
        ci = _find_uidx(st, u)
        if owner is not None and owner.team == me:
            cmds[0] = carrier_cmd_v2(st, u, me, w)
        elif owner is not None:
            # defend: jockey goal-side of the ball, tackle when in reach
            bx, by = st.bx, st.by
            ogx = MY_GOAL_X[me]
            dx, dy = ogx - bx, 13.0 - by
            dl = math.hypot(dx, dy) or 1.0
            db = math.hypot(u.x - bx, u.y - by)
            if db < 2.6:
                tx, ty = bx, by
            else:
                tx, ty = bx + dx / dl * 2.0, by + dy / dl * 2.0
            tx = clamp(tx, 0.7, FIELD_W - 0.7)
            ty = clamp(ty, 0.9, FIELD_H - 0.9)
            cmds[0] = Cmd(move_dir_to(u.x, u.y, tx, ty, me, allow_box=True),
                          ang_to(u.x, u.y, bx, by), False)
        else:
            tx, ty = chase_target(st, u)
            tx, ty = push_out(me, tx, ty, 0.2)
            cmds[0] = Cmd(move_dir_to(u.x, u.y, tx, ty, me), ang_to(u.x, u.y, st.bx, st.by), False)
        return cmds

    # goalkeeper
    cmds[0] = keeper_cmd(st, my[0], me, w)
    fielders = [u for u in my if u.index != 0]

    if owner is not None and owner.team == me:
        if owner.index != 0:
            cmds[owner.index] = carrier_cmd_v2(st, owner, me, w)
        others = [u for u in fielders if u is not owner]
        if w.mode == 'park':
            gx = MY_GOAL_X[me]
            spots = [(gx + ATK[me] * 1.8, 10.8), (gx + ATK[me] * 1.8, 15.2),
                     (gx + ATK[me] * 5.5, 8.0), (gx + ATK[me] * 5.5, 18.0)]
            for i, u in enumerate(others):
                tx, ty = spots[i % len(spots)]
                cmds[u.index] = Cmd(move_dir_to(u.x, u.y, tx, ty, me, allow_box=True),
                                    ang_to(u.x, u.y, st.bx, st.by), False)
        else:
            taken = []
            others_sorted = sorted(others, key=lambda z: (z.x - MY_GOAL_X[me]) * ATK[me])
            roles = []
            if len(others_sorted) == 1:
                roles = ['support']
            elif len(others_sorted) == 2:
                roles = ['cover', 'support']
            else:
                roles = ['cover', 'support'] + ['striker'] * (len(others_sorted) - 2)
            for u, role in zip(others_sorted, roles):
                if w.passp is not None and w.passp[0] == u.index and st.frame <= w.passp[2] + 2:
                    tx, ty = w.passp[1]
                else:
                    tx, ty = choose_attack_spot(st, u, me, w, taken, role)
                taken.append((tx, ty))
                cmds[u.index] = Cmd(move_dir_to(u.x, u.y, tx, ty, me),
                                    ang_to(u.x, u.y, OPP_GOAL_X[me], 13.0), False)
        return cmds

    if owner is not None and owner.team != me:
        defend_assign(st, me, fielders, owner, w, cmds)
        return cmds

    # loose ball
    if fielders:
        sf = sorted(fielders, key=lambda u: math.hypot(u.x - st.bx, u.y - st.by))
        chaser = sf[0]
        cd = math.hypot(chaser.x - st.bx, chaser.y - st.by)
        if cd < 12.0 or not in_infl(me, st.bx, st.by, 0.0):
            tx, ty = chase_target(st, chaser)
            tx, ty = push_out(me, tx, ty, 0.35)
            cmds[chaser.index] = Cmd(move_dir_to(chaser.x, chaser.y, tx, ty, me),
                                     ang_to(chaser.x, chaser.y, st.bx, st.by), False)
        taken = []
        for u in fielders:
            if u.index in cmds:
                continue
            tx, ty = choose_attack_spot(st, u, me, w, taken, 'support')
            taken.append((tx, ty))
            cmds[u.index] = Cmd(move_dir_to(u.x, u.y, tx, ty, me),
                                ang_to(u.x, u.y, OPP_GOAL_X[me], 13.0), False)
    return cmds


def decide_window_v2(st0, me, prev_obs):
    mode = select_mode(st0, me)
    w = build_wctx(st0, prev_obs, me, mode)
    st = st0.clone()
    out = []
    for f in range(20):
        if st.status != 'playing':
            out.append(None)
            continue
        cmds = frame_commands_v2(st, me, w)
        inp = []
        for u in st.units:
            if u.team == me:
                c = cmds.get(u.index) or Cmd()
                aim = None
                if c.aim is not None:
                    a = math.radians(c.aim % 360.0)
                    aim = (math.cos(a), math.sin(a))
                inp.append((c.dir, aim, bool(c.kick)))
            else:
                inp.append((opp_pred_dir(st, u, w, f), None, False))
        out.append(inp)
        g = step(st, inp, st.kickoffTeam)
        if g >= 0:
            st.score[g] += 1
            if st.golden:
                st.status = 'finished'
                break
            kickoff(st, 1 - g)
    while len(out) < 20:
        out.append(None)
    return out


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
            frames = decide_window_v2(st, me, prev)
            our_units = [u for u in st.units if u.team == me]
            out = []
            for fr in frames:
                if fr is None:
                    out.append(neutral_frame(n))
                    continue
                row = []
                for u in our_units:
                    d, aim, kick = fr[st.units.index(u)]
                    deg = None
                    if aim is not None:
                        deg = round(math.degrees(math.atan2(aim[1], aim[0])) % 360.0, 2)
                        if deg >= 360.0:
                            deg = 0.0
                    row.append({"dir": d, "aim": deg, "kick": bool(kick)})
                out.append(row)
            LAST['obs'] = obs
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
