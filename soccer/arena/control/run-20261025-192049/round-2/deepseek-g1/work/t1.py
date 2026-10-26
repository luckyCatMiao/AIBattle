import sys, os, time, importlib.util
WS=os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0,WS)
import agent as A
spec=importlib.util.spec_from_file_location('pol','policy.py')
P=importlib.util.module_from_spec(spec); spec.loader.exec_module(P)
for n in (1,2,3,4,6):
    s=A.initial_state(n, kickoff_team=0); s.freeze=12
    t0=time.time()
    fr=P.decide(s.clone(),0,n,A)
    dt=time.time()-t0
    print('n',n,'frames',len(fr),'first',fr[0].get((0,0)),'time %.3f'%dt)
