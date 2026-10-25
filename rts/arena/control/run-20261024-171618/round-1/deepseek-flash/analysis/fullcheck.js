'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const {makeSol2}=require('./sol2.js');
const cfg=JSON.parse(process.argv[2]);
function evalVs(list,label){
  let w=0,g=0;const sw=[0,0],sg=[0,0];const losses=[];
  for(const o of list){for(const seat of [0,1]){
    const me=makeEngine(cfg),opp=o.mk();
    const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
    g++;sg[seat]++;if(r.winner===seat){w++;sw[seat]++;}else losses.push({seat,tag:o.tag,dur:Math.round(r.duration)});
  }}
  console.log(label,(100*w/g).toFixed(1)+'%',w+'/'+g,'seats',sw+'/'+sg,'losses',losses.length);
  const by={};for(const l of losses){const k=l.tag+'/s'+l.seat;by[k]=(by[k]||0)+1}
  console.log(' ',JSON.stringify(by));
}
// strong family 36
const strong=[];let seed=100;
for(const pr of [1.2,1.3,1.5])for(const er of [380,430,480])for(const fm of ['lowhp','spread'])for(const op of ['nodes','defend']){
  const c={build:['tank'],workersTarget:4,opening:op,focusMode:fm,engageRange:er,powerRatio:pr,captureNodes:true,retreatFrac:0.3,seed:++seed};
  strong.push({tag:'eng',mk:()=>makeEngine(c)});
}
evalVs(strong,'strong36');
// sol2 family 108
const sols=[];
for(const rf of [0.2,0.3,0.45])for(const fr of [400,470,560])for(const db of [true,false])for(const rb of [false,true])for(const pa of [60,90,150]){
  const c={retreatFrac:rf,focusRange:fr,defendBase:db,rebuildWorkers:rb,pushAfter:pa};
  sols.push({tag:'sol2',mk:()=>makeSol2(c)});
}
evalVs(sols,'sol2x108');
// adversarial
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
const advl=Object.entries(adv).map(([tag,c])=>({tag,mk:()=>makeEngine(c)}));
evalVs(advl,'adversarial');
