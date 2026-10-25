const sim=require('./simulation.patched.js');
const {run,summarize}=require('./lab.js');
const cat=require('./catalog.patched.js');
const CH=cat.characters;
const BTN={lp:'LP',hp:'HP',lk:'LK',hk:'HK'};

// build chain schedule: keys list of normal keys; returns {sched, events:[{key,start,hit,resume}], end}
function buildChain(keys, t0){
  const out={}; const ev=[]; let t=t0;
  for (let i=0;i<keys.length;i++){
    const k=keys[i], d=CH[CUR].normals[k];
    const s=d.startup, h=d.hitstop||4;
    const hit=t+s, resume=hit+h+1;
    ev.push({key:k,start:t,hit,resume});
    // press at t, hold until resume (so next press is an edge)
    for (let f=t; f<=resume; f++) out[f]=['F',BTN[k]];
    // release the frame after resume unless the next press is there
    t=resume;
  }
  return {sched:out, ev, end:t};
}
let CUR='vex';

function testChain(ch, keys, dx, opp, meter){
  CUR=ch;
  const b=buildChain(keys,0);
  const r=run(ch,'torv',dx,b.sched,opp,140,meter);
  return {ch,keys:keys.join('>'),ev:b.ev.map(e=>`${e.key}@${e.start}(hit${e.hit})`).join(' '), ...summarize(r)};
}
const passive=null;
const blockB=()=>require('./lab.js').I('B');
const blockDB=()=>require('./lab.js').I('DB');
for (const ch of ['vex','kestrel','aegis','nyx','sable','torv']){
  for (const keys of [['lp','lk','hp'],['lp','lk','hk'],['lk','lp','hp']]){
    const res=testChain(ch,keys,110,passive);
    console.log(`${ch} ${keys.join('>')}: dmg=${res.dmg} hits=${res.hits} meter=${res.meter} ev=[${res.ev}]`);
  }
}
