const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const dist=(p,q)=>Math.hypot(p.x-q.x,p.y-q.y);
for(const id of ['r1-g1','r1-g2','r2-g1','r2-g2']){
 const g=a.find(x=>x.id===id);const ss=g.seats.indexOf('sol'), me=1-ss;
 console.log('====',id);
 let out=[];
 for(const d of g.decisions){
  const f=g.frames.find(x=>x.tick===d.tick); if(!f) continue;
  const myU=f.units.filter(u=>u.owner===ss&&u.type!=='worker');
  const ebase=f.bases.find(b=>b.owner===me);
  const pts=f.nodes.map(n=>({id:n.id,x:n.x,y:n.y,own:n.owner})).concat([{id:'EB',x:ebase.x,y:ebase.y,own:me}]);
  for(const c of (d.commands[ss]||[])){
   if(c.type!=='attackMove'||!c.units)continue;
   const u=myU.find(x=>c.units.includes(x.id)); if(!u)continue;
   const sorted=pts.slice().sort((p,q)=>dist(c,p)-dist(c,q));
   const owners=f.nodes.map(n=>n.owner===null?'.':(n.owner===ss?'S':'M')).join('');
   out.push(`${d.now.toFixed(0)}:${sorted[0].id}${sorted[0].own===me?'E':sorted[0].own===null?'N':'S'}d${dist(c,sorted[0]).toFixed(0)} own[${owners}]`);
  }
 }
 // dedupe consecutive same seconds
 console.log(out.filter((x,i,arr)=>true).slice(0,120).join('  '));
}
