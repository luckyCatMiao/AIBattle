'use strict';
/* 场景测试：对手（固定用 r1 版 agent 驱动）到 stopAt 后强制原地停 holdSec 秒，
   比较被测 agent 越过对手的时间。 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const sim = require(path.resolve(__dirname, '../../../../../../simulation.js'));
const WS = path.resolve(__dirname, '..');
class PyAgent {
  constructor(script){ this.proc=spawn('python',['-I',script],{cwd:WS,stdio:['pipe','pipe','pipe']});
    this.rl=readline.createInterface({input:this.proc.stdout}); this.waiters=[]; this.lines=[];
    this.rl.on('line',l=>{ if(this.waiters.length) this.waiters.shift()(l); else this.lines.push(l); });
    this.stderr=''; this.proc.stderr.on('data',d=>{this.stderr+=d.toString();});
  }
  ask(obs){ this.proc.stdin.write(JSON.stringify(obs)+'\n');
    return new Promise((res,rej)=>{ const done=l=>{try{res({reply:JSON.parse(l)});}catch(e){rej(e);}};
      if(this.lines.length) done(this.lines.shift()); else this.waiters.push(done); }); }
  close(){ try{this.proc.stdin.end();}catch(e){} try{this.proc.kill();}catch(e){} }
}
const NEU=[[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]];
function norm(raw){ const o=[]; for(let i=0;i<5;i++){ const f=raw[i];
  if(Array.isArray(f)) o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);
  else if(f&&typeof f==='object') o.push([{move:Number(f.move)||0,jump:!!f.jump}]); else o.push([{move:0,jump:false}]); } return o; }
async function run(seed, script, stopAt, holdSec=1.5, seatAgent=0){
  const g=sim.createMatch({id:'b',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const A=new PyAgent(script), B=new PyAgent('tools/agent_r1.py');
  const oppSeat=1-seatAgent;
  const ctr=[seatAgent===0?A:B, seatAgent===0?B:A];
  let stoppedUntil=null, passT=null, windows=0; const trace=[];
  while (g.status==='playing' && windows<500 && passT===null){
    const ans=[];
    for (let s=0;s<2;s++){
      const obs=Object.assign({},sim.view(g,s)); obs.yourPlayer=s;
      ans[s]=norm((await ctr[s].ask(obs)).reply.inputs);
    }
    const o=g.runners[oppSeat];
    if (stoppedUntil===null && o.x>=stopAt) stoppedUntil=g.time+holdSec;
    if (stoppedUntil!==null && g.time<stoppedUntil && o.x>=stopAt-1) ans[oppSeat]=NEU;
    const mx0=g.runners[seatAgent].maxX;
    sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
    const a=g.runners[seatAgent];
    trace.push({t:+g.time.toFixed(2),a:+a.x.toFixed(2),b:+g.runners[oppSeat].x.toFixed(2)});
    if (a.x > g.runners[oppSeat].x + 0.2 && a.x > stopAt) passT=g.time;
    windows++;
  }
  const res={seed, script, passT:passT===null?null:+passT.toFixed(2), x:g.runners.map(r=>+r.x.toFixed(1)),
    deaths:g.runners.map(r=>r.deaths), windows, trace: passT===null?trace.slice(-6):trace.filter(p=>p.t>passT-1.2&&p.t<passT+0.4).slice(0,14)};
  A.close(); B.close();
  return res;
}
(async()=>{
  const seeds=(process.argv[2]||'7002').split(',').map(Number);
  const stopAt=Number(process.argv[3]||40);
  for (const seed of seeds){
    for (const script of ['tools/agent_r1.py','agent.py']){
      const r=await run(seed,script,stopAt);
      console.log(JSON.stringify({seed,script,passT:r.passT,x:r.x,deaths:r.deaths}));
    }
  }
})();
