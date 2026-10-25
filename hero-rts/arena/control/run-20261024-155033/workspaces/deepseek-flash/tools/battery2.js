'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('../agent.js');
const agentVariants=JSON.parse(process.argv[2]||'[{"name":"base","opts":{}}]');
const cloneVariants=JSON.parse(process.argv[3]||'[{"name":"base","opts":{}},{"name":"def","opts":{"pushAt":150,"aggroRange":1100,"defenseBias":1}}]');
for(const av of agentVariants){
  const line=[];
  let w=0,n=0;
  for(const cv of cloneVariants)for(const seat of [0,1]){
    const us=new Agent(Object.assign({},av.opts)),cl=new SolClone(Object.assign({},cv.opts));
    const A=seat===0?us:cl,B=seat===0?cl:us;
    const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:420});
    const win=r.winner===seat;if(win)w++;n++;
    const oppTH=r.th.find(x=>x.startsWith((1-seat)+':'));
    line.push(`${cv.name}/s${seat}:${win?'W':'L'} ${Math.round(r.duration)}s TH=${oppTH?oppTH.split(':')[1]:'X'}`);
  }
  console.log(av.name.padEnd(10),`${w}/${n}`,line.join(' | '));
}
