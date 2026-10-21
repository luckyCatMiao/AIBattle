from pathlib import Path
s=Path('continuation_r3.js').read_text()
v={}
for t in [30,40,50]:
 v['stage'+str(t)]=s.replace('now<20?home','now<'+str(t)+'?home').replace("if(enemy&&(!missions", "if(u.type==='tank'&&now<"+str(t)+"&&enemy&&D(u,enemy)>stats.range+enemy.r){intent(u,{type:'attackMove',x:home.x-sign*45,y:home.y},79);continue;}\n  if(enemy&&(!missions")
for n in [1,2,3]:
 x=s.replace('let main=army.filter',"if(now<20){const north=s.nodes[0];for(const u of scouts.slice(0,"+str(n)+"))missions.set(u.id,north);}\n let main=army.filter")
 v['north'+str(n)]=x
for k in [1.05,1.25,1.4]:v['flee'+str(k).replace('.','')]=s.replace('danger>power*1.65','danger>power*'+str(k))
for k in [130,160,190,210]:v['kite'+str(k)]=s.replace('D(u,closest)<175','D(u,closest)<'+str(k))
for name,x in v.items():Path('c4_'+name+'.js').write_text(x)
