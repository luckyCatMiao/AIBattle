const R=require('../rules.js');
// Controlled micro test: N units of type A vs M units of type B, facing off at distance D.
function mk(){const m=R.createMatch({id:'m',players:[{name:'a'},{name:'b'}],seed:1});R.command(m,0,{type:'start'});return m;}
function clear(m){m.units=m.units.filter(u=>u.owner===undefined);}
function fight(nA,typeA,nB,typeB,D,orderA,orderB,maxT){
  const m=mk();
  // remove all initial units, give credits irrelevant
  m.units=[];
  const cx=640,cy=420;
  for(let i=0;i<nA;i++)R.spawn(m,0,typeA,cx-D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  for(let i=0;i<nB;i++)R.spawn(m,1,typeB,cx+D/2+((i%3)-1)*26,cy+Math.floor(i/3)*26);
  const ids=o=>m.units.filter(u=>u.owner===o&&u.hp>0).map(u=>u.id);
  let t=0;
  while(m.status!=='playing'||m.now<maxT){
    const au=ids(0),bu=ids(1);
    if(!au.length||!bu.length)break;
    if(t%1===0){
      if(orderA==='attack'){const tgt=m.units.filter(u=>u.owner===1&&u.hp>0).sort((a,b)=>Math.hypot(a.x-cx,a.y-cy)-Math.hypot(b.x-cx,b.y-cy))[0];if(tgt)try{R.command(m,0,{type:'attack',units:au,target:tgt.id})}catch(e){}}
      else if(orderA==='stop'){try{R.command(m,0,{type:'stop',units:au})}catch(e){}}
      else {const tgt=m.units.filter(u=>u.owner===1&&u.hp>0)[0];if(tgt)try{R.command(m,0,{type:'attackMove',units:au,x:tgt.x,y:tgt.y})}catch(e){}}
      if(orderB==='attack'){const tgt=m.units.filter(u=>u.owner===0&&u.hp>0)[0];if(tgt)try{R.command(m,1,{type:'attack',units:bu,target:tgt.id})}catch(e){}}
      else if(orderB==='stop'){try{R.command(m,1,{type:'stop',units:bu})}catch(e){}}
      else {const tgt=m.units.filter(u=>u.owner===0&&u.hp>0)[0];if(tgt)try{R.command(m,1,{type:'attackMove',units:bu,x:tgt.x,y:tgt.y})}catch(e){}}
    }
    for(let k=0;k<20;k++)R.step(m);
    t++;
    if(m.now>maxT)break;
  }
  const a=m.units.filter(u=>u.owner===0), b=m.units.filter(u=>u.owner===1);
  return {t:+m.now.toFixed(1),a:a.length,ahp:Math.round(a.reduce((s,u)=>s+u.hp,0)),b:b.length,bhp:Math.round(b.reduce((s,u)=>s+u.hp,0))};
}
const cases=[[3,4],[4,3],[6,4],[5,4],[4,4],[8,5],[2,2],[1,1]];
for(const [nR,nT] of cases){
  const r=fight(nR,'raider',nT,'tank',260,'attack','attack',90);
  console.log(`${nR} raiders vs ${nT} tanks (both attack): t${r.t} raiders ${r.a} (${r.ahp}hp) vs tanks ${r.b} (${r.bhp}hp)`);
}
