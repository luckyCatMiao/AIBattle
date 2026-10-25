'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const cfg=JSON.parse(process.argv[2]);
const hard=[];
for(const rf of [0.0,0.05,0.1,0.15])for(const pr of [1.2,1.3,1.5])for(const fm of ['lowhp','nearest'])for(const op of ['nodes','defend']){
  hard.push({build:['tank'],workersTarget:4,opening:op,focusMode:fm,engageRange:430,powerRatio:pr,captureNodes:true,retreatFrac:rf});
}
let w=0,g=0;const sw=[0,0];const losses=[];
for(const oc of hard){for(const seat of [0,1]){
  const me=makeEngine(cfg),opp=makeEngine(oc);
  const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
  g++;if(r.winner===seat){w++;sw[seat]++;}else losses.push({seat,oc,dur:Math.round(r.duration)});
}}
console.log('hardfam',(100*w/g).toFixed(1)+'%',w+'/'+g,'seats',sw+'/'+'[48,48]');
const by={};for(const l of losses){const k='s'+l.seat+' rf'+l.oc.retreatFrac+' pr'+l.oc.powerRatio+' '+l.oc.focusMode+' '+l.oc.opening;by[k]=(by[k]||0)+1}
console.log(JSON.stringify(by,null,0));
