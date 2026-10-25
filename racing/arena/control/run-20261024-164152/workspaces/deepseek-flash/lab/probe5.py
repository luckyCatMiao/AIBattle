import math
from probe3 import step
P=5
def pol(i):
    ph=i%P
    if ph < P-1: return (1.0, 0.8, True, True)
    return (1.0, 0.2, False, True)
s=dict(x=0.,y=0.,ang=0.,vx=0.,vy=0.,de=0.,be=1.0,drifting=False)
for i in range(400):
    s=step(s,*pol(i))
    if i>=100 and i%10==0:
        sp=math.hypot(s['vx'],s['vy'])
        print('t=%5.2f pos=(%7.2f,%7.2f) ang=%+6.2f velang=%+6.2f speed=%5.2f vF=%5.2f vL=%6.2f be=%.2f'%(
            i*0.05, s['x'], s['y'], s['ang'], math.atan2(s['vy'],s['vx']), sp, s['vF'], s['vL'], s['be']))
