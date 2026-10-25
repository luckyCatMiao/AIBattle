'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('../agent.js');
const agentOpts=process.env.AGENT_OPTS?JSON.parse(process.env.AGENT_OPTS):{marchFight:false,raidTime:9,focusR:280};
const clones=[
  {name:'sol-r1',    opts:{}},
  {name:'sol-r3-push',opts:{pushAt:160,aggroRange:1000,defenseBias:1}},
  {name:'sol-late-push',opts:{pushAt:210,aggroRange:900}},
  {name:'sol-early-push',opts:{pushAt:120,aggroRange:1100,defenseBias:1}},
  {name:'sol-towers',opts:{towerAt:55,tower2At:80,aggroRange:1000,defenseBias:1}},
  {name:'sol-boom',  opts:{workers:22,pushAt:175}},
  {name:'sol-def',   opts:{pushAt:150,aggroRange:1150,defenseBias:1}},
  {name:'sol-lowagg',opts:{aggroRange:700}},
];
let W=0,N=0,tot=0;
for(const cv of clones){
  const out=[];
  for(const seat of [0,1]){
    const us=new Agent(agentOpts),cl=new SolClone(Object.assign({},cv.opts));
    const A=seat===0?us:cl,B=seat===0?cl:us;
    const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:700});
    const win=r.winner===seat;if(win){W++;tot+=r.duration;}N++;
    const oppTH=r.th.find(x=>x.startsWith((1-seat)+':'));
    out.push(`s${seat}:${win?'W'+Math.round(r.duration):'L'+Math.round(r.duration)+'(TH'+(oppTH?oppTH.split(':')[1]:'X')+')'}`);
  }
  console.log(cv.name.padEnd(14),out.join('  '));
}
console.log(`TOTAL ${W}/${N} = ${(100*W/N).toFixed(0)}%  avg win ${Math.round(tot/Math.max(1,W))}s`);
