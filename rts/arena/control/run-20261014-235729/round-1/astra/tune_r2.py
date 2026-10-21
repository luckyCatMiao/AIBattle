import subprocess,pathlib,re
base=pathlib.Path('agent_r2_a.js').read_text()
for name,changes in [('a',[]),('kite185', [('D(u,closest)<175','D(u,closest)<185')]),('kite165',[('D(u,closest)<175','D(u,closest)<165')]),('reload95',[('now+.65','now+.95')]),('retreat135',[('danger>power*1.65','danger>power*1.35')]),('retreat2',[('danger>power*1.65','danger>power*2')]),('kite55',[('/d*38','/d*55')]),('upgradeearly',[("(army.filter(u=>u.type==='tank').length>=2||now>75)","army.length>=3")])]:
 s=base
 for a,b in changes:s=s.replace(a,b)
 pathlib.Path('agent.js').write_text(s)
 pathlib.Path('variant_'+name+'.js').write_text(s)
 print(name,subprocess.check_output(['node','experiment.js','./agent_r2_a.js'],text=True).strip(),flush=True)
 print(subprocess.check_output(['node','test.js'],text=True).split('sim ',1)[1].replace(' log ', ' log ')[:0],flush=True)
 # Record only concise actual outcomes.
 out=subprocess.check_output(['node','test.js'],text=True)
 print('\n'.join(x.split(' log ')[0] for x in out.splitlines() if x.startswith('sim')),flush=True)
pathlib.Path('agent.js').write_text(base)
