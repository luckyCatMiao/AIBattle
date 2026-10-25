const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const dist=(u,v)=>Math.hypot(u.x-v.x,u.y-v.y);
let rows=[];
for(const id of ['r1-g1','r1-g2','r2-g1','r2-g2']){
 const g=a.find(x=>x.id===id);const ss=g.seats.indexOf('sol'), me=1-ss;
 for(const d of g.decisions){
  const f=g.frames.find(x=>x.tick===d.tick); if(!f) continue;
  const my=f.units.filter(u=>u.owner===ss&&u.type!=='worker');
  const foes=f.units.filter(u=>u.owner===me&&u.type!=='worker');
  for(const u of my){
    const sorted=foes.slice().sort((p,q)=>dist(u,p)-dist(u,q));
    const near=sorted[0];
    if(!near||dist(u,near)>186) continue;
    const cs=(d.commands[ss]||[]).filter(c=>c.units&&c.units.includes(u.id));
    const hasMove=cs.some(c=>c.type==='move'), hasAtk=cs.some(c=>c.type==='attack'&&c.target&&c.target[0]==='u');
    let kind=hasMove?'move':hasAtk?'attackU':'other';
    if(kind==='other')continue;
    const atkCmd=cs.find(c=>c.type==='attack');
    const tgt=atkCmd?foes.find(v=>v.id===atkCmd.target):null;
    rows.push({id,kind,delta:u.fireAt-d.now,d:dist(u,near),ownHp:u.hp/u.maxHp,order:u.order?u.order.type:'none',
      tgtDist:tgt?dist(u,tgt):-1, tgtHp:tgt?tgt.hp:0, nearHp:near.hp});
  }
 }
}
const ex=rows.filter(r=>r.delta>1.05&&r.delta<1.95&&r.kind==='attackU');
console.log('exceptions n',ex.length,'d med',ex.map(r=>r.d).sort((a,b)=>a-b)[Math.floor(ex.length/2)].toFixed(0),
 'd<=174%',(100*ex.filter(r=>r.d<=174).length/ex.length).toFixed(0),
 'order attack%',(100*ex.filter(r=>r.order==='attack').length/ex.length).toFixed(0),
 'tgtDist<=174%',(100*ex.filter(r=>r.tgtDist>=0&&r.tgtDist<=174).length/ex.length).toFixed(0));
console.log(ex.slice(0,12).map(r=>`d${r.d.toFixed(0)} tgtD${r.tgtDist.toFixed(0)} order${r.order} hp${r.ownHp.toFixed(2)}`).join(' | '));
const mv=rows.filter(r=>r.delta>1.05&&r.delta<1.95&&r.kind==='move');
console.log('move d med',mv.map(r=>r.d).sort((a,b)=>a-b)[Math.floor(mv.length/2)].toFixed(0),'order attack%',(100*mv.filter(r=>r.order==='attack').length/mv.length).toFixed(0));
// for the ready-ish bin, what are moves?
const mv2=rows.filter(r=>r.delta<=0.95&&r.kind==='move');
console.log('ready moves n',mv2.length, mv2.slice(0,10).map(r=>`d${r.d.toFixed(0)} del${r.delta.toFixed(2)} tgtD${r.tgtDist.toFixed(0)} order${r.order}`).join(' | '));
