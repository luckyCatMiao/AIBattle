import importlib.util, os, sys, time
HERE=os.path.dirname(os.path.abspath(__file__)); ROOT=os.path.dirname(HERE)
sys.path.insert(0,ROOT); sys.path.insert(0,HERE)
import engine_py as E
from brain_py import Brain
spec=importlib.util.spec_from_file_location("brain_r1bak",os.path.join(HERE,"brain_py.r1bak.py"))
m=importlib.util.module_from_spec(spec);sys.modules["brain_r1bak"]=m;spec.loader.exec_module(m)
OldBrain=m.Brain
seed=int(sys.argv[1]) if len(sys.argv)>1 else 7121
b=Brain(); old=OldBrain()
g=E.Match(seed=seed); w=0; times=[]
while g.status=="playing" and w<600:
    o0,o1=g.view(0),g.view(1)
    t0=time.perf_counter(); w0=[E.normalize_frame(f)[0] for f in b.act(o0)]; dt=time.perf_counter()-t0
    times.append(dt)
    w1=[E.normalize_frame(f)[0] for f in old.act(o1)]
    for fi in range(10):
        if g.status!="playing": break
        g.batsmen[0]["held"]=w0[fi]; g.batsmen[1]["held"]=w1[fi]
        g.step()
    w+=1
times.sort()
print("windows",len(times),"max %.3f  p99 %.3f  mean %.3f"%(times[-1],times[int(len(times)*0.99)],sum(times)/len(times)))
print("score",g.score)
