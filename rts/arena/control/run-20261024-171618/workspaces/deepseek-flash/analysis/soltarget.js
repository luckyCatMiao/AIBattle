const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const ids=['history-run-20261015-010803-r1-g1','history-run-20261015-010803-r1-g2','history-run-20261015-010803-r2-g1','history-run-20261015-010803-r2-g2','history-run-20261015-010803-r3-g1','history-run-20261015-010803-r3-g2','r1-g1','r1-g2'];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let stats={n:0,nearest:0,lowhp:0,lowhpEff:0,maxval:0,lowestRatio:0,base:0};
let rows=[];
for(const id of ids){
 const g=j.find(x=>x.id===id); const S=g.seats.indexOf('sol'),E=1-S;
 const fbt=new Map(g.frames.map(f=>[f.tick,f]));
 for(const d of g.decisions){
  const f=fbt.get(d.tick); if(!f) continue;
  const su=f.units.filter(u=>u.owner===S&&u.type!=='worker'), eu=f.units.filter(u=>u.owner===E&&u.hp>0);
  for(const c of d.commands[S]){
    if(c.type!=='attack'||!c.units) continue;
    for(const uid of c.units){
      const u=su.find(x=>x.id===uid); if(!u) continue;
      const tgu=eu.find(x=>x.id===c.target);
      if(!tgu){stats.base++;continue;}
      const foes=eu.filter(v=>v.type!=='worker'||true).sort((a,b)=>dist(u,a)-dist(u,b));
      const cands=eu.slice().sort((a,b)=>dist(u,a)-dist(u,b));
      stats.n++;
      if(cands[0]&&cands[0].id===c.target) stats.nearest++;
      const low=eu.slice().sort((a,b)=>a.hp-b.hp)[0];
      if(low&&low.id===c.target)stats.lowhp++;
      const loweff=eu.slice().sort((a,b)=>(a.hp+a.maxHp*0.0)-(b.hp))[0];
      const val={rifle:16.25, tank:20, raider:24.6, worker:0};
      const maxv=eu.slice().sort((a,b)=>(val[b.type]||0)*(b.hp/b.maxHp)-(val[a.type]||0)*(a.hp/a.maxHp))[0];
      if(maxv&&maxv.id===c.target)stats.maxval++;
      const lr=eu.slice().sort((a,b)=>a.hp/a.maxHp-b.hp/b.maxHp)[0];
      if(lr&&lr.id===c.target)stats.lowestRatio++;
      rows.push({id,t:Math.round(d.now),uid,target:c.target,dEn:Math.round(dist(u,tgu)),dNear:Math.round(dist(u,cands[0])),tghp:Math.round(tgu.hp),nearestId:cands[0].id,lowId:low?low.id:null});
    }
  }
 }
}
console.log(stats,'n%',stats.n);
console.log('nearest',(stats.nearest/stats.n*100).toFixed(1),'lowhp',(stats.lowhp/stats.n*100).toFixed(1),'lowestRatio',(stats.lowestRatio/stats.n*100).toFixed(1),'maxval',(stats.maxval/stats.n*100).toFixed(1));
console.log('base attacks',stats.base);
console.log('avg dEn',(rows.reduce((s,r)=>s+r.dEn,0)/rows.length).toFixed(1),'avg dNear',(rows.reduce((s,r)=>s+r.dNear,0)/rows.length).toFixed(1));
// distance histogram for attacks
const h={};for(const r of rows){const b=Math.min(200,Math.round(r.dEn/10)*10);h[b]=(h[b]||0)+1}console.log('dEn hist',JSON.stringify(h));
