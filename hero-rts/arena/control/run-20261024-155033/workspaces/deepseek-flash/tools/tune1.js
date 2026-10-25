'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require(process.env.AGENT_FILE||'../agent.js');
const variants=JSON.parse(process.argv[2]);
const cloneOpts=JSON.parse(process.argv[3]||'{}');
for(const v of variants){
 const out=[];
 for(const seat of (process.argv[4]?process.argv[4].split(',').map(Number):[0,1])){
  const us=new Agent(Object.assign({},v.opts)),cl=new SolClone(Object.assign({},cloneOpts));
  const A=seat===0?us:cl,B=seat===0?cl:us;
  const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:600});
  const win=r.winner===seat;
  const th=r.th.find(x=>x.startsWith((1-seat)+':'));
  out.push(`s${seat}:${win?'W'+Math.round(r.duration):'L'+Math.round(r.duration)+'(eTH'+th+')'}`);
 }
 console.log(v.name.padEnd(22),out.join('  '));
}
