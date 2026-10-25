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
    rows.push({id,kind,delta:u.fireAt-d.now,nearType:near.type,ownHp:u.hp/u.maxHp});
  }
 }
}
const bins=[[-1,0.11],[0.11,0.95],[0.95,1.05],[1.05,1.95],[1.95,3]];
for(const b of bins){
 const rr=rows.filter(r=>r.delta>b[0]&&r.delta<=b[1]);
 const cnt={};for(const r of rr)cnt[r.kind]=(cnt[r.kind]||0)+1;
 console.log('delta',b.join('..'),'n',rr.length,JSON.stringify(cnt),'move%',rr.length?(100*(cnt.move||0)/rr.length).toFixed(0):0);
}
// near type breakdown for delta 0.11-0.95
for(const nt of ['tank','rifle','worker']){
 const rr=rows.filter(r=>r.delta>0.11&&r.delta<=0.95&&r.nearType===nt);
 const cnt={};for(const r of rr)cnt[r.kind]=(cnt[r.kind]||0)+1;
 console.log('mid-delta near',nt,'n',rr.length,JSON.stringify(cnt));
}
