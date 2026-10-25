const {runDuel}=require('./duel');
const {Agent}=require('../agent.js');
const {SolClone}=require('./solclone.js');
const us=new Agent({marchFight:false,raidTime:9});
const cl=new SolClone({pushAt:600,aggroRange:1400,defenseBias:1,towerAt:60,tower2At:90});
const r=runDuel(cl,us,{heroA:'druid',heroB:'necromancer',maxSeconds:300});
console.log('FINAL',r.winner,r.duration.toFixed(1),r.th);
