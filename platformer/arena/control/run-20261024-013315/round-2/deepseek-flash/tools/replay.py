import sys, os, json
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import agent


GEN = None
def make_fd(rec):
    prects = [{'x': p['x'], 'y': p['y'], 'w': p['w'], 'h': p['h'], 'top': p['y'] + p['h'], 'dx': p['dx']}
              for p in rec['platforms']]
    plants2 = [(p['x'], p['y'], agent.plant_height(p, rec['timeExact'])) for p in GEN['plants']]
    saws = [(s['x'], s['y']) for s in rec['saws']]
    mons = [(m['x'], m['y']) for m in rec['monsters']]
    gone = set(int(g['y']) * L0['width'] + int(g['x']) for g in rec['gone'])
    return {'prects': prects, 'plants': plants2, 'saws': saws, 'monsters': mons}, gone


def main():
    data = json.load(open(sys.argv[1]))
    L = data['level']
    global GEN, L0
    L0 = L
    GEN = agent.generate_level(data['seed'] * 131 + 977)
    assert GEN['w'] == L['width'] and GEN['tiles'] == L['tiles'], 'gen mismatch'
    geom = (L['width'], L['height'], L['tiles'])
    s = data['start']
    x, y, vx, vy = s['x'], s['y'], s['vx'], s['vy']
    og = s['onGround']
    bad = 0
    prev_deaths = 0
    for i, rec in enumerate(data['frames']):
        fd, gone = make_fd(rec)
        # 植物高度公式校验
        for p, pl in zip(rec['plants'], fd['plants']):
            if abs(p['height'] - pl[2]) > 0.02:
                print(f'frame {i}: plant height formula mismatch obs={p["height"]} calc={pl[2]:.3f}')
                bad += 1
                break
        mv = rec['inp']['move']; jp = rec['inp']['jump']
        r = agent.step_player(x, y, vx, vy, og, mv, jp, geom, fd['prects'], gone)
        rr = rec['runner']
        died = r is None
        if not died:
            nx, ny, nvx, nvy, nog = r
            if agent.hazard_hit(nx, ny, geom, fd):
                died = True
        js_died = rr['deaths'] > prev_deaths
        if died != js_died:
            print(f'frame {i}: death mismatch py={died} js={js_died} pos=({x:.2f},{y:.2f}) jsrunner={rr}')
            bad += 1
            if bad > 10:
                break
        if died:
            # 判断是坑还是危险物（都在同一帧复活）
            x, y, vx, vy, og = L['startX'], L['height'] - 13, 0.0, 0.0, True
            prev_deaths = rr['deaths']
            continue
        errs = [abs(nx - rr['x']), abs(ny - rr['y']), abs(nvx - rr['vx']), abs(nvy - rr['vy'])]
        if max(errs) > 0.03 or nog != rr['onGround']:
            print(f'frame {i}: MISMATCH py=({nx:.3f},{ny:.3f},{nvx:.3f},{nvy:.3f},{nog}) js={rr} errs={errs}')
            bad += 1
            if bad > 10:
                break
        x, y, vx, vy, og = nx, ny, nvx, nvy, nog
        prev_deaths = rr['deaths']
    print('frames', len(data['frames']), 'bad', bad)


main()
