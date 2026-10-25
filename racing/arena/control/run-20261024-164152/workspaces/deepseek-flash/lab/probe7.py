import math, sys
sys.path.insert(0,'..')
from probe3 import step
P=12; amp=0.2
def pol(i):
    ph=i%P
    se = amp if ph<6 else -amp
    return (1.0, se, ph<11, True)
s=dict(x=0.,y=0.,ang=0.,vx=0.,vy=0.,de=0.,be=1.0,drifting=False)
for i in range(400):
    s=step(s,*pol(i))
    if i>=300 and i%4==0:
        sp=math.hypot(s['vx'],s['vy'])
        print('i=%3d ph=%2d pos=(%7.2f,%7.2f) ang=%+7.2f velang=%+7.2f sp=%6.2f vF=%6.2f vL=%+7.2f be=%.2f'%(
            i,i%P,s['x'],s['y'],s['ang'],math.atan2(s['vy'],s['vx']),sp,s['vF'],s['vL'],s['be']))
