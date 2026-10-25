const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const dist=(u,v)=>Math.hypot(u.x-v.x,u.y-v.y);
let rows=[];
for(const id of ['r1-g1','r1-g2','r2-g1','r2-g2']){
 const g=a.find(x=>x.id===id);const ss=g.seats.indexOf('sol'), me=1-ss;
 for(const d of g.decisions){
  const f=g.frames.find(x=>x.tick===d.tick); if(!f) continue;
  const my=f.units.filter(u=>u.owner===ss&&u.type!=='worker');
  const foes=f.units.filter(u=>u.owner===me&&u.type!=='worker');
  const ebase=f.bases.find(b=>b.owner===me);
  for(const u of my){
    const fs2=foes.filter(v=>dist(u,v)<400).sort((p,q)=>dist(u,p)-dist(u,q));
    const near=fs2[0];
    const cs=(d.commands[ss]||[]).filter(c=>c.units&&c.units.includes(u.id));
    // classify
    let kind='none';
    if(cs.some(c=>c.type==='move'))kind='move';
    else if(cs.some(c=>c.type==='attack'&&c.target&&c.target[0]==='u'))kind='attackU';
    else if(cs.some(c=>c.type==='attack'))kind='attackBase';
    else if(cs.some(c=>c.type==='attackMove'))kind='AM';
    else if(cs.some(c=>c.type==='stop'))kind='stop';
    rows.push({id:u.id,type:u.type,t:d.now,delta:u.fireAt-d.now,d:near?dist(u,near):999,kind,ncmd:cs.length,nearType:near?near.type:null});
  }
 }
}
const kinds=[...new Set(rows.map(r=>r.kind))];console.log('kinds',kinds);
for(const k of kinds){
 const rr=rows.filter(r=>r.kind===k&&r.type==='tank');
 if(!rr.length)continue;
 const ds=rr.map(r=>r.d).sort((a,b)=>a-b), dl=rr.map(r=>r.delta).sort((a,b)=>a-b);
 const q=(v,p)=>v[Math.min(v.length-1,Math.floor(p*v.length))];
 console.log(k.padEnd(10),'n',rr.length,'d: min',q(ds,0).toFixed(0),'p10',q(ds,.1).toFixed(0),'p50',q(ds,.5).toFixed(0),'p90',q(ds,.9).toFixed(0),'max',q(ds,1).toFixed(0),'| delta: min',q(dl,0).toFixed(2),'p10',q(dl,.1).toFixed(2),'p50',q(dl,.5).toFixed(2),'p90',q(dl,.9).toFixed(2),'max',q(dl,1).toFixed(2));
}
// cross tab: bucket by delta<=0.1 vs > and distance<=186/210
for(const dr of [[-99,0.1],[0.1,99]])for(const dd of [[-1,186],[186,210],[210,999]]){
 const rr=rows.filter(r=>r.type==='tank'&&r.delta>dr[0]&&r.delta<=dr[1]&&r.d>dd[0]&&r.d<=dd[1]);
 const cnt={};for(const r of rr)cnt[r.kind]=(cnt[r.kind]||0)+1;
 console.log('delta',dr.join('..'),'dist',dd.join('..'),'n='+rr.length,JSON.stringify(cnt));
}
