import subprocess
src=open('agent_original.js').read()
for retreat in [1.35,1.8,2.5]:
 for scout in [False,True]:
  for worker in [False,True]:
   s=src.replace('danger>power*1.35',f'danger>power*{retreat}')
   if scout:s=s.replace("if(ec.some(e=>D(e,n)<220))continue;","if((n.id==='n0'&&now<25)||ec.some(e=>D(e,n)<220))continue;")
   if worker:s=s.replace("train('tank');train('worker');","train('worker');train('tank');")
   open('agent.js','w').write(s)
   out=subprocess.check_output(['node','test.js'],text=True)
   lines=[l for l in out.splitlines() if l.startswith('sim')];wins=sum(l.split()[2]==l.split()[4] for l in lines)
   print(retreat,scout,worker,wins,[(l.split()[1:6]) for l in lines],flush=True)
   if wins==6:open('agent_best.js','w').write(s)
open('agent.js','w').write(src)
