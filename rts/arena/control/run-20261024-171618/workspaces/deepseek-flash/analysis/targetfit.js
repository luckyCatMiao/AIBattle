const fs=require('fs');const a=JSON.parse(fs.readFileSync('../public_replays.json','utf8'));
const dist=(u,v)=>Math.hypot(u.x-v.x,u.y-v.y);
let rows=[];
for(const id of ['r1-g1','r1-g2','r2-g1','r2-g2']){
 const g=a.find(x=>x.id===id);const ss=g.seats.indexOf('sol'), me=1-ss;
 for(const d of g.decisions){
  const f=g.frames.find(x=>x.tick===d.tick); if(!f) continue;
  const my=f.units.filter(u=>u.owner===ss&&u.type!=='worker');
  const foes=f.units.filter(u=>u.owner===me);
  const combat=foes.filter(u=>u.type!=='worker');
  const ebase=f.bases.find(b=>b.owner===me);
  for(const c of (d.commands[ss]||[])){
   if(c.type!=='attack'||!c.target) continue;
   for(const uid of c.units){
    const u=my.find(x=>x.id===uid); if(!u) continue;
    const tgt=foes.find(v=>v.id===c.target);
    if(tgt){
      const byNearAll=foes.slice().sort((p,q)=>dist(u,p)-dist(u,q));
      const byNearCombat=combat.slice().sort((p,q)=>dist(u,p)-dist(u,q));
      rows.push({id,type:u.type,t:d.now,tType:tgt.type,tHp:tgt.hp,tMax:tgt.maxHp,d:dist(u,tgt),
        rankAll:byNearAll.findIndex(v=>v.id===tgt.id),rankCombat:byNearCombat.findIndex(v=>v.id===tgt.id),
        ebaseD:dist(u,ebase), nt:byNearCombat.length});
    } else if(c.target===ebase.id){
      rows.push({id,type:u.type,t:d.now,tType:'base',d:dist(u,ebase)});
    }
   }
  }
 }
}
const tgt=rows.filter(r=>r.tType!=='base');
console.log('n unit attacks',tgt.length,'by target type',JSON.stringify(tgt.reduce((m,r)=>(m[r.tType]=(m[r.tType]||0)+1,m),{})));
for(const ty of ['tank','rifle']){
 const rr=tgt.filter(r=>r.type===ty);
 console.log(ty,'rankCombat0',rr.filter(r=>r.rankCombat===0).length,'rankCombat<=1',rr.filter(r=>r.rankCombat<=1).length,'n',rr.length,'avgD',(rr.reduce((s,r)=>s+r.d,0)/rr.length).toFixed(0));
}
// hp preference: is target the lowest hp among in-range combat?
let low=0,tot=0;
for(const r of tgt){ tot++; if(r.tHp<=0.5*r.tMax) low++; }
console.log('targets at <=50% hp:',low+'/'+tot);
const bases=rows.filter(r=>r.tType==='base');
console.log('base attacks',bases.length,'dist to base: min',Math.min(...bases.map(r=>r.d)).toFixed(0),'max',Math.max(...bases.map(r=>r.d)).toFixed(0),'p50',bases.map(r=>r.d).sort((a,b)=>a-b)[Math.floor(bases.length/2)].toFixed(0));
