'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const myCfg=JSON.parse(process.argv[2]);
const opps={
 rifleRush:{build:['rifle'],workersTarget:3,opening:'enemyBase',staging:'enemyBase',engageRange:300,pushTime:0,upgrades:false,powerRatio:0.5},
 raiderRush:{build:['raider'],workersTarget:3,opening:'enemyBase',staging:'enemyBase',engageRange:300,pushTime:0,upgrades:false,powerRatio:0.5},
 raiderRushEcon:{build:['raider'],workersTarget:4,opening:'nodes',staging:'center',engageRange:430,pushTime:30,powerRatio:0.9},
 mixed:{build:['tank','raider','raider'],workersTarget:4,opening:'nodes',focusMode:'nearest',engageRange:430,powerRatio:1.1},
 mixedSpread:{build:['tank','raider','raider','raider'],workersTarget:4,opening:'nodes',focusMode:'spread',engageRange:330,powerRatio:1.1},
 turtle:{build:['tank'],workersTarget:4,opening:'defend',staging:'home',engageRange:330,powerRatio:1.5,pushTime:999,captureNodes:true},
 turtle5:{build:['tank'],workersTarget:5,opening:'defend',staging:'home',engageRange:430,powerRatio:1.3,pushTime:999},
 workerRaid:{build:['tank','tank','raider'],workersTarget:4,opening:'nodes',staging:'center',raid:{count:3,from:30,workersFirst:true},engageRange:430,powerRatio:1.1},
 aggressive:{build:['tank'],workersTarget:4,opening:'enemyBase',staging:'enemyBase',engageRange:600,pushTime:0,powerRatio:0.5},
 sustain:{build:['tank'],workersTarget:5,opening:'nodes',focusMode:'lowhp',engageRange:430,powerRatio:1.3,captureNodes:true},
};
let tot=0,w=0;const rows=[];
for(const [name,cfg] of Object.entries(opps)){
  const res=[];
  for(const seat of [0,1]){
    const me=makeEngine(myCfg),opp=makeEngine(cfg);
    const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
    const win=r.winner===seat; if(win)w++; tot++;
    res.push((win?'W':'L')+Math.round(r.duration));
  }
  rows.push(name+':'+res.join('/'));
}
console.log(rows.join('  '));
console.log('win rate',(100*w/tot).toFixed(1)+'%',w+'/'+tot);
