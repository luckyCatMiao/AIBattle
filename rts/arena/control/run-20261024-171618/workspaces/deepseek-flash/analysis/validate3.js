const {runMatch}=require('./harness.js');
const {makeSol}=require('./solbot2.js');
const {makeAgent}=require('./agent3.js');
const cfgs=JSON.parse(process.argv[2]||'[{}]');
const solCfg=JSON.parse(process.argv[3]||'{}');
for(const cfg of cfgs){
  let line=JSON.stringify(cfg).slice(0,70).padEnd(30);
  for(const swap of [0,1]){
    const A=makeAgent(cfg),B=makeSol(solCfg);
    const r=runMatch(swap?[B,A]:[A,B],{maxT:600});
    const as=swap?1:0;
    line+=' | s'+as+' '+(r.winner===as?'WIN':'LOSS')+' t'+r.duration.toFixed(0)+' '+r.scores[as]+':'+r.scores[1-as];
  }
  console.log(line);
}
