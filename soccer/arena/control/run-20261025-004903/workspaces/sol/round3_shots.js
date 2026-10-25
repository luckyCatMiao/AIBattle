'use strict';
const sim=require('./simulation'),fs=require('fs');
const agents={base:require('./agent_round3_base'),edge:require('./agent_round3_candidate'),posts:require('./agent_round3_posts')};
const results=[];
for(const [name,a] of Object.entries(agents))for(const x of [29,32,33.3])for(const y of [4.8,9,13,17,21.2])for(const ky of [11,13,15]){
 const g=sim.createMatch({teamSize:2,seed:1,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});g.frame=200;
 const u=g.units[1];u.x=x;u.y=y;
 g.units[0].x=3;g.units[0].y=13;g.units[2].x=40.7;g.units[2].y=ky;g.units[3].x=24;g.units[3].y=22;
 g.ball={x:x+.62,y,vx:0,vy:0,owner:u.id,lastTouch:u.id,lastTeam:0};
 const sh=a.shot(a.local(g,0).us[1],a.local(g,0));
 const action={dir:'N',aim:sh.aim,kick:true};
 for(let f=0;f<100&&!g.score[0]&&!g.score[1];f++){
  const b=agents.base.policy(g,1);
  for(const z of g.units)z.held=z.team===1?b[z.index]:(z===u&&f===0?action:{dir:'N',aim:0,kick:false});
  sim.step(g);
 }
 results.push({name,x,y,ky,margin:sh.score,aim:sh.aim,goal:g.score[0],save:g.events.some(e=>e.type==='save'),fouls:g.stats[0].fouls});
}
fs.writeFileSync('round3_shot_cases.json',JSON.stringify(results));
const summary={};for(const r of results){const s=summary[r.name]||={cases:0,goals:0,saves:0,fouls:0};s.cases++;s.goals+=r.goal;s.saves+=+r.save;s.fouls+=r.fouls;}
console.log(JSON.stringify(summary));
