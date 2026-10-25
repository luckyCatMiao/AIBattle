'use strict';
/* 跑图速度剖析：逐窗口 dx，统计“损失时间”（dx<1.6 格/窗口 = 慢于满速）。 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const sim = require(path.resolve(__dirname, '../../../../../../simulation.js'));
const WS = path.resolve(__dirname, '..');

class PyAgent {
  constructor(){ this.proc = spawn('python',['agent.py'],{cwd:WS,stdio:['pipe','pipe','pipe']});
    this.rl = readline.createInterface({input:this.proc.stdout}); this.waiters=[]; this.lines=[];
    this.rl.on('line',l=>{ if(this.waiters.length) this.waiters.shift()(l); else this.lines.push(l); });
    this.stderr=''; this.proc.stderr.on('data',d=>{this.stderr+=d.toString(); if(this.stderr.length>200000)this.stderr=this.stderr.slice(-100000);});
  }
  ask(obs){ const t0=Date.now(); this.proc.stdin.write(JSON.stringify(obs)+'\n');
    return new Promise((res,rej)=>{ const done=l=>{ try{res({reply:JSON.parse(l),ms:Date.now()-t0});}catch(e){rej(e);} };
      if(this.lines.length) done(this.lines.shift()); else this.waiters.push(done); }); }
  close(){ try{this.proc.stdin.end();}catch(e){} try{this.proc.kill();}catch(e){} }
}
function normWindow(raw){ const out=[]; for(let i=0;i<5;i++){ const f=raw[i];
  if(Array.isArray(f)) out.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);
  else if(f&&typeof f==='object') out.push([{move:Number(f.move)||0,jump:!!f.jump}]);
  else out.push([{move:0,jump:false}]); } return out; }

async function one(seed, seat=0, oppMode='idle', verbose=false){
  const g = sim.createMatch({id:'t',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const py = new PyAgent();
  const idle = { ask: async()=>({reply:{inputs:[[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]]},ms:0}), close(){} };
  const ctr = [seat===0?py:idle, seat===0?idle:py];
  const prof = []; let lastX = g.runners[seat].x; let lastT = g.time;
  let windows=0, maxMs=0;
  while (g.status==='playing' && windows<1400){
    const obs = Object.assign({}, sim.view(g, seat)); obs.yourPlayer=seat;
    const r = await ctr[seat].ask(obs);
    maxMs=Math.max(maxMs,r.ms);
    const other = sim.view(g,1-seat); other.yourPlayer=1-seat;
    const w0 = normWindow(normWindow2(r.reply.inputs||r.reply));
    const w1 = [[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]]; w1[0][0]={move:0,jump:false};
    const before = {x:g.runners[seat].x, t:g.time, deaths:g.runners[seat].deaths, phase:g.phase, frame:g.frame};
    sim.advanceWindow(g, [sim.submitWindow(g,seat===0?0:1,w0), sim.submitWindow(g,seat===0?1:0,w1)]);
    const after = {x:g.runners[seat].x, t:g.time, deaths:g.runners[seat].deaths};
    if (before.phase==='race'){
      prof.push({f:before.frame, t:before.t, dx: after.x-before.x, x:after.x, dead:after.deaths>before.deaths, dt:after.t-before.t});
    }
    windows++;
  }
  const r0 = g.runners[seat];
  const raceSec = g.time;
  const dist = r0.maxX - 2.5;
  const ideal = dist/6.8;
  const slow = prof.filter(p=>p.dt>0.2 && p.dx < 1.55);
  const lostSec = slow.reduce((s,p)=>s+Math.max(0, p.dt - Math.max(0,p.dx)/6.8),0);
  const deaths = prof.filter(p=>p.dead).length;
  py.close();
  return {seed, wins:[...g.wins], round:g.round, finished:r0.finished, maxX:+r0.maxX.toFixed(1), deaths:r0.deaths,
    raceSec:+raceSec.toFixed(2), ideal:+ideal.toFixed(2), lostSec:+lostSec.toFixed(2),
    slowWindows:slow.length, windows, maxMs,
    slowDetail: slow.slice(0,12).map(p=>({t:+p.t.toFixed(2),x:+p.x.toFixed(2),dx:+p.dx.toFixed(2)}))};
}
function normWindow2(raw){ return raw; }
(async()=>{
  const seeds=(process.argv[2]||'7001').split(',').map(Number);
  for(const s of seeds) console.log(JSON.stringify(await one(s)));
})();
