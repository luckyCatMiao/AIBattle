'use strict';
const sim=require('./simulation'),ag=require('./agent'),{baseline}=require('./test');
const g=sim.createMatch({players:[{name:'us',kind:'api'},{name:'rush',kind:'api'}]});let history=[];
while(g.frame<800){
 const w=ag.plan(sim.view(g,0)).inputs;
 const copy=structuredClone(g),ow=[];
 for(let f=0;f<20;f++){let aa=baseline(copy,1,'rush'),bb=baseline(copy,0,'rush');ow.push(aa);for(const u of copy.units)u.held=(u.team===1?aa:bb)[u.index];sim.step(copy);}
 for(let f=0;f<20;f++){
  for(const u of g.units)u.held=(u.team===0?w:ow)[f][u.index];sim.step(g);
  history.push({f:g.frame,b:{...g.ball},u:g.units.map(u=>({x:u.x,y:u.y,id:u.id})),a:w[f]});
 }
}
require('fs').writeFileSync('/workspace/trace.json',JSON.stringify(history));
console.log(JSON.stringify(g.events.filter(e=>['goal','kick'].includes(e.type))));
