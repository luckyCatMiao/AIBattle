import sys,math
sys.path.insert(0,'/workspace')
import agent as A
W,H=44,26
BOXES={0:{'x1':1,'y1':6,'x2':10,'y2':20},1:{'x1':34,'y1':6,'x2':43,'y2':20}}
def build_field():
    tiles=[0]*(W*H)
    for y in range(H):
        for x in range(W):
            border=x==0 or y==0 or x==W-1 or y==H-1
            if not border: continue
            goal=(x==0 or x==W-1) and 10<=y<16
            if not goal: tiles[y*W+x]=1
    return tiles
TILES=build_field()
def mk(uid,team,index,x,y,fx=1.0,fy=0.0):
    return {'id':uid,'team':team,'index':index,'name':uid,'x':x,'y':y,'fx':fx,'fy':fy,
            'kickCd':0,'controlLock':0,'stealLock':0,'foulLock':0,'held':{'dir':'N','aim':None,'kick':False}}
def world(units,ball):
    w=A.World(TILES); w.units=sorted(units,key=lambda u:(u['team'],u['index'])); w.ball=dict(ball); return w
MIR={'N':'N','U':'U','D':'D','L':'R','R':'L','UL':'UR','UR':'UL','DL':'DR','DR':'DL'}
def mirror_units(units):
    out=[]
    for u in units:
        out.append(mk(u['id'],1-u['team'],u['index'],43-u['x'],u['y'],-u['fx'],u['fy']))
    return out
def show(team, carrier_pos, foes, mate, keeper, ballowner='carrier'):
    units=[mk('t0u0',0,0,3.0,13.0,fx=1),mk('t0u1',0,1,25.0,13.0,fx=1),mk('t0u2',0,2,carrier_pos[0],carrier_pos[1],fx=1),
           mk('t1u0',1,0,keeper[0],keeper[1],fx=-1),
           mk('t1u1',1,1,foes[0][0],foes[0][1],fx=-1),
           mk('t1u2',1,2,foes[1][0],foes[1][1],fx=-1)]
    ball={'x':carrier_pos[0]+0.62,'y':carrier_pos[1],'vx':0.0,'vy':0.0,'owner':'t0u2'}
    w=world(units,ball)
    o=A.decide_frame(w,0,3,BOXES,allow_shot=True)[2]
    # mirrored world: swap 0<->1, x->43-x
    mu=[mk('t1u0',1,0,43-3.0,13.0,fx=-1),mk('t1u1',1,1,43-25.0,13.0,fx=-1),mk('t1u2',1,2,43-carrier_pos[0],carrier_pos[1],fx=-1),
        mk('t0u0',0,0,43-keeper[0],keeper[1],fx=1),
        mk('t0u1',0,1,43-foes[0][0],foes[0][1],fx=1),
        mk('t0u2',0,2,43-foes[1][0],foes[1][1],fx=1)]
    mball={'x':43-(carrier_pos[0]+0.62),'y':carrier_pos[1],'vx':0.0,'vy':0.0,'owner':'t1u2'}
    w2=world(mu,mball)
    o2=A.decide_frame(w2,1,3,BOXES,allow_shot=True)[2]
    return o,o2
for cp,foes,keeper in [((30.0,13.0),((35.0,10.0),(35.0,17.0)),(42.0,13.0)),
                        ((28.0,5.0),((33.0,10.0),(33.0,17.0)),(42.0,12.0)),
                        ((20.0,13.0),((26.0,10.0),(26.0,17.0)),(42.0,13.0)),
                        ((31.0,12.0),((35.0,12.0),(36.0,18.0)),(42.0,13.0))]:
    o,o2=show(0,cp,foes,None,keeper)
    om={**o2,'dir':MIR[o2['dir']]}
    if isinstance(o2.get('aim'),(int,float)): om['aim']=(180-o2['aim'])%360
    print("carrier",cp,"foes",foes,"keeper",keeper)
    print("   team0:",o)
    print("   team1 mirrored:",om, " raw:",o2)
