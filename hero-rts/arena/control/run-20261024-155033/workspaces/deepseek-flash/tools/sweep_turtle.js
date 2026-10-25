'use strict';
const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('../agent.js');
const base={departFootmen:12,departAt:50,commitFrac:0.45,commitDist:900,commitMin:5,nodeCapture:3};
const variants=[];
const list=JSON.parse(process.argv[2]);
for(const v of list)variants.push({name:v.name,opts:Object.assign({},base,v.opts)});
const clones=[{name:'turtle',opts:{pushAt:600,aggroRange:1400,defenseBias:1,towerAt:60,tower2At:90}},{name:'turtle2',opts:{pushAt:600,aggroRange:900,defenseBias:1,towerAt:40,tower2At:70,workers:22}}];
for(const v of variants){
 const line=[];let W=0,N=0;
 for(const cv of clones)for(const seat of [0,1]){
  const us=new Agent(Object.assign({},v.opts)),cl=new SolClone(Object.assign({},cv.opts));
  const A=seat===0?us:cl,B=seat===0?cl:us;
  const r=runDuel(A,B,{heroA:seat===0?'necromancer':'druid',heroB:seat===0?'druid':'necromancer',maxSeconds:700});
  const win=r.winner===seat;if(win)W++;N++;
  line.push(cv.name+'/s'+seat+':'+(win?'W'+Math.round(r.duration):'L'+Math.round(r.duration)));
 }
 console.log(v.name.padEnd(18),W+'/'+N,'|',line.join(' '));
}
