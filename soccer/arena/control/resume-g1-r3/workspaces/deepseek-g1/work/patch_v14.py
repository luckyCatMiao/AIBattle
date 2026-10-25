import io
p = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v14.py'
s = io.open(p, encoding='utf-8').read()

anchor = 'def decide_window(s0, me, n):'
add = '''# ---------------------------------------------------------------- window shot planner
def build_opp_ctx(st, prev, me):
    gc = (MY_GOAL_X[me], 13.0)
    prev_pos = {}
    if prev:
        for u in prev.get('units', []):
            prev_pos[(int(u['team']), int(u['index']))] = (float(u['x']), float(u['y']))
    out = []
    for u in st.units:
        if u.team == me:
            continue
        vx = vy = 0.0
        pp = prev_pos.get((u.team, u.index))
        if pp is not None:
            dx, dy = u.x - pp[0], u.y - pp[1]
            if hyp(dx, dy) < 3.6:
                vx, vy = dx, dy
        ln = hyp(vx, vy)
        if ln > SPD:
            vx *= SPD / ln
            vy *= SPD / ln
        comm = []
        if u.index == 0 and not (st.owner >= 0 and st.units[st.owner] is u):
            dx, dy = st.bx - gc[0], st.by - gc[1]
            D = hyp(dx, dy) or 1.0
            k = min(2.6, max(0.6, 0.6 * D))
            tx, ty = gc[0] + dx / D * k, gc[1] + dy / D * k
            px, py = u.x, u.y
            for f in range(20):
                ddx, ddy = tx - px, ty - py
                dd = hyp(ddx, ddy)
                if dd > 1e-6:
                    stp = min(SPD * DT, dd)
                    px += ddx / dd * stp
                    py += ddy / dd * stp
                comm.append((px, py))
        else:
            for f in range(1, 21):
                comm.append((clamp(u.x + vx * f / 20.0, R_U, W - R_U),
                             clamp(u.y + vy * f / 20.0, R_U, H - R_U)))
        out.append({'pos': (u.x, u.y), 'comm': comm, 'pos20': comm[-1]})
    return out


def pred_opp_pos(o, f):
    if f <= 20:
        return o['comm'][f - 1], 0.0
    return o['pos20'], SPD * (f - 20) / 20.0


def plan_shot_only(st, u, me, opp_ctx, margin=0.35):
    gx = OPP_GOAL_X[me]
    Dg = hyp(gx - u.x, 13.0 - u.y)
    if Dg > 27.0 or Dg < 1.2:
        return None
    base = math.atan2(13.0 - u.y, gx - u.x)
    spread = math.atan2(3.5, max(2.2, Dg))
    best = None
    for i in range(37):
        t = -1.15 + 2.30 * i / 36.0
        ang = (math.degrees(base) + math.degrees(spread) * t) % 360.0
        a = math.radians(ang)
        ox = u.x + math.cos(a) * KICK_OFF
        oy = u.y + math.sin(a) * KICK_OFF
        if ball_hits_wall(ox, oy):
            ox, oy = u.x, u.y
        path, gf, gt = fly_path(ox, oy, ang)
        if gf is None or gt != me:
            continue
        bad = False
        for k in range(min(gf, len(path))):
            bx, by = path[k]
            f = k + 1
            for o in opp_ctx:
                (ox2, oy2), reach = pred_opp_pos(o, f)
                if hyp(ox2 - bx, oy2 - by) <= CR + reach + margin:
                    bad = True
                    break
            if bad:
                break
            for m in st.units:
                if m.team != me or m is u:
                    continue
                if hyp(m.x - bx, m.y - by) <= CR + 0.10:
                    bad = True
                    break
            if bad:
                break
        if bad:
            continue
        sc = 400.0 - gf * 1.2 - Dg * 0.4
        if best is None or sc > best[0]:
            best = (sc, ang)
    return best


'''
assert anchor in s
s = s.replace(anchor, add + anchor)

old = '''def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        n = 1
        try:
            obs = json.loads(line)
            n = int(obs.get('teamSize') or 1)
            me = int(obs.get('yourTeam') or 0)
            if obs.get('freeze', 0) > 0 or obs.get('status') not in (None, 'playing'):
                print(json.dumps({"inputs": [neutral_frame(n) for _ in range(20)]}), flush=True)
                continue
            st = state_from_obs(obs)
            sc = obs.get('score') or [0, 0]
            tl = float(obs.get('timeLeft') or 120.0)
            golden = bool(obs.get('golden'))
            GAME_CTX['desp'] = (int(sc[me]) <= int(sc[1 - me])) and (golden or tl < DESP_T)
            fr = decide_window(st, me, n)
'''
new = '''PLAN = {'action': None, 'prev': None}


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
            if obs.get('freeze', 0) > 0 or obs.get('status') not in (None, 'playing'):
                print(json.dumps({"inputs": [neutral_frame(n) for _ in range(20)]}), flush=True)
                PLAN['prev'] = None
                continue
            st = state_from_obs(obs)
            sc = obs.get('score') or [0, 0]
            tl = float(obs.get('timeLeft') or 120.0)
            golden = bool(obs.get('golden'))
            GAME_CTX['desp'] = (int(sc[me]) <= int(sc[1 - me])) and (golden or tl < DESP_T)
            PLAN['action'] = None
            if st.owner >= 0 and st.units[st.owner].team == me:
                u = st.units[st.owner]
                if u.kickCd <= 0 and u.controlLock <= 0:
                    opp_ctx = build_opp_ctx(st, PLAN['prev'], me)
                    act = plan_shot_only(st, u, me, opp_ctx)
                    if act is not None:
                        PLAN['action'] = (act[1], st.units.index(u))
            fr = decide_window(st, me, n)
            if PLAN['action'] is not None:
                ang, ci = PLAN['action']
                row = list(fr[0])
                row[ci] = (row[ci][0], (math.cos(math.radians(ang)), math.sin(math.radians(ang))), True)
                fr[0] = row
'''
assert old in s
s = s.replace(old, new)

old = '''            print(json.dumps({"inputs": out}), flush=True)
        except Exception as e:
'''
new = '''            print(json.dumps({"inputs": out}), flush=True)
            PLAN['prev'] = obs
        except Exception as e:
'''
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('patched v14')
