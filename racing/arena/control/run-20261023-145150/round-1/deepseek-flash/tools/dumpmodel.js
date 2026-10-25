'use strict';
const sim = require('../simulation.js');
const A = require('../agent.js');
const seed=Number(process.argv[2]||1000);
const cfg=Object.assign({},A.DEFAULTS, process.argv[3]?JSON.parse(process.argv[3]):{});
const g=sim.createMatch({id:'d',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
const m=A.buildModel(g.track,cfg);
const M=m.M;
console.log('length',g.track.length.toFixed(1),'hw',g.track.halfWidth.toFixed(2),'M',M,'step',m.step);
let maxOff=0; for(let k=0;k<M;k++) maxOff=Math.max(maxOff,Math.abs(m.off[k]));
console.log('max |offset|',maxOff.toFixed(2));
const step=Math.max(1,Math.round(2/m.step));
const rows=[];
for(let k=0;k<M;k+=step){
  const c=g.track.points; // unused
  rows.push({s:+(k*m.step).toFixed(1),kap:+m.kap[k].toFixed(3),v:+m.vlim[k].toFixed(1),off:+m.off[k].toFixed(2)});
}
// print compact: only where v<13.5
const low=rows.filter(r=>r.v<13.4);
console.log('low-speed rows',low.length,'of',rows.length);
console.log(rows.map(r=>`${r.s}:${r.v}/${r.kap.toFixed(2)}/${r.off.toFixed(1)}`).join(' ').slice(0,4000));
