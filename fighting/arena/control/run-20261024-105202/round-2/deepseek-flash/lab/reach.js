const {run,summarize,ALL}=require('./lab.js');
const cat=require('./catalog.patched.js');
const CH=cat.characters, BTN={lp:'LP',hp:'HP',lk:'LK',hk:'HK'};
const MOT={qcf:['D','DF','F'],qcb:['D','DB','B'],dp:['F','D','DF'],hcb:['F','DF','D','DB','B']};
// direct super from neutral
function superSched(ch,t0){const sup=CH[ch].super,seq=MOT[sup.motion];const o={};for(let i=0;i<seq.length;i++)o[t0+i]=[seq[i],i===seq.length-1?sup.button:null];return o;}
console.log('== normal reach (does single poke connect?) ==');
for(const ch of ALL){
  const line=[];
  for(const key of ['lp','hp','lk','hk']){
    let best=0;
    for(let dx=60;dx<=320;dx+=4){
      const r=run(ch,'torv',dx,{0:['F',BTN[key]]},null,30);
      if(r.g.players[0].hits>0) best=dx; else if(best) break;
    }
    line.push(`${key}:${best}`);
  }
  console.log(ch, line.join(' '));
}
console.log('== direct super max range & damage (passive dummy) ==');
for(const ch of ALL){
  const sup=CH[ch].super;
  let best=0, bestdmg=0;
  for(let dx=60;dx<=600;dx+=10){
    const r=run(ch,'torv',dx,superSched(ch,0),null,200,100);
    const d=r.g.players[0].damageDealt;
    if(d>0){best=dx;bestdmg=d;}
  }
  console.log(ch, sup.name, 'maxdx', best, 'dmg@maxdx', bestdmg);
}
