'use strict';
const sim=require('../simulation.js');
const seed=Number(process.argv[2]||1000);
const g=sim.createMatch({id:'a',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
const t=g.track; const W=t.width,H=t.height;
let out='';
for(let y=0;y<H;y+=2){ let row='';
  for(let x=0;x<W;x+=1){ const v=t.tiles[y*W+x]; row += v===0?'#':v===2?'|':'.'; }
  out+=row+'\n';
}
console.log('seed',seed,'len',t.length.toFixed(1),'hw',t.halfWidth.toFixed(2));
console.log(out);
