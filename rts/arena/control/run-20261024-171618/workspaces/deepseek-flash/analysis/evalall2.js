'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const {makeSol2}=require('./sol2.js');
const cfg=JSON.parse(process.argv[2]);
const base={build:['tank'],workersTarget:4,opening:'nodes',focusMode:'lowhp',engageRange:430,powerRatio:1.3,captureNodes:true,retreatFrac:0.1,chaseRange:300,holdRatio:99};
function ev(list,kind,label){let w=0,g=0;const sw=[0,0];
 for(const oc of list)for(const seat of [0,1]){
  const me=makeEngine(cfg),opp=kind==='sol'?makeSol2(oc):makeEngine(Object.assign({},base,oc,{holdRatio:99}));
  const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
  g++;if(r.winner===seat){w++;sw[seat]++;}}
 console.log(label.padEnd(10),(100*w/g).toFixed(1)+'%',w+'/'+g,'seats',sw.join(','));
 return {w,g};}
const s3=[];for(const rf of [0,0.1,0.2,0.3])for(const fr of [260,340,430])for(const adv of ['north','south','base'])for(const rb of [false,true])for(const pa of [90,150])s3.push({retreatFrac:rf,focusRange:fr,advanceMode:adv,rebuildWorkers:rb,pushAfter:pa,kiteFrac:0});
const s2=[];for(const rf of [0.2,0.3,0.45])for(const fr of [400,470,560])for(const db of [true,false])for(const rb of [false,true])for(const pa of [60,90,150])s2.push({retreatFrac:rf,focusRange:fr,defendBase:db,rebuildWorkers:rb,pushAfter:pa});
const hard=[];for(const rf of [0.0,0.05,0.1,0.15])for(const pr of [1.2,1.3,1.5])for(const fm of ['lowhp','nearest'])for(const op of ['nodes','defend'])hard.push({opening:op,focusMode:fm,powerRatio:pr,retreatFrac:rf});
const adv={
 rifleRush:{build:['rifle'],workersTarget:3,opening:'enemyBase',staging:'enemyBase',engageRange:300,pushTime:0,upgrades:false,powerRatio:0.5},
 raiderRush:{build:['raider'],workersTarget:3,opening:'enemyBase',staging:'enemyBase',engageRange:300,pushTime:0,upgrades:false,powerRatio:0.5},
 mixedSpread:{build:['tank','raider','raider','raider'],workersTarget:4,opening:'nodes',focusMode:'spread',engageRange:330,powerRatio:1.1},
 turtle:{build:['tank'],workersTarget:4,opening:'defend',staging:'home',engageRange:330,powerRatio:1.5,pushTime:999,captureNodes:true},
 workerRaid:{build:['tank','tank','raider'],workersTarget:4,opening:'nodes',staging:'center',raid:{count:3,from:30,workersFirst:true},engageRange:430,powerRatio:1.1},
 aggressive:{build:['tank'],workersTarget:4,opening:'enemyBase',staging:'enemyBase',engageRange:600,pushTime:0,powerRatio:0.5},
 raiderEcon:{build:['raider'],workersTarget:4,opening:'nodes',staging:'center',engageRange:430,pushTime:30,powerRatio:0.9},
 mixed:{build:['tank','raider','raider'],workersTarget:4,opening:'nodes',focusMode:'nearest',engageRange:430,powerRatio:1.1},
};
ev(s3,'sol','sol3x288');ev(s2,'sol','sol2x216');ev(hard,'eng','hardx96');
let w=0,g=0;const sw=[0,0];
for(const [tag,oc] of Object.entries(adv))for(const seat of [0,1]){
 const me=makeEngine(cfg),opp=makeEngine(Object.assign({},base,oc,{holdRatio:99}));
 const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
 g++;if(r.winner===seat){w++;sw[seat]++;}}
console.log('adv'.padEnd(10),(100*w/g).toFixed(1)+'%',w+'/'+g,'seats',sw.join(','));
