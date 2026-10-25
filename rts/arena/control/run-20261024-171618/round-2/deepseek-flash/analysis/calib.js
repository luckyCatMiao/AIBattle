const {runMatch}=require('./harness.js');
const {makeOld}=require('./oldagent.js');
const {makeSol}=require('./solbot.js');
for(const swap of [0,1]){
  const old=makeOld(), sol=makeSol();
  const pols = swap? [sol,old]:[old,sol];
  const r=runMatch(pols,{maxT:600});
  // old seat: swap?1:0 ; sol seat: swap?0:1
  const os=swap?1:0, ss=swap?0:1;
  console.log('oldseat',os,'winner seat',r.winner,'reason',r.reason,'dur',r.duration.toFixed(1),'scores old/sol',r.scores[os],r.scores[ss],'lv',r.level[os],r.level[ss],'errs',r.errs,r.errs1);
}
console.log('REAL: r1-g1 old(west) lost t133.35 score 955 vs 2652; r1-g2 old(east) lost t159.4 score 1307 vs 3123');
