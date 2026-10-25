'use strict';
const sim=require('./simulation'), current=require('./agent'),old=require('./agent_v2');
const fs=require('fs');
function run(n,team,type,seed){
 const g=sim.createMatch({players:[{name:'new',kind:'api'},{name:type,kind:'api'}],seed,teamSize:n});
 let windows=0,maxMs=0,ms=0;
 while(g.status==='playing'){
  const start=performance.now(),a=current.decide(sim.view(g,team)).inputs;
  const elapsed=performance.now()-start;maxMs=Math.max(maxMs,elapsed);ms+=elapsed;
  let b;
  if(type==='old')b=old.decide(sim.view(g,1-team)).inputs;
  else if(type==='mirror')b=current.decide(sim.view(g,1-team)).inputs;
  else b=null;
  sim.submitWindow(g,team,a);if(b)sim.submitWindow(g,1-team,b);
  for(let f=0;f<20&&g.status==='playing';f++){
   const enemy=b?b[f]:(type==='reactive-old'?old:current).policy(g,1-team);
   for(const u of g.units)u.held=(u.team===team?a[f]:enemy)[u.index];
   sim.step(g);
  }
  windows++;
 }
 return {n,team,type,seed,score:g.score,ours:g.score[team],theirs:g.score[1-team],fouls:g.stats[team].fouls,enemyFouls:g.stats[1-team].fouls,possession:g.stats.map(s=>s.possession),kicks:g.stats.map(s=>s.kicks),saves:[0,1].map(t=>g.events.filter(e=>e.type==='save'&&e.team===t).length),maxMs,meanMs:ms/windows};
}
if(require.main===module){
 const sizes=(process.argv[2]||'1,2,3,4,5,6').split(',').map(Number),types=(process.argv[3]||'old,reactive-old').split(','),out=[];
 for(const n of sizes)for(const type of types)for(const team of [0,1]){
  const r=run(n,team,type,71+n);out.push(r);console.log(JSON.stringify(r));
 }
 fs.writeFileSync('/workspace/round3_tests.json',JSON.stringify(out,null,2));
}
module.exports={run};
