'use strict';
const zlib=require('zlib'),fs=require('fs');
const f=process.argv[2];
const j=JSON.parse(zlib.gunzipSync(fs.readFileSync(f)));
const seats=j.seats;
function owner(x){return x===0?seats[0]:x===1?seats[1]:'neutral';}
const per=Math.max(1,Math.round(5/0.25)); // print every 5s
console.log('id',j.id,'seats',seats,'winner',j.winner,'dur',j.duration);
let last=null;
for(let i=0;i<j.frames.length;i+=20){
  const fr=j.frames[i];
  if(!fr) continue;
  const ps=fr.players.map(p=>{
    const units=fr.units.filter(u=>u.owner===p.id);
    const by={};
    for(const u of units)by[u.type]=(by[u.type]||0)+1;
    const blds=fr.buildings.filter(b=>b.owner===p.id);
    const bstr=blds.map(b=>b.type+':'+(b.complete?Math.round(b.hp):'WIP'+Math.round(b.progress*100)));
    return `${p.name.slice(0,10)} g${Math.round(p.gold)} w${Math.round(p.wood)} pop${p.population}/${p.popCap} | `+Object.entries(by).map(([k,v])=>k+'x'+v).join(',')+' | '+bstr.join(' ');
  });
  // positions
  const mine=fr.units.filter(u=>u.owner===0&&u.type!=='worker');
  const avg=(arr)=>arr.length?[Math.round(arr.reduce((s,u)=>s+u.x,0)/arr.length),Math.round(arr.reduce((s,u)=>s+u.y,0)/arr.length)]:[0,0];
  const a0=avg(mine);
  const e1=fr.units.filter(u=>u.owner===1&&u.type!=='worker');
  const a1=avg(e1);
  console.log(`t=${fr.now.toFixed(1)} A0@${a0} A1@${a1}`);
  ps.forEach(s=>console.log('   '+s));
}
