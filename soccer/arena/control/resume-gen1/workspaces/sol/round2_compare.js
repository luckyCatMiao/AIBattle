'use strict';
const sim=require('./simulation'),cur=require(process.env.AGENT_MODULE||'./agent'),base=require('./agent_round2_base'),old=require('./agent_r1'),{baseline}=require('./test');
function window(g,team,mode){
 if(mode==='base')return base.decide(sim.view(g,team)).inputs;
 if(mode==='old')return old.decide(sim.view(g,team)).inputs;
 const p=cur.restore(sim.view(g,team)),out=[];
 for(let f=0;f<20;f++){
  const a=[0,1].map(t=>mode==='oracle'?old.policy(p,t):baseline(p,t,mode));out.push(a[team]);
  for(const u of p.units)u.held=a[u.team][u.index];sim.step(p);
 }
 return out;
}
function run(n,seat,mode,seed){
 const g=sim.createMatch({teamSize:n,seed,players:[{name:'candidate',kind:'api'},{name:'own-test',kind:'api'}]});let maxMs=0;
 while(g.status==='playing'){
  let t=performance.now();const a=cur.decide(sim.view(g,seat)).inputs;maxMs=Math.max(maxMs,performance.now()-t);
  sim.submitWindow(g,seat,a);
  if(mode==='oracle'){
   for(let f=0;f<20&&g.status==='playing';f++) {const b=old.policy(g,1-seat);for(const u of g.units)u.held=(u.team===seat?a[f]:b)[u.index];sim.step(g);}
  }else{const b=window(g,1-seat,mode);sim.submitWindow(g,1-seat,b);const w=[];w[seat]=a;w[1-seat]=b;sim.advanceWindow(g,w);}
 }
 return {n,seat,mode,seed,score:g.score,result:g.winner===null?'draw':g.winner===seat?'win':'loss',fouls:g.stats.map(s=>s.fouls),maxMs:+maxMs.toFixed(2)};
}
if(require.main===module)for(const mode of (process.argv[2]||'base,old,corners,swarm,oracle').split(','))for(const n of (process.argv[3]||'1,2,3,4,5,6').split(',').map(Number))for(let seat=0;seat<2;seat++)for(let r=0;r<+(process.argv[4]||1);r++)console.log(JSON.stringify(run(n,seat,mode,Number(process.env.SEED_BASE||8200)+n*10+r)));
module.exports={run};
