'use strict';
const {runGame}=require('./harness.js');
const seed=Number(process.argv[2]||1000);
for (const cfg of [{driftOn:false,boostOn:false},{driftOn:true,boostOn:false},{driftOn:true,boostOn:true}]){
  const c=Object.assign({cornerA:20,edgeMargin:1.1},cfg);
  const r=runGame(seed,{cfg});
  console.log(JSON.stringify(cfg),'fin',r.finishTime,'best',r.bestLap,'pathLen',r.pathLen.toFixed(1),'(3L=',(3*r.progress/3).toFixed(0),')',
    'lowSpeedFrac',(r.tLow/r.totalFrames*100).toFixed(1),'hiSpeedFrac',(r.tHigh/r.totalFrames*100).toFixed(1),
    'drift',r.driftTime.toFixed(1),'boosts',r.boosts,'avg',r.avgSpeed.toFixed(2));
}
