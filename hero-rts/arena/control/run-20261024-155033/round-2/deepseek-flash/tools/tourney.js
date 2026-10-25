const {runMatch,SIM}=require('./sim.js');
const {SolBot}=require('./solbot.js');
const {Agent}=require('../agent.js');
function play(agentHero,agentOpts,solOpts,{agentSeat=0,maxSeconds=600,seed=1}={}){
  const A=new Agent(Object.assign({hero:agentHero},agentOpts));
  const S=new SolBot(solOpts||{});
  const [a,b]=agentSeat===0?[A,S]:[S,A];
  const r=runMatch(a,b,{seed,maxSeconds,heroA:agentSeat===0?agentHero:'druid',heroB:agentSeat===0?'druid':agentHero});
  return {r,win:r.winner===agentSeat,seat:agentSeat,dur:r.duration};
}
module.exports={play};
