const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const ids=['history-run-20261015-010803-r1-g1','history-run-20261015-010803-r1-g2','history-run-20261015-010803-r2-g1','history-run-20261015-010803-r2-g2','history-run-20261015-010803-r3-g1','history-run-20261015-010803-r3-g2','r1-g1','r1-g2'];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const rows=[];
for(const id of ids){
 const g=j.find(x=>x.id===id); const S=g.seats.indexOf('sol'),E=1-S;
 const fbt=new Map(g.frames.map(f=>[f.tick,f]));
 for(const d of g.decisions){
  const f=fbt.get(d.tick); if(!f) continue;
  const su=f.units.filter(u=>u.owner===S), eu=f.units.filter(u=>u.owner===E);
  for(const c of d.commands[S]){
    if(c.type==='move'||c.type==='attackMove'){
      const us=(c.units||[]).map(id=>su.find(u=>u.id===id)).filter(Boolean);
      for(const u of us){
        const near=eu.filter(v=>v.type!=='worker').sort((a,b)=>dist(u,a)-dist(u,b))[0];
        const home=f.bases[S];
        const cn=Math.hypot(c.x-u.x,c.y-u.y);
        const toEnemy=near?{x:near.x-u.x,y:near.y-u.y}:null;
        const toTarget={x:c.x-u.x,y:c.y-u.y};
        let cosang=null;
        if(near&&cn>1){cosang=(toEnemy.x*toTarget.x+toEnemy.y*toTarget.y)/(Math.hypot(toEnemy.x,toEnemy.y)*cn);}
        rows.push({id,t:Math.round(d.now),type:c.type,uid:u.id,hp:Math.round(u.hp),frac:+(u.hp/u.maxHp).toFixed(2),dEn:near?Math.round(dist(u,near)):null,dT:Math.round(cn),cos:cosang===null?null:+cosang.toFixed(2),ord:u.order.type,tx:Math.round(c.x),ty:Math.round(c.y),ex:near?Math.round(near.x):null,ey:near?Math.round(near.y):null});
      }
    }
  }
 }
}
// summarize moves: distance traveled vs fraction hp
const mv=rows.filter(r=>r.type==='move');
const am=rows.filter(r=>r.type==='attackMove');
console.log('move cmds',mv.length,'attackMove',am.length);
const bucket=(rs)=>{const b={};for(const r of rs){const k=r.frac<.25?'<25%':r.frac<.5?'25-50%':r.frac<.75?'50-75%':r.frac<1?'75-100%':'full';(b[k]=b[k]||[]).push(r);} for(const k in b){const a=b[k];console.log(k,a.length,'avgLen',(a.reduce((s,r)=>s+r.dT,0)/a.length).toFixed(0),'avg dEn',(a.reduce((s,r)=>s+(r.dEn||0),0)/a.length).toFixed(0),'avgCos',(a.reduce((s,r)=>s+(r.cos||0),0)/a.length).toFixed(2));}};
console.log('--- MOVE by hp frac');bucket(mv);
console.log('--- ATTACKMOVE by hp frac');bucket(am);
console.log('--- sample moves');
for(const r of mv.slice(0,40)) console.log(JSON.stringify(r));
