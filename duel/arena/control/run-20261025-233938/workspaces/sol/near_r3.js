'use strict';
const fs=require('fs');
const sim=require('./simulation');
const {Agent}=require('./agent');
const {Agent:Previous}=require('./agent_r2');
const results=[];
for(let seat=0;seat<2;seat++)for(const distance of [3,5,8])for(const cooldown of [0,12,24]){
 const g=sim.createMatch({id:`near-${seat}-${distance}-${cooldown}`,players:[{name:'A'},{name:'B'}]});
 const a=new Agent(),b=new Previous();
 g.players[seat].x=14;g.players[seat].y=10;
 g.players[1-seat].x=14+distance;g.players[1-seat].y=10;
 g.players[seat].cooldown=12;g.players[1-seat].cooldown=cooldown;
 let maxMS=0;
 while(g.status==='playing'&&g.frame<400){
  const start=performance.now(),aw=a.act(sim.view(g,seat));maxMS=Math.max(maxMS,performance.now()-start);
  const bw=b.act(sim.view(g,1-seat)),ws=[];
  ws[seat]=sim.submitWindow(g,seat,aw.inputs);ws[1-seat]=sim.submitWindow(g,1-seat,bw.inputs);sim.advanceWindow(g,ws);
 }
 const r={seat,distance,enemyCooldown:cooldown,outcome:g.status==='playing'?'survived20s':g.winner===seat?'win':'loss',seconds:+g.now.toFixed(2),maxMS:+maxMS.toFixed(3)};
 results.push(r);console.log(JSON.stringify(r));
}
fs.writeFileSync('near_results_r3.json',JSON.stringify(results,null,2));
