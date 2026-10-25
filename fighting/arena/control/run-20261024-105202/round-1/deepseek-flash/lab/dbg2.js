const path=require('path');
const {makeProc,normalize}=require('./harness.js');
const sim=require('./simulation.patched.js');
const cat=require('./catalog.patched.js');
const WS=path.resolve(__dirname,'..');
const PY=process.env.PY||'python';
(async()=>{
  const style=process.argv[2]||'rush';
  const a=makeProc(PY,[path.join(WS,'agent.py')],WS);
  const b=makeProc(PY,[path.join(__dirname,'bot.py'),style],__dirname);
  const g=sim.createMatch({id:'m',players:[{name:'A',kind:'api',team:['vex','kestrel','aegis']},{name:'B',kind:'api',team:process.argv[4]?process.argv[4].split(','):['kestrel','vex','aegis']}],seed:parseInt(process.argv[3]||'1',10)});
  const notes={};
  let w=0;
  while(g.status==='playing'&&w<400){
    const reqs=[0,1].map(o=>{const s=sim.snapshot(g,o);s.catalog={rules:cat.rules,characters:s.catalog};return [o,JSON.stringify(s)];});
    const lines=[];
    for(const [o,j] of reqs) lines[o]=await (o===0?a:b).send(j);
    let ins=[];
    for(let o=0;o<2;o++){ const obj=JSON.parse(lines[o]); if(o===0){const n=obj.note||''; notes[n]=(notes[n]||0)+1;} ins.push(normalize(obj.inputs)); }
    sim.advanceWindow(g,ins); w++;
  }
  console.log('winner',g.winner,'frames',g.frames,'rounds',g.roundLog.length);
  console.log(JSON.stringify(g.roundLog));
  console.log('A notes:',JSON.stringify(notes));
  const ev=g.events.filter(e=>e.type==='hit');
  console.log('A dealt',g.players[0].damageDealt,'hits',g.players[0].hits,'blocks',g.players[0].blocks);
  console.log('B dealt',g.players[1].damageDealt,'hits',g.players[1].hits,'blocks',g.players[1].blocks);
  a.kill();b.kill();
})();
