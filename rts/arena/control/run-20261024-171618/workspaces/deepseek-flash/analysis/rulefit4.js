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
    const near=foes.slice().sort((p,q)=>dist(u,p)-dist(u,q))[0];
    if(!near||dist(u,near)>186) continue;
    const cs=(d.commands[ss]||[]).filter(c=>c.units&&c.units.includes(u.id));
    const hasMove=cs.some(c=>c.type==='move'), hasAtk=cs.some(c=>c.type==='attack'&&c.target&&c.target[0]==='u');
    let kind=hasMove?'move':hasAtk?'attackU':'other';
    if(kind==='other')continue;
    rows.push({id,kind,delta:u.fireAt-d.now,eDelta:near.fireAt-d.now,ownHp:u.hp/u.maxHp,
      d:dist(u,near),order:u.order?u.order.type:'none',tgt:u.order&&u.order.target});
  }
 }
}
const t=rows.filter(r=>r.kind==='move'||r.kind==='attackU');
const crosstab=(f)=>{const m={};for(const r of t){const k=f(r);m[k]=m[k]||{move:0,attackU:0};m[k][r.kind]++;}console.log(JSON.stringify(m));};
console.log('own not-ready (delta>0.1):'); crosstab(r=>r.delta>0.1?('enemyReady='+(r.eDelta<=0.1)):'OWN_READY');
console.log('by own order'); crosstab(r=>r.order);
console.log('own ready subset by enemy ready'); crosstab(r=>'own'+r.delta.toFixed(1)+'/'+r.eDelta.toFixed(1));
