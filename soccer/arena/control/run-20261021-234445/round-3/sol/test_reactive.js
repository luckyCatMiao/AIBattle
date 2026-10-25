'use strict';
const sim=require('./simulation'),agent=require('./agent');
const results=[];
for(const n of [1,2,3,4,5,6])for(const team of [0,1]) {
 const g=sim.createMatch({players:[{name:'window',kind:'api'},{name:'reactive',kind:'api'}],seed:41+n,teamSize:n});
 let maxMs=0;
 while(g.status==='playing') {
  const start=performance.now(),frames=agent.decide(sim.view(g,team)).inputs;maxMs=Math.max(maxMs,performance.now()-start);
  sim.submitWindow(g,team,frames);
  for(let f=0;f<20&&g.status==='playing';f++){
   const other=agent.policy(g,1-team);
   for(const u of g.units)u.held=(u.team===team?frames[f]:other)[u.index];
   sim.step(g);
  }
 }
 const r={n,team,score:g.score,ours:g.score[team],theirs:g.score[1-team],fouls:g.stats[team].fouls,maxMs};results.push(r);console.log(JSON.stringify(r));
}
require('fs').writeFileSync('/workspace/reactive_results.json',JSON.stringify(results,null,2));
