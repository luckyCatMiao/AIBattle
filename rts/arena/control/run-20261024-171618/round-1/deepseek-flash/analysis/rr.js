'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const base={build:['tank'],workersTarget:4,opening:'nodes',focusMode:'lowhp',retreatFrac:0.28,powerRatio:0.85,engageRange:430,pushTime:90};
const C=JSON.parse(process.argv[2]||'{}');
const names=Object.keys(C);
const score={};names.forEach(n=>score[n]=0);
for(let i=0;i<names.length;i++)for(let j=i+1;j<names.length;j++){
  const A=Object.assign({},base,C[names[i]]),B=Object.assign({},base,C[names[j]]);
  for(const seat of [0,1]){
    const a=makeEngine(A),b=makeEngine(B);
    const r=seat===0?runMatch(a,b,{}):runMatch(b,a,{});
    // winner is seat id
    const winnerName=r.winner===seat?names[i]:names[j];
    score[winnerName]++;
  }
}
const rank=Object.entries(score).sort((a,b)=>b[1]-a[1]);
console.log(rank.map(([n,s])=>n+':'+s).join('  '));
