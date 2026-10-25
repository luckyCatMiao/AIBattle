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
    let kind=hasMove?'move':hasAtk?'attackU':cs.map(c=>c.type).join('+')||'none';
    if(kind!=='move'&&kind!=='attackU')continue;
    rows.push({id,type:u.type,delta:+(u.fireAt-d.now).toFixed(2),d:+dist(u,near).toFixed(0),kind,
      both:hasMove&&hasAtk,ownHp:u.hp/u.maxHp, nearType:near.type,nearHp:near.hp/near.maxHp, nearD:+dist(u,near).toFixed(0),
      tgt:cs.filter(c=>c.type==='attack').map(c=>c.target).join(',')});
  }
 }
}
const t=rows.filter(r=>r.type==='tank');
console.log('n',t.length,'both',t.filter(r=>r.both).length);
// delta<=0.1 should be attack
const byDelta={};
for(const r of t){const k=r.delta<=0.1?'ready':(r.delta<=1.0?'soon':'later'); byDelta[k]=byDelta[k]||{move:0,attackU:0};byDelta[k][r.kind]++;}
console.log('by delta',JSON.stringify(byDelta));
// For not-ready, correlate own hp and near type
for(const grp of ['ready','soon','later']){
 const rr=t.filter(r=>(grp==='ready')===(r.delta<=0.1)&&grp!=='ready'||(grp==='ready'&&r.delta<=0.1)||(grp==='soon'&&r.delta>0.1&&r.delta<=1.0)||(grp==='later'&&r.delta>1.0));
 const mv=rr.filter(r=>r.kind==='move'), at=rr.filter(r=>r.kind==='attackU');
 const avg=(v,f)=>v.length?(v.reduce((s,r)=>s+f(r),0)/v.length):0;
 console.log(grp,'move n',mv.length,'ownHP',avg(mv,r=>r.ownHp).toFixed(2),'nearTank%',(100*mv.filter(r=>r.nearType==='tank').length/Math.max(1,mv.length)).toFixed(0),'nearHP',avg(mv,r=>r.nearHp).toFixed(2),
   '| atk n',at.length,'ownHP',avg(at,r=>r.ownHp).toFixed(2),'nearTank%',(100*at.filter(r=>r.nearType==='tank').length/Math.max(1,at.length)).toFixed(0),'nearHP',avg(at,r=>r.nearHp).toFixed(2));
}
// print sample later/soon attackU
console.log('samples attackU not ready:');
console.log(t.filter(r=>r.delta>0.1&&r.kind==='attackU').slice(0,15).map(r=>`t? ${r.id} d${r.d} del${r.delta} own${r.ownHp.toFixed(2)} near ${r.nearType} hp${r.nearHp.toFixed(2)} tgt ${r.tgt} both${r.both}`).join('\n'));
console.log('samples move:');
console.log(t.filter(r=>r.kind==='move').slice(0,10).map(r=>`d${r.d} del${r.delta} own${r.ownHp.toFixed(2)} near ${r.nearType} hp${r.nearHp.toFixed(2)} both${r.both}`).join('\n'));
