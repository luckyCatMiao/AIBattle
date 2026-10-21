import random,json,time
from selftest import Bridge
from agent import Agent,duration
N={'dir':'N','btn':None}
rng=random.Random(9876123)
def run():
    b=Bridge();checks=0
    for case in range(100):
        o=b.send(op='new',seed=case+111,raw=True);g=o['raw'];tiles=g['tiles']
        # JSON serializes Uint8Array as keyed object.
        tiles=o['map']['tiles'][:]
        frame=rng.choice([0,500,795,840,899,999])
        fs=g['fighters']
        for f in fs:f['invulnUntil']=10**9
        ps=rng.sample([i for i,v in enumerate(tiles) if v!=1],rng.randrange(1,12))
        bombs=[]
        for k,p in enumerate(ps):
            tiles[p]=0;bombs.append({'id':'t'+str(k),'x':p%19,'y':p//19,'owner':k%2,'fuse':rng.randrange(1,41),'blast':rng.randrange(1,7)})
        fires=[{'x':p%19,'y':p//19,'frames':rng.randrange(1,12),'owner':0} for p in rng.sample(range(323),8)]
        o=b.send(op='set',state={'tiles':tiles,'bombs':bombs,'blasts':fires,'fighters':fs,'roundFrames':frame})
        a=Agent();a.setup(o);tl=a.timeline()
        for t in range(1,81):
            o=b.send(op='step',inputs=[N,N])
            actualfire={z['y']*19+z['x'] for z in o['blasts']}
            actualbombs={z['y']*19+z['x'] for z in o['bombs']}
            for p in range(323):
                assert (tl[2][p]<=t)==(o['map']['tiles'][p]==0),(case,t,p,'open',tl[2][p],o['map']['tiles'][p],bombs,frame)
                assert bool(tl[1][p]&(1<<t))==(p in actualbombs),(case,t,p,'bomb')
                assert bool(tl[0][p]&(1<<t))==(p in actualfire or a.depth[p]<o['flood']['ring']),(case,t,p,'hazard')
                checks+=3
    b.close()
    print('exact timeline checks:',checks)
    # Movement duration for all available speeds.
    b=Bridge()
    for speed in range(4):
        o=b.send(op='new',raw=True);g=o['raw'];fs=g['fighters'];fs[0]['speed']=speed
        o=b.send(op='set',state={'fighters':fs})
        for t in range(1,duration(6-speed)+1):
            o=b.send(op='step',inputs=[{'dir':'R' if t==1 else 'N','btn':None},N],raw=True)
            f=o['raw']['fighters'][0]
            assert (f['moveProgress']>=1)==(t==duration(6-speed))
    b.close();print('movement duration checks: passed')
if __name__=='__main__':run()
