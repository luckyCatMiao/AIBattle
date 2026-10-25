const path=require('path');
const {makeProc,playMatch}=require('./harness.js');
const WS=path.resolve(__dirname,'..');
const PY=process.env.PY||'python';
(async()=>{
  const a=makeProc(PY,[path.join(WS,'agent.py')],WS);
  const b=makeProc(PY,[path.join(__dirname,'bot.py'),'rush'],__dirname);
  a.proc.stderr.on('data',d=>process.stderr.write('A:'+d));
  b.proc.stderr.on('data',d=>process.stderr.write('B:'+d));
  const r=await playMatch(a,b,['vex','kestrel','aegis'],['kestrel','vex','aegis'],1);
  console.log('errors',r.errors,'status',r.g.status,'frames',r.g.frames,'winner',r.g.winner);
  console.log(JSON.stringify(r.g.roundLog));
  a.kill();b.kill();
})();
