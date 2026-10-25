// node dbgmatch.js <myTeam> <oppSpec> <oppTeam> <swap 0/1> [maxWin]
const path=require('path');
const {makeProc}=require('./harness.js');
const sim=require('./simulation.patched.js');
const WS=path.resolve(__dirname,'..');
const PY=process.env.PY||'python';
const teamA=(process.argv[2]||'vex,kestrel,aegis').split(',');
const parts=(process.argv[3]||'py:bot.py:smart').split(':');
const teamB=(process.argv[4]||'torv,nyx,sable').split(',');
const swap=process.argv[5]==='1';
const MAXW=parseInt(process.argv[6]||'60',10);

const a=makeProc(PY,[path.join(WS,'agent.py')],WS);                 // 我
const b=makeProc(PY,[path.join(__dirname,parts[1]),...parts.slice(2)],__dirname); // 对手
a.proc.stderr.on('data',d=>process.stderr.write('AERR:'+d));
b.proc.stderr.on('data',d=>process.stderr.write('BERR:'+d));
const mySeat = swap?1:0;
const procs = swap? [b,a] : [a,b];
const teams = swap? [teamB,teamA] : [teamA,teamB];
const g=sim.createMatch({id:'d',players:[{name:'A',kind:'api',team:teams[0]},{name:'B',kind:'api',team:teams[1]}],seed:1});
(async()=>{
  let w=0;
  while(g.status==='playing' && w<MAXW){
    const reqs=procs.map((p,o)=>p.send(JSON.stringify((()=>{const s=sim.snapshot(g,o); s.catalog={rules:require('./catalog.patched.js').rules,characters:s.catalog}; return s;})())));
    const lines=await Promise.all(reqs);
    const ins=lines.map(l=>{const obj=JSON.parse(l); const arr=obj.inputs; const out=[]; for(let i=0;i<15;i++) out.push(arr[i]===undefined?{dir:'N',btn:null}:sim.normalizeInput(arr[i])); return out;});
    const me=g.fighters[mySeat], op=g.fighters[1-mySeat];
    const myNote = JSON.parse(lines[mySeat]).note;
    if (process.env.DUMPIN){
      const mine=ins[mySeat].map(x=>x.btn?x.dir+'/'+x.btn:x.dir).join(' ');
      const theirs=ins[1-mySeat].map(x=>x.btn?x.dir+'/'+x.btn:x.dir).join(' ');
      console.log(`w${w} f${g.frames} me=${me.char}/${me.state} hp${Math.round(me.hp)} | op=${op.char}/${op.state} f${op.move?op.move.frame:'-'} hp${Math.round(op.hp)} | ${myNote}
   MY : ${mine}
   OP : ${theirs}`);
    } else console.log(`w${w} f${g.frames} r${g.round} me=${me.char}/${me.state} hp${Math.round(me.hp)} m${Math.round(me.meter)} x${Math.round(me.x)} | op=${op.char}/${op.state} hp${Math.round(op.hp)} m${Math.round(op.meter)} x${Math.round(op.x)} | ${myNote}`);
    sim.advanceWindow(g, ins);
    w++;
  }
  console.log('END status',g.status,'winner',g.winner, JSON.stringify(g.roundLog));
  a.kill(); b.kill();
})();
