'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require(process.env.AGENT_FILE||'../agent.js');
const ourVariants=JSON.parse(process.argv[2]);
const cloneVariants=JSON.parse(process.argv[3]||'[{"name":"base","opts":{}},{"name":"push150","opts":{"pushAt":150,"aggroRange":1000,"defenseBias":1}},{"name":"push120","opts":{"pushAt":120,"aggroRange":1100,"defenseBias":1}},{"name":"tower60","opts":{"towerAt":60,tower2At":95,"aggroRange":1000,"defenseBias":1}},{"name":"w22push150","opts":{"workers":22,"pushAt":150}},{"name":"agg700","opts":{"aggroRange":700}},{"name":"harsh","opts":{"pushAt":110,"aggroRange":1300,"defenseBias":1,"towerAt":50,"tower2At":80}}]');
for(const av of ourVariants){
 let W=0,N=0;const L=[];
 const rows=[];
 for(const cv of cloneVariants){
  const line=[];
  for(const seat of [0,1]){
   const us=new Agent(Object.assign({},av.opts)),cl=new SolClone(Object.assign({},cv.opts));
   const A=seat===0?us:cl,B=seat===0?cl:us;
   const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:600});
   const win=r.winner===seat;if(win)W++;N++;
   if(!win)L.push(cv.name+'/s'+seat+'('+r.duration.toFixed(0)+')');
   line.push(win?'W':'L');
  }
  rows.push(cv.name.padEnd(10)+line.join(''));
 }
 console.log(av.name.padEnd(18),`${W}/${N}`,L.length?'L:'+L.join(' '):'', ' | '+rows.join(' '));
}
