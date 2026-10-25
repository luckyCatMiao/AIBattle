'use strict';
const fs=require('fs');
const sim=require('./simulation');
const {plan}=require('./agent_core');
const args=process.argv.slice(2), count=Number(args[0]||10), base=Number(args[1]||100);
const results=[];let totalMs=0,calls=0,maxMs=0;
for(let i=0;i<count;i++) {
 const me=i%2, mode=['jump','run','push','react'][i%4];
 const g=sim.createMatch({seed:base+i,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
 let windows=0;
 while(g.status==='playing' && g.round===1 && windows<370) {
  const o=sim.view(g,me), t=performance.now();
  const actions=plan(o);const ms=performance.now()-t;totalMs+=ms;maxMs=Math.max(ms,maxMs);calls++;
  let enemy=[];
  // Adversary recomputes all five frames from public physics each time.
  for(let k=0;k<5;k++) {
   const p=g.runners[1-me], q=g.runners[me];
   let jump=mode==='jump'; let move=1;
   if(mode==='react'||mode==='push') {
    jump=p.onGround&&(sim.solidWorld(g,p.x+.9,p.y+.4)||!sim.solidWorld(g,p.x+1.2,p.y-.2)||g.monsters.some(m=>Math.abs(m.x-p.x)<2));
    if(mode==='push' && p.x>q.x && p.x-q.x<1.8 && p.x>11) move=0;
   }
   g.runners[me].held=actions[k];g.runners[1-me].held={move,jump}; sim.step(g);
   if(g.round!==1||g.status!=='playing') break;
  }
  windows++;
 }
 const r={seed:base+i,me,mode,windows,round:g.round,wins:g.wins,deaths:g.runners[me].deaths,x:g.runners[me].x,maxX:g.runners[me].maxX,events:g.events.filter(e=>e.type==='respawn'||e.type==='round')};
 results.push(r);console.log(JSON.stringify(r));
}
const summary={calls,meanMs:totalMs/calls,maxMs,results};
fs.writeFileSync(`selftest_${base}.json`,JSON.stringify(summary,null,2));
console.log('TIMING',totalMs/calls,maxMs);
