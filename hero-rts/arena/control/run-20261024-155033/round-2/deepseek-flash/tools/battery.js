'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('../agent.js');
const variants=[
  {name:'base',opts:{}},
  {name:'strongdef',opts:{defenseBias:1,pushAt:150,aggroRange:1100}},
  {name:'turtle',opts:{pushAt:420,aggroRange:1200,defenseBias:1}},
  {name:'earlypush',opts:{pushAt:130}},
];
const agentOpts=process.env.AGENT_OPTS?JSON.parse(process.env.AGENT_OPTS):{};
let W=0,N=0;
for(const v of variants){
  const line=[];
  for(const seat of [0,1]){
    const clone=new SolClone(Object.assign({},v.opts));
    const us=new Agent(Object.assign({},agentOpts));
    const A=seat===0?us:clone,B=seat===0?clone:us;
    const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:600});
    const win=(r.winner===seat);
    if(win)W++;N++;
    line.push(`seat${seat}:${win?'W':'L'} ${r.duration.toFixed(0)}s oppTH=${r.th.find(x=>x.startsWith((1-seat)+':'))} hero=${r.heroes[seat]}`);
  }
  console.log(v.name.padEnd(10),line.join(' | '));
}
console.log('TOTAL',W+'/'+N);
