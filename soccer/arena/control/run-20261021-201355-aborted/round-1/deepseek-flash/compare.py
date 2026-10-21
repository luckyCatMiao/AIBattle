import json, subprocess, sys
sys.path.insert(0, '/workspace')
import physics

DIRS = ['N','U','D','L','R','UL','UR','DL','DR']

def inp(f, i, t):
    return {
        'dir': DIRS[(f * 3 + i * 2 + t) % 9],
        'aim': None if ((f + i) % 3 == 0) else ((f * 37 + i * 61 + t * 113) % 360),
        'kick': ((f + i) % 11 == 0),
    }

js = json.loads(subprocess.check_output(['node', '/workspace/dump_state.js']))

w = physics.World()
bad = 0
for f in range(80):
    held = {t: [inp(f, i, t) for i in range(3)] for t in (0, 1)}
    w.step(held)
    j = js[f]
    if w.score != j['score'] or w.freeze != j['freeze'] or w.status != j['status']:
        print('META MISMATCH', f, w.score, j['score'], w.freeze, j['freeze'], w.status, j['status'])
        bad += 1
        break
    for i, u in enumerate(w.units):
        ju = j['units'][i]
        dx = abs(u.x - ju['x']); dy = abs(u.y - ju['y'])
        dfx = abs(u.facing[0] - ju['fx']); dfy = abs(u.facing[1] - ju['fy'])
        if dx > 1e-9 or dy > 1e-9 or dfx > 1e-9 or dfy > 1e-9:
            print('UNIT MISMATCH frame', f, u.id, (u.x, u.y, u.facing), (ju['x'], ju['y'], ju['fx'], ju['fy']))
            bad += 1
            break
        if u.kick_cd != ju['cd'] or u.control_lock != ju['cl'] or u.steal_lock != ju['sl'] or u.kicks != ju['kicks'] or u.touches != ju['touches']:
            print('UNIT STATE MISMATCH frame', f, u.id, (u.kick_cd, u.control_lock, u.steal_lock, u.kicks, u.touches),
                  (ju['cd'], ju['cl'], ju['sl'], ju['kicks'], ju['touches']))
            bad += 1
            break
    b, jb = w.ball, j['ball']
    if abs(b.x-jb['x'])>1e-9 or abs(b.y-jb['y'])>1e-9 or abs(b.vx-jb['vx'])>1e-9 or abs(b.vy-jb['vy'])>1e-9 or b.owner != jb['owner']:
        print('BALL MISMATCH frame', f, (b.x,b.y,b.vx,b.vy,b.owner), jb)
        bad += 1
        break
    if bad:
        break
print('frames checked:', 80, 'mismatches:', bad)
