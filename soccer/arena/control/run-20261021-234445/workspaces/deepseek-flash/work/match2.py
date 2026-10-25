import sys, math, argparse
sys.path.insert(0,'/workspace'); sys.path.insert(0,'/workspace/work'); sys.path.insert(0,'/workspace/tools')
import soccer
import brain as brainmod
from wingbot import WingBot
from soccer_meta import get_meta
META=get_meta(); RULES=META['rules']; W,H=META['W'],META['H']

class Idle:
    def __init__(self,team): self.team=team
    def plan(self,w):
        n=w.teamSize
        return [[{'dir':'N','aim':None,'kick':False} for _ in range(n)] for _ in range(20)]

class Sniper:
    """shoot-on-sight, from any range, at corner away from keeper"""
    def __init__(self,team): self.team=team; self.s=1 if team==0 else -1
    def plan(self,w):
        n=w.teamSize; sim=w.clone(); frames=[]
        for f in range(20):
            mine={}
            for u in sim.units:
                if u['team']!=self.team: continue
                b=sim.ball
                gx=(W-1.0) if self.s>0 else 1.0
                if b['owner']==u['id']:
                    ky=None
                    for o in sim.units:
                        if o['team']!=self.team and o['index']==0: ky=o['y']
                    ty=15.2 if (ky is not None and ky>13) else 10.8
                    a=math.degrees(math.atan2(ty-u['y'],gx-u['x']))
                    mine[u['id']]={'dir':'N','aim':a,'kick':True}
                elif u['index']==0 and n>1:
                    kx=(1.0 if self.s>0 else W-1.0)+self.s*2.6
                    ty=max(6.6,min(19.4,13.0+(b['y']-13.0)*0.5))
                    a=math.degrees(math.atan2(ty-u['y'],kx-u['x']))
                    mine[u['id']]={'dir':brainmod.oct_name(a),'aim':None,'kick':False}
                else:
                    a=math.degrees(math.atan2(b['y']-u['y'],b['x']-u['x']))
                    mine[u['id']]={'dir':brainmod.oct_name(a),'aim':None,'kick':False}
            # model opponent: also chase ball (mirror)
            inputs={}
            for u in sim.units:
                if u['team']==self.team: inputs[u['id']]=mine[u['id']]
                else:
                    a=math.degrees(math.atan2(sim.ball['y']-u['y'],sim.ball['x']-u['x']))
                    inputs[u['id']]={'dir':brainmod.oct_name(a),'aim':None,'kick':False}
            sim.step(inputs)
            frames.append([mine['t%du%d'%(self.team,i)] for i in range(n)])
        return frames

class Chase:
    def __init__(self,team,shoot_range=16.0): self.team=team; self.s=1 if team==0 else -1; self.sr=shoot_range
    def plan(self,w):
        n=w.teamSize; sim=w.clone(); frames=[]
        gx=(W-1.0) if self.s>0 else 1.0
        for f in range(20):
            mine={}
            for u in sim.units:
                if u['team']!=self.team: continue
                b=sim.ball
                if b['owner']==u['id']:
                    if math.hypot(u['x']-gx,u['y']-13.0)<self.sr:
                        a=math.degrees(math.atan2(13.0-u['y'],gx-u['x']))
                        mine[u['id']]={'dir':'N','aim':a,'kick':True}
                    else:
                        a=math.degrees(math.atan2(13.0-u['y'],gx-u['x']))
                        mine[u['id']]={'dir':brainmod.oct_name(a),'aim':a,'kick':False}
                elif u['index']==0 and n>1:
                    kx=(1.0 if self.s>0 else W-1.0)+self.s*2.6
                    ty=max(6.6,min(19.4,13.0+(b['y']-13.0)*0.4))
                    a=math.degrees(math.atan2(ty-u['y'],kx-u['x']))
                    mine[u['id']]={'dir':brainmod.oct_name(a),'aim':None,'kick':False}
                else:
                    a=math.degrees(math.atan2(b['y']-u['y'],b['x']-u['x']))
                    mine[u['id']]={'dir':brainmod.oct_name(a),'aim':None,'kick':False}
            inputs={}
            for u in sim.units:
                if u['team']==self.team: inputs[u['id']]=mine[u['id']]
                else:
                    b=sim.ball
                    a=math.degrees(math.atan2(b['y']-u['y'],b['x']-u['x']))
                    inputs[u['id']]={'dir':brainmod.oct_name(a),'aim':None,'kick':False}
            sim.step(inputs)
            frames.append([mine['t%du%d'%(self.team,i)] for i in range(n)])
        return frames

def new_match(seed,n):
    w=soccer.World(W,H,META['tiles'],RULES,META['penaltyBoxes'],META['goals'],n)
    w.spawns={int(k):v for k,v in META['spawns_by_n'][str(n)].items()}
    w.kickoffTeam=abs(seed)%2
    for team in (0,1):
        for i in range(n):
            u=w.add_unit(team,i,f't{team}u{i}')
            sx,sy=w.spawns[team][i]
            u['x']=sx+0.5; u['y']=sy+0.5; u['fx']=1.0 if team==0 else -1.0
    w.ball={'x':W/2.0,'y':H/2.0,'vx':0.0,'vy':0.0,'owner':None,'lastTouch':None,'lastTeam':None}
    w.freeze=0; w.frame=0; w.status='playing'
    return w

def run(me,opp,seed,n):
    w=new_match(seed,n)
    while w.status=='playing' and w.frame<3000:
        f0=me.plan(w); f1=opp.plan(w)
        for i in range(20):
            if w.status!='playing': break
            inp={}
            for team,frames in ((0,f0),(1,f1)):
                fr=frames[i]
                for idx in range(n):
                    inp['t%du%d'%(team,idx)]=fr[idx]
            w.step(inp)
    return w

def summarize(w,team):
    ev=w.events
    gf=sum(1 for e in ev if e['type']=='goal' and e.get('team')==team)
    ga=sum(1 for e in ev if e['type']=='goal' and e.get('team')!=team)
    saves=sum(1 for e in ev if e['type']=='save' and e.get('team')==team)
    fouls=sum(1 for e in ev if e['type']=='foul' and e.get('team')==team)
    kicks=sum(1 for e in ev if e['type']=='kick' and e.get('team')==team)
    return gf,ga,saves,fouls,kicks

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--me',default='wing'); ap.add_argument('--opp',default='brain')
    ap.add_argument('--n',type=int,default=0); ap.add_argument('--seeds',type=int,default=3)
    ap.add_argument('--wing_y',type=float,default=4.8); ap.add_argument('--rng',type=float,default=13.0)
    a=ap.parse_args()
    def make(kind,team):
        if kind=='wing': return WingBot(team,wing_y=a.wing_y,shoot_rng=a.rng)
        if kind=='brain': return brainmod.Brain(team)
        if kind=='sniper': return Sniper(team)
        if kind=='chase': return Chase(team)
        if kind=='idle': return Idle(team)
        raise SystemExit(kind)
    import time
    tot=[0,0,0,0,0]; games=0
    t0=time.time()
    for seed in range(1,a.seeds+1):
        if a.n: n=a.n
        else:
            x=((seed ^ 0x9e3779b9)&0xFFFFFFFF); x^=(x<<13)&0xFFFFFFFF; x&=0xFFFFFFFF
            x^=x>>17; x&=0xFFFFFFFF; x^=(x<<5)&0xFFFFFFFF; x&=0xFFFFFFFF
            n=1+(x%6)
        for seat in (0,1):
            me=make(a.me,seat); op=make(a.opp,1-seat)
            w=run(me if seat==0 else op, op if seat==0 else me, seed, n)
            gf,ga,saves,fouls,kicks=summarize(w,seat)
            print(f'seed{seed} n={n} me={a.me} team={seat} {gf}:{ga} saves {saves} fouls {fouls} kicks {kicks} final {w.score}')
            tot[0]+=gf; tot[1]+=ga; tot[2]+=saves; tot[3]+=fouls; tot[4]+=kicks; games+=1
    print(f'GAMES {games} GF {tot[0]} GA {tot[1]} saves {tot[2]} fouls {tot[3]} kicks {tot[4]} time {time.time()-t0:.1f}s')
