import sys, math; sys.path.insert(0,'.')
from fast import get_tracks, FastTrack
from ctrl1 import v_for_radius
seeds=[6011,6012,6021,6022,5011,5012]
data=get_tracks(seeds)
for s in seeds:
    f=FastTrack(data[str(s)]); L=f.line
    n=L.n; ds=L.length/n
    v=[min(48.0, v_for_radius(1.0/max(L.kappa[i],1e-6))) for i in range(n)]
    for _ in range(3):
        for i in range(n-1,-1,-1):
            j=(i+1)%n
            v[i]=min(v[i], math.sqrt(max(0.0,v[j]*v[j]+2*20.0*ds)))
    t=sum(ds/v[i] for i in range(n))
    # curvature stats
    ks=sorted(1.0/max(L.kappa[i],1e-6) for i in range(n))
    print('seed %d len=%.0f ideal_lap=%.2f  frac_slow(<25)=%.2f  minR=%.1f  p10R=%.1f  medianR=%.1f  hw=%.2f'%(
        s, L.length, t, sum(1 for x in v if x<25)/n, ks[0], ks[int(0.1*n)], ks[n//2], f.hw))
