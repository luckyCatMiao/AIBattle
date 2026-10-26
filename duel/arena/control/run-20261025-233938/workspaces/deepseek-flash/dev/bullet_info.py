import gzip,json,sys,math
sys.path.insert(0,'dev')
from replay import Match,HIT_R
specs=[('r1-g1',176,2193),('r1-g1',97,2354),('r1-g1',126,1568),('r1-g2',89,1280),('r1-g2',96,2178),('r1-g2',110,1525),
       ('r2-g1',90,1144),('r2-g1',29,1446),('r2-g1',168,2097),('r2-g2',85,2080),('r2-g2',106,1672),
       ('r3-g1',148,1867),('r3-g1',68,1997),('r3-g1',93,2231),('r3-g2',160,2005),('r3-g2',7,2336),('r3-g2',137,2356),('r3-g2',25,2173)]
root='../../'
for gid,bid,ev in specs:
    d=json.load(gzip.open(root+gid+'.json.gz','rt',encoding='utf-8'))
    wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
    m=Match(d['seed'],wins).run()
    fire=None
    for (fr,o,px,py,ux,uy,b2) in m.fires:
        if b2==bid: fire=(fr,o,px,py,ux,uy); break
    if fire is None:
        print(gid,'b%d'%bid,'no fire'); continue
    fr,o,px,py,ux,uy=fire
    flips=0; pv=None; found=False; bx=by=None
    for f2 in range(fr,min(ev+1,len(m.frames))):
        for b in m.frames[f2]['bullets']:
            if b[5]==bid:
                if pv:
                    if (b[2]>0)!=(pv[0]>0): flips+=1
                    if (b[3]>0)!=(pv[1]>0): flips+=1
                pv=(b[2],b[3]); bx,by,bvx,bvy=b[0],b[1],b[2],b[3]; found=True
                break
    if not found:
        # death frame: use final
        f=d['final']
        for b in f['bullets']:
            if b['id']=='b%d'%bid:
                bx,by,bvx,bvy=b['x'],b['y'],b['vx'],b['vy']; found=True
                if pv:
                    if (bvx>0)!=(pv[0]>0): flips+=1
                    if (bvy>0)!=(pv[1]>0): flips+=1
                break
    print(f'{gid} b{bid} owner=P{o} fire_frame={fr} t={fr*0.05:.2f} pos=({px:.2f},{py:.2f}) dir=({ux:.2f},{uy:.2f}) event_frame={ev} age={ev-fr} bounces_at_event={flips} pos_at_event=({bx:.2f},{by:.2f}) v=({bvx:.2f},{bvy:.2f})')
