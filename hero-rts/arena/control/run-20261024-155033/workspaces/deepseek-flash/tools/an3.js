'use strict';
const fs=require('fs'),zlib=require('zlib');
const f=process.argv[2];const step=parseFloat(process.argv[3]||'5');
const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(f)));
const seats=j.seats;
const us=(fr,o)=>fr.units.filter(u=>u.owner===o);
const cnt=arr=>{const m={};for(const u of arr)m[u.type]=(m[u.type]||0)+1;return Object.entries(m).map(([k,v])=>k+'x'+v).join(',')};
const avg=a=>a.length?{x:Math.round(a.reduce((s,u)=>s+u.x,0)/a.length),y:Math.round(a.reduce((s,u)=>s+u.y,0)/a.length)}:null;
const bld=(fr,o)=>fr.buildings.filter(b=>b.owner===o).map(b=>b.type+':'+(b.complete?Math.round(b.hp):'WIP'+Math.round(b.progress*100)));
console.log('==',j.id,seats,'winner',j.winner,j.duration);
let next=0;
for(const fr of j.frames){
  if(fr.now+1e-9<next)continue;next+=step;
  const parts=[];
  for(const o of [0,1]){
    const p=fr.players[o];const un=us(fr,o);const w=un.filter(u=>u.type==='worker');
    const army=un.filter(u=>u.type!=='worker'&&!u.summoned);
    const th=fr.buildings.find(b=>b.owner===o&&b.type==='townhall');
    const nodes=fr.nodes.filter(n=>n.owner===o).length;
    parts.push(`${seats[o].slice(0,6)}|g${Math.round(p.gold)} w${Math.round(p.wood)} pop${p.population}/${p.popCap} th${th?Math.round(th.hp):'X'} nd${nodes} wk${w.length} ${cnt(army)} @${JSON.stringify(avg(army.filter(u=>u.type!=='worker')))} | ${bld(fr,o).join(' ')}`);
  }
  console.log('t='+fr.now.toFixed(1));parts.forEach(x=>console.log('  '+x));
}
