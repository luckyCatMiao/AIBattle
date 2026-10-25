import json,sys,math
d=json.load(open(sys.argv[1]))
print("seed",d['seed'],"n",d['n'],"score",d['result'],"reason",d['reason'],"frames",len(d['frames']))
ev=[(fr['f'],e) for fr in d['frames'] for e in fr['events'] if e['type'] in ('goal','foul','kick','save','tackle')]
for f,e in ev: print(f,e)
# frames leading to goals: print ball state 30 frames before each goal
goalf=[f for f,e in ev if e['type']=='goal']
for gf in goalf:
    print("=== goal at",gf)
    for fr in d['frames']:
        if gf-40<=fr['f']<=gf+1 and fr['f']%5==0:
            b=fr['ball']
            print(f" f={fr['f']} ball=({b['x']:.1f},{b['y']:.1f}) v=({b['vx']:.1f},{b['vy']:.1f}) owner={b['owner']}")
