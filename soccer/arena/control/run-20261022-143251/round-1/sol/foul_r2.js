'use strict';
const sim=require('./simulation'),a=require('./agent'),old=require('./agent_r1'),{baseline}=require('./test');
const g=sim.createMatch({teamSize:+(process.argv[2]||1),seed:5011,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
while(g.status==='playing'){
 const obs=sim.view(g,0),w=a.decide(obs).inputs,p=old.restore(sim.view(g,1)),b=[];
 for(let i=0;i<20;i++){const x=baseline(p,1,'swarm'),y=baseline(p,0,'swarm');b.push(x);for(const u of p.units)u.held=(u.team?x:y)[u.index];sim.step(p);}
 const before=g.stats[0].fouls;
 for(let i=0;i<20&&g.status==='playing';i++){
  for(const u of g.units)u.held=(u.team?b[i]:w[i])[u.index];sim.step(g);
  if(g.stats[0].fouls>before){console.log(JSON.stringify({frame:g.frame,f:i,obs:obs.units,inputs:w,events:g.events.slice(-6)}));process.exit();}
 }
}
