const fs=require('fs');
const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const id=process.argv[2]||'r2-g1';
const g=a.find(x=>x.id===id);
const me=g.seats.indexOf('deepseek-flash'), sol=g.seats.indexOf('sol');
console.log('id',id,'me',me,'sol',sol,'winner',g.winner);
// frames every 5s: counts, hp, credits, level, nodes
for(const f of g.frames){
  const t=f.now;
  if(Math.abs(t-Math.round(t))>0.06) continue;
  if(Math.round(t)%5!==0) continue;
  const cnt=(p,ty)=>f.units.filter(u=>u.owner===p&&u.type===ty&&u.hp>0).length;
  const hp=(p)=>Math.round(f.units.filter(u=>u.owner===p).reduce((s,u)=>s+u.hp,0));
  const fmt=p=>`${cnt(p,'worker')}w ${cnt(p,'rifle')}r ${cnt(p,'tank')}t ${cnt(p,'raider')}a hp${hp(p)} c${f.players[p].credits} L${f.players[p].level}`;
  const nodes=f.nodes.map(n=>n.owner===null?'.':(n.owner===me?'M':'S')).join('');
  console.log(String(Math.round(t)).padStart(3),'ME['+fmt(me)+']','SOL['+fmt(sol)+']','nodes',nodes,'base',Math.round(f.bases[me].hp)+'/'+Math.round(f.bases[sol].hp));
}
