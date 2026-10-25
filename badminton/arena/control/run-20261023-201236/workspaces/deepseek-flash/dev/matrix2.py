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
t0=time.time()
W=L=0
for pname,pfac in OPPS.items():
    g1,_,_=run(Brain(), pfac()); g2,_,_=run(pfac(), Brain())
    w=sum(1 for g,seat in ((g1,0),(g2,1)) if g.winner==seat)
    W+=w; L+=2-w
    print('vs %-6s %d-%d (%s / %s)'%(pname,w,2-w,g1.score,g2.score), flush=True)
print('TOTAL %d-%d  %.0fs'%(W,L,time.time()-t0))
