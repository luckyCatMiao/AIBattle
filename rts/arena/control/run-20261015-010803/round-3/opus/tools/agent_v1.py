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
        want_workers = 4 if home_mine['ore'] > 300 else 3
        if t > 420:
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
        for w in workers:
            if w['order'].get('type') == 'hold' and live_mines:
                m = min(live_mines, key=lambda m: D(m, base))
                cmds.append({'type': 'gather', 'units': [w['id']], 'target': m['id']})
                break

        # ---------- army ----------
        mynode = min(nodes, key=lambda n: D(n, base) + (0 if abs(n['x'] - 640) > 50 else 1e4))
        enode = min(nodes, key=lambda n: D(n, eb) + (0 if abs(n['x'] - 640) > 50 else 1e4))
        north = next(n for n in nodes if abs(n['x'] - 640) <= 50)
        mp = power(army, earmy)
        ep = power(earmy, army)
        ratio = math.sqrt(mp / ep) if ep > 0 else 99.0

        # staging point next to base (base turret support), toward the centre
        cx, cy = 640, 420
        stage = {'x': base['x'] + (cx - base['x']) * .16, 'y': base['y'] + (cy - base['y']) * .16}
        rally = stage
        mp *= 1 + .2 * P['level']
        ep *= 1 + .2 * o['players'][eb['owner']]['level']
        ratio = math.sqrt(mp / ep) if ep > 0 else 99.0
        if self.mode in ('take', 'push'):
            attacking = ratio > 0.8
        else:
            attacking = ratio > 0.9 and len(army) >= 3
        if threat_near:
            goal = min(threat_near, key=lambda e: D(e, base))
            self.mode = 'defend'
        elif attacking:
            targets = [n for n in sorted(nodes, key=lambda n: D(n, base)) if n['owner'] != me]
            if (ratio > 1.5 and len(army) >= 7) or (ratio > 1.3 and len(army) >= 12) or pop >= 38 or not targets:
                goal = eb; self.mode = 'push'
            else:
                goal = targets[0]; self.mode = 'take'
        else:
            goal = stage; self.mode = 'hold'
        # cohesion: regroup on centroid when the army is strung out
        if self.mode in ('take', 'push') and len(army) >= 2:
            mx = sum(u['x'] for u in army) / len(army); my_ = sum(u['y'] for u in army) / len(army)
            spread = max(math.hypot(u['x'] - mx, u['y'] - my_) for u in army)
            if spread > 130:
                # gather on the unit closest to home side of centroid to avoid running ahead
                goal = {'x': mx + (base['x'] - mx) * .1, 'y': my_ + (base['y'] - my_) * .1}
                self.mode += '-regroup'
        if self.mode.startswith('push') and goal is eb:
            # siege spot just outside turret range (tank range 160+32 > turret 170+14)
            dx, dy = base['x'] - eb['x'], base['y'] - eb['y']; dd = math.hypot(dx, dy)
            goal = {'x': eb['x'] + dx / dd * 186, 'y': eb['y'] + dy / dd * 186}
        if t % 10 == 0:
            cmds.append({'type': 'rally', 'x': rally['x'], 'y': rally['y']})

        # focus fire: assign each combat unit to best enemy in reach
        groups = {}
        movers = []
        for u in army:
            reach = RANGE[u['type']] + 60
            cand = [e for e in en if D(u, e) <= reach + e['r']]
            if self.mode.startswith('push'):
                cand = cand + ([eb] if D(u, eb) <= RANGE[u['type']] + 40 else [])
            if cand:
                def val(e):
                    ty = e.get('type')
                    if ty == 'base':
                        return 0.4
                    mult = 1.5 if COUNTER[u['type']] == ty else 1
                    threat = DMG.get(ty, 0.0) + 2
                    inrange = 1.0 if D(u, e) <= RANGE[u['type']] + e['r'] else 0.6
                    return mult * threat / max(e['hp'], 20) * inrange * 100
                e = max(cand, key=val)
                groups.setdefault(e['id'], []).append(u['id'])
            else:
                movers.append(u)

        att = sorted(groups.items(), key=lambda kv: -len(kv[1]))
        budget = 10 - len(cmds)
        for eid, ids in att:
            if budget <= 1:
                break
            # avoid resending identical attack orders
            need = [i for i in ids if not any(u['id'] == i and u['order'].get('type') == 'attack' and u['order'].get('target') == eid for u in army)]
            if need:
                cmds.append({'type': 'attack', 'units': need, 'target': eid})
                budget -= 1
        if movers and budget >= 1:
            # stragglers: wait at rally unless group already moving / defending
            ids = []
            for u in movers:
                o_ = u['order']
                if o_.get('type') in ('move', 'attackMove') and math.hypot(o_.get('x', 0) - goal['x'], o_.get('y', 0) - goal['y']) < 40:
                    continue
                if o_.get('type') == 'hold' and D(u, goal) < 50:
                    continue
                ids.append(u['id'])
            if ids:
                cmds.append({'type': 'attackMove', 'units': ids, 'x': goal['x'], 'y': goal['y']})
        return {'commands': cmds[:10], 'note': f'{self.mode} r={ratio:.2f}'}

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
