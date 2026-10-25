'use strict';
const sim=require('./simulation'),{plan}=require('./agent_core'),fs=require('fs');
const seed=Number(process.argv[2]||101), me=Number(process.argv[3]||1);
const g=sim.createMatch({seed,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
const trace=[];
for(let w=0;w<365&&g.round===1;w++) {
 const o=sim.view(g,me), actions=plan(o);
 trace.push({time:g.time,p:{...o.runners[me]},actions,near: o.plants.filter(p=>Math.abs(p.x-o.runners[me].x)<8),spikes:o.level.tiles.map((v,i)=>v===3?i%g.w:-1).filter(x=>x>=0)});
 for(let k=0;k<5;k++) {g.runners[me].held=actions[k];g.runners[1-me].held={move:1,jump:true};sim.step(g);if(g.round!==1)break;}
}
fs.writeFileSync(`trace_${seed}.json`,JSON.stringify(trace));
console.log(trace.filter((t,i)=>i%10===0).map(t=>[t.time.toFixed(2),t.p.x,t.p.y,t.actions.map(a=>''+a.move+(a.jump?'j':'')).join(' ')]));
