'use strict';
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine.js');
const win20 = []; for (let i = 0; i < 20; i++) win20.push({ dir: 'N', btn: null });
class Agent {
  constructor(cmd) { const p = cmd.split(' ');
    this.proc = spawn(p[0], p.slice(1), { cwd: path.resolve(__dirname, '..'), stdio: ['pipe','pipe','pipe'] });
    this.buf=''; this.lines=[]; this.waiters=[]; this.dead=false;
    this.proc.stdout.on('data', d => { this.buf += d.toString(); let i;
      while ((i=this.buf.indexOf('\n'))>=0){const l=this.buf.slice(0,i).trim(); this.buf=this.buf.slice(i+1); if(l) this.lines.push(l);}
      while(this.lines.length&&this.waiters.length) this.waiters.shift()(this.lines.shift()); });
    this.proc.stderr.on('data',()=>{});
    this.proc.on('close',()=>{this.dead=true; while(this.waiters.length) this.waiters.shift()(null);}); }
  next(ms=5000){ if(this.lines.length) return Promise.resolve(this.lines.shift()); if(this.dead) return Promise.resolve(null);
    return new Promise(r=>{const t=setTimeout(()=>r(null),ms); this.waiters.push(l=>{clearTimeout(t);r(l);});}); }
  send(o){ this.proc.stdin.write(JSON.stringify(o)+'\n'); }
  kill(){ try{this.proc.kill();}catch(e){} }
}
async function play(seed, cmdA, cmdB) {
  const g = engine.createMatch({ id:'m', players:[{name:'A',kind:'api'},{name:'B',kind:'api'}], seed });
  const ag=[new Agent(cmdA), new Agent(cmdB)];
  const marks = [[null,null],[null,null],[null,null]]; // t=30,45,60 per side
  const times=[30,45,60];
  let w=0;
  while(g.status==='playing'&&w<800){ w++;
    const obs=[0,1].map(o=>{const s=engine.snapshot(g,o); s.lastErrors=[]; s.decisionWindows=true; s.framesPerWindow=20; s.exampleWindow=win20; return s;});
    ag.forEach((a,i)=>a.send(obs[i]));
    const rep=await Promise.all(ag.map(a=>a.next()));
    const wi=[null,null]; for(let i=0;i<2;i++){ try{ wi[i]=engine.submitWindow(g,i,JSON.parse(rep[i]).inputs);}catch(e){ ag.forEach(a=>a.kill()); return null; } }
    const t=g.roundFrames/20;
    for(let k=0;k<3;k++) for(let o=0;o<2;o++) if(marks[k][o]===null && t>=times[k] && g.fighters[o].alive) marks[k][o]=`${g.fighters[o].bombs}/${g.fighters[o].blast}/${g.fighters[o].speed}`;
    engine.advanceWindow(g,wi);
  }
  ag.forEach(a=>a.kill());
  return {marks, roundLog:g.roundLog};
}
(async()=>{
  const n=parseInt(process.argv[2]||'8',10), s0=parseInt(process.argv[3]||'9000',10);
  const cmdA=process.argv[4]||'python agent.py', cmdB=process.argv[5]||'python dev/agents/v1.py';
  const agg={30:[],45:[],60:[]};
  let rounds=0;
  for(let i=0;i<n;i++){ const r=await play(s0+i,cmdA,cmdB); if(!r) continue; rounds+=r.roundLog.length;
    for(let k=0;k<3;k++) for(let o=0;o<2;o++) if(r.marks[k][o]) agg[[30,45,60][k]].push(r.marks[k][o]); }
  for(const t of [30,45,60]){
    const arr=agg[t]; const A=arr.filter((_,i)=>i%2===0), B=arr.filter((_,i)=>i%2===1);
    const avg=a=>{ if(!a.length) return '-'; const p=a.map(x=>x.split('/').map(Number));
      return `${(p.reduce((s,x)=>s+x[0],0)/p.length).toFixed(1)}/${(p.reduce((s,x)=>s+x[1],0)/p.length).toFixed(1)}/${(p.reduce((s,x)=>s+x[2],0)/p.length).toFixed(1)}`; };
    console.log(`t=${t}s  A(${cmdA.split(' ')[1]||''})=${avg(A)}  B(${cmdB.split('/').pop()})=${avg(B)}`);
  }
  console.log('rounds', rounds);
})();
