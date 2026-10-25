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
    const near=foes.slice().sort((p,q)=>dist(u,p)-dist(u,q))[0];
    const cs=(d.commands[ss]||[]).filter(c=>c.units&&c.units.includes(u.id));
    let kind='none';
    if(cs.some(c=>c.type==='move'))kind='move';
    else if(cs.some(c=>c.type==='attack'&&c.target&&c.target[0]==='u'))kind='attackU';
    else if(cs.some(c=>c.type==='attack'))kind='attackBase';
    else if(cs.some(c=>c.type==='attackMove'))kind='AM';
    else if(cs.some(c=>c.type==='stop'))kind='stop';
    rows.push({type:u.type,delta:u.fireAt-d.now,d:near?dist(u,near):999,kind,dbase:ebase?dist(u,ebase):999});
  }
 }
}
const t=rows.filter(r=>r.type==='tank');
for(const dr of [[-99,0.1],[0.1,99]])for(const dd of [[-1,180],[180,186],[186,192],[192,210],[210,999]]){
 const rr=t.filter(r=>r.delta>dr[0]&&r.delta<=dr[1]&&r.d>dd[0]&&r.d<=dd[1]);
 const cnt={};for(const r of rr)cnt[r.kind]=(cnt[r.kind]||0)+1;
 console.log('delta',dr.join('..'),'d',dd.join('..'),'n='+rr.length,JSON.stringify(cnt));
}
console.log('--- base proximity for attackBase ---');
const ab=t.filter(r=>r.kind==='attackBase');
console.log('dbase min',Math.min(...ab.map(r=>r.dbase)).toFixed(0),'max',Math.max(...ab.map(r=>r.dbase)).toFixed(0));
console.log('--- move rows d 186.. with kind, dbase ---');
console.log(t.filter(r=>r.kind==='move'&&r.d>210).slice(0,10).map(r=>`d${r.d.toFixed(0)} delta${r.delta.toFixed(2)} db${r.dbase.toFixed(0)}`).join(' | '));
