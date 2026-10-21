from pathlib import Path
s=Path('agent.js').read_text()
vs={
 'reload50':s.replace('now+.65','now+.5'),
 'reload90':s.replace('now+.65','now+.9'),
 'reload170':s.replace('D(u,closest)<175','D(u,closest)<170'),
 'reload190':s.replace('D(u,closest)<175','D(u,closest)<190'),
 'north':s.replace('now<20?home','now<20?s.nodes[0]'),
 'hold':s.replace("if(enemy&&(!missions", "if(u.type==='tank'&&enemy&&u.fireAt>now+.4&&D(u,enemy)>stats.range+enemy.r){intent(u,{type:'stop'},88);continue;}\n  if(enemy&&(!missions"),
}
cohesion="""if(u.type==='tank'&&!closest&&!missions.has(u.id)){
   const tanks=army.filter(f=>f.type==='tank'&&f.id!==u.id&&D(f,eb)<D(u,eb));
   if(tanks.length){let lead=tanks.sort((a,b)=>D(u,a)-D(u,b))[0];if(D(u,lead)>120)dest=lead;}
  }
  """
vs['support']=s.replace('let x=dest.x,y=dest.y;',cohesion+'let x=dest.x,y=dest.y;')
vs['rallynorth']=s.replace('let rally={x:home.x-sign*65,y:home.y-10}', 'let rally={x:640-sign*47,y:267}')
vs['distance']=s.replace('(hp<=0?1000:hp/damage)*5','(hp<=0?1000:hp/damage)*3').replace(')*2+(e.type',')*5+(e.type')
vs['rangehold']=s.replace("if(enemy&&(!missions", "if(u.type==='tank'&&enemy&&D(u,enemy)>stats.range+enemy.r&&near.filter(e=>D(u,e)<220).length>friends.filter(f=>D(f,u)<160).length){intent(u,{type:'stop'},88);continue;}\n  if(enemy&&(!missions")
for n,v in vs.items():Path('c3_'+n+'.js').write_text(v)
