'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('../agent.js');
const clones=[
  {name:'std',       opts:{}},
  {name:'w16',       opts:{workers:16}},
  {name:'w22',       opts:{workers:22}},
  {name:'push150',   opts:{pushAt:150,aggroRange:1000,defenseBias:1}},
  {name:'push200',   opts:{pushAt:200,aggroRange:850}},
  {name:'agg800',    opts:{aggroRange:800}},
  {name:'agg1100',   opts:{aggroRange:1100,defenseBias:1}},
  {name:'tower60',   opts:{towerAt:60,tower2At:95,aggroRange:1000,defenseBias:1}},
  {name:'tower100',  opts:{towerAt:100,tower2At:150,aggroRange:900}},
  {name:'push120',   opts:{pushAt:120,aggroRange:1100,defenseBias:1}},
  {name:'heroFarmOff',opts:{heroFarm:false,aggroRange:1000,defenseBias:1}},
  {name:'noUnitSkills',opts:{unitSkills:false,aggroRange:1000,defenseBias:1}},
];
let W=0,N=0,tot=0;const losses=[];
for(const cv of clones){
  const out=[];
  for(const seat of [0,1]){
    const us=new Agent({}),cl=new SolClone(Object.assign({},cv.opts));
    const A=seat===0?us:cl,B=seat===0?cl:us;
    const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:800});
    const win=r.winner===seat;if(win){W++;tot+=r.duration;}else losses.push(cv.name+'/s'+seat);
    N++;
    const oppTH=r.th.find(x=>x.startsWith((1-seat)+':'));
    out.push(`s${seat}:${win?'W'+Math.round(r.duration):'L'+Math.round(r.duration)+'(TH'+(oppTH?oppTH.split(':')[1]:'X')+')'}`);
  }
  console.log(cv.name.padEnd(13),out.join('  '));
}
console.log(`TOTAL ${W}/${N} = ${(100*W/N).toFixed(1)}%  avg win ${Math.round(tot/Math.max(1,W))}s  losses: ${losses.join(',')||'none'}`);
