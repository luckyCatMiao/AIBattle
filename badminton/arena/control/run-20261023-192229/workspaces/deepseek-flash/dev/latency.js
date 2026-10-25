'use strict';
const sim=require('../engine.js');const brain=require('../brain.js');
function bot(o){const t=process.hrtime.bigint();const r=brain.decide(o);return {frames:r.frames,ms:Number(process.hrtime.bigint()-t)/1e6};}
const g=sim.createMatch({id:'l',seed:1,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
const times=[];
while(g.status==='playing'){
  const wins=[];
  for(let t=0;t<2;t++){const o=sim.view(g,t);o.yourPlayer=t;const r=bot(o);wins.push(r.frames);times.push(r.ms);}
  try{sim.advanceWindow(g,[sim.submitWindow(g,0,wins[0]),sim.submitWindow(g,1,wins[1])]);}catch(e){console.log('err',e.message);break;}
}
times.sort((a,b)=>a-b);
const q=p=>times[Math.min(times.length-1,Math.floor(times.length*p))];
console.log('windows',times.length,'p50',q(.5).toFixed(1),'p95',q(.95).toFixed(1),'p99',q(.99).toFixed(1),'max',times[times.length-1].toFixed(1),'score',g.score.join(':'));
