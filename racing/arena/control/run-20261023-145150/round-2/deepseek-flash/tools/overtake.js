'use strict';
const {runGame}=require('./harness.js');
const cfg={};
const oppCfg={vTop:9.5,edgeMargin:1.6};
for(let i=0;i<10;i++){
  const seed=2000+i;
  const r=runGame(seed,{cfg,oppCfg});
  console.log('seed',seed,'fin',r.finishTime,'best',r.bestLap?r.bestLap.toFixed(1):null,'off',r.offroadPct.toFixed(2),'coll',r.collisions,'maxStuck',r.maxStuck);
}
