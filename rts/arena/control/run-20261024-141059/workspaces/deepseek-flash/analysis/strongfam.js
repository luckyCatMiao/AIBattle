'use strict';
const {runMatch}=require('./sim.js');
const {makeEngine}=require('./engine.js');
function strongFamily(){
  const v=[];let seed=100;
  for(const pr of [1.2,1.3,1.5])for(const er of [380,430,480])for(const fm of ['lowhp','spread'])for(const op of ['nodes','defend']){
    v.push({build:['tank'],workersTarget:4,opening:op,focusMode:fm,engageRange:er,powerRatio:pr,captureNodes:true,retreatFrac:0.3,seed:++seed});
  }
  return v;
}
function evalCfg(myCfg,opps){
  let w=0,g=0;const sw=[0,0],sg=[0,0];const losses=[];
  for(const oc of opps){for(const seat of [0,1]){
    const me=makeEngine(myCfg),opp=makeEngine(oc);
    const r=seat===0?runMatch(me,opp,{}):runMatch(opp,me,{});
    g++;sg[seat]++;if(r.winner===seat){w++;sw[seat]++;}else losses.push({seat,oc,dur:Math.round(r.duration)});
  }}
  return {w,g,rate:w/g,sw,sg,losses};
}
module.exports={strongFamily,evalCfg};
if(require.main===module){
  const myCfg=JSON.parse(process.argv[2]);
  const e=evalCfg(myCfg,strongFamily());
  console.log('strong-family win rate',(100*e.rate).toFixed(1)+'%','seats',e.sw,'/',e.sg,'games',e.g);
  const bs={};for(const l of e.losses)bs[l.seat]=(bs[l.seat]||0)+1;
  console.log('losses by seat',JSON.stringify(bs));
}
