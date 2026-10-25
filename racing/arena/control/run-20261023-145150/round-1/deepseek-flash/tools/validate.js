'use strict';
const {runGame}=require('./harness.js');
const cfg=Object.assign({cornerA:20,mpcH:16,edgeMargin:1.3,lineKappa:0.07,mpcSteerW:1.0,driftOn:true,driftAlways:true,boostOn:true,boostMode:'always',boostMinEnergy:0.05},process.argv[3]?JSON.parse(process.argv[3]):{});
const a=Number(process.argv[2]||2100), n=Number(process.argv[4]||40);
const rows=[];
for(let i=0;i<n;i++){const r=runGame(a+i,{cfg});rows.push(r);}
rows.sort((x,y)=>y.offroadPct-x.offroadPct);
let fin=rows.filter(r=>r.finishTime!=null);
console.log('fin',fin.length+'/'+n,'meanFin',(fin.reduce((s,r)=>s+r.finishTime,0)/fin.length).toFixed(2),
  'medianFin',fin.map(r=>r.finishTime).sort((x,y)=>x-y)[Math.floor(fin.length/2)].toFixed(2),
  'meanOff',(rows.reduce((s,r)=>s+r.offroadPct,0)/n).toFixed(2));
for(const r of rows.slice(0,6)) console.log('worst offroad seed',r.seed,'off',r.offroadPct.toFixed(2),'fin',r.finishTime,'best',r.bestLap,'maxStuck',r.maxStuck,'boosts',r.boosts);
for(const r of rows.slice(-3)) console.log('best seeds',r.seed,'off',r.offroadPct.toFixed(2),'fin',r.finishTime,'best',r.bestLap);
