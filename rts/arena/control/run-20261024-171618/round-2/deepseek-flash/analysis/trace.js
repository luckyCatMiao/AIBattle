const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const id=process.argv[2], t0=+process.argv[3], t1=+process.argv[4];
const g=j.find(x=>x.id===id);
const decByTick=new Map(g.decisions.map(d=>[d.tick,d]));
for(const f of g.frames){
  if(f.now<t0||f.now>t1) continue;
  console.log('=== t'+f.now.toFixed(0)+' tick'+f.tick);
  const d=decByTick.get(f.tick);
  if(d) for(let p=0;p<2;p++) if(d.commands[p].length) console.log('  CMD p'+p+': '+JSON.stringify(d.commands[p]));
  for(const u of f.units){
    if(u.type==='worker') continue;
    console.log('  u'+u.id+' p'+u.owner+' '+u.type+' hp'+Math.round(u.hp)+'/'+u.maxHp+' ('+Math.round(u.x)+','+Math.round(u.y)+') ord'+JSON.stringify(u.order));
  }
  for(const e of f.events){ if(e.type==='explosion'&&!e.big) console.log('  EXPL ('+Math.round(e.x)+','+Math.round(e.y)+')'); }
}
