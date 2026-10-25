const fs=require('fs');
const j=JSON.parse(fs.readFileSync('public_replays.json','utf8'));
const ids=['history-run-20261015-010803-r3-g1','r1-g1','r1-g2'];
const dist=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
let rows=[];
for(const id of ids){
 const g=j.find(x=>x.id===id); const S=g.seats.indexOf('sol'),E=1-S;
 const fbt=new Map(g.frames.map(f=>[f.tick,f]));
 for(const d of g.decisions){
  const f=fbt.get(d.tick); if(!f) continue;
  const su=f.units.filter(u=>u.owner===S), eu=f.units.filter(u=>u.owner===E);
  const inCmd=new Map();
  for(const c of d.commands[S]) if(c.units) for(const uid of c.units) inCmd.set(uid,c);
  for(const u of su){
    const c=inCmd.get(u.id); if(!c||c.type!=='move') continue;
    const foes=eu.filter(v=>v.type!=='worker'&&v.hp>0);
    const near=foes.slice().sort((a,b)=>dist(u,a)-dist(u,b))[0];
    const cent=foes.reduce((s,v)=>({x:s.x+v.x/foes.length,y:s.y+v.y/foes.length}),{x:0,y:0});
    const mv={x:c.x-u.x,y:c.y-u.y}; const L=Math.hypot(mv.x,mv.y);
    const ang=(v)=>{const a={x:v.x-u.x,y:v.y-u.y};const l=Math.hypot(a.x,a.y);return l<1?0:(a.x*mv.x+a.y*mv.y)/(l*L);}
    // enemy that is targeting u?
    const chase=foes.filter(v=>v.order&&v.order.type==='attack'&&v.order.target===u.id);
    const ch=chase.length?chase.sort((a,b)=>dist(u,a)-dist(u,b))[0]:null;
    // nearest threat = enemy nearest to u among those within 300
    rows.push({id,t:Math.round(d.now),uid:u.id,L:+L.toFixed(1),
      cosNear:+ang(near).toFixed(2), cosCent:+ang(cent).toFixed(2), cosCh:ch?+ang(ch).toFixed(2):null,
      dEn:Math.round(dist(u,near)), hp:+(u.hp/u.maxHp).toFixed(2), ord:u.order.type, tgt:u.order.target||'',
      nfoes:foes.length, x:Math.round(u.x),y:Math.round(u.y),tx:Math.round(c.x),ty:Math.round(c.y)});
  }
 }
}
console.log('n',rows.length);
const hist=(k)=>{const h={};for(const r of rows){const v=Math.round(r[k]*10)/10;h[v]=(h[v]||0)+1}return h};
console.log('len dist:',hist('L'));
console.log('cosNear hist:',JSON.stringify(hist('cosNear')));
console.log('cosCent hist:',JSON.stringify(hist('cosCent')));
console.log('cosCh hist:',JSON.stringify(hist('cosCh')));
console.log('prior order:',JSON.stringify(rows.reduce((h,r)=>(h[r.ord]=(h[r.ord]||0)+1,h),{})));
console.log('avg dEn',(rows.reduce((s,r)=>s+r.dEn,0)/rows.length).toFixed(0),'hp dist',JSON.stringify(hist('hp')));
console.log('sample:');
for(const r of rows.slice(0,15)) console.log(JSON.stringify(r));
