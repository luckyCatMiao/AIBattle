import sys,time
sys.path.insert(0,'.'); sys.path.insert(0,'dev')
from brain_py import Brain
from dev.selfplay import run

OPPS = {
 'tie0': lambda: Brain('tie', nudge=False),
 'tie1': lambda: Brain('tie', nudge=True),
 'mid0': lambda: Brain('mid', nudge=False),
 'smash': lambda: Brain('tie', smash_lover=True, nudge=False),
 'camp0': lambda: Brain('camp', nudge=False),
}
OURS = {
 'tie0': lambda: Brain('tie', nudge=False),
 'tie1': lambda: Brain('tie', nudge=True),
 'mid0': lambda: Brain('mid', nudge=False),
}
t0=time.time()
for oname, ofac in OURS.items():
    W=L=0; rows=[]
    for pname, pfac in OPPS.items():
        g1,_,_=run(ofac(), pfac()); g2,_,_=run(pfac(), ofac())
        w=sum(1 for g,seat in ((g1,0),(g2,1)) if g.winner==seat)
        W+=w; L+=2-w
        rows.append('%s:%d-%d(%s/%s)'%(pname,w,2-w,g1.score,g2.score))
    print('our=%-5s W%d L%d  %s'%(oname,W,L,' '.join(rows)), flush=True)
print('%.0fs'%(time.time()-t0))
