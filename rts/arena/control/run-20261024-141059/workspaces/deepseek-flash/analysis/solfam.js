'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
const {makeSol2}=require('./sol2.js');
function family(){
  const v=[];
  for(const rf of [0.2,0.3,0.45])for(const fr of [400,470,560])for(const db of [true,false])for(const rb of [false,true])for(const pa of [60,90,150]){
    v.push({retreatFrac:rf,focusRange:fr,defendBase:db,rebuildWorkers:rb,pushAfter:pa});
  }
  return v;
}
function evalCfg(myCfg,varCfgs){
  let w=0,g=0;const sw=[0,0],sg=[0,0];const losses=[];
  for(const vc of varCfgs){for(const seat of [0,1]){
    const me=makeEngine(myCfg),opp=makeSol2(vc);
    const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
    g++;sg[seat]++;if(r.winner===seat){w++;sw[seat]++;}else losses.push({seat,vc,dur:Math.round(r.duration)});
  }}
  return {w,g,rate:w/g,sw,sg,losses};
}
module.exports={family,evalCfg};
if(require.main===module){
  const myCfg=JSON.parse(process.argv[2]);
  const e=evalCfg(myCfg,family());
  console.log('win rate',(100*e.rate).toFixed(1)+'%','seats',e.sw,'/',e.sg,'games',e.g);
  const bySeat={};for(const l of e.losses){bySeat[l.seat]=(bySeat[l.seat]||0)+1}
  console.log('losses by seat',JSON.stringify(bySeat));
  for(const l of e.losses.slice(0,20))console.log('L seat'+l.seat,JSON.stringify(l.vc),'@'+l.dur);
}
