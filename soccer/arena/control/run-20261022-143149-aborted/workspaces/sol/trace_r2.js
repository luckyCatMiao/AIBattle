'use strict';
const sim=require('./simulation'),a=require('./agent'),b=require('./agent_r1');
const g=sim.createMatch({teamSize:+(process.argv[2]||1),seed:5010,players:[{name:'new',kind:'api'},{name:'old',kind:'api'}]});let eid=0;
while(g.status==='playing'){
 const w=[a.decide(sim.view(g,0)).inputs,b.decide(sim.view(g,1)).inputs];sim.advanceWindow(g,w);
 if(process.argv.includes('--state'))console.log(JSON.stringify({t:g.frame/20,b:g.ball,u:g.units.map(u=>[u.x,u.y])}));
 else for(const e of g.events)if(e.id>eid&&['goal','kick','tackle'].includes(e.type)) console.log(JSON.stringify(e));
 eid=g.eventId;
}
