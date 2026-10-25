'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const {makeSol2}=require('./sol2.js');
const cfg=JSON.parse(process.argv[2]);
// hard family reduced (16 configs -> 32 games)
const hard=[];
for(const rf of [0.0,0.1])for(const pr of [1.2,1.3,1.5])for(const fm of ['lowhp','nearest'])for(const op of ['nodes','defend']){
  hard.push({build:['tank'],workersTarget:4,opening:op,focusMode:fm,engageRange:430,powerRatio:pr,captureNodes:true,retreatFrac:rf});
}
// sol2 family reduced (24)
const sols=[];
for(const rf of [0.0,0.3])for(const fr of [400,470])for(const db of [true,false])for(const pa of [60,120])sols.push({retreatFrac:rf,focusRange:fr,defendBase:db,pushAfter:pa,advanceMode:'south'});
function ev(list,kind){let w=0,g=0;const sw=[0,0];
 for(const oc of list)for(const seat of [0,1]){const me=makeEngine(cfg),opp=kind==='sol'?makeSol2(oc):makeEngine(oc);
  const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
  g++;if(r.winner===seat){w++;sw[seat]++;}}
 return {w,g,sw};}
const h=ev(hard,'eng'),s=ev(sols,'sol');
console.log('hard',(100*h.w/h.g).toFixed(1)+'%',h.w+'/'+h.g,'seats',h.sw,'| sol2',(100*s.w/s.g).toFixed(1)+'%',s.w+'/'+s.g,'seats',s.sw);
