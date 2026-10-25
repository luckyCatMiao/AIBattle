'use strict';
const sim=require('./simulation'),agent=require('./agent');
const results=[];
for(const n of [1,3,6])for(let seat=0;seat<2;seat++)for(const kind of ['half','golden','goal','foul']){
 const g=sim.createMatch({teamSize:n,seed:9501+n,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
 if(kind==='half')g.frame=1190;
 if(kind==='golden'){g.frame=2390;g.half=2;}
 if(kind==='goal')g.ball={x:42.9,y:13,vx:10,vy:0,owner:null,lastTeam:0,lastTouch:'t0u0'};
 if(kind==='foul'){const u=g.units.find(u=>u.team===1-seat&&u.index===n-1);u.x=seat===0?5:39;u.y=13;}
 for(let w=0;w<3&&g.status==='playing';w++){
  const a=agent.decide(sim.view(g,seat)).inputs;sim.submitWindow(g,seat,a);
  for(let f=0;f<20&&g.status==='playing';f++){
   const b=agent.policy(g,1-seat);for(const u of g.units)u.held=(u.team===seat?a[f]:b)[u.index];sim.step(g);
  }
 }
 results.push({n,seat,kind,frame:g.frame,half:g.half,golden:g.golden,fouls:g.stats.map(s=>s.fouls),score:g.score});
}
console.log(JSON.stringify({cases:results.length,ownFouls:results.reduce((a,r)=>a+r.fouls[r.seat],0),results}));
