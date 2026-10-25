'use strict';
const {runGame}=require('./harness.js');
const cfg=Object.assign({cornerA:20,mpcH:16,edgeMargin:1.1,lineKappa:0.07,mpcSteerW:1.0,driftOn:true,driftPulsePeriod:0,driftKappa:0.1,boostOn:true,boostMode:'always',boostMinEnergy:0.05},process.argv[3]?JSON.parse(process.argv[3]):{});
const n=Number(process.argv[2]||8);
for(let i=0;i<n;i++){
  const seed=2000+i;
  const r=runGame(seed,{cfg,selfPlay:true});
  console.log('seed',seed,'fin',r.finishTime,'best',r.bestLap?r.bestLap.toFixed(1):null,'off',r.offroadPct.toFixed(2),'coll',r.collisions,'stuck',r.maxStuck);
}
