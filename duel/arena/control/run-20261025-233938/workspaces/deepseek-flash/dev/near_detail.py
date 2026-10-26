import gzip,json,sys,math
sys.path.insert(0,'dev')
from replay import Match,HIT_R
d=json.load(gzip.open(sys.argv[1],'rt',encoding='utf-8'))
wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
m=Match(d['seed'],wins).run()
our=d['seats'].index('deepseek-flash'); opp=1-our
lo,hi=int(sys.argv[2]),int(sys.argv[3])
for fr in range(lo,hi+1):
    st=m.frames[fr]
    px,py=st['px'][our],st['py'][our]
    ox,oy=st['px'][opp],st['py'][opp]
    rows=[]
    for b in st['bullets']:
        if b[4]==our: continue
        dd=math.hypot(px-b[0],py-b[1])
        if dd<3.0:
            rows.append((dd,b[5],b[0],b[1],b[2],b[3]))
    rows.sort()
    print(fr,f'{fr*0.05:.2f}s me=({px:.2f},{py:.2f}) opp=({ox:.2f},{oy:.2f}) sep={math.hypot(px-ox,py-oy):.2f} cd={st["cd"][1]}')
    for dd,bid,bx,by,vx,vy in rows[:4]:
        print(f'   b{bid} d={dd:.3f} clear={dd-HIT_R:.3f} at ({bx:.2f},{by:.2f}) v=({vx:.1f},{vy:.1f})')
