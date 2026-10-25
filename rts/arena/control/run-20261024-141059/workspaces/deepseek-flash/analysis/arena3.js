'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const {makeSol2}=require('./sol2.js');
const {makeSol}=require('./bots.js');
function getOpp(kind,cfg){ if(kind==='sol2')return makeSol2(cfg); if(kind==='sol1')return makeSol(cfg); return makeEngine(cfg); }
function run(cfg,oppKind='sol2',oppCfg={},trace=false){
  const out=[];
  for(const seat of [0,1]){
    const me=makeEngine(cfg), opp=getOpp(oppKind,oppCfg);
    const r=seat===0?runMatch(me,opp,{traceEvery:trace?5:0}):runMatch(opp,me,{traceEvery:trace?5:0});
    out.push({seat,win:r.winner===seat,r,myI:seat,opI:1-seat});
  }
  return out;
}
if(require.main===module){
  const cfg=JSON.parse(process.argv[2]||'{}');
  const kind=process.argv[3]||'sol2';
  const oppCfg=process.argv[4]?JSON.parse(process.argv[4]):{};
  for(const x of run(cfg,kind,oppCfg)){
    const r=x.r,me=r.stats[x.myI],op=r.stats[x.opI];
    console.log(`seat${x.seat}: ${x.win?'WIN ':'LOSS'} @${r.duration.toFixed(0)}s me[${me.kills}k ${me.damage.toFixed(0)}dmg mined${me.mined.toFixed(0)} ctl${me.ctl.toFixed(0)}] op[${op.kills}k ${op.damage.toFixed(0)}dmg mined${op.mined.toFixed(0)} ctl${op.ctl.toFixed(0)}] scores ${r.scores}`);
  }
}
module.exports={run};
