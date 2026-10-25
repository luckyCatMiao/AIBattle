'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const {makeSol2}=require('./sol2.js');
function opps(){
  const list=[];
  // sol2 family (reduced)
  for(const rf of [0.2,0.3,0.45])for(const db of [true,false])for(const rb of [false,true]){
    list.push({kind:'sol2',cfg:{retreatFrac:rf,defendBase:db,rebuildWorkers:rb},tag:'sol2'});
  }
  // strong engine family (reduced)
  for(const pr of [1.2,1.3,1.5])for(const er of [380,430])for(const fm of ['lowhp','spread']){
    list.push({kind:'eng',cfg:{build:['tank'],workersTarget:4,opening:'nodes',focusMode:fm,engageRange:er,powerRatio:pr,captureNodes:true},tag:'eng'});
  }
  // adversarial
  const adv={
   rifleRush:{build:['rifle'],workersTarget:3,opening:'enemyBase',staging:'enemyBase',engageRange:300,pushTime:0,upgrades:false,powerRatio:0.5},
   raiderRush:{build:['raider'],workersTarget:3,opening:'enemyBase',staging:'enemyBase',engageRange:300,pushTime:0,upgrades:false,powerRatio:0.5},
   mixedSpread:{build:['tank','raider','raider','raider'],workersTarget:4,opening:'nodes',focusMode:'spread',engageRange:330,powerRatio:1.1},
   turtle:{build:['tank'],workersTarget:4,opening:'defend',staging:'home',engageRange:330,powerRatio:1.5,pushTime:999,captureNodes:true},
   workerRaid:{build:['tank','tank','raider'],workersTarget:4,opening:'nodes',staging:'center',raid:{count:3,from:30,workersFirst:true},engageRange:430,powerRatio:1.1},
   aggressive:{build:['tank'],workersTarget:4,opening:'enemyBase',staging:'enemyBase',engageRange:600,pushTime:0,powerRatio:0.5},
  };
  for(const [n,cfg] of Object.entries(adv)) list.push({kind:'eng',cfg,tag:n});
  return list;
}
function mk(opp){return opp.kind==='sol2'?makeSol2(opp.cfg):makeEngine(opp.cfg);}
function evalCfg(myCfg,list){
  const byTag={};let w=0,g=0;const seatW=[0,0],seatG=[0,0];
  for(const o of list){
    const t=byTag[o.tag]||(byTag[o.tag]={w:0,g:0});
    for(const seat of [0,1]){
      const me=makeEngine(myCfg),opp=mk(o);
      const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
      g++;t.g++;seatG[seat]++;
      if(r.winner===seat){w++;t.w++;seatW[seat]++;}
    }
  }
  return {w,g,rate:w/g,seatW,seatG,byTag};
}
module.exports={opps,evalCfg};
if(require.main===module){
  const myCfg=JSON.parse(process.argv[2]);
  const e=evalCfg(myCfg,opps());
  console.log('rate',(100*e.rate).toFixed(1)+'%','seats',e.seatW+'/'+e.seatG,'tags',Object.entries(e.byTag).map(([k,v])=>k+':'+v.w+'/'+v.g).join(' '));
}
