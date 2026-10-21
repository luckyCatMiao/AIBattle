from pathlib import Path
s=Path('agent.js').read_text()
variants={}
# Support allies currently fighting even before they are within personal aggro.
for rad in [110,160,210]:
 insert=f'''  if(u.type==='tank'&&!missions.has(u.id)&&!(enemy&&D(u,enemy)<=stats.range+enemy.r)){{
   const fighting=army.filter(f=>f.type==='tank'&&f.id!==u.id&&ec.some(e=>D(f,e)<210));
   if(fighting.length){{const lead=fighting.sort((a,b)=>D(u,a)-D(u,b))[0];
    if(D(u,lead)>{rad}){{intent(u,{{type:'move',x:clamp(lead.x-sign*35,20,1260),y:clamp(lead.y+(main.indexOf(u)%2?40:-40),20,820)}},82);continue;}}
   }}
  }}
'''
 variants['support'+str(rad)]=s.replace("  if(enemy&&(!missions",insert+"  if(enemy&&(!missions")
for range in [0,20,35]:
 variants['pursuit'+str(range)]=s.replace('stats.range+e.r+65','stats.range+e.r+'+str(range))
for penalty in [1,2,4]:
 variants['focus'+str(penalty)]=s.replace("let hp=e.hp-(reserved[e.id]||0);return",f"let hp=e.hp-(reserved[e.id]||0);return army.filter(f=>f.type==='tank').reduce((v,f)=>v+Math.min(250,D(f,e)),0)*{penalty}/Math.max(1,army.filter(f=>f.type==='tank').length)+")
for hp in [100,160,220]:
 variants['save'+str(hp)]=s.replace('const fleeing=danger>power*1.65','const fleeing=(danger>power*1.65||u.hp<'+str(hp)+'&&friends.some(f=>f.type===\'tank\'&&f.hp>u.hp+80))')
for n in [1,2,3]:
 variants['north'+str(n)]=s.replace("const goal=incoming|| (now<20?home:assault?eb:objective);",f"const goal=incoming|| (now<20?home:assault?eb:objective);\n if(now<20)for(const u of scouts.slice(0,{n}))missions.set(u.id,s.nodes[0]);")
for name,x in variants.items():Path('c5_'+name+'.js').write_text(x)
