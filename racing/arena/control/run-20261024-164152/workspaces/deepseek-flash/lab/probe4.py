import math
from probe3 import run
# Pareto: net turn rate (rad/s) vs sustainable speed
res={}
for P in (3,4,5,6,8,10,12,16):
  for a_d in (0.0,0.15,0.25,0.4,0.6,0.8,1.0):
    for a_g in (0.2,0.5,0.8,1.0):
      for ng in (1,2):
        if ng>=P: continue
        for sgn in (1,-1):
          def pol(s,i,P=P,a_d=a_d,a_g=a_g,ng=ng,sgn=sgn):
              ph=i%P
              if ph < P-ng: return (1.0, sgn*a_d if a_d>0.15 else sgn*0.16, True, True)
              return (1.0, sgn*a_g, False, True)
          sp,rate,be,dr=run(pol, 16.0, 1.0)[0],None,None,None
          # recompute with score
          import probe3
          sp,rate,be,dr=probe3.score(pol,16.0,1.0)
          key=round(rate,1)
          if sp>res.get(key,(0,))[0]:
              res[key]=(sp,rate,be,dr,P,a_d,a_g,ng,sgn)
for k in sorted(res, reverse=True):
    sp,rate,be,dr,P,a_d,a_g,ng,sgn=res[k]
    print('rate=%+5.2f speed=%5.2f R=%5.1f be=%.2f drift=%.2f P=%d ad=%.2f ag=%.2f ng=%d'%(
        rate,sp, sp/max(abs(rate),1e-3) if abs(rate)>0.05 else 999, be,dr,P,a_d,a_g,ng))
