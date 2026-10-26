import gzip, json, sys

def load(p):
    with gzip.open(p,'rt',encoding='utf-8') as f: return json.load(f)

def units(f, fmt):
    out=[]
    for row in f['units']:
        d=dict(zip(fmt,row)); out.append(d)
    return out

p=sys.argv[1]
d=load(p)
fmt=d['unitsFormat']
print('seats',d['seats'],'teamSize',d['teamSize'],'seed',d['seed'])
for e in d['events']:
    print('EV', e)
step=int(sys.argv[2]) if len(sys.argv)>2 else 10
a=int(sys.argv[3]) if len(sys.argv)>3 else 0
b=int(sys.argv[4]) if len(sys.argv)>4 else 160
for i in range(a,b,step):
    f=d['frames'][i]; us=units(f,fmt); ball=f['ball']
    ss=' | '.join(f"{u['id']}({u['x']:.1f},{u['y']:.1f},f({u['fx']:.2f},{u['fy']:.2f}),b{u['hasBall']},cd{u['kickCd']:.2f})" for u in us)
    print(f"f{i:4d} t={f['timeLeft']:6.1f} sc={f['score']} ball({ball['x']:.1f},{ball['y']:.1f} v{ball['vx']:.1f},{ball['vy']:.1f} own={ball['owner']}) {ss}")
