'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const {makeSol2}=require('./sol2.js');
const F={};
F.s3=[];for(const rf of [0,0.15])for(const fr of [260,340,430])for(const adv of ['north','south'])for(const rb of [false,true])F.s3.push({retreatFrac:rf,focusRange:fr,advanceMode:adv,rebuildWorkers:rb,pushAfter:90,kiteFrac:0});
F.s2=[];for(const rf of [0,0.2,0.45])for(const fr of [340,470])for(const db of [true,false])for(const pa of [60,150])F.s2.push({retreatFrac:rf,focusRange:fr,defendBase:db,pushAfter:pa});
F.adv=Object.entries({
 rifleRush:{build:['rifle'],workersTarget:3,opening:'enemyBase',staging:'enemyBase',engageRange:300,pushTime:0,upgrades:false,powerRatio:0.5},
 raiderRush:{build:['raider'],workersTarget:3,opening:'enemyBase',staging:'enemyBase',engageRange:300,pushTime:0,upgrades:false,powerRatio:0.5},
 mixedSpread:{build:['tank','raider','raider','raider'],workersTarget:4,opening:'nodes',focusMode:'spread',engageRange:330,powerRatio:1.1},
 turtle:{build:['tank'],workersTarget:4,opening:'defend',staging:'home',engageRange:330,powerRatio:1.5,pushTime:999,captureNodes:true},
 workerRaid:{build:['tank','tank','raider'],workersTarget:4,opening:'nodes',staging:'center',raid:{count:3,from:30,workersFirst:true},engageRange:430,powerRatio:1.1},
 aggressive:{build:['tank'],workersTarget:4,opening:'enemyBase',staging:'enemyBase',engageRange:600,pushTime:0,powerRatio:0.5},
 raiderEcon:{build:['raider'],workersTarget:4,opening:'nodes',staging:'center',engageRange:430,pushTime:30,powerRatio:0.9},
 mixed:{build:['tank','raider','raider'],workersTarget:4,opening:'nodes',focusMode:'nearest',engageRange:430,powerRatio:1.1},
}).map(([tag,cfg])=>({tag,cfg}));
function runSet(cfg,list,kind){let w=0,g=0;const sw=[0,0];
 for(const oc of list)for(const seat of [0,1]){const me=makeEngine(cfg),opp=kind==='sol'?makeSol2(oc):makeEngine(oc);
  const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
  g++;if(r.winner===seat){w++;sw[seat]++;}}
 return {w,g,sw};}
function evaluate(cfg){const a=runSet(cfg,F.s3,'sol'),b=runSet(cfg,F.s2,'sol'),c=runSet(cfg,F.adv.map(x=>x.cfg),'eng');
 return {s3:a,s2:b,adv:c,total:(a.w+b.w+c.w)/(a.g+b.g+c.g)};}
module.exports={F,runSet,evaluate};
if(require.main===module){
 const base=JSON.parse(process.argv[2]);
 const vars=JSON.parse(process.argv[3]);
 for(const [n,d] of Object.entries(vars)){
  const cfg=Object.assign({},base,d);const e=evaluate(cfg);
  console.log(n.padEnd(16),'tot',(100*e.total).toFixed(1)+'%','| sol3',(100*e.s3.w/e.s3.g).toFixed(0)+'%','sol2',(100*e.s2.w/e.s2.g).toFixed(0)+'%','adv',(100*e.adv.w/e.adv.g).toFixed(0)+'%','seats',e.s3.sw.join(','));
 }
}
