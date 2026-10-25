'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('../agent.js');
const agentVariants=JSON.parse(process.argv[2]||'[{"name":"base","opts":{}}]');
const cloneVariants=[
  {name:'base',opts:{}},
  {name:'def',opts:{pushAt:150,aggroRange:1100,defenseBias:1}},
  {name:'early',opts:{pushAt:110,aggroRange:1200,defenseBias:1}},
  {name:'turtle',opts:{pushAt:600,aggroRange:1400,defenseBias:1,towerAt:60,tower2At:90}},
  {name:'towers',opts:{towerAt:40,tower2At:70,aggroRange:1300,defenseBias:1}},
  {name:'boom',opts:{workers:22,pushAt:150}},
];
for(const av of agentVariants){
  const line=[];let w=0,n=0;
  for(const cv of cloneVariants)for(const seat of [0,1]){
    const us=new Agent(Object.assign({},av.opts)),cl=new SolClone(Object.assign({},cv.opts));
    const A=seat===0?us:cl,B=seat===0?cl:us;
    const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:600});
    const win=r.winner===seat;if(win)w++;n++;
    const oppTH=r.th.find(x=>x.startsWith((1-seat)+':'));
    line.push(`${cv.name}/s${seat}:${win?'W':'L'+Math.round(r.duration)}${win?'('+Math.round(r.duration)+')':''}${win?'':' TH'+(oppTH?oppTH.split(':')[1]:'X')}`);
  }
  console.log(av.name.padEnd(8),`${w}/${n}`);console.log('   '+line.join(' | '));
}
