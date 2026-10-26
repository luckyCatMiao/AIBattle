'use strict';
const sim=require('./simulation'),agent=require('./agent'),{baseline}=require('./test');
let results=[];
for(let n=1;n<=6;n++)for(let seat=0;seat<2;seat++){
 const g=sim.createMatch({seed:501+n,teamSize:n,players:[{name:'candidate',kind:'api'},{name:'reactive',kind:'api'}]});
 while(g.status==='playing'){
  const a=agent.decide(sim.view(g,seat)).inputs;sim.submitWindow(g,seat,a);
  for(let i=0;i<20&&g.status==='playing';i++){
   const b=agent.policy(g,1-seat);
   for(const u of g.units)u.held=(u.team===seat?a[i]:b)[u.index];sim.step(g);
  }
 }
 const r={n,seat,opponent:'reactive-main-20Hz',score:g.score,win:g.winner===null?'draw':g.winner===seat?'win':'loss',fouls:g.stats.map(s=>s.fouls)};results.push(r);console.log(JSON.stringify(r));
}
// Arbitrary legal positions stress input validity, wall/box movement, and runtime.
let maxMs=0;
for(let k=0;k<120;k++){
 const n=1+k%6,g=sim.createMatch({seed:k+900,teamSize:n,players:[{name:'x',kind:'api'},{name:'y',kind:'api'}]});
 let rnd=()=>{kseed=(1664525*kseed+1013904223)>>>0;return kseed/4294967296;};let kseed=k+12;
 for(const u of g.units){u.x=11+rnd()*22;u.y=1.5+rnd()*23;}
 g.ball={x:1.5+rnd()*41,y:1.5+rnd()*23,vx:(rnd()-.5)*22,vy:(rnd()-.5)*22,owner:null,lastTouch:null,lastTeam:null};
 if(k%3===0){const u=g.units[k%g.units.length];g.ball.owner=u.id;g.ball.x=u.x+.62*u.facing.x;g.ball.y=u.y;}
 let t=performance.now(),a=agent.decide(sim.view(g,k%2));maxMs=Math.max(maxMs,performance.now()-t);sim.submitWindow(g,k%2,a.inputs);
}
console.log(JSON.stringify({stressCases:120,maxMs}));
