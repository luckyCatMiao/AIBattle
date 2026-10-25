'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('../agent.js');
const agentVariants=JSON.parse(process.argv[2]);
const clones=[
  {name:'early',opts:{pushAt:110,aggroRange:1200,defenseBias:1}},
  {name:'turtle',opts:{pushAt:600,aggroRange:1400,defenseBias:1,towerAt:60,tower2At:90}},
  {name:'towers',opts:{towerAt:40,tower2At:70,aggroRange:1300,defenseBias:1}},
];
for(const av of agentVariants){
  const out=[];let w=0,n=0;
  for(const cv of clones)for(const seat of [0,1]){
    const us=new Agent(Object.assign({},av.opts)),cl=new SolClone(Object.assign({},cv.opts));
    const A=seat===0?us:cl,B=seat===0?cl:us;
    const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:700});
    const win=r.winner===seat;if(win)w++;n++;
    const oppTH=r.th.find(x=>x.startsWith((1-seat)+':'));
    out.push(`${cv.name}/s${seat}:${win?'W'+Math.round(r.duration):'L'+Math.round(r.duration)+'(TH'+(oppTH?oppTH.split(':')[1]:'X')+')'}`);
  }
  console.log(av.name.padEnd(10),`${w}/${n}`,out.join(' '));
}
