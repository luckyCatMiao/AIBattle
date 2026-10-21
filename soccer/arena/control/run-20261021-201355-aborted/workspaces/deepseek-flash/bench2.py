"""Deterministic benchmark across bots and parameter sets."""
import sys, itertools
sys.path.insert(0, '/workspace')
import policy, soccer_test as T

def opponents():
    return [
        ('Simple', T.SimpleBot()),
        ('Motion', T.MotionBot()),
        ('Park',   T.ParkBot()),
        ('Kick',   T.KickBot()),
    ]

def run_one(agent_params, opp, agent_seat):
    a = policy.Agent(agent_params)
    if agent_seat == 0:
        s, g, st = T.run_match(a, opp)
    else:
        s, g, st = T.run_match(opp, a)
    ours, theirs = (s[0], s[1]) if agent_seat == 0 else (s[1], s[0])
    return ours, theirs, g

def bench(agent_params, label, include_self=True):
    rows = []
    for name, opp in opponents():
        for seat in (0, 1):
            ours, theirs, g = run_one(agent_params, opp, seat)
            rows.append(('%s/%d' % (name, seat), ours, theirs))
    if include_self:
        a, b = policy.Agent(agent_params), policy.Agent(agent_params)
        s, g, st = T.run_match(a, b)
        rows.append(('self', s[0], s[1]))
    print('== %s ==' % label)
    tw = tl = td = 0
    for name, o, t in rows:
        tag = 'W' if o > t else ('L' if o < t else 'D')
        tw += o > t; tl += o < t; td += o == t
        print('  %-9s %s %2d-%2d' % (name, tag, o, t))
    print('  record %dW %dD %dL  goals %d:%d' % (tw, td, tl,
          sum(r[1] for r in rows), sum(r[2] for r in rows)))
    return rows

if __name__ == '__main__':
    for reaction, speed in [(0.0, 1.0), (5.0, 0.9), (7.0, 0.9), (5.0, 0.75), (9.0, 0.8)]:
        bench(dict(lane_reaction=reaction, lane_speed=speed),
              'reaction=%s speed=%s' % (reaction, speed))
