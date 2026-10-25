const engine = require('./engine.js');
// replicate rollDrop for seed/round/cell
function makeRng(seed){let s=(seed>>>0)||1;return()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};}
function roll(seed,round,x,y){const rng=makeRng(seed*31+round*977+x*131+y*17);const r=rng();if(r>=0.55)return null;const p=rng();let acc=0,ch='bomb';for(const [t,w] of [['bomb',0.40],['blast',0.35],['speed',0.25]]){acc+=w;if(p<=acc){ch=t;break;}}return ch;}
const out=[];
for(let y=0;y<17;y++)for(let x=0;x<19;x++){const v=roll(12000,1,x,y);if(v)out.push(x+','+y+'='+v);}
console.log(out.length, out.slice(0,20).join(' '));
