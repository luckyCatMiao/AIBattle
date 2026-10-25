import math
from probe3 import step
s=dict(x=0.,y=0.,ang=0.,vx=0.,vy=0.,de=0.,be=1.0,drifting=False)
for i in range(120):
    ph=i%5
    inp=(1.0, 0.8, True, True) if ph<4 else (1.0, 0.2, False, True)
    s=step(s,*inp)
    if i>=100:
        sp=math.hypot(s['vx'],s['vy'])
        print('i=%3d ph=%d drift=%d pos=(%6.2f,%6.2f) ang=%+6.2f velang=%+6.2f sp=%5.2f vF=%5.2f vL=%+6.2f de=%.2f be=%.2f'%(
            i,ph,s['drifting'], s['x'],s['y'], s['ang'], math.atan2(s['vy'],s['vx']), sp, s['vF'], s['vL'], s['de'], s['be']))
