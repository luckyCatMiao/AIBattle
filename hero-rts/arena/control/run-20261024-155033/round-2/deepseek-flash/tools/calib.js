const {runDuel}=require('./duel');
const {SolClone}=require('./solclone.js');
const {Agent}=require('./agent_r1_backup.js');
const C=require('./duel');
for(const seat of [0,1]){
  const clone=new SolClone({});
  const old=new Agent();
  const A=seat===0?clone:old, B=seat===0?old:clone;
  const r=C.runDuel(A,B,{heroA:seat===0?'druid':'necromancer',heroB:seat===0?'necromancer':'druid',maxSeconds:900});
  console.log('cloneSeat',seat,'winner',r.winner,'(clone is',seat,') dur',r.duration.toFixed(1),'TH',r.th,'heroes',r.heroes,'rej',JSON.stringify(r.stats.rejected));
}
