const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const id=process.argv[2]||'r2-g1', t0=+process.argv[3]||40, t1=+process.argv[4]||72;
const g=a.find(x=>x.id===id);const me=g.seats.indexOf('deepseek-flash'), ss=1-me;
for(const d of g.decisions){
 if(d.now<t0-0.01||d.now>t1+0.01) continue;
 const f=g.frames.find(x=>x.tick===d.tick);
 const units=f.units.filter(u=>u.type!=='worker'&&u.type!=='rifle');
 const fmt=u=>`${u.id}${u.owner===me?'M':'S'}(${Math.round(u.x)},${Math.round(u.y)} ${Math.round(u.hp)}${u.fireAt>d.now?'*':''})`;
 const cmd=c=>{let s=c.type;if(c.unit)s+=':'+c.unit;if(c.target)s+='->'+c.target;if(c.x!==undefined)s+='@'+Math.round(c.x)+','+Math.round(c.y);if(c.units)s+='['+c.units.join(',')+']';return s;};
 console.log('t='+d.now.toFixed(0),'U:',units.map(fmt).join(' '));
 console.log('   ME:',(d.commands[me]||[]).map(cmd).join(' | '));
 console.log('   SOL:',(d.commands[ss]||[]).map(cmd).join(' | '));
}
