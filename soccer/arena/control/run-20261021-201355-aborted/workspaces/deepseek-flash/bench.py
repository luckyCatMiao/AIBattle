import sys
sys.path.insert(0, '/workspace')
import policy, soccer_test as T

def show(name, s, g, st):
    print('%-38s %s-%s  goals=%s' % (name, s[0], s[1], [round(t,1) for t,_ in g]))

# agent as team0 vs SimpleBot
for side in (0, 1):
    a = policy.Agent(); b = T.SimpleBot()
    if side == 0:
        s, g, st = T.run_match(a, b)
        show('Agent0 vs SimpleBot', s, g, st)
    else:
        s, g, st = T.run_match(b, a)
        show('SimpleBot vs Agent1', s, g, st)

for side in (0, 1):
    a = policy.Agent(); b = T.MotionBot()
    if side == 0:
        s, g, st = T.run_match(a, b)
        show('Agent0 vs MotionBot', s, g, st)
    else:
        s, g, st = T.run_match(b, a)
        show('MotionBot vs Agent1', s, g, st)

# self play
for k in range(2):
    a = policy.Agent(); b = policy.Agent()
    s, g, st = T.run_match(a, b)
    show('Agent0 vs Agent1 (self)', s, g, st)
for k in range(2):
    a = policy.Agent(); b = policy.Agent()
    s, g, st = T.run_match(b, a)
    show('Agent1 vs Agent0 (self)', s, g, st)
