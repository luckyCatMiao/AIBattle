"""Run a match and dump context around each goal."""
import sys
sys.path.insert(0, '/workspace')
import physics, policy, soccer_test as T

def fmt_units(w):
    return ' '.join('%s(%.1f,%.1f)%s' % (u.id, u.x, u.y, '*' if w.ball.owner == u.id else '')
                    for u in w.units)

def run(pa, pb, label):
    w = physics.World()
    buf = []
    prev = [0, 0]
    prev_owner = None
    events = []
    for win in range(140):
        if w.status != 'playing':
            break
        oa = T.make_obs(w, 0); ob = T.make_obs(w, 1)
        wa = pa.plan(oa); wb = pb.plan(ob)
        for i in range(20):
            if w.status != 'playing':
                break
            w.step({0: wa['inputs'][i], 1: wb['inputs'][i]})
            buf.append((w.frame, w.ball.x, w.ball.y, w.ball.owner, w.score[:],
                        [(u.id, u.x, u.y) for u in w.units]))
            if len(buf) > 65:
                buf.pop(0)
            if w.score != prev:
                print('\n=== GOAL', w.score, 'at t=%.1f' % (w.frame / 20.0), 'in', label)
                # print 2s context every 5 frames
                for slot in buf[::5]:
                    print(' f%4d ball(%.1f,%.1f) owner=%-5s score=%s' % slot[:5])
                    print('        ', ' '.join('%s(%.1f,%.1f)' % u for u in slot[5]))
                prev = w.score[:]
        if w.status != 'playing':
            break
    print('\nFINAL', label, w.score, 'status', w.status, 'reason', w.reason)

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'self'
    if which == 'self':
        run(policy.Agent(), policy.Agent(), 'self')
    elif which == 'motion':
        run(policy.Agent(), T.MotionBot(), 'agent0-vs-motion1')
    elif which == 'motion2':
        run(T.MotionBot(), policy.Agent(), 'motion0-vs-agent1')
    elif which == 'simple':
        run(T.SimpleBot(), policy.Agent(), 'simple0-vs-agent1')
