import sys, math, argparse, time
sys.path.insert(0,'/workspace'); sys.path.insert(0,'/workspace/work'); sys.path.insert(0,'/workspace/tools')
import soccer
import brain as brainmod
from match2 import Sniper, Chase, Idle, new_match
from planner import Brain2

def make(kind,team):
    if kind in ('v2','self'): return Brain2(team)
    if kind=='brain': return brainmod.Brain(team)
    if kind=='sniper': return Sniper(team)
    if kind=='chase': return Chase(team)
    if kind=='idle': return Idle(team)
    raise SystemExit(kind)

def run(me,opp,seed,n,log=None):
    w=new_match(seed,n)
    stats={'poss':[0,0],'kicks':[0,0],'goals':[0,0],'saves':[0,0],'fouls':[0,0],
           'att_poss':[0,0],'mid_poss':[0,0],'shotkick':[0,0],'kickpos':[[],[]],
           'owner_idx':{0:{},1:{}}}
    while w.status=='playing' and w.frame<3000:
        fr_by_team={me.team: me.plan(w), opp.team: opp.plan(w)}
        for i in range(20):
            if w.status!='playing': break
            inp={}
            for team,frames in fr_by_team.items():
                fr=frames[i]
                for idx in range(n):
                    inp['t%du%d'%(team,idx)]=fr[idx]
            w.step(inp)
            b=w.ball
            if b['owner']:
                t=int(b['owner'][1]); idx=int(b['owner'].split('u')[1])
                stats['poss'][t]+=1
                stats['owner_idx'][t][idx]=stats['owner_idx'][t].get(idx,0)+1
                s=1 if t==0 else -1
                if (b['x']-22)*s>0: stats['att_poss'][t]+=1
                elif abs(b['x']-22)<7: stats['mid_poss'][t]+=1
            for e in w.events:
                pass
            w.events=w.events  # keep
        # cleanup events after each window while counting new ones
        # (count at end instead)
    for e in w.events:
        if e['type']=='goal': stats['goals'][e['team']]+=1
        elif e['type']=='save': stats['saves'][e['team']]+=1
        elif e['type']=='foul': stats['fouls'][e['team']]+=1
        elif e['type']=='kick':
            t=e['team']; stats['kicks'][t]+=1
            s=1 if t==0 else -1; gx=43 if s>0 else 1
            dx,dy=gx-e['x'],13-e['y']; dl=math.hypot(dx,dy) or 1
            sp=math.hypot(e['vx'],e['vy']) or 1
            cos=(e['vx']*dx+e['vy']*dy)/(dl*sp)
            stats['kickpos'][t].append((e['frame'],round(e['x'],1),round(e['y'],1),round(dl,1),round(cos,2)))
            if cos>0.93 and (e['x']-22)*s>0: stats['shotkick'][t]+=1
    return w,stats

def tsize(seed):
    x=((seed ^ 0x9e3779b9)&0xFFFFFFFF); x^=(x<<13)&0xFFFFFFFF; x&=0xFFFFFFFF
    x^=x>>17; x&=0xFFFFFFFF; x^=(x<<5)&0xFFFFFFFF; x&=0xFFFFFFFF
    return 1+(x%6)

if __name__=='__main__':
    ap=argparse.ArgumentParser()
    ap.add_argument('--opp',default='self'); ap.add_argument('--n',type=int,default=3)
    ap.add_argument('--seeds',type=int,default=1); ap.add_argument('--seat',type=int,default=-1)
    ap.add_argument('--detail',type=int,default=0)
    a=ap.parse_args()
    for seed in range(1,a.seeds+1):
        n=a.n or tsize(seed)
        seats=(0,1) if a.seat<0 else (a.seat,)
        for seat in seats:
            me=make('v2',seat); op=make(a.opp,1-seat)
            t0=time.time(); w,st=run(me,op,seed,n)
            gf,ga=w.score[seat],w.score[1-seat]
            # reattribute stats from my perspective
            my=seat
            print(f'seed{seed} n={n} seat={seat} score {gf}:{ga} | poss {st["poss"]} att_poss {st["att_poss"]} mid {st["mid_poss"]} | kicks {st["kicks"]} shotkicks {st["shotkick"]} saves {st["saves"]} fouls {st["fouls"]} | t={time.time()-t0:.1f}s')
            print('  owner_idx', st['owner_idx'])
            if a.detail:
                for t in (0,1):
                    print(f'  team{t} kicks:', st['kickpos'][t][:40])
