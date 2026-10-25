'use strict';
const sim=require('./simulation'),agent=require('./agent');
function baseline(g,t,type) {
 const own=g.units.filter(u=>u.team===t),b=g.ball;
 return own.map(u=>{
  let x=b.x,y=b.y;
  if(type==='keeper'&&u.index===0&&own.length>1){x=t?38:6;y=Math.max(10.5,Math.min(15.5,b.y));}
  if((t===0&&x>33.5||t===1&&x<10.5)&&y>=6&&y<=20)x=t?10.5:33.5;
  if(b.owner===u.id){x=t?10.6:33.4;y=13;}
  const dx=x-u.x,dy=y-u.y;
  let dir=(Math.abs(dy)>.12?(dy>0?'D':'U'):'')+(Math.abs(dx)>.12?(dx>0?'R':'L'):'');
  const targetY=type==='corner'?(u.y<13?15.3:10.7):13;
  return {dir:dir||'N',aim:(Math.atan2(targetY-u.y,(t?1:43)-u.x)*180/Math.PI+360)%360,kick:!!b.owner&&(b.owner===u.id)&&((t?44-u.x:u.x)>=(type==='rush'?18:27))};
 });
}
const results=[];let maxMs=0;
const sizes=process.argv[2]?process.argv[2].split(',').map(Number):[1,2,3,4,5,6];
for(const n of sizes)for(const type of ['rush','keeper','corner'])for(const team of [0,1]) {
 const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:19+n,teamSize:n});
 let windows=0,totalMs=0;
 while(g.status==='playing') {
  let start=performance.now();const a=agent.decide(sim.view(g,team)).inputs;let elapsed=performance.now()-start;maxMs=Math.max(maxMs,elapsed);totalMs+=elapsed;
  const clone=agent.fromObservation(sim.view(g,1-team)),bb=[];
  for(let f=0;f<20;f++){
   const acts=baseline(clone,1-team,type);bb.push(acts);
   const other=baseline(clone,team,type);
   for(const u of clone.units)u.held=(u.team===1-team?acts:other)[u.index];
   sim.step(clone);
  }
  sim.submitWindow(g,team,a);sim.submitWindow(g,1-team,bb);
  sim.advanceWindow(g,team===0?[a,bb]:[bb,a]);windows++;
 }
 const r={n,type,team,score:g.score,ours:g.score[team],theirs:g.score[1-team],fouls:g.stats[team].fouls,ms:Math.round(totalMs/windows)};
 results.push(r);console.log(JSON.stringify(r));
}
require('fs').writeFileSync('/workspace/test_results.json',JSON.stringify({results,maxMs},null,2));
