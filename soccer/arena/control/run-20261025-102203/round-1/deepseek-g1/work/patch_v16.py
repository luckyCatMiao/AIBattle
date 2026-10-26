import io
p = r'D:\extraProj\AIBattle\soccer\arena\control\run-20261025-013221\workspaces\deepseek-g1\agent_v16.py'
s = io.open(p, encoding='utf-8').read()

anchor = 'def decide_window(s0, me, n):'
add = '''# ---------------------------------------------------------------- frame-0 shot trigger
def goal_shot_now(st, u, me, keeper_perp_min=1.6, lane_min=1.0):
    """A shot is worth taking right now if the observed keeper is far from the
    shot line and no opponent is close to it."""
    gx = OPP_GOAL_X[me]
    D = hyp(gx - u.x, 13.0 - u.y)
    if D < 1.5 or D > 14.5:
        return None
    opp = [o for o in st.units if o.team != me]
    if not opp:
        return None
    kp = None
    for o in opp:
        if o.index == 0:
            kp = o
            break
    if kp is None:
        kp = min(opp, key=lambda o: hyp(o.x - gx, o.y - 13.0))
    mates = [m for m in st.units if m.team == me and m is not u]
    base = math.atan2(13.0 - u.y, gx - u.x)
    spread = math.atan2(3.4, max(2.2, D))
    best = None
    for i in range(25):
        t = -1.12 + 2.24 * i / 24.0
        ang = (math.degrees(base) + math.degrees(spread) * t) % 360.0
        a = math.radians(ang)
        ox = u.x + math.cos(a) * KICK_OFF
        oy = u.y + math.sin(a) * KICK_OFF
        if ball_hits_wall(ox, oy):
            ox, oy = u.x, u.y
        path, gf, gt = fly_path(ox, oy, ang)
        if gf is None or gt != me:
            continue
        # keeper perpendicular distance to the straight kick line
        dx, dy = math.cos(a), math.sin(a)
        perp = abs((kp.x - ox) * dy - (kp.y - oy) * dx)
        if perp < keeper_perp_min:
            continue
        # any opponent close to the early path?
        bad = False
        for f in range(min(gf, len(path))):
            bx, by = path[f]
            for o in opp:
                if hyp(o.x - bx, o.y - by) <= CR + 0.30:
                    bad = True
                    break
            if bad:
                break
            for m in mates:
                if hyp(m.x - bx, m.y - by) <= CR + 0.10:
                    bad = True
                    break
            if bad:
                break
        if bad:
            continue
        sc = 100.0 + perp * 8.0 - gf * 0.8 - D * 0.3
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
new = '''def main():
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
            act = None
            if st.owner >= 0 and st.units[st.owner].team == me:
                u = st.units[st.owner]
                if u.kickCd <= 0 and u.controlLock <= 0:
                    act = goal_shot_now(st, u, me)
            fr = decide_window(st, me, n)
            if act is not None:
                ci = st.units.index(st.units[st.owner])
                ang = act[1]
                row = list(fr[0])
                row[ci] = (row[ci][0], (math.cos(math.radians(ang)), math.sin(math.radians(ang))), True)
                fr[0] = row
'''
assert old in s
s = s.replace(old, new)
io.open(p, 'w', encoding='utf-8').write(s)
print('patched v16')
