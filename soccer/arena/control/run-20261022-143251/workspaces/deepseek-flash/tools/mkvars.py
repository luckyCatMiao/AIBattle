import sys
BASE = open('tools/agent_r2base.py', encoding='utf-8').read()

def c1(s):
    anchor = 'def choose_pass(w, carrier, team, mates, foes):'
    helper = '''def shot_clear_at(x, y, team, others):
    """Best shot-lane clearance if we shot from (x, y) (opponents only)."""
    gx = attack_goal_x(team)
    best = -1e9
    for i in range(11):
        ty = 10.7 + i * (15.3 - 10.7) / 10.0
        c = path_clearance(x, y, gx, ty, others, P.shot_reach)
        if c > best:
            best = c
    return best


def best_strike_spot(w, team, units, carrier, foes, boxes):
    """Legal spot just outside the opponent box with the best shot lane."""
    att = 1.0 if team == 0 else -1.0
    edge = opp_box_edge(team, boxes)
    bx, by = carrier['x'], carrier['y']
    best, bv = None, -1e9
    for dx in (1.1, 2.0, 3.2, 4.8):
        x = edge - att * dx
        for y in (9.0, 10.8, 12.2, 13.6, 15.2, 17.0):
            od = min((math.hypot(f['x'] - x, f['y'] - y) for f in foes), default=9.0)
            if od < 1.0:
                continue
            lane = path_clearance(bx, by, x, y, foes, P.pass_reach)
            if lane < -0.2:
                continue
            sc = shot_clear_at(x, y, team, foes)
            v = sc + 0.35 * min(od, 3.0) + 0.45 * lane - 0.20 * dx - 0.06 * abs(y - 13.0)
            if v > bv:
                bv, best = v, (x, y)
    return best


'''
    assert anchor in s
    s = s.replace(anchor, helper + anchor, 1)
    old = '''        c = path_clearance(bx, by, tx, ty, foes, P.pass_reach)
        if c < P.pass_min_c:
            continue
        gain = att * (tx - bx)
        val = 1.15 * c + 0.16 * gain - 0.05 * abs(ty - 13.0)
        if val > best_val:
            best_val, best = val, (tx, ty, m['id'], val)'''
    new = '''        c = path_clearance(bx, by, tx, ty, foes, P.pass_reach)
        if c < P.pass_min_c:
            continue
        gain = att * (tx - bx)
        shot_bonus = 0.0
        if att * (tx - 21.5) > 2.0:
            sc = shot_clear_at(tx, ty, team, foes)
            shot_bonus = 0.32 * clamp(sc, -1.0, 2.0)
        val = 1.15 * c + 0.16 * gain - 0.05 * abs(ty - 13.0) + shot_bonus
        if val > best_val:
            best_val, best = val, (tx, ty, m['id'], val)'''
    assert old in s
    s = s.replace(old, new, 1)
    old = '''        rest = [f for f in field if f['id'] != carrier['id']]
        if my_team == 0:
            cands_x = [clamp(b['x'] + d, 6.0, edge - (BOX_MARGIN + 0.5)) for d in (5.0, 9.0, 13.0, 18.0)]
        else:
            cands_x = [clamp(b['x'] - d, edge + (BOX_MARGIN + 0.5), W - 6.0) for d in (5.0, 9.0, 13.0, 18.0)]
        cands_y = [2.5, 5.0, 8.0, 10.5, 13.0, 15.5, 18.0, 21.0, 23.5]
        used = []
        for f in rest:
            if f['id'] == pass_receiver_id:
                out[f['index']] = {'dir': 'N', 'aim': None, 'kick': False}
                used.append((f['x'], f['y']))
                continue'''
    new = '''        rest = [f for f in field if f['id'] != carrier['id']]
        if my_team == 0:
            cands_x = [clamp(b['x'] + d, 6.0, edge - (BOX_MARGIN + 0.5)) for d in (5.0, 9.0, 13.0, 18.0)]
        else:
            cands_x = [clamp(b['x'] - d, edge + (BOX_MARGIN + 0.5), W - 6.0) for d in (5.0, 9.0, 13.0, 18.0)]
        cands_y = [2.5, 5.0, 8.0, 10.5, 13.0, 15.5, 18.0, 21.0, 23.5]
        striker_id = None
        if rest and att * (b['x'] - 21.5) > -1.0:
            striker = max(rest, key=lambda f: att * (f['x'] - 21.5))
            striker_id = striker['id']
        used = []
        for f in rest:
            if f['id'] == pass_receiver_id:
                out[f['index']] = {'dir': 'N', 'aim': None, 'kick': False}
                used.append((f['x'], f['y']))
                continue
            if f['id'] == striker_id:
                tgt = best_strike_spot(w, my_team, w.units, carrier, foes, boxes)
                if tgt is None:
                    tgt = (edge - att * 1.4, 13.0)
                tgt = safe_target(my_team, tgt[0], tgt[1], boxes, BOX_MARGIN)
                out[f['index']] = {'dir': go_to_dir(w, f, tgt, my_team, boxes), 'aim': None, 'kick': False}
                used.append(tgt)
                continue'''
    assert old in s
    return s.replace(old, new, 1)

def c2(s):
    s = s.replace("def kick_to_space(w, carrier, team, mates, foes, boxes):",
                  "def kick_to_space(w, carrier, team, mates, foes, boxes, want_score=False):", 1)
    old = '''        if score > best_score:
            best_score = score
            best_ang = ang
    return best_ang'''
    new = '''        if score > best_score:
            best_score = score
            best_ang = ang
    if want_score:
        return (best_ang, best_score)
    return best_ang'''
    assert old in s
    s = s.replace(old, new, 1)
    old = '''        if not acted:
            # dribble toward the attacking box edge, away from the nearest foe
            lane = 13.0'''
    new = '''        if not acted and ball_press > 4.2 and att * (cx - 21.5) < 6.0:
            ks, ksc = kick_to_space(w, carrier, my_team, mates, foes, boxes, want_score=True)
            if ks is not None and ksc > 2.4:
                out[carrier['index']] = {'dir': 'N', 'aim': float(ks), 'kick': True}
                acted = True
                action = 'push'
        if not acted:
            # dribble toward the attacking box edge, away from the nearest foe
            lane = 13.0'''
    assert old in s
    return s.replace(old, new, 1)

def c3(s):
    s = s.replace("__slots__ = ('tiles', 'units', 'ball', 'freeze', 'frame', 'goal_scored')",
                  "__slots__ = ('tiles', 'units', 'ball', 'freeze', 'frame', 'goal_scored', 'score', 'time_left')", 1)
    s = s.replace("        self.goal_scored = None\n\n    def tile_at",
                  "        self.goal_scored = None\n        self.score = [0, 0]\n        self.time_left = 99.0\n\n    def tile_at", 1)
    old = '''    w.freeze = int(round(float(obs.get('freeze', 0)) * 20))
    w.goal_scored = None
    return w, obs['map']['penaltyBoxes']'''
    new = '''    w.freeze = int(round(float(obs.get('freeze', 0)) * 20))
    w.goal_scored = None
    w.score = list(obs.get('score', [0, 0]))
    w.time_left = float(obs.get('timeLeft', 99.0))
    return w, obs['map']['penaltyBoxes']'''
    assert old in s
    s = s.replace(old, new, 1)
    old = '''        if not acted:
            tgt = kick_to_space_simple(w, keeper, my_team, mates, foes, boxes)
            if tgt is not None:
                ang = angle_deg(tgt[0] - b['x'], tgt[1] - b['y'])
                out[keeper['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
            else:
                ang = angle_deg(att * 1.0, 0.0)
                out[keeper['index']] = {'dir': 'N', 'aim': ang, 'kick': True}

'''
    new = '''        if not acted:
            tgt = kick_to_space_simple(w, keeper, my_team, mates, foes, boxes)
            c = -9.0
            if tgt is not None:
                c = path_clearance(keeper['x'], keeper['y'], tgt[0], tgt[1], foes, P.pass_reach)
            gx0 = own_goal_x(my_team)
            deep = abs(keeper['x'] - gx0) < 5.5
            urgent = (w.time_left < 30.0 and w.score[my_team] < w.score[1 - my_team])
            if tgt is not None and (c > 0.05 or not deep or urgent):
                ang = angle_deg(tgt[0] - b['x'], tgt[1] - b['y'])
                out[keeper['index']] = {'dir': 'N', 'aim': ang, 'kick': True}
            else:
                ty = clamp(13.0 + (keeper['y'] - 13.0) * 0.6, 8.0, 18.0)
                tx = gx0 + (0.9 if my_team == 0 else -0.9)
                out[keeper['index']] = {'dir': go_to_dir(w, keeper, (tx, ty), my_team, boxes),
                                        'aim': None, 'kick': False}'''
    assert old in s
    return s.replace(old, new, 1)

CASES = {
    'c1': [c1], 'c2': [c2], 'c3': [c3],
    'c12': [c1, c2], 'c13': [c1, c3], 'c23': [c2, c3],
}
for name, fns in CASES.items():
    s = BASE
    for fn in fns:
        s = fn(s)
    open('tools/v_%s.py' % name, 'w', encoding='utf-8').write(s)
    print('wrote', name)
