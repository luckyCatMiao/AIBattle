const {runDuel}=require('./duel');
const {Agent}=require('../agent.js');
const {SolClone}=require('./solclone.js');
function run(){
 const us=new Agent({marchFight:false,raidTime:9});
 const cl=new SolClone({pushAt:600,aggroRange:1400,defenseBias:1,towerAt:60,tower2At:90});
 const tl=[];
 const r=runDuel(cl,us,{heroA:'druid',heroB:'necromancer',maxSeconds:300,onFrame:(g)=>{
   if(Math.abs(g.now%20)<0.06)tl.push(Math.round(g.now)+':'+(g.buildings.find(b=>b.type==='townhall'&&b.owner===0)?.hp|0));
 }});
 return {inl:r.th.join(','), tl:tl.join(' '), winner:r.winner};
}
console.log(run());
console.log(run());
