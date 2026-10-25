const path=require('path');
const {makeProc,normalize}=require('./harness.js');
const sim=require('./simulation.patched.js');
const cat=require('./catalog.patched.js');
const WS=path.resolve(__dirname,'..');
const PY=process.env.PY||'python';
(async()=>{
  const style=process.argv[2]||'rush';
  const nf=parseInt(process.argv[3]||'180',10);
  const a=makeProc(PY,[path.join(WS,'agent.py')],WS);
  const b=makeProc(PY,[path.join(__dirname,'bot.py'),style],__dirname);
  const g=sim.createMatch({id:'m',players:[{name:'A',kind:'api',team:['vex','kestrel','aegis']},{name:'B',kind:'api',team:['kestrel','vex','aegis']}],seed:1});
  let w=0; let frame=0;
  while(g.status==='playing'&&frame<nf){
    const snaps=[0,1].map(o=>{const s=sim.snapshot(g,o);s.catalog={rules:cat.rules,characters:s.catalog};return s;});
    const lines=[];
    for(let o=0;o<2;o++) lines[o]=await (o===0?a:b).send(JSON.stringify(snaps[o]));
    let ins=[]; const meta=[];
    for(let o=0;o<2;o++){const obj=JSON.parse(lines[o]); ins.push(normalize(obj.inputs)); meta.push(obj.note||'');}
    console.log(`#W${w} f${frame} dx=${Math.abs(snaps[0].fighters[1].x-snaps[0].fighters[0].x).toFixed(0)} A[${snaps[0].fighters[0].state} ${snaps[0].fighters[0].move?snaps[0].fighters[0].move.name+'/'+snaps[0].fighters[0].move.frame:''} hp${snaps[0].fighters[0].hp} mt${Math.round(snaps[0].fighters[0].meter)}] note=${meta[0]} || B[${snaps[0].fighters[1].state} ${snaps[0].fighters[1].move?snaps[0].fighters[1].move.name+'/'+snaps[0].fighters[1].move.frame:''} hp${snaps[0].fighters[1].hp}]`);
    sim.advanceWindow(g,ins); frame+=15; w++;
  }
  a.kill();b.kill();
})();
