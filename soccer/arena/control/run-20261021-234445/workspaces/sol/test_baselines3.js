'use strict';
const sim=require('./simulation'),agent=require('./agent'),fs=require('fs');
function baseline(g,t,type){
 const own=g.units.filter(u=>u.team===t),b=g.ball;
 let chaser=own.filter(u=>own.length===1||u.index!==0).sort((a,c)=>Math.hypot(a.x-b.x,a.y-b.y)-Math.hypot(c.x-b.x,c.y-b.y))[0];
 return own.map(u=>{
  let x=b.x,y=b.y;
  if(own.length>1&&u.index===0){x=t?38:6;y=Math.max(10.5,Math.min(15.5,b.y));}
  else if(type==='spread'&&u!==chaser&&b.owner!==u.id){x=t?18:26;y=5+u.index*3;}
  if(b.owner===u.id){x=t?10.6:33.4;y=type==='corners'?(u.y<13?9:17):13;}
  if((t===0&&x>33.5||t===1&&x<10.5)&&y>=6&&y<=20)x=t?10.5:33.5;
  const dx=x-u.x,dy=y-u.y;
  const dir=(Math.abs(dy)>.13?(dy>0?'D':'U'):'')+(Math.abs(dx)>.13?(dx>0?'R':'L'):'');
  const gy=type==='corners'?(u.y<13?15.3:10.7):13;
  return {dir:dir||'N',aim:(Math.atan2(gy-u.y,(t?1:43)-u.x)*180/Math.PI+360)%360,kick:b.owner===u.id&&(t?44-u.x:u.x)>25};
 });
}
const out=[];
for(const n of [1,2,3,4,5,6])for(const type of ['corners','spread'])for(const team of [0,1]){
 const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:103+n,teamSize:n});
 let maxMs=0;
 while(g.status==='playing'){
  const start=performance.now(),a=agent.decide(sim.view(g,team)).inputs;maxMs=Math.max(maxMs,performance.now()-start);sim.submitWindow(g,team,a);
  for(let f=0;f<20&&g.status==='playing';f++){
   const b=baseline(g,1-team,type);
   for(const u of g.units)u.held=(u.team===team?a[f]:b)[u.index];sim.step(g);
  }
 }
 const r={n,type,team,ours:g.score[team],theirs:g.score[1-team],fouls:g.stats[team].fouls,maxMs};out.push(r);console.log(JSON.stringify(r));
}
fs.writeFileSync('/workspace/round3_baselines.json',JSON.stringify(out,null,2));
