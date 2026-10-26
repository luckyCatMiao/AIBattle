import gzip,json,sys,math
sys.path.insert(0,'dev')
from replay import Match,HIT_R
d=json.load(gzip.open(sys.argv[1],'rt',encoding='utf-8'))
wins=[(w['frame'],{'inputs':w['inputs'][0]},{'inputs':w['inputs'][1]}) for w in d['windows']]
m=Match(d['seed'],wins).run()
bid=int(sys.argv[2]); lo=int(sys.argv[3]); hi=int(sys.argv[4])
# fire info
for (fr,o,px,py,ux,uy,b2) in m.fires:
    if b2==bid: print('fire',fr,'owner',o,'pos',px,py,'dir',ux,uy)
prevv=None; flips=0
for fr in range(lo,hi+1):
    st=m.frames[fr]
    for b in st['bullets']:
        if b[5]==bid:
            vx,vy=b[2],b[3]
            if prevv:
                if (vx>0)!=(prevv[0]>0): flips+=1
                if (vy>0)!=(prevv[1]>0): flips+=1
            prevv=(vx,vy)
            print(fr, f'({b[0]:.3f},{b[1]:.3f})', f'v=({vx:.2f},{vy:.2f})', 'flips_sofar',flips)
            break
