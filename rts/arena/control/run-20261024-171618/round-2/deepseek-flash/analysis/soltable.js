const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const id=process.argv[2], t0=+process.argv[3], t1=+process.argv[4];
const g=j.find(x=>x.id===id); const S=g.seats.indexOf('sol'),E=1-S;
const fbt=new Map(g.frames.map(f=>[f.tick,f]));
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
for(const d of g.decisions){
  if(d.now<t0||d.now>t1) continue;
  const f=fbt.get(d.tick); if(!f) continue;
  const su=f.units.filter(u=>u.owner===S&&u.type!=='worker'), eu=f.units.filter(u=>u.owner===E&&u.type!=='worker');
  const cmds=d.commands[S];
  const act=new Map();
  for(const c of cmds){ if(!c.units) continue; for(const id of c.units) act.set(id,c.type+(c.target?('>'+c.target):'')+(c.x!==undefined?('@'+Math.round(c.x)+','+Math.round(c.y)):'')); }
  console.log('t'+d.now.toFixed(0)+' cr'+f.players[S].credits+' lv'+f.players[S].level+' base'+Math.round(f.bases[S].hp)+' | sol['+su.map(u=>u.id.slice(0)+':'+Math.round(u.hp)).join(' ')+'] enemy['+eu.map(u=>u.id+':'+Math.round(u.hp)+'@'+Math.round(u.x)+','+Math.round(u.y)).join(' ')+']');
  for(const u of su){
    const near=eu.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
    console.log('   '+u.id+' hp'+Math.round(u.hp)+' ('+Math.round(u.x)+','+Math.round(u.y)+') ord'+u.order.type+(u.order.target?('>'+u.order.target):'')+' dEn'+(near?Math.round(dist(u,near)):'-')+' ready'+(u.fireAt<=d.now?'Y':'N')+' -> '+(act.get(u.id)||'-'));
  }
  const w=f.units.filter(u=>u.owner===S&&u.type==='worker');
  for(const u of w){ const near=eu.filter(x=>x.hp>0).sort((a,b)=>dist(u,a)-dist(u,b))[0]; const a=act.get(u.id); if(a) console.log('   '+u.id+' WORKER ('+Math.round(u.x)+','+Math.round(u.y)+') ord'+u.order.type+'>'+u.order.target+' -> '+a); }
}
