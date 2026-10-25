'use strict';
// Two different agent commands: node mock_duel2.js <seed> <cmdB...> -- <cmdA...>
const { spawn } = require('child_process');
const sim = require('./simulation.js');
const seed = Number(process.argv[2]);
const rest = process.argv.slice(3);
const sep = rest.indexOf('--');
const cmd0 = rest.slice(0, sep), cmd1 = rest.slice(sep+1);
const g = sim.createMatch({ id:'duel', seed, players:[{name:'A',kind:'api'},{name:'B',kind:'api'}] });
function mk(cmd) {
  const child = spawn(cmd[0], cmd.slice(1), { stdio:['pipe','pipe','pipe'] });
  const st={child,buf:'',waiting:[]};
  child.stdout.on('data', d=>{ st.buf+=d.toString(); let i;
    while((i=st.buf.indexOf('\n'))>=0){ const line=st.buf.slice(0,i); st.buf=st.buf.slice(i+1);
      const cb=st.waiting.shift(); if(cb) cb(line);} });
  child.stderr.on('data', d=>process.stderr.write('[agent] '+d.toString()));
  return st;
}
const sts=[mk(cmd0), mk(cmd1)];
function ask(st,p){ return new Promise((res,rej)=>{ const t0=Date.now();
  st.waiting.push(line=>res({line,ms:Date.now()-t0}));
  st.child.stdin.write(JSON.stringify(p)+'\n');
  setTimeout(()=>{ if(st.waiting.length){ st.waiting.shift(); rej(new Error('timeout')); } },8000); }); }
(async()=>{
  while (g.status==='playing' && g.frame < 300*20) {
    const [r0,r1] = await Promise.all([ask(sts[0], sim.view(g,0)), ask(sts[1], sim.view(g,1))]);
    const w0=sim.submitWindow(g,0,JSON.parse(r0.line).inputs);
    const w1=sim.submitWindow(g,1,JSON.parse(r1.line).inputs);
    sim.advanceWindow(g,[w0,w1]);
  }
  const out=[0,1].map(t=>{ const c=g.cars[t];
    return { team:t, lap:c.lap, finished:c.finished, finishTime:c.finishTime, bestLap:c.bestLap,
             progress:Math.round(c.progress), collisions:c.collisions }; });
  const coll=g.events.filter(e=>e.type==='collision').map(e=>({t:e.t,a:e.a,b:e.b,speed:e.speed}));
  console.log(JSON.stringify({seed,winner:g.winner,reason:g.reason,cars:out,collisions:coll,
                              frames:g.frame}));
  sts.forEach(p=>{ p.child.stdin.end(); setTimeout(()=>p.child.kill(),100); });
})().catch(e=>{ console.error('ERR',e); sts.forEach(p=>p.child.kill()); process.exit(1); });
