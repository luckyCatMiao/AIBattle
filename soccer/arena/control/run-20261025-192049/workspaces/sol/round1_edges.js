'use strict';
const sim=require('./simulation'),a=require('./agent');
const cases=[];
for(let n=1;n<=6;n++)for(let seat=0;seat<2;seat++)for(const kind of ['shot-high','shot-low','near-box','freeze']){
 const g=sim.createMatch({teamSize:n,seed:8301+n,players:[{name:'x',kind:'api'},{name:'y',kind:'api'}]});
 const mirror=x=>seat?44-x:x;
 g.frame=200;
 for(const u of g.units){u.x=mirror(u.team===seat?12:30);u.y=3+u.index*3.5;}
 const k=g.units.find(u=>u.team===seat&&u.index===0);k.x=mirror(3.3);k.y=13;
 if(kind.startsWith('shot'))g.ball={x:mirror(13),y:kind==='shot-high'?10.8:15.2,vx:seat?10:-10,vy:0,owner:null,lastTouch:null,lastTeam:1-seat};
 if(kind==='near-box'){
  const u=g.units.find(u=>u.team===seat&&u.index===n-1);u.x=mirror(32.6);u.y=13;
  g.ball={x:mirror(33.22),y:13,vx:0,vy:0,owner:u.id,lastTouch:u.id,lastTeam:seat};
 }
 if(kind==='freeze'){g.freeze=12;g.half=2;g.frame=1220;}
 const w=a.decide(sim.view(g,seat)).inputs;sim.submitWindow(g,seat,w);
 for(let f=0;f<20&&g.status==='playing';f++){
  const b=a.policy(g,1-seat);for(const u of g.units)u.held=(u.team===seat?w[f]:b)[u.index];sim.step(g);
 }
 cases.push({n,seat,kind,score:g.score,fouls:g.stats[seat].fouls});
}
console.log(JSON.stringify({cases:cases.length,ownFouls:cases.reduce((s,r)=>s+r.fouls,0),results:cases}));
