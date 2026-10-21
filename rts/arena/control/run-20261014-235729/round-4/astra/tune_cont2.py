from pathlib import Path
s=Path('continuation_r1.js').read_text()
variants={
'near':s.replace("return (hp<=0?1000:hp/damage)*5+", "return (range>stats.range+e.r?220:0)+(hp<=0?1000:hp/damage)*5+"),
'upgrade':s.replace("if(queue.length<1){", "if(p.level<2&&army.filter(u=>u.type==='tank').length>=2&&money>=180+p.level*120){add({type:'upgrade'});money-=180+p.level*120;}\n if(queue.length<1){").replace("if(p.level<2&&(army", "if(false&&p.level<2&&(army"),
'cohesion':s.replace("let dest=missions.get(u.id)||goal;", "let dest=missions.get(u.id)||goal;\n if(!missions.has(u.id)&&u.type==='tank'){const engaged=main.filter(f=>f.type==='tank'&&ec.some(e=>D(e,f)<210));if(engaged.length&& !ec.some(e=>D(e,u)<195))dest=engaged.reduce((a,b)=>D(a,u)<D(b,u)?a:b);}"),
'reload':s.replace('u.fireAt>now+.65','u.fireAt>now+.95'),
'north':s.replace('const goal=incoming|| (now<20?home:',"const goal=incoming|| (now<20?s.nodes[0]:").replace('(now<20&&n.id!==home.id)','(now<20&&n.id!==home.id)'),
}
variants['near_upgrade']=variants['upgrade'].replace("return (hp<=0?1000:hp/damage)*5+", "return (range>stats.range+e.r?220:0)+(hp<=0?1000:hp/damage)*5+")
for k,v in variants.items():Path('c2_'+k+'.js').write_text(v)
