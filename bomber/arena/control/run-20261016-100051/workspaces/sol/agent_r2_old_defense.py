import sys,json,heapq,traceback,math

DIRS=[('U',0,-1),('D',0,1),('L',-1,0),('R',1,0)]
INF=10**9

def duration(n):
    p=1/n; k=1
    while p<1:
        p=min(1,p+1/n); k+=1
    return k

class Agent:
    attack_weight=1.5
    def __init__(self): self.pred=None
    def setup(self,o):
        self.o=o; self.W=o['map']['width']; self.H=o['map']['height']; self.S=self.W*self.H
        self.tiles=o['map']['tiles']; self.frame=o.get('frame',0); self.me=o['fighters'][o['yourPlayer']]; self.enemy=o['fighters'][1-o['yourPlayer']]
        self.rules=o['rules']; self.hz=self.rules.get('hz',20)
        self.start=self.me['y']*self.W+self.me['x']; self.ep=self.enemy['y']*self.W+self.enemy['x']
        self.n=max(self.rules.get('framesPerTileMin',3),self.rules.get('framesPerTile',6)-self.me['speed']); self.d=duration(self.n)
        self.rem=0
        if self.pred and self.pred[:3]==(o.get('round'),self.frame,self.start): self.rem=self.pred[3]
        else:
            diff=abs(self.me.get('px',self.me['x'])-self.me['x'])+abs(self.me.get('py',self.me['y'])-self.me['y'])
            if diff>.015: self.rem=max(0,self.d-round((1-diff)*self.n))
        self.neigh=[]; self.depth=[]
        for i in range(self.S):
            x=i%self.W;y=i//self.W
            self.neigh.append([(s,(y+dy)*self.W+x+dx) for s,dx,dy in DIRS if 0<=x+dx<self.W and 0<=y+dy<self.H])
            self.depth.append(min(x,y,self.W-1-x,self.H-1-y))
        self.horizon=max(80,max([b['fuse'] for b in o.get('bombs',[])]+[0])+15)
        self.horizon=min(100,self.horizon)
        last_safe=round((self.rules.get('floodStart',40)+max(self.depth)*self.rules.get('floodInterval',2.5))*self.hz)-1
        self.horizon=max(1,min(self.horizon,last_safe-self.frame))
        self.weights=[0]+[1 if t<=20 else .13 for t in range(1,self.horizon+1)]
        self.wsum=[0]
        for v in self.weights[1:]:self.wsum.append(self.wsum[-1]+v)
        self.dropmap={d['y']*self.W+d['x']:d['type'] for d in o.get('drops',[])}
        self.centers=[i for i in range(self.S) if self.depth[i]>=min(8,(self.H-1)//2) and self.tiles[i]!=1]
        if not self.centers:self.centers=[(self.H//2)*self.W+self.W//2]

    def timeline(self,extra=None,enemy_extra=None):
        H=self.horizon; W=self.W; S=self.S
        tiles=self.tiles[:]; opened=[0 if a==0 else INF for a in tiles]
        danger=[0]*S; blocks=[0]*S
        for a in self.o.get('blasts',[]):
            i=a['y']*W+a['x']; end=min(H,a['frames']-1)
            if end>0:danger[i]|=((1<<(end+1))-2)
        hz=self.hz; fs=self.rules.get('floodStart',self.o.get('flood',{}).get('startsAt',40)); fi=self.rules.get('floodInterval',2.5)
        for i,dep in enumerate(self.depth):
            death=round((fs+dep*fi)*hz)+(1 if dep==0 else 0)-self.frame
            lo=max(1,death)
            if lo<=H:danger[i]|=((1<<(H+1))-(1<<lo))
        bombs=[dict(b,p=b['y']*W+b['x'],dead=False) for b in self.o.get('bombs',[])]
        destroyed=set(); hitcells=set(); proposed_time=[None]; proposed_chained=[False]
        def boom(b,t):
            if b['dead']:return
            b['dead']=True
            cells=[b['p']]; x=b['x'];y=b['y']
            for _,dx,dy in reversed(DIRS):
                for k in range(1,b['blast']+1):
                    nx=x+dx*k;ny=y+dy*k
                    if not(0<=nx<W and 0<=ny<self.H):break
                    p=ny*W+nx
                    if tiles[p]==1:break
                    cells.append(p)
                    if tiles[p]==2:
                        tiles[p]=0; opened[p]=t; destroyed.add(p);break
                    for other in bombs:
                        if not other['dead'] and other['p']==p:boom(other,t);break
            end=min(H+1,t+self.rules.get('blastFrames',12)-1)
            mask=(1<<end)-(1<<t)
            for p in cells:danger[p]|=mask
            if extra and b.get('proposed'):
                hitcells.update(cells);proposed_time[0]=t;proposed_chained[0]=not b.get('natural',False)
        for t in range(1,H+1):
            for b in bombs:
                if b['dead']:continue
                b['fuse']-=1
                if b['fuse']<=0:
                    b['natural']=True;boom(b,t)
            # Fighters act in owner order after the bomb and flame clocks.
            for owner in range(2):
                if extra and t==extra[1] and self.me['owner']==owner:
                    p=extra[0]
                    if not any(not b['dead'] and b['p']==p for b in bombs):
                        bombs.append({'owner':owner,'x':p%W,'y':p//W,'p':p,'blast':self.me['blast'],'fuse':self.rules.get('fuseFrames',40),'dead':False,'proposed':True})
                if enemy_extra and t==enemy_extra[1] and self.enemy['owner']==owner:
                    p=enemy_extra[0]
                    if not any(not b['dead'] and b['p']==p for b in bombs):
                        bombs.append({'owner':owner,'x':p%W,'y':p//W,'p':p,'blast':self.enemy['blast'],'fuse':self.rules.get('fuseFrames',40),'dead':False})
            bit=1<<t
            for b in bombs:
                if not b['dead']:blocks[b['p']]|=bit
        return danger,blocks,opened,tiles,destroyed,hitcells,proposed_time[0],proposed_chained[0]

    def distances(self,tiles,targets,softcost=6):
        ds=[INF]*self.S; q=[]
        for p,value in targets:
            if value<ds[p]:ds[p]=value;heapq.heappush(q,(value,p))
        while q:
            d,p=heapq.heappop(q)
            if d!=ds[p]:continue
            for _,n in self.neigh[p]:
                if tiles[n]==1:continue
                nd=d+(softcost if tiles[n]==2 else 1)
                if nd<ds[n]:ds[n]=nd;heapq.heappush(q,(nd,n))
        return ds

    def potentials(self,tl):
        tiles=tl[3]; cd=self.distances(tiles,[(p,0) for p in self.centers])
        sec=self.frame/self.hz; centerweight=.65 if sec<25 else (1.0 if sec<38 else 1.4)
        vals=[-1000.0]*self.S
        # Empty-space routes to visible items, useful even if a future fire will remove an item.
        itemdist=[]
        for p,kind in self.dropmap.items():
            benefit={'speed':8 if self.me['speed']<3 else 0,'bomb':7 if self.me['bombs']<4 else 1,'blast':7 if self.me['blast']<4 else 1}[kind]
            itemdist.append((benefit,self.distances(tiles,[(p,0)],100)))
        for p in range(self.S):
            if tiles[p]==1:continue
            dep=self.depth[p]; free=sum(tiles[n]==0 for _,n in self.neigh[p])
            v=-centerweight*min(100,cd[p])+.12*free
            imminent=tl[0][p]&((1<<57)-2)
            if imminent:v-=4.5
            if tl[1][p]&((1<<21)-2):v-=1.0
            for benefit,ds in itemdist:v+=max(0,benefit-ds[p]*1.15)
            # Move inward well before a flood deadline, retaining room to detour.
            deadline=(self.rules.get('floodStart',40)+dep*self.rules.get('floodInterval',2.5))*self.hz-self.frame
            if deadline<180:v-=max(0,180-deadline)*.055
            # Avoid giving the opponent a short, straight shot in a narrow passage.
            ex=self.ep%self.W;ey=self.ep//self.W; x=p%self.W;y=p//self.W
            md=abs(x-ex)+abs(y-ey)
            if md<=self.enemy['blast']+1 and (x==ex or y==ey):v-=.9
            if free==1 and md<=3 and self.frame<(self.rules.get('floodStart',40)+6*self.rules.get('floodInterval',2.5))*self.hz:v-=8
            vals[p]=v
        return vals,cd

    def search(self,tl,vals,start=None,starttime=0,initial_rem=0,end=None,need_paths=True):
        danger,blocks,opened=tl[:3]; H=self.horizon if end is None else end
        p=self.start if start is None else start
        t0=starttime+initial_rem
        if t0>H:t0=H
        if t0>starttime and danger[p]&((1<<(t0+1))-(1<<(starttime+1))):return None
        rows=[{} for _ in range(H+1)]; parents=[{} for _ in range(H+1)] if need_paths else None
        rows[t0][p]=vals[p]*(self.wsum[t0]-self.wsum[starttime])
        for t in range(t0,H):
            if not rows[t]:continue
            d=self.d
            endmove=min(H,t+d); mm=((1<<(endmove+1))-(1<<(t+1)))
            wmove=self.wsum[endmove]-self.wsum[t]
            wwait=self.weights[t+1]
            for p,score in rows[t].items():
                # A frame with neutral input is always legal on the bomb beneath one's feet.
                if not(danger[p]&(1<<(t+1))):
                    ns=score+vals[p]*wwait
                    if ns>rows[t+1].get(p,-1e30):
                        rows[t+1][p]=ns
                        if need_paths:parents[t+1][p]=(t,p,'N')
                for direction,n in self.neigh[p]:
                    if opened[n]>t+1 or blocks[n]&(1<<(t+1)) or danger[n]&mm:continue
                    ns=score+vals[n]*wmove-.035
                    if ns>rows[endmove].get(n,-1e30):
                        rows[endmove][n]=ns
                        if need_paths:parents[endmove][n]=(t,p,direction)
        if not rows[H]:return None
        dest=max(rows[H],key=rows[H].get); best=rows[H][dest]
        actions=['N']*H
        if need_paths:
            tt=H;pp=dest
            while tt>t0:
                prev,p0,di=parents[tt][pp]; actions[prev]=di;tt=prev;pp=p0
        return best,actions,rows,parents

    def prefix_candidates(self,tl,window=20,delays=False):
        # Earliest safe arrival at each potential planting square within this window.
        danger,blocks,opened=tl[:3]; reach=[{} for _ in range(window)]
        t0=self.rem
        if t0>=window:return []
        if danger[self.start]&((1<<(t0+1))-2):return []
        reach[t0][self.start]=[]
        seen={};out=[]
        for t in range(t0,window-1):
            for p,path in list(reach[t].items()):
                if p not in seen:
                    seen[p]=t;out.append((p,t,path))
                elif delays:
                    # A late fuse can seal one side until the next flood boundary.
                    next_ring=round((self.rules.get('floodStart',40)+self.depth[p]*self.rules.get('floodInterval',2.5))*self.hz)
                    gap=next_ring-(self.frame+t+1+self.rules.get('fuseFrames',40)+self.rules.get('blastFrames',12)-2)
                    if 0<=gap<=self.d+2 or t==window-2:
                        out.append((p,t,path))
                for direction,n in [('N',p)]+self.neigh[p]:
                    nt=t+(1 if direction=='N' else self.d)
                    if nt>=window-1:continue
                    mask=(1<<(nt+1))-(1<<(t+1))
                    if danger[n]&mask:continue
                    if direction!='N' and (opened[n]>t+1 or blocks[n]&(1<<(t+1))):continue
                    if n not in reach[nt]:reach[nt][n]=path+[(t,direction)]
        return out

    def blast_cells(self,p,tiles,r):
        cells=[p];x=p%self.W;y=p//self.W
        for _,dx,dy in reversed(DIRS):
            for k in range(1,r+1):
                nx=x+dx*k;ny=y+dy*k
                if not(0<=nx<self.W and 0<=ny<self.H):break
                z=ny*self.W+nx
                if tiles[z]==1:break
                cells.append(z)
                if tiles[z]==2:break
        return cells

    def opponent_placements(self,base):
        slot_ready=0
        if self.enemy['activeBombs']>=self.enemy['bombs']:
            slot_ready=min([b['fuse'] for b in self.o.get('bombs',[]) if b['owner']==self.enemy['owner']]+[1000])
            if slot_ready>=40:return []
        saved=(self.start,self.rem,self.d)
        n=max(self.rules.get('framesPerTileMin',3),self.rules.get('framesPerTile',6)-self.enemy['speed'])
        self.d=duration(n);self.start=self.ep
        diff=abs(self.enemy.get('px',self.enemy['x'])-self.enemy['x'])+abs(self.enemy.get('py',self.enemy['y'])-self.enemy['y'])
        self.rem=max(0,self.d-round((1-diff)*n)) if diff>.015 else 0
        options=self.prefix_candidates(base,window=min(40,self.horizon+1))
        self.start,self.rem,self.d=saved
        out=[]
        for p,t,_ in options:
            when=max(t+1,slot_ready)
            mask=(1<<(when+1))-(1<<(t+1))
            if when<min(40,self.horizon+1) and not(base[1][p]&(1<<when)) and not(base[0][p]&mask):out.append((p,when))
        return out

    def unsafe_forecast(self,extra,actions,forecasts):
        # Validate this complete open-loop window against plausible enemy blockades.
        # A later observation can revise the continuation, so only its existence is required.
        focus=extra[0] if extra else self.start
        close=sorted(forecasts,key=lambda z:(abs(z[0]%self.W-focus%self.W)+abs(z[0]//self.W-focus//self.W),z[1]))[:14]
        for forecast in close:
            if extra and forecast==extra:
                if self.me['owner']>self.enemy['owner']:return forecast
                continue
            tl=self.timeline(extra,forecast);p=self.start;rem=self.rem;placed=not extra
            if extra and tl[7]:return forecast
            limit=min(20,self.horizon)
            for tt in range(1,limit+1):
                if rem:rem-=1
                else:
                    if extra and tt==extra[1]:
                        if p!=extra[0] or (forecast[0]==p and forecast[1]<=tt):return forecast
                        placed=True
                    direction=actions[tt-1] if tt<=len(actions) else 'N'
                    if direction!='N':
                        nn=next((n for d,n in self.neigh[p] if d==direction),None)
                        if nn is not None and tl[2][nn]<=tt and not(tl[1][nn]&(1<<tt)):
                            p=nn;rem=self.d-1
                if tl[0][p]&(1<<tt):return forecast
            if not placed:return forecast
            if self.horizon>20 and self.search(tl,[0.0]*self.S,start=p,starttime=20,initial_rem=rem,need_paths=False) is None:return forecast
        return None

    def enemy_search(self,tl,values=None):
        saved=(self.d,self.start,self.rem)
        n=max(self.rules.get('framesPerTileMin',3),self.rules.get('framesPerTile',6)-self.enemy['speed'])
        self.d=duration(n)
        diff=abs(self.enemy.get('px',self.enemy['x'])-self.enemy['x'])+abs(self.enemy.get('py',self.enemy['y'])-self.enemy['y'])
        rem=max(0,self.d-round((1-diff)*n)) if diff>.015 else 0
        result=self.search(tl,values if values is not None else [0.0]*self.S,start=self.ep,initial_rem=rem,need_paths=False)
        self.d,self.start,self.rem=saved
        return result

    def decide(self,o):
        self.setup(o)
        base=self.timeline(); vals,cd=self.potentials(base)
        result=self.search(base,vals,initial_rem=self.rem)
        if result:
            bestscore=result[0]/self.wsum[self.horizon]; bestacts=result[1]; bestbomb=None
        else:
            # Maximize the survivable prefix if an opponent has already forced a loss.
            bestacts=['N']*self.horizon;bestscore=-1e20;bestbomb=None
            for h in [40,25,20,15,10,5,1]:
                if h>self.horizon:continue
                rr=self.search(base,vals,initial_rem=self.rem,end=h)
                if rr:bestacts[:h]=rr[1];break
        candidates=[]
        near_enemy=abs(self.me['x']-self.enemy['x'])+abs(self.me['y']-self.enemy['y'])<=11
        forecasts=self.opponent_placements(base) if near_enemy else []
        if forecasts and result:
            checked=[]
            for _ in range(5):
                failure=self.unsafe_forecast(None,bestacts,forecasts)
                if failure is None:break
                if failure in checked:break
                checked.append(failure)
                alternative=self.timeline(enemy_extra=failure)
                rr=self.search(alternative,vals,initial_rem=self.rem)
                if rr is None:break
                if self.unsafe_forecast(None,rr[1],forecasts) is None:
                    bestacts=rr[1];bestscore=rr[0]/self.wsum[self.horizon];break
        # Score attacks by loss of the opponent's safe routes and center access.
        enemyvals=[-min(100,x) for x in cd]
        enemybase=self.enemy_search(base,enemyvals) if near_enemy else None
        if self.me['activeBombs']<self.me['bombs']:
            for p,t,path in self.prefix_candidates(base,delays=True):
                if t+1>self.horizon or base[1][p]&(1<<(t+1)):continue
                # A firepower pickup changes bomb geometry before the next observation.
                # Collect it first and postpone planting, rather than certify the old range.
                visited={self.start,p};walk=self.start
                for _,direction in path:
                    if direction!='N':walk=next(n for d,n in self.neigh[walk] if d==direction)
                    visited.add(walk)
                if any(self.dropmap.get(z)=='blast' for z in visited):continue
                cells=self.blast_cells(p,base[3],self.me['blast'])
                soft=[z for z in cells if base[3][z]==2]
                enemy_dist=abs(p%self.W-self.ep%self.W)+abs(p//self.W-self.ep//self.W)
                attack=(4 if self.ep in cells else max(0,2.7-enemy_dist*.5))
                if not soft and attack<=0:continue
                changed=base[3][:]
                for z in soft:changed[z]=0
                newcd=self.distances(changed,[(z,0) for z in self.centers])
                improvement=max(0,cd[p]-newcd[p])
                rank=improvement+len(soft)*1.2+attack-t*.10
                candidates.append((rank,p,t,path,len(soft),attack))
        candidates.sort(reverse=True,key=lambda a:a[0])
        for rank,p,t,path,nsoft,attack in candidates[:36]:
            tl=self.timeline((p,t+1)); pv,newcd=self.potentials(tl)
            rr=self.search(tl,pv,start=p,starttime=t)
            if rr is None or tl[6] is None:continue
            # Prefix to the planting square has to remain safe under the augmented chain schedule.
            prefix=['N']*t
            for tt,di in path:prefix[tt]=di
            prefscore=0;pp=self.start;rem=self.rem;valid=True
            for tt,di in enumerate(prefix,1):
                if rem:rem-=1
                elif di!='N':
                    pp=next(n for d,n in self.neigh[pp] if d==di);rem=self.d-1
                if tl[0][pp]&(1<<tt):valid=False;break
                prefscore+=pv[pp]*self.weights[tt]
            if not valid:continue
            bonus=.7*nsoft-.025*t
            if attack>0 and enemybase is not None:
                er=self.enemy_search(tl,enemyvals)
                if er is None:
                    bonus+=35
                else:
                    access=max(0,(enemybase[0]-er[0])/self.wsum[self.horizon])
                    sample=[k for k in range(max(20,tl[6]-7),min(self.horizon,tl[6]+13)+1,7)]
                    old=sum(len(enemybase[2][k]) for k in sample)
                    new=sum(len(er[2][k]) for k in sample)
                    pressure=max(0,math.log((old+1)/(new+1)))
                    bonus+=2.5*access+2.0*pressure+self.attack_weight*attack
            # The public engine does not free a chained bomb's capacity slot.
            # Avoid losing permanent capacity for an ordinary wall-clearing action.
            if tl[7]:bonus-=20
            score=(rr[0]+prefscore)/self.wsum[self.horizon]+bonus
            if score>bestscore+.03:
                trial=prefix+rr[1][t:]
                if forecasts and self.unsafe_forecast((p,t+1),trial,self.opponent_placements(tl)) is not None:continue
                bestscore=score;bestacts=prefix+rr[1][t:];bestbomb=t
        inputs=[{'dir':di,'btn':'BOMB' if i==bestbomb else None} for i,di in enumerate(bestacts[:20])]
        while len(inputs)<20:inputs.append({'dir':'N','btn':None})
        # Predict the remaining movement lock using the exact engine arithmetic.
        pp=self.start;rem=self.rem;speed=self.me['speed']; drops=dict(self.dropmap)
        for a in inputs:
            if rem:rem-=1;continue
            if drops.pop(pp,None)=='speed':speed=min(3,speed+1)
            di=a['dir']
            if di!='N':
                n=next(n for d,n in self.neigh[pp] if d==di)
                # Intended route starts only through cells certified by the temporal planner.
                pp=n;rem=duration(max(self.rules.get('framesPerTileMin',3),self.rules.get('framesPerTile',6)-speed))-1
        self.pred=(o.get('round'),self.frame+20,pp,rem)
        return {'inputs':inputs,'note':'安全放弹，逐帧避险，提前向中心开路'}

if __name__=='__main__':
    agent=Agent()
    for line in sys.stdin:
        try:
            o=json.loads(line);ans=agent.decide(o)
        except Exception:
            traceback.print_exc(file=sys.stderr)
            ans={'inputs':[{'dir':'N','btn':None} for _ in range(20)],'note':'备用中立输入'}
        print(json.dumps(ans,separators=(',',':'),ensure_ascii=False),flush=True)
