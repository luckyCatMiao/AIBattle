const engine = require('./engine.js');
const seed = parseInt(process.argv[2]||'12000',10);
const g = engine.createMatch({id:'m',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
const x0=+(process.argv[3]||0), x1=+(process.argv[4]||18), y0=+(process.argv[5]||0), y1=+(process.argv[6]||7);
let hdr='    '; for(let x=x0;x<=x1;x++)hdr+=String(x%10)+' '; console.log(hdr);
for(let y=y0;y<=y1;y++){let row=String(y).padStart(3)+' ';
  for(let x=x0;x<=x1;x++){const t=g.tiles[y*19+x]; row+=(t===1?'#':t===2?'o':'.')+' ';}
  console.log(row);}
