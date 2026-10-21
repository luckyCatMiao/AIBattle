import json,collections,sys,importlib.util
import compare_versions
from pathlib import Path
old=Path('agent_round1.py').read_text();new=Path('agent.py').read_text()
def section(s,a,b):return s[s.index(a):s.index(b,s.index(a))]
variants={}
variants['filter']=old.replace('self.unsafe_forecast((p,t+1),trial,forecasts)','self.unsafe_forecast((p,t+1),trial,self.opponent_placements(tl))')
v=variants['filter']
v=v.replace(section(v,'    def prefix_candidates','    def blast_cells'),section(new,'    def prefix_candidates','    def blast_cells'))
v=v.replace('self.prefix_candidates(base):','self.prefix_candidates(base,delays=True):').replace('candidates[:9]','candidates[:36]').replace('if rr is None:continue\n            # Prefix','if rr is None or tl[6] is None:continue\n            # Prefix')
variants['filter_delay']=v
v=new.replace(section(new,'        if forecasts and result:',"        # Score attacks"),section(old,'        if forecasts and result:',"        if self.me['activeBombs']"))
variants['old_defense']=v
v=new.replace(section(new,'            bonus=.7*nsoft','            # The public engine'),section(old,'            bonus=.7*nsoft','            # The public engine'))
variants['old_bonus']=v
name=sys.argv[1];Path('agent_r2_'+name+'.py').write_text(variants[name]);spec=importlib.util.spec_from_file_location('variant','agent_r2_'+name+'.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);compare_versions.Agent=m.Agent
rs=[]
for seed in range(1,25):
 for seat in [0,1]:rs.append(compare_versions.play(seed,seat,compare_versions.load('agent_round1')))
 if seed%6==0:print(name,seed,dict(collections.Counter(r['result']for r in rs)),flush=True)
json.dump(rs,open('r2_ablation_'+name+'.json','w'),indent=2)
