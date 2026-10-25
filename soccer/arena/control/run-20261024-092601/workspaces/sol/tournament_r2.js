'use strict';
const sim = require('./simulation');
const old = require('./agent_r1');
const cur = require('./agent');
const { baseline } = require('./test');
const fs = require('fs');
function opponent(g, team, mode) {
  if (mode === 'r1' || mode === 'oracle') return old.policy(g,team);
  return baseline(g,team,mode);
}
function enemyWindow(g, team, mode) {
  if (mode === 'r1') return old.decide(sim.view(g,team)).inputs;
  const p=old.restore(sim.view(g,team)), out=[];
  for(let f=0;f<20;f++) {
    const a=opponent(p,team,mode), b=opponent(p,1-team,mode);out.push(a);
    for(const u of p.units)u.held=(u.team===team?a:b)[u.index];sim.step(p);
  }
  return out;
}
function run(n,seat,mode,seed) {
 const g=sim.createMatch({teamSize:n,seed,players:[{name:'new',kind:'api'},{name:'test',kind:'api'}]});
 let maxMs=0,windows=0;
 while(g.status==='playing') {
   const start=performance.now(), a=cur.decide(sim.view(g,seat)).inputs;maxMs=Math.max(maxMs,performance.now()-start);windows++;
   sim.submitWindow(g,seat,a);
   if(mode==='oracle') {
     for(let f=0;f<20&&g.status==='playing';f++) {const b=opponent(g,1-seat,mode);for(const u of g.units)u.held=(u.team===seat?a[f]:b)[u.index];sim.step(g);}
   } else {const w=[];w[seat]=a;w[1-seat]=enemyWindow(g,1-seat,mode);sim.submitWindow(g,1-seat,w[1-seat]);sim.advanceWindow(g,w);}
 }
 return {n,seat,mode,seed,score:g.score,win:g.winner===null?'draw':g.winner===seat?'win':'loss',fouls:g.stats.map(s=>s.fouls),kicks:g.stats.map(s=>s.kicks),maxMs:+maxMs.toFixed(2),windows};
}
if(require.main===module){const modes=(process.argv[2]||'r1,swarm,corners,oracle').split(','), repeats=+(process.argv[3]||1);for(const mode of modes)for(let n=1;n<=6;n++)for(let seat=0;seat<2;seat++)for(let r=0;r<repeats;r++)console.log(JSON.stringify(run(n,seat,mode,5000+n*10+r)));}
module.exports={run};
