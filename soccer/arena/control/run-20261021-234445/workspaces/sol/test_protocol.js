'use strict';
const sim=require('./simulation'),a=require('./agent');
let count=0,maxMs=0;
for(let n=1;n<=6;n++)for(const team of [0,1])for(const kind of ['start','edge','shot','freeze']) {
 const g=sim.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:123,teamSize:n});
 if(kind==='edge'){
  const u=g.units.find(u=>u.team===team&&u.index===n-1);
  u.x=team?10.26:33.74;u.y=6.05;g.ball.owner=u.id;
  g.ball.x=u.x+(team?-.62:.62);g.ball.y=u.y;
 }
 if(kind==='shot')Object.assign(g.ball,{x:team?32:12,y:12,vx:team?11:-11,vy:1});
 if(kind==='freeze')g.freeze=12;
 const start=performance.now(),out=a.decide(sim.view(g,team)).inputs;maxMs=Math.max(maxMs,performance.now()-start);
 sim.submitWindow(g,team,out);
 for(const f of out)for(const u of f)if(!Number.isFinite(u.aim)||u.aim<0||u.aim>=360)throw Error('bad aim');
 for(let f=0;f<20;f++){
  for(const u of g.units)u.held=u.team===team?out[f][u.index]:{dir:'N',kick:false};
  sim.step(g);
 }
 if(g.stats[team].fouls)throw Error(`foul ${n} ${team} ${kind}`);
 count++;
}
console.log(JSON.stringify({scenarios:count,maxMs,allValid:true,allZeroFouls:true}));
