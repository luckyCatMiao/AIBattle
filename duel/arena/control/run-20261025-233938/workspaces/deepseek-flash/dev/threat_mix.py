import gzip,json,math,sys
sys.path.insert(0,'dev')
from replay import Match
games=['r1-g1','r1-g2','r2-g1','r2-g2','r3-g1','r3-g2']
agg={0:{},1:{}}
for gid in games:
    d=json.load(gzip.open('../../'+gid+'.json.gz','rt',encoding='utf-8'))
    wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
    m=Match(d['seed'],wins).run(); our=d['seats'].index('deepseek-flash'); n=len(m.frames)
    print('---',gid)
    for i in (0,1):
        who='OUR' if i==our else 'OPP'; tgt=1-i
        buckets={'0b':0,'1-5b':0,'6-20b':0,'>20b':0}
        close=[]
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
            if best>=1.5: continue
            # count bounces at bf from fire to bf
            flips=0; pv=None
            for f2 in range(fr,bf+1):
                for b in m.frames[f2]['bullets']:
                    if b[5]==bid:
                        if pv:
                            if (b[2]>0)!=(pv[0]>0): flips+=1
                            if (b[3]>0)!=(pv[1]>0): flips+=1
                        pv=(b[2],b[3]); break
            age=bf-fr
            key='0b' if flips==0 else ('1-5b' if flips<=5 else ('6-20b' if flips<=20 else '>20b'))
            buckets[key]+=1
            close.append((best,bid,fr,bf,age,flips))
        print(f'  {who} bullets ever <1.5: {len(close)} mix={buckets}')
        close.sort()
        print('   closest:',[(round(c[0],2),'b%d'%c[1],'age%d'%c[4],'%db'%c[5]) for c in close[:4]])
