'use strict';
const {runDuel}=require('./duel');
const {Agent}=require('../agent.js');
const {SolClone}=require('./solclone.js');
const seat=parseInt(process.argv[2]||'0',10);
const agOpts=process.argv[3]?JSON.parse(process.argv[3]):{};
const us=new Agent(agOpts),cl=new SolClone({});
const A=seat===0?us:cl,B=seat===0?cl:us;
const seen=new Set();
const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:400,onFrame:(g)=>{
  if(g.now<40||g.now>140)return;
  for(const e of g.events){
    if(seen.has(e.id))continue;seen.add(e.id);
    if(['cast','death','heroDeath','level','shot','shot'].includes(e.type)){
      if(e.type==='shot')continue;
      const who=e.owner===seat?'us':e.owner===1-seat?'opp':'neutral';
      console.log(`t=${e.t.toFixed(1)} ${who} ${e.type} ${e.text||''} @${Math.round(e.x||0)},${Math.round(e.y||0)} ${e.big?'BIG':''}`);
    }
  }
}});
console.log('RESULT',r.winner,r.duration.toFixed(1));
