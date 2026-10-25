const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const ids=['history-run-20261015-010803-r1-g1','history-run-20261015-010803-r1-g2','history-run-20261015-010803-r2-g1','history-run-20261015-010803-r2-g2','history-run-20261015-010803-r3-g1','history-run-20261015-010803-r3-g2','r1-g1','r1-g2'];
for(const id of ids){
 const g=j.find(x=>x.id===id); const S=g.seats.indexOf('sol');
 const fbt=new Map(g.frames.map(f=>[f.tick,f]));
 console.log('=====',id,'sol seat',S);
 const amDst={};
 for(const d of g.decisions){
  const f=fbt.get(d.tick); if(!f) continue;
  for(const c of d.commands[S]){
    if(c.type==='train')console.log('  t'+d.now.toFixed(0),'TRAIN',c.unit,'cr',f.players[S].credits,'queue',f.bases[S].queue.map(q=>q.type).join(','));
    if(c.type==='upgrade')console.log('  t'+d.now.toFixed(0),'UPGRADE cr',f.players[S].credits,'lv',f.players[S].level);
    if(c.type==='repair')console.log('  t'+d.now.toFixed(0),'REPAIR base',Math.round(f.bases[S].hp),'cr',f.players[S].credits);
    if(c.type==='rally')console.log('  t'+d.now.toFixed(0),'RALLY',Math.round(c.x),Math.round(c.y));
    if(c.type==='attackMove'){const k=Math.round(c.x)+','+Math.round(c.y);amDst[k]=(amDst[k]||0)+1;}
  }
 }
 const top=Object.entries(amDst).sort((a,b)=>b[1]-a[1]).slice(0,12);
 console.log('  attackMove dest top:',JSON.stringify(top));
}
