import gzip,json,math,os,sys
sys.path.insert(0,'dev')
from replay import Match
root='../../'
games=['r1-g1','r1-g2','r2-g1','r2-g2','r3-g1','r3-g2']
def pct(v,p):
    s=sorted(v); return s[min(len(s)-1,max(0,int(round(p/100*(len(s)-1)))))]
tot={}
for gid in games:
    d=json.load(gzip.open(root+gid+'.json.gz','rt',encoding='utf-8'))
    wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
    m=Match(d['seed'],wins).run()
    our=d['seats'].index('deepseek-flash')
    n=len(m.frames)
    print(f'--- {gid} our=P{our}')
    for i in (0,1):
        who='OUR' if i==our else 'OPP'
        tgt=1-i
        for hz,name in ((15,'0.75s'),(10**9,'life')):
            vals=[]; zero=0; ids=[]
            for (fr,o,x,y,ux,uy,bid) in m.fires:
                if o!=i: continue
                best=1e9; bf=None
                for f2 in range(fr,min(n,fr+hz)):
                    st=m.frames[f2]; px,py=st['px'][tgt],st['py'][tgt]
                    for b in st['bullets']:
                        if b[5]==bid:
                            dd=math.hypot(px-b[0],py-b[1])
                            if dd<best: best,bf=dd,f2
                            break
                vals.append(best); ids.append((best,bid,fr,bf))
            vals.sort()
            print(f'  {who} {name}: n={len(vals)} median={pct(vals,50):.2f} p10={pct(vals,10):.2f} min={vals[0]:.3f} <1.5={sum(1 for v in vals if v<1.5)} <1.0={sum(1 for v in vals if v<1.0)}')
            k='%s_%s'%(who,name)
            # aggregate of min only for life
        # bounce classification of best life approach per game
        rows=[]
        for (fr,o,x,y,ux,uy,bid) in m.fires:
            if o!=i: continue
            best=1e9; bf=None
            for f2 in range(fr,n):
                st=m.frames[f2]; px,py=st['px'][tgt],st['py'][tgt]
                for b in st['bullets']:
                    if b[5]==bid:
                        dd=math.hypot(px-b[0],py-b[1])
                        if dd<best: best,bf=dd,f2
                        break
            rows.append((best,bid,fr,bf))
        rows.sort()
        print(f'  {who} best 3 life:',[(round(r[0],3),'b%d'%r[1],'f%d'%r[2],'hit@%d'%r[3]) for r in rows[:3]])
