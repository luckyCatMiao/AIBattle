import json, io, sys, math, statistics

def load(name):
    return json.load(io.open('tools/r3/%s.json' % name, encoding='utf-8'))

def unwrap(car_frames, idx):
    # progress may reset each lap? use lap + progress
    out=[]
    for f in car_frames:
        c=f['cars'][idx]
        out.append((f['tick'], f['tick']*0.05, c['lap'], c['progress'], c['speed'], c['x'], c['y'], c['angle'], c['nextCp'], c['offRoad'], c['boosting'], c['drifting'], c['boostEnergy'], c['driftCharge'], c['collisions'], c['finished'], c['finishTime'], c['bestLap']))
    return out

def stats(vals):
    if not vals: return None
    return (min(vals), sum(vals)/len(vals), max(vals), statistics.pstdev(vals))

for name in ['r3-g1','r3-g2']:
    d=load(name)
    n=len(d['frames'])
    seats=d['seats']
    print('='*80)
    print(name,'seed',d['seed'],'seats',seats,'frames',n,'winner',d['winner'])
    print('track length %.3f halfWidth %.3f'%(d['track']['length'],d['track']['halfWidth']))
    for idx in range(2):
        arr=unwrap(d['frames'],idx)
        # start after countdown (t>=1.5)
        run=[a for a in arr if a[1]>=1.5]
        speeds=[a[4] for a in run]
        off=sum(1 for a in run if a[9])
        boostf=sum(1 for a in run if a[10])
        driftf=sum(1 for a in run if a[11])
        print('\n-- car',idx,seats[idx])
        print('run frames',len(run),'t range',run[0][1],run[-1][1])
        print('speed min/avg/max', '%.2f %.2f %.2f'%(min(speeds),sum(speeds)/len(speeds),max(speeds)))
        print('offroad frames',off,'boost frames',boostf,'drift frames',driftf)
        # per-lap splits
        last_t=1.5; last_lap=0
        for a in arr:
            tick,t,lap,prog,sp = a[0],a[1],a[2],a[3],a[4]
            if lap!=last_lap:
                print('  lap %d reached at t=%.2f tick=%d  lapdur=%.2f progress=%.2f speed=%.2f'%(lap,t,tick,t-last_t,prog,sp))
                last_t=t; last_lap=lap
        # progress rate per second in windows: sample every 10 ticks
        print('  samples (t, lap, progress, speed, nextCp, boosting, drifting, energy):')
        for a in run:
            if a[0]%10==0:
                print('   %6.2f lap%d prog%8.2f sp%6.2f cp%d b%d d%d E%.2f'%(a[1],a[2],a[3],a[4],a[8],a[10],a[11],a[12]))
    # gaps
    p0=[f['cars'][0] for f in d['frames']]
    p1=[f['cars'][1] for f in d['frames']]
    print('\n-- delta samples: t, lap0/prog0, lap1/prog1, progress diff (lap-aware)')
    for k in range(0,n,10):
        a=p0[k]; b=p1[k]
        # absolute progress = lap*L + progress? progress likely cumulative within lap
        L=d['track']['length']
        A=a['lap']*L+a['progress']; B=b['lap']*L+b['progress']
        print('  %5.2f  p0 lap%d %7.2f sp%5.2f | p1 lap%d %7.2f sp%5.2f | diff %7.2f'%(d['frames'][k]['tick']*0.05,a['lap'],a['progress'],a['speed'],b['lap'],b['progress'],b['speed'],A-B))
