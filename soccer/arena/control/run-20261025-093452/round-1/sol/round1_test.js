'use strict';
const sim=require('./simulation'),cur=require('./agent'),old=require('./agent_r1'),before=require('./agent_before_r1'),{baseline}=require('./test');
function window(g,team,mode){
 if(mode==='old')return old.decide(sim.view(g,team)).inputs;
 if(mode==='before')return before.decide(sim.view(g,team)).inputs;
 const p=cur.restore(sim.view(g,team)),out=[];
 for(let f=0;f<20;f++){
  const acts=[0,1].map(t=>baseline(p,t,mode));out.push(acts[team]);
  for(const u of p.units)u.held=acts[u.team][u.index];sim.step(p);
 }
 return out;
}
function run(n,seat,mode,seed){
 const g=sim.createMatch({teamSize:n,seed,players:[{name:'submitted',kind:'api'},{name:'local-baseline',kind:'api'}]});
 let maxMs=0,windows=0;
 while(g.status==='playing'){
  const t=performance.now(),a=cur.decide(sim.view(g,seat)).inputs;maxMs=Math.max(maxMs,performance.now()-t);windows++;
  sim.submitWindow(g,seat,a);
  if(mode==='oracle'){
   for(let f=0;f<20&&g.status==='playing';f++){
    const b=old.policy(g,1-seat);for(const u of g.units)u.held=(u.team===seat?a[f]:b)[u.index];sim.step(g);
   }
  }else{
   const b=window(g,1-seat,mode);sim.submitWindow(g,1-seat,b);const w=[];w[seat]=a;w[1-seat]=b;sim.advanceWindow(g,w);
  }
 }
 return {n,seat,mode,seed,score:g.score,result:g.winner===null?'draw':g.winner===seat?'win':'loss',fouls:g.stats.map(s=>s.fouls),maxMs:+maxMs.toFixed(2),windows};
}
for(const mode of (process.argv[2]||'old,before,swarm,corners,oracle').split(','))for(let n=1;n<=6;n++)for(let seat=0;seat<2;seat++)for(let r=0;r<+(process.argv[3]||1);r++)console.log(JSON.stringify(run(n,seat,mode,7100+n*10+r)));
