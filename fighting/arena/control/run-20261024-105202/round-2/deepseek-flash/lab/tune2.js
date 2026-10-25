const {run,summarize,ALL}=require('./lab.js');
const cat=require('./catalog.patched.js');
const CH=cat.characters, BTN={lp:'LP',hp:'HP',lk:'LK',hk:'HK'};
const MOT={qcf:['D','DF','F'],qcb:['D','DB','B'],dp:['F','D','DF'],hcb:['F','DF','D','DB','B']};

// build "normal -> cancel into super" schedule. returns {sched, info}
function buildKill(ch, key, t0, holdExtra=0){
  const d=CH[ch].normals[key], s=d.startup, h=d.hitstop||4;
  const resume=t0+s+h+1;
  const sup=CH[ch].super, seq=MOT[sup.motion], btn=sup.button;
  const out={};
  out[t0]=['F',BTN[key]];
  for(let f=1;f<seq.length;f++){} // nothing
  const mstart=resume-(seq.length-1);
  for(let i=0;i<seq.length;i++){
    const b = (i===seq.length-1)? btn : null;
    out[mstart+i]=[seq[i], b];
  }
  // hold last frame's btn for +3 then release
  const last=mstart+seq.length-1;
  for(let k=1;k<=3;k++) out[last+k]=[seq[seq.length-1], btn];
  return {sched:out, hit:t0+s, resume, mstart, last, end:last+4, sup:sup.name};
}
function test(ch,key,dx,opp,meter,extra){
  const b=buildKill(ch,key,0);
  const r=run(ch,'torv',dx,b.sched,opp,180,meter,extra);
  const s=summarize(r);
  return {ch,key,dx,info:`${key}@0 hit${b.hit} resume${b.resume} super@${b.mstart}`,dmg:s.dmg,hits:s.hits,meter:s.meter,oppHp:s.oppHp,status:s.status,winner:s.winner,ev:s.ev};
}
for(const ch of ALL){
  const r=test(ch,'lp',110,null,100);
  console.log(JSON.stringify(r));
}
console.log('--- blocked / whiff safety (vex) ---');
console.log(JSON.stringify(test('vex','lp',110,()=>({dir:'DB',btn:null}),100)));
console.log(JSON.stringify(test('vex','lp',400,null,100)));
