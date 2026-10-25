'use strict';
const {runGame}=require('./harness.js');
const seed=Number(process.argv[2]);
const cfg=Object.assign({cornerA:20,mpcH:16,edgeMargin:1.2,driftOn:true,driftPulsePeriod:6,driftPulseOn:3,driftKappa:0.1,boostOn:true,boostMode:'always',boostMinEnergy:0.05},process.argv[3]?JSON.parse(process.argv[3]):{});
const r=runGame(seed,{cfg,trace:true});
console.log(JSON.stringify({seed,status:r.status,winner:r.winner,fin:r.finishTime,lap:r.lap,nextCp:r.nextCp,prog:r.progress,off:r.offroadPct,maxStuck:r.maxStuck,totalFrames:r.totalFrames,timeLeft:r.timeLeft,pathLen:r.pathLen},null,1));
// print trace every 1s with speed and progress
const tr=r.trace||[];
let out=[];
for(let i=0;i<tr.length;i+=20){const t=tr[i];out.push(`${t.f.toFixed(0)}:s${t.s.toFixed(0)} sp${t.sp.toFixed(1)}${t.off?' OFF':''}`);}
console.log(out.join(' | '));
