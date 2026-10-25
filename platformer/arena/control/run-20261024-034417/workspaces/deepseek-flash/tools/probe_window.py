#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""检查指定回放窗口：全速(move=1)+跳/不跳 是否存在 40 帧存活线路，以及每条线路的末端 x。"""
import gzip, json, sys, os
sys.stdout.reconfigure(encoding='utf-8')
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, BASE)
import agent as A

RUN = os.path.dirname(os.path.dirname(BASE))


def load(fn):
    return json.loads(gzip.decompress(open(os.path.join(RUN, fn), 'rb').read()).decode('utf-8'))


def run(fn, player, frame_idx, horizon=40, beam=2000):
    d = load(fn)
    obs = json.loads(json.dumps(d['frames'][frame_idx]))
    obs['yourPlayer'] = player
    obs['level'] = d['levels'][str(obs['round'])]
    ctx = A.reset_ctx(obs)
    geom = ctx['geom']
    t0 = obs['time']
    fds, mask = A.build_frame_data(ctx, obs, t0, horizon + 10)
    r = obs['runners'][player]
    init = (r['x'], r['y'], r['vx'], r['vy'], r['onGround'])
    print('=== %s frame %d t=%.2f R%d player=%d x=%.2f y=%.2f vx=%.2f vy=%.2f og=%s' %
          (fn, frame_idx, t0, obs['round'], player, *init))
    states = [(init[0], init[1], init[2], init[3], init[4], ())]
    for k in range(horizon):
        fd = fds[k]
        nxt = []
        for (x, y, vx, vy, og, acts) in states:
            opts = (0, 1) if og else (0,)
            for jump in opts:
                rr = A.step_player(x, y, vx, vy, og, 1.0, jump, geom, fd['prects'], fd['gone'])
                if rr is None:
                    continue
                if A.hazard_hit(rr[0], rr[1], geom, fd, mask):
                    continue
                nxt.append((rr[0], rr[1], rr[2], rr[3], rr[4], acts + (jump,)))
        # dedup keeping farthest
        best = {}
        for s in nxt:
            key = A._key(s[0], s[1], s[2], s[3], s[4])
            if key not in best or s[0] > best[key][0]:
                best[key] = s
        states = list(best.values())
        if not states:
            print('全速线路在 horizon=%d 处全部死亡 (t=%.2f)' % (k + 1, t0 + 0.05 * (k + 1)))
            return
        states.sort(key=lambda s: s[0], reverse=True)
        states = states[:beam]
    print('存活 %d 帧后仍有 %d 条，最远 x=%.2f' % (horizon, len(states), max(s[0] for s in states)))
    bestst = max(states, key=lambda s: s[0])
    print('最远线路 jump 序列:', bestst[5])
    # 对比：完全不跳 / 只在着地后第一帧跳
    for label, policy in [('无跳', lambda og: 0), ('着地即跳', lambda og: 1)]:
        x, y, vx, vy, og = init
        fail = None
        for k in range(horizon):
            fd = fds[k]
            jump = policy(og)
            rr = A.step_player(x, y, vx, vy, og, 1.0, jump, geom, fd['prects'], fd['gone'])
            if rr is None:
                fail = ('FALL', k); break
            x, y, vx, vy, og = rr
            if A.hazard_hit(x, y, geom, fd, mask):
                fail = ('HAZ', k); break
        print('  %s: end x=%.2f y=%.2f fail=%s' % (label, x, y, fail))


if __name__ == '__main__':
    run(sys.argv[1], int(sys.argv[2]), int(sys.argv[3]),
        int(sys.argv[4]) if len(sys.argv) > 4 else 40)
