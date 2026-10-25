'use strict';
const sim=require('./simulation');
const readline=require('readline');
let g, stats;
readline.createInterface({input:process.stdin}).on('line',line=>{
 const q=JSON.parse(line);
 if(q.seed!==undefined){
  g=sim.createMatch({seed:q.seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  stats={off:[0,0],maxSpeed:[0,0]};
  if(q.close){
   const a=g.cars[0], b=g.cars[1];
   b.x=a.x-Math.cos(a.angle)*1.15; b.y=a.y-Math.sin(a.angle)*1.15;
  }
 }
 if(q.windows){
  for(let i=0;i<20 && g.status==='playing';i++){
   for(let j=0;j<2;j++)g.cars[j].held=q.windows[j][i][0];
   sim.step(g);
   for(let j=0;j<2;j++){
    stats.off[j]+=Number(g.cars[j].offRoad);
    stats.maxSpeed[j]=Math.max(stats.maxSpeed[j],Math.hypot(g.cars[j].vx,g.cars[j].vy));
   }
  }
 }
 const o=sim.view(g,0); o.testStats=stats;
 if(!q.full){ delete o.track; delete o.rules; delete o.events; }
 console.log(JSON.stringify(o));
});
