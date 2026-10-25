const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const ids=['history-run-20261015-010803-r1-g1','history-run-20261015-010803-r1-g2','history-run-20261015-010803-r2-g1','history-run-20261015-010803-r2-g2','history-run-20261015-010803-r3-g1','history-run-20261015-010803-r3-g2','r1-g1','r1-g2'];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let moveRows=[],atkRows=[],baseAtk=0;
for(const id of ids){
 const g=j.find(x=>x.id===id); const S=g.seats.indexOf('sol'),E=1-S;
 const fbt=new Map(g.frames.map(f=>[f.tick,f]));
 for(const d of g.decisions){
  const f=fbt.get(d.tick); if(!f) continue;
  const su=f.units.filter(u=>u.owner===S), eu=f.units.filter(u=>u.owner===E);
  const inCmd=new Map();
  for(const c of d.commands[S]) if(c.units) for(const uid of c.units) inCmd.set(uid,c);
  for(const u of su){
    if(u.type==='worker') continue;
    const near=eu.filter(v=>v.type!=='worker'&&v.hp>0).sort((a,b)=>dist(u,a)-dist(u,b));
    const c=inCmd.get(u.id);
    const cdReady = u.fireAt <= d.now + 1e-9;
    if(c&&c.type==='move') moveRows.push({cd:+cdReady, dEn:near[0]?Math.round(dist(u,near[0])):null, hp:+(u.hp/u.maxHp).toFixed(2), ord:u.order.type});
    else if(c&&c.type==='attack') {
      const all=[...eu.filter(v=>v.hp>0), ...f.bases.filter(b=>b.owner!==S&&b.hp>0)];
      const tg=all.find(v=>v.id===c.target);
      if(!tg){baseAtk++;continue;}
      atkRows.push({cd:+cdReady, rank:near.findIndex(v=>v.id===c.target), isbase:tg.type==='base', dEn:Math.round(dist(u,tg)), tghp:+(tg.hp/tg.maxHp).toFixed(2), n:near.length});
    }
  }
 }
}
const pct=(a)=>a.length?(a.filter(x=>x).length/a.length*100).toFixed(1)+'%':'n/a';
console.log('MOVE: n',moveRows.length,'fireReady%',pct(moveRows.map(r=>r.cd)),'avg dEn',(moveRows.reduce((s,r)=>s+r.dEn,0)/moveRows.length).toFixed(0),'avg hp',(moveRows.reduce((s,r)=>s+r.hp,0)/moveRows.length).toFixed(2));
const ordh={};for(const r of moveRows)ordh[r.ord]=(ordh[r.ord]||0)+1;console.log('move prior order',ordh);
console.log('ATTACK: n',atkRows.length,'fireReady%',pct(atkRows.map(r=>r.cd)),'isbase',atkRows.filter(r=>r.isbase).length,'badTarget',baseAtk);
const rankHist={};for(const r of atkRows)rankHist[r.rank]=(rankHist[r.rank]||0)+1;console.log('target rank (0=nearest):',rankHist);
const nb=atkRows.filter(r=>!r.isbase);
console.log('nonbase attack avg dEn',(nb.reduce((s,r)=>s+r.dEn,0)/nb.length).toFixed(1),'avg tghp',(nb.reduce((s,r)=>s+r.tghp,0)/nb.length).toFixed(2));
