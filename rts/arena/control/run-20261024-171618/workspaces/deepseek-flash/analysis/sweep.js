'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const base={build:['tank'],workersTarget:4,opening:'nodes',focusMode:'lowhp',retreatFrac:0.28,powerRatio:0.85,engageRange:430,pushTime:90};
function play(cfgA,cfgB,seat){const A=makeEngine(cfgA),B=makeEngine(cfgB);const r=seat===0?runMatch(A,B,{}):runMatch(B,A,{});return r.winner===seat;}
const cfgs=JSON.parse(process.argv[2]);
const baseline=Object.assign({},base,JSON.parse(process.argv[3]||'{}'));
let tot=0,w=0;
for(const c of cfgs){
  const cfg=Object.assign({},baseline,c);
  const res=[];
  for(const seat of [0,1]){const win=play(cfg,baseline,seat);res.push(win?'W':'L');if(win)w++;tot++;}
  console.log(JSON.stringify(c),res.join(''));
}
console.log('total wins',w,'/',tot,(100*w/tot).toFixed(0)+'%');
