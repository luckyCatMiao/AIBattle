const engine = require('./engine.js');
const g = engine.createMatch({id:'m',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed:parseInt(process.argv[2]||'12000',10)});
const y0=parseInt(process.argv[3]||'0',10), y1=parseInt(process.argv[4]||'8',10);
const x0=parseInt(process.argv[5]||'0',10), x1=parseInt(process.argv[6]||'12',10);
function roll(seed,round,x,y){let s=((seed*31+round*977+x*131+y*17)>>>0)||1;
 const step=()=>{s=(s*1664525+1013904223)>>>0;return s/4294967296;};
 const r=step(); if(r>=0.55)return '.'; const p=step(); return p<=0.40?'B':(p<=0.75?'P':'S');}
let hdr='    '; for(let x=x0;x<=x1;x++)hdr+=String(x%10); console.log(hdr);
for(let y=y0;y<=y1;y++){let row=String(y).padStart(3)+' ';
 for(let x=x0;x<=x1;x++){const t=g.tiles[y*19+x]; row+= t===1?'#':(t===2? roll(g.seed,g.round,x,y).toLowerCase():'.');}
 console.log(row);}
