import sys,time
sys.path.insert(0,'.'); sys.path.insert(0,'dev')
from brain_py import Brain
from dev.selfplay import run
OPPS = {
 'tie': lambda: Brain('tie'),
 'mid': lambda: Brain('mid'),
 'smash': lambda: Brain('tie', smash_lover=True),
 'camp': lambda: Brain('camp'),
}
for learn in (False, True):
    t0=time.time(); W=L=0; rows=[]
    for pname,pfac in OPPS.items():
        g1,_,_=run(Brain('mid', learn=learn), pfac()); g2,_,_=run(pfac(), Brain('mid', learn=learn))
        w=sum(1 for g,seat in ((g1,0),(g2,1)) if g.winner==seat)
        W+=w; L+=2-w
        rows.append('%s:%d-%d(%s/%s)'%(pname,w,2-w,g1.score,g2.score))
    print('learn=%-5s %d-%d  %s  (%.0fs)'%(learn,W,L,' '.join(rows),time.time()-t0), flush=True)
