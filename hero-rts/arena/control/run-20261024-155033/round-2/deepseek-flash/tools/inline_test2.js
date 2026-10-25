const {runDuel}=require('./duel');
const {Agent}=require('../agent.js');
const {SolClone}=require('./solclone.js');
function run(withFrame){
 const us=new Agent({marchFight:false,raidTime:9});
 const cl=new SolClone({pushAt:600,aggroRange:1400,defenseBias:1,towerAt:60,tower2At:90});
 const opts={heroA:'druid',heroB:'necromancer',maxSeconds:300};
 if(withFrame)opts.onFrame=()=>{};
 const r=runDuel(cl,us,opts);
 console.log('withFrame',withFrame,'winner',r.winner,'TH',r.th);
}
run(false);run(true);
