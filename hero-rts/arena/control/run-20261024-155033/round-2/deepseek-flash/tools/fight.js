const {runMatch}=require('./sim.js');
const {SolBot}=require('./solbot.js');
const {Agent}=require('../agent.js');
function run(hero,opts,{seat=0,maxSeconds=900,solOpts={}}={}){
  const A=new Agent(Object.assign({hero},opts));
  const S=new SolBot(solOpts);
  const [a,b]=seat===0?[A,S]:[S,A];
  const r=runMatch(a,b,{maxSeconds,heroA:seat===0?hero:'druid',heroB:seat===0?'druid':hero});
  return {r,agentSeat:seat};
}
module.exports={run};
