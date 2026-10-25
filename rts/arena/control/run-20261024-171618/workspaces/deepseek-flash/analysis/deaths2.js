const fs=require('fs');
const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const id=process.argv[2]||'r2-g1';
const g=a.find(x=>x.id===id);
const me=g.seats.indexOf('deepseek-flash');
const last={};
const deaths=[];
for(const f of g.frames){
  const seen=new Set();
  for(const u of f.units){seen.add(u.id);last[u.id]={t:f.now,o:u.owner,ty:u.type,x:u.x,y:u.y,hp:u.hp};}
  for(const uid in last){ if(!seen.has(uid)&&last[uid].t<f.now){deaths.push(last[uid]); delete last[uid];} }
}
deaths.sort((a,b)=>a.t-b.t);
for(const d of deaths) console.log(d.t.toFixed(1), d.o===me?'ME ':'SOL', d.ty.padEnd(6), 'at',Math.round(d.x)+','+Math.round(d.y),'hpBefore',Math.round(d.hp));
