import json, sys, os, importlib.util
WS = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
spec = importlib.util.spec_from_file_location("ag", os.path.join(WS, 'agent.py'))
ag = importlib.util.module_from_spec(spec); spec.loader.exec_module(ag)
cat = json.load(open(os.path.join(WS, 'example.json'), encoding='utf-8'))['catalog']

def mkobs(frame, myx, opx, mystate='stand', opstate='stand', opmove=None, events=None,
          mymeter=0, opmeter=0, myhp=1000, ophp=1000, mechar='vex', opchar='torv'):
    f = lambda own, ch, x, st, mv, mt, hp: {
        'id': 'f', 'owner': own, 'char': ch, 'name': ch, 'archetype': '', 'x': x, 'y': 500,
        'vx': 0, 'vy': 0, 'facing': 1 if own == 0 else -1, 'hp': hp, 'maxHp': 1000, 'meter': mt,
        'guard': 120, 'state': st, 'airborne': st in ('air', 'jump'), 'move': mv,
        'invulnerable': False, 'armored': False, 'combo': 0}
    return {'id': 'm', 'seed': 1, 'frame': frame, 'status': 'playing', 'yourPlayer': 0, 'round': 1,
            'roundLog': [], 'fighters': [f(0, mechar, myx, mystate, None, mymeter, myhp),
                                          f(1, opchar, opx, opstate, opmove, opmeter, ophp)],
            'projectiles': [], 'events': events or [], 'stage': cat['rules']['stage'],
            'rules': cat['rules'], 'catalog': cat}

a = ag.Agent()
EV = []
eid = 0
def ev(t, owner, frame, **kw):
    global eid
    eid += 1
    return dict({'id': eid, 'type': t, 'owner': owner, 'frame': frame}, **kw)

# 1) 我方 lp 被对手挡住
print('--- opponent blocks my lp ---')
print(a.decide(mkobs(0, 1116, 1220)))
EV.append(ev('block', 1, 14))
out = a.decide(mkobs(15, 1116, 1220, events=list(EV)))
print('note:', out['note'])
print(''.join((i['dir'] or 'N') + ('+' + i['btn'] if i['btn'] else '') + ' ' for i in out['inputs']))
print('crouch_blocks =', a.opp_crouch_blocks, 'my_atk_guard =', a.my_atk_guard)
