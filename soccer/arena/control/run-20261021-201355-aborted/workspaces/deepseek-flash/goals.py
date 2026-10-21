"""Print compact context for every goal in a match."""
import sys, math
sys.path.insert(0, '/workspace')
import physics, policy, soccer_test as T

def side(name, team, our_team):
    tag = name
    if our_team is not None:
        tag += ' (us)' if team == our_team else ' (them)'
    return tag

def run(pa, pb, label, our_team=None):
    w = physics.World()
    prev = [0, 0]
    buf = []
    for win in range(140):
        if w.status != 'playing':
            break
        wa = pa.plan(T.make_obs(w, 0)); wb = pb.plan(T.make_obs(w, 1))
        for i in range(20):
            if w.status != 'playing':
                break
            w.step({0: wa['inputs'][i], 1: wb['inputs'][i]})
            buf.append({'f': w.frame, 'b': (w.ball.x, w.ball.y),
                        'own': w.ball.owner, 'sc': w.score[:],
                        'u': [(u.id, round(u.x,1), round(u.y,1)) for u in w.units]})
            if len(buf) > 34:
                buf.pop(0)
            if w.score != prev:
                g = w.score[:]
                scorer = 0 if g[0] > prev[0] else 1
                print('\nGOAL %s  t=%.1f  scorer=team%d  score=%s' %
                      (label, w.frame/20.0, scorer, g))
                for slot in buf[::6]:
                    print('  f%4d ball(%5.1f,%5.1f) own=%-5s %s' %
                          (slot['f'], slot['b'][0], slot['b'][1], str(slot['own']),
                           ' '.join('%s(%.1f,%.1f)' % u for u in slot['u'])))
                last = buf[-1]
                print('  at goal: ball(%.1f,%.1f) owner=%s' % (last['b'][0], last['b'][1], last['own']))
                print('           ', ' '.join('%s(%.1f,%.1f)' % u for u in last['u']))
                prev = g
    print('\nFINAL %s %s %s' % (label, w.score, w.status))

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'motion1'
    if which == 'motion1':
        run(T.MotionBot(), policy.Agent(), 'Motion0-Agent1', our_team=1)
    elif which == 'simple0':
        run(policy.Agent(), T.SimpleBot(), 'Agent0-Simple1', our_team=0)
    elif which == 'kick0':
        run(policy.Agent(), T.KickBot(), 'Agent0-Kick1', our_team=0)
    elif which == 'self':
        run(policy.Agent(), policy.Agent(), 'self-self', our_team=0)
