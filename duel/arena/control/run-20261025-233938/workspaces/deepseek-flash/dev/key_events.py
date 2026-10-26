import gzip,json,sys,math
sys.path.insert(0,'dev')
from replay import Match,HIT_R

def bounces(path):
    n=0; last=None
    for i in range(1,len(path)):
        x0,y0=path[i-1]; x1,y1=path[i]
        dx,dy=x1-x0,y1-y0
        if last:
            if abs(dx)>1e-9 and abs(last[0])>1e-9 and (dx>0)!=(last[0]>0): n+=1
            if abs(dy)>1e-9 and abs(last[1])>1e-9 and (dy>0)!=(last[1]>0): n+=1
        last=(dx,dy)
    return n

def load(p):
    d=json.load(gzip.open(p,'rt',encoding='utf-8'))
    wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
    m=Match(d['seed'],wins).run()
    return d,m

for p in sys.argv[1:]:
    d,m=load(p)
    our=d['seats'].index('deepseek-flash')
    opp=1-our
    print('='*100)
    print(d['id'],'seats',d['seats'],'our=P%d'%our,'death',m.death_frame,m.death_victim,m.death_owner)
    n=len(m.frames)
    # minimum clearance events for both
    for i in (0,1):
        who='OUR' if i==our else 'OPP'
        arr=[]
        for fr,st in enumerate(m.frames):
            px,py=st['px'][i],st['py'][i]
            for b in st['bullets']:
                if b[4]==i: continue
                dd=math.hypot(px-b[0],py-b[1])
                if dd<=0.75: arr.append((dd,fr,b[5],b[4]))
        arr.sort()
        seen=set(); out=[]
        for dd,fr,bid,own in arr:
            key=(bid,max(0,fr//25))
            if key in seen: continue
            seen.add(key)
            out.append((dd,fr,bid,own))
            if len(out)>=4: break
        for dd,fr,bid,own in out:
            path=m.bullet_paths.get(bid,[])
            firefr=None
            for (f2,o,px,py,ux,uy,b2) in m.fires:
                if b2==bid: firefr=f2; break
            print(f'  {who} near bullet b{bid} own={own} d={dd:.3f} clear={dd-HIT_R:.3f} frame={fr} t={fr*0.05:.2f}s fire_frame={firefr} age={fr-(firefr or 0)} bounces={bounces(path)}')
    # closest separation frames
    sep=[(math.hypot(st['px'][0]-st['px'][1],st['py'][0]-st['py'][1]),fr) for fr,st in enumerate(m.frames)]
    sep.sort()
    print('  min sep:',[(round(s,3),fr,round(fr*0.05,2),m.frames[fr]['cd'][0],m.frames[fr]['cd'][1]) for s,fr in sep[:5]])
    # shot quality with ids
    for i in (0,1):
        who='OUR' if i==our else 'OPP'
        rows=[]
        for (fr,o,x,y,ux,uy,bid) in m.fires:
            if o!=i: continue
            tgt=1-i
            best=1e9; bf=None
            for f2 in range(fr,min(n,fr+30)):
                st=m.frames[f2]
                px,py=st['px'][tgt],st['py'][tgt]
                for b in st['bullets']:
                    if b[5]==bid:
                        dd=math.hypot(px-b[0],py-b[1])
                        if dd<best: best,bf=dd,f2
                        break
            rows.append((best,fr,bid,bf))
        rows.sort()
        print('  %s best first-0.75s shots:'%who)
        for best,fr,bid,bf in rows[:3]:
            path=m.bullet_paths.get(bid,[])
            print(f'    b{bid} fire_frame={fr} t={fr*0.05:.2f} min_d={best:.3f} at frame {bf} age={bf-fr} bounces={bounces(path)}')
        # life
        rows=[]
        for (fr,o,x,y,ux,uy,bid) in m.fires:
            if o!=i: continue
            tgt=1-i
            best=1e9; bf=None
            for f2 in range(fr,n):
                st=m.frames[f2]
                px,py=st['px'][tgt],st['py'][tgt]
                for b in st['bullets']:
                    if b[5]==bid:
                        dd=math.hypot(px-b[0],py-b[1])
                        if dd<best: best,bf=dd,f2
                        break
            rows.append((best,fr,bid,bf))
        rows.sort()
        print('  %s best life shots:'%who)
        for best,fr,bid,bf in rows[:3]:
            path=m.bullet_paths.get(bid,[])
            print(f'    b{bid} fire_frame={fr} t={fr*0.05:.2f} min_d={best:.3f} at frame {bf} t={bf*0.05:.2f} age={bf-fr} bounces={bounces(path)}')
