'use strict';
const sim=require('./simulation'),a=require('./agent'),b=require('./agent_v2');
const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:74,teamSize:3});
while(g.frame<600){
 const aa=a.decide(sim.view(g,0)).inputs,bb=b.decide(sim.view(g,1)).inputs;
 for(let f=0;f<20;f++){
  for(const u of g.units)u.held=(u.team===0?aa:bb)[f][u.index];
  const e=g.eventId;sim.step(g);
  if(g.eventId!==e)console.log(JSON.stringify({frame:g.frame,events:g.events.filter(v=>v.id>e),ball:g.ball,units:g.units.map(u=>({id:u.id,x:u.x,y:u.y}))}));
 }
}
