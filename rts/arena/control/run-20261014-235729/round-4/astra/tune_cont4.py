from pathlib import Path
s=Path('agent.js').read_text()
variants={
'short':s.replace('/d*38','/d*13'),
'short20':s.replace('/d*38','/d*20'),
'reload90':s.replace('now+.65','now+.9'),
'hold':s.replace("if(enemy&&(!missions", "if(u.type==='tank'&&enemy&&D(u,enemy)>stats.range+enemy.r&&friends.filter(f=>f.type==='tank'&&D(f,base)<D(u,base)&&D(f,u)>70).length&&danger>=power*.65){intent(u,{type:'stop'},78);continue;}\n  if(enemy&&(!missions"),
'cohere':s.replace("if(u.type==='tank'&&!closest", "if(u.type==='tank'&&(!closest||D(u,closest)>185)").replace('D(u,lead)>120','D(u,lead)>70'),
'closepower':s.replace('D(f,u)<230','D(f,u)<150'),
'noover':s.replace('range>stats.range+e.r?220:0','range>stats.range+e.r?500:0').replace(')*2+(e.type',')*5+(e.type'),
}
variants['shorthold']=variants['hold'].replace('/d*38','/d*13')
variants['shortcohere']=variants['cohere'].replace('/d*38','/d*13')
for name,x in variants.items():Path('c4_'+name+'.js').write_text(x)
