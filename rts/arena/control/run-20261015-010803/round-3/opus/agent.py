# Frontier RTS agent (claude-opus-5-5). Counter-composition raider army + economy + focus fire.
import sys, json, math

DMG = {'rifle': 13 / .8, 'tank': 40 / 2, 'raider': 16 / .65}
COUNTER = {'rifle': 'raider', 'tank': 'rifle', 'raider': 'tank'}
RANGE = {'rifle': 115, 'tank': 160, 'raider': 94}
COST = {'worker': 50, 'rifle': 60, 'tank': 160, 'raider': 100}


def D(a, b):
    return math.hypot(a['x'] - b['x'], a['y'] - b['y'])


def dps(a, btype):
    return DMG[a] * (1.5 if COUNTER[a] == btype else 1)


def power(us, them):
    """Lanchester-style strength of `us` against composition `them`."""
    if not us:
        return 0.0
    hp = sum(u['hp'] for u in us)
    if not them:
        return hp * sum(DMG[u['type']] for u in us)
    n = len(them)
    d = sum(sum(dps(u['type'], v['type']) for v in them) / n for u in us)
    return hp * d


class Agent:
    def __init__(self):
        self.mode = 'gather'

    def act(self, o):
        me = o['yourPlayer']
        P = o['players'][me]
        cr = P['credits']
        t = o['now']
        base = next(b for b in o['bases'] if b['owner'] == me)
        eb = next(b for b in o['bases'] if b['owner'] != me)
        west = base['x'] < 640
        my = [u for u in o['units'] if u['owner'] == me]
        en = [u for u in o['units'] if u['owner'] != me]
        workers = [u for u in my if u['type'] == 'worker']
        army = [u for u in my if u['type'] != 'worker']
        earmy = [u for u in en if u['type'] != 'worker']
        nodes = o['nodes']
        cmds = []
        q = base['queue']
        pop = len(my) + len(q)

        # ---------- economy / production ----------
        if P['level'] < 2 and t > 20 and cr >= 180 + 120 * P['level'] + (0 if q else 160):
            cmds.append({'type': 'upgrade'})
            cr -= 180 + 120 * P['level']
        if base['hp'] < base['maxHp'] - 450 and cr >= 100 and t - P['repairAt'] >= 30:
            cmds.append({'type': 'repair'})
            cr -= 100
        qw = sum(1 for x in q if x['type'] == 'worker')
        live_mines = [m for m in o['mines'] if m['ore'] > 0]
        home_mine = min(o['mines'], key=lambda m: D(m, base))
        mynode0 = min(nodes, key=lambda n: D(n, base) + (0 if abs(n['x'] - 640) > 50 else 1e4))
        far_mine = min(live_mines, key=lambda m: D(m, mynode0)) if live_mines else home_mine
        want_workers = 4 if home_mine['ore'] > 400 else 7
        if t > 480:
            want_workers = 0
        threat_near = [e for e in earmy if D(e, base) < 330]
        added = 0
        while len(q) + added < 2 and pop + added < 40:
            if len(workers) + qw < want_workers and cr >= 50 and not (threat_near and len(workers) >= 3):
                cmds.append({'type': 'train', 'unit': 'worker'})
                cr -= 50; qw += 1; added += 1
                continue
            unit = self.pick_unit(earmy, army)
            if cr >= COST[unit]:
                cmds.append({'type': 'train', 'unit': unit})
                cr -= COST[unit]; added += 1
            else:
                break
        if t == 0:
            mn = min(nodes, key=lambda n: D(n, base) + (0 if abs(n['x'] - 640) > 50 else 1e4))
            cmds.append({'type': 'attackMove', 'units': [u['id'] for u in army], 'x': mn['x'], 'y': mn['y']})
            cmds.append({'type': 'gather', 'units': [w['id'] for w in workers], 'target': home_mine['id']})
        # idle workers (e.g. after a mine empties) -> nearest safe mine
        danger = [w for w in workers if any(D(w, e) < 190 for e in earmy) and D(w, base) > 140]
        if danger:
            cmds.append({'type': 'move', 'units': [w['id'] for w in danger], 'x': base['x'], 'y': base['y'] + 30})
        idle = [w for w in workers if w not in danger and (w['order'].get('type') in ('hold', 'move') and D(w, base) < 120
                or (home_mine['ore'] <= 0 and w['order'].get('target') not in (far_mine['id'], None) and w['order'].get('type') == 'gather'))]
        if idle and live_mines and not any(D(e, far_mine) < 220 for e in earmy):
            cmds.append({'type': 'gather', 'units': [w['id'] for w in idle], 'target': far_mine['id']})

        # ---------- army ----------
        mynode = min(nodes, key=lambda n: D(n, base) + (0 if abs(n['x'] - 640) > 50 else 1e4))
        lvl = 1 + .2 * P['level']
        elvl = 1 + .2 * o['players'][eb['owner']]['level']
        mp = power(army, earmy) * lvl
        ep = power(earmy, army) * elvl
        ratio = math.sqrt(mp / ep) if ep > 0 else 99.0
        # local fight: enemies close to my army
        near_en = [e for e in earmy if any(D(e, u) < 260 for u in army)]
        near_my = [u for u in army if any(D(e, u) < 300 for e in near_en)]
        if near_en:
            lp = power(near_my, near_en) * lvl
            le = power(near_en, near_my) * elvl
            lratio = math.sqrt(lp / le) if le > 0 else 99.0
        else:
            lratio = 99.0
        # station: own-side outpost, slightly toward home
        st = {'x': mynode['x'] + (base['x'] - mynode['x']) * .06, 'y': mynode['y'] + (base['y'] - mynode['y']) * .06}
        home = {'x': base['x'] + (640 - base['x']) * .16, 'y': base['y']}
        if threat_near:
            self.mode = 'defend'
            goal = min(threat_near, key=lambda e: D(e, base))
        else:
            if self.mode in ('take', 'push'):
                adv = ratio > 0.85
            else:
                adv = ratio > 0.95 and len(army) >= 4
            targets = [n for n in sorted(nodes, key=lambda n: D(n, base)) if n['owner'] != me]
            if adv and ((ratio > 1.6 and len(army) >= 8) or (ratio > 1.35 and len(army) >= 14) or pop >= 38):
                goal = eb; self.mode = 'push'
            elif adv and targets:
                goal = targets[0]; self.mode = 'take'
            elif ratio < 0.55 and len(earmy) >= 3:
                goal = home; self.mode = 'turtle'
            else:
                goal = st; self.mode = 'hold'
        fighting = bool(near_en)
        retreat = fighting and lratio < 0.6 and self.mode != 'defend'
        if retreat:
            goal = home; self.mode = 'retreat'
        # cohesion: regroup on centroid when strung out (not while fighting)
        if not fighting and self.mode in ('take', 'push', 'hold') and len(army) >= 2:
            fr = [u for u in army if D(u, base) > 250] or army
            mx = sum(u['x'] for u in fr) / len(fr); my_ = sum(u['y'] for u in fr) / len(fr)
            spread = max(math.hypot(u['x'] - mx, u['y'] - my_) for u in fr)
            if spread > 140 and self.mode != 'hold':
                goal = {'x': mx + (base['x'] - mx) * .1, 'y': my_ + (base['y'] - my_) * .1}
                self.mode += '-regroup'
        if self.mode == 'push' and goal is eb:
            dx, dy = base['x'] - eb['x'], base['y'] - eb['y']; dd = math.hypot(dx, dy)
            goal = {'x': eb['x'] + dx / dd * 186, 'y': eb['y'] + dy / dd * 186}
        if t % 10 == 0:
            r_ = st if self.mode not in ('turtle', 'retreat', 'defend') else home
            cmds.append({'type': 'rally', 'x': r_['x'], 'y': r_['y']})

        # micro v3: shoot-and-scoot. Ready units focus the weakest reachable enemy;
        # reloading units step back out of enemy range; nothing chases across the map.
        now = t
        groups = {}
        backers, holders, joiners, movers = [], [], [], []
        aggressive = self.mode in ('defend',) or (fighting and lratio >= 1.05 and not retreat)
        en_combat = [e for e in en if e['type'] != 'worker']
        focus = {}
        for u in army:
            o_ = u['order']
            if o_.get('type') == 'attack':
                focus[o_.get('target')] = focus.get(o_.get('target'), 0) + 1
        for u in army:
            rng = RANGE[u['type']]
            cd = u.get('fireAt', 0) - now
            near_threat = [e for e in en_combat if D(u, e) <= RANGE[e['type']] + u['r'] + 30]
            reach = 30 if (aggressive or self.mode == 'defend' or cd < 0.6) else 4
            cand = [e for e in en if D(u, e) <= rng + e['r'] - 3 + reach]
            if self.mode.startswith('push') and D(u, eb) <= rng + eb['r'] - 2:
                cand.append(eb)
            if cd > 0.9 and near_threat and D(u, base) > 200 and u['type'] == 'tank':
                backers.append((u, near_threat)); continue
            if retreat and not cand:
                movers.append(u); continue
            if cand:
                def val(e):
                    ty = e.get('type')
                    if ty == 'base':
                        return 0.3
                    mult = 1.5 if COUNTER[u['type']] == ty else 1
                    threat = DMG.get(ty, 0.0) + 2
                    inr = 1.0 if D(u, e) <= rng + e['r'] - 3 else 0.6
                    return mult * threat / max(e['hp'], 20) * 100 * inr * (1 + 0.3 * focus.get(e['id'], 0))
                e = max(cand, key=val)
                groups.setdefault(e['id'], []).append(u['id'])
                focus[e['id']] = focus.get(e['id'], 0) + 1
            elif fighting and any(D(u, e) < 230 for e in near_en):
                (joiners if aggressive else holders).append(u)
            else:
                movers.append(u)

        att = sorted(groups.items(), key=lambda kv: -len(kv[1]))
        budget = 10 - len(cmds)
        if backers:
            budget -= 1  # reserve
        for eid, ids in att:
            if budget <= 2:
                break
            need = [i for i in ids if not any(u['id'] == i and u['order'].get('type') == 'attack' and u['order'].get('target') == eid for u in army)]
            if need:
                cmds.append({'type': 'attack', 'units': need, 'target': eid})
                budget -= 1
        if backers:
            budget += 1
            # individual step-back moves for the most threatened, others share one
            backers.sort(key=lambda b: -len(b[1]))
            for u, th in backers:
                if budget <= 1:
                    break
                cx = sum(e['x'] for e in th) / len(th); cy = sum(e['y'] for e in th) / len(th)
                dx, dy = u['x'] - cx, u['y'] - cy; dd = math.hypot(dx, dy) or 1
                # bias the retreat toward home so we don't run sideways into the map edge
                hx, hy = base['x'] - u['x'], base['y'] - u['y']; hd = math.hypot(hx, hy) or 1
                vx, vy = dx / dd + 0.5 * hx / hd, dy / dd + 0.5 * hy / hd; vd = math.hypot(vx, vy) or 1
                x = min(1260, max(20, u['x'] + vx / vd * 45)); y = min(820, max(20, u['y'] + vy / vd * 45))
                cmds.append({'type': 'move', 'units': [u['id']], 'x': x, 'y': y}); budget -= 1
        if joiners and budget >= 1:
            ids = [u['id'] for u in joiners]
            tgt = min(near_en, key=lambda e: sum(D(e, u) for u in joiners))
            cmds.append({'type': 'attackMove', 'units': ids, 'x': tgt['x'], 'y': tgt['y']}); budget -= 1
        if holders and budget >= 1:
            ids = [u['id'] for u in holders if u['order'].get('type') != 'hold']
            if ids:
                cmds.append({'type': 'stop', 'units': ids}); budget -= 1
        if movers and budget >= 1:
            ids = []
            for u in movers:
                o_ = u['order']
                if o_.get('type') in ('move', 'attackMove') and math.hypot(o_.get('x', 0) - goal['x'], o_.get('y', 0) - goal['y']) < 40:
                    continue
                if o_.get('type') == 'hold' and D(u, goal) < 60:
                    continue
                ids.append(u['id'])
            if ids:
                cmds.append({'type': 'move' if (retreat and not near_en) else 'attackMove', 'units': ids, 'x': goal['x'], 'y': goal['y']})
        return {'commands': cmds[:10], 'note': f'{self.mode} r={ratio:.2f} l={lratio:.2f}'}

    def pick_unit(self, earmy, army):
        # Simulated fights: massed tanks (splash + range) beat raiders/rifles per build-second.
        return 'tank'
        if not earmy:
            return 'raider'
        n = {'rifle': 0.0, 'tank': 0.0, 'raider': 0.0}
        for e in earmy:
            n[e['type']] += COST[e['type']] * e['hp'] / e['maxHp']
        tot = sum(n.values())
        # value of each of our unit types against enemy mix, per credit
        best, bv = 'raider', -1
        for ut, hp in (('raider', 150), ('tank', 360), ('rifle', 110)):
            d = sum(n[et] / tot * dps(ut, et) for et in n)
            # how much enemy damages this type
            inc = sum(n[et] / tot * dps(et, ut) for et in n)
            v = hp * d / (inc + 1) / COST[ut] ** 2
            if v > bv:
                best, bv = ut, v
        return best


def main():
    a = Agent()
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            o = json.loads(line)
            out = a.act(o)
        except Exception as ex:  # never break protocol
            print('err', repr(ex), file=sys.stderr)
            out = {'commands': [], 'note': 'error'}
        sys.stdout.write(json.dumps(out) + '\n')
        sys.stdout.flush()


if __name__ == '__main__':
    main()
