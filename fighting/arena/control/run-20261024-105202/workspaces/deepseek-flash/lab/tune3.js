const {run,summarize,ALL}=require('./lab.js');
const cat=require('./catalog.patched.js');
const CH=cat.characters, BTN={lp:'LP',hp:'HP',lk:'LK',hk:'HK'};
const MOT={qcf:['D','DF','F'],qcb:['D','DB','B'],dp:['F','D','DF'],hcb:['F','DF','D','DB','B']};
function killSched(ch,key,t0){
  const d=CH[ch].normals[key], s=d.startup, h=d.hitstop||4;
  const resume=t0+s+h+1, sup=CH[ch].super, seq=MOT[sup.motion];
  const o={}; o[t0]=['F',BTN[key]];
  const ms=resume-(seq.length-1);
  for(let i=0;i<seq.length;i++) o[ms+i]=[seq[i], i===seq.length-1?sup.button:null];
  for(let j=1;j<=2;j++) o[ms+seq.length-1+j]=[seq[seq.length-1],sup.button];
  return {o,hit:t0+s,resume,ms};
}
for(const ch of ALL){
  for(const key of ['lp','lk','hp','hk']){
    const k=killSched(ch,key,0);
    const r=run(ch,'torv',110,k.o,null,200,100);
    const s=summarize(r);
    console.log(`${ch} ${key}->super dmg=${s.dmg} hits=${s.hits} oppHp=${s.oppHp} ${s.winner===0?'KILL':''}`);
  }
}
