const {runMatch}=require('./harness.js');
const {makeSol}=require('./solbot2.js');
const {makeAgent}=require('./agent_v2_mod.js');
for(const swap of [0,1]){
  const A=makeAgent(),B=makeSol({});
  const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
  const as=swap?1:0;
  console.log('agentSeat',as,r.winner===as?'WIN':'LOSS','t',r.duration.toFixed(1),'score',r.scores[as]+':'+r.scores[1-as],'reason',r.reason,'errs',JSON.stringify(r.errs),JSON.stringify(r.errs1));
}
