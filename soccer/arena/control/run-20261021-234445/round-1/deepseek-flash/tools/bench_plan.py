"""Find the slowest plan window in a self-play match and dump it as an observation."""
import sys, json, time
sys.path.insert(0, '/workspace')
sys.path.insert(0, '/workspace/tools')
import soccer, brain as B
from match import new_match
from soccer_meta import get_meta

META = get_meta()


def world_to_obs(w, team, seed=2):
    hz = w.rules['hz']
    return {
        'id': 'dump', 'seed': seed, 'frame': w.frame, 'status': w.status,
        'yourTeam': team, 'score': list(w.score), 'half': w.half,
        'teamSize': w.teamSize, 'golden': w.golden,
        'goldenLeft': (max(0, (w.goldenEnd - w.frame) / hz) if w.golden else None),
        'freeze': w.freeze / hz,
        'units': [{
            'id': u['id'], 'team': u['team'], 'index': u['index'],
            'x': u['x'], 'y': u['y'], 'facing': {'x': u['fx'], 'y': u['fy']},
            'hasBall': w.ball['owner'] == u['id'], 'keeper': u['index'] == 0,
            'kickCd': u['kickCd'] / hz, 'controlLock': u['controlLock'] / hz,
        } for u in w.units],
        'ball': {k: w.ball[k] for k in ('x', 'y', 'vx', 'vy', 'owner', 'lastTouch', 'lastTeam')},
        'map': {'width': w.W, 'height': w.H, 'tiles': list(w.tiles), 'goals': w.goals,
                'spawns': {str(k): v for k, v in w.spawns.items()},
                'penaltyBoxes': {str(k): v for k, v in
                                 ((int(kk), vv) for kk, vv in w.pen.items())}},
        'rules': w.rules,
        'events': w.events[-140:],
    }


def main(seed=2, n=5, frames=2800):
    w = new_match(seed, n)
    brains = [B.Brain(0), B.Brain(1)]
    worst = (0, None, None)
    cnt = 0
    while w.status == 'playing' and w.frame < frames:
        fs = []
        for team in (0, 1):
            t0 = time.time()
            fr = brains[team].plan(w)
            dt = time.time() - t0
            cnt += 1
            if dt > worst[0]:
                worst = (dt, team, world_to_obs(w, team, seed))
            fs.append(fr)
        for i in range(20):
            if w.status != 'playing':
                break
            inp = {}
            for team in (0, 1):
                for idx in range(n):
                    inp['t%du%d' % (team, idx)] = fs[team][i][idx]
            w.step(inp)
    print('worst %.3fs team %s score %s frames %d' % (worst[0], worst[1], w.score, w.frame))
    json.dump(worst[2], open('/workspace/tools/slow_obs.json', 'w'))


if __name__ == '__main__':
    main(int(sys.argv[1]) if len(sys.argv) > 1 else 2,
         int(sys.argv[2]) if len(sys.argv) > 2 else 5)
