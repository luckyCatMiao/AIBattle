'use strict';
/* 单人跑图评测：agent 坐 1 号位（起点在前，后面挂机玩家不挡路），统计每局用时/死亡/停滞。 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const sim = require(path.resolve(__dirname, '../../../../../../simulation.js'));
const WS = path.resolve(__dirname, '..');
class PyAgent {
  constructor(script){ this.proc=spawn('python',['-I',script],{cwd:WS,stdio:['pipe','pipe','pipe']});
    this.rl=readline.createInterface({input:this.proc.stdout}); this.waiters=[]; this.lines=[];
    this.rl.on('line',l=>{ if(this.waiters.length) this.waiters.shift()(l); else this.lines.push(l); });
    this.stderr=''; this.proc.stderr.on('data',d=>{ this.stderr+=d.toString(); });
  }
  ask(obs){ const t0=Date.now(); this.proc.stdin.write(JSON.stringify(obs)+'\n');
    return new Promise((res,rej)=>{ const done=l=>{try{res({reply:JSON.parse(l),ms:Date.now()-t0});}catch(e){rej(e);}};
      if(this.lines.length) done(this.lines.shift()); else this.waiters.push(done); }); }
  close(){ try{this.proc.stdin.end();}catch(e){} try{this.proc.kill();}catch(e){} }
}
const IDLE = [[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]];
function normWindow(raw){ const out=[]; for(let i=0;i<5;i++){ const f=raw[i];
  if(Array.isArray(f)) out.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);
  else if(f&&typeof f==='object') out.push([{move:Number(f.move)||0,jump:!!f.jump}]);
  else out.push([{move:0,jump:false}]); } return out; }
async function one(seed, script, seat=1, maxWindows=2000){
  const g = sim.createMatch({id:'s',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const py = new PyAgent(script);
  const rounds=[]; let cur={round:1, deaths:0, t0:null, lastx:2.5, still:0, maxstill:0, stillAt:null, waits:0};
  let windows=0, maxMs=0, sumMs=0, nMs=0;
  const roundEndInfo=[];
  let lastEventIdx = 0;
  while (g.status==='playing' && windows<maxWindows){
    const obs = Object.assign({}, sim.view(g, seat)); obs.yourPlayer=seat;
    const before={x:g.runners[seat].x, t:g.time, deaths:g.runners[seat].deaths, phase:g.phase, frame:g.frame, maxX:g.runners[seat].maxX, oppx:g.runners[1-seat].x};
    const r = await py.ask(obs); maxMs=Math.max(maxMs,r.ms); sumMs+=r.ms; nMs++;
    const ans=[]; ans[seat]=normWindow(r.reply.inputs||r.reply); ans[1-seat]=IDLE;
    const w=[sim.submitWindow(g,0,ans[0]), sim.submitWindow(g,1,ans[1])];
    sim.advanceWindow(g,w);
    if (before.phase==='race'){
      const R=g.runners[seat];
      if (R.deaths>before.deaths) cur.deaths++;
      const dx=R.x-before.x;
      if (g.round===cur.round && before.phase==='race'){
        if (dx < 0.35 && R.onGround) { cur.still++; if(cur.still>cur.maxstill){cur.maxstill=cur.still; cur.stillAt={t:before.t,x:R.x};} }
        else cur.still=0;
      }
    }
    // 局结束时记录（用窗口前的快照，因为 setupRound 会重置 runners）
    for (const e of g.events.slice(lastEventIdx)) {
      if (e.type==='round') roundEndInfo.push({round:e.round, winner:e.team, reason:e.reason, t:e.t,
        x:before.x, maxX:before.maxX, deaths:cur.deaths, still:cur.maxstill, stillAt:cur.stillAt, oppx:before.oppx});
    }
    lastEventIdx = g.events.length;
    if (g.round !== cur.round) { cur={round:g.round, deaths:0, t0:null, lastx:g.runners[seat].x, still:0, maxstill:0, stillAt:null, waits:0}; }
    windows++;
  }
  py.close();
  return {seed, wins:[...g.wins], status:g.status, rounds:roundEndInfo, maxMs, avgMs:nMs?Math.round(sumMs/nMs):0, windows,
          err: py.stderr ? py.stderr.split('\n').slice(-1)[0] : ''};
}
(async()=>{
  const seeds=(process.argv[2]||'1').split(',').map(Number);
  const script=process.argv[3]||'agent.py';
  let deaths=0, stalls=0, done=0, total=0;
  for (const s of seeds){
    const r = await one(s, script);
    for (const rd of r.rounds){ total++; if (rd.winner!=null) done++; deaths+=rd.deaths; if (rd.still>=2) stalls++; }
    console.log(JSON.stringify({seed:s, wins:r.wins, status:r.status, maxMs:r.maxMs, avgMs:r.avgMs, rounds:r.rounds.map(rd=>({r:rd.round,w:rd.winner,reason:rd.reason,t:rd.t,x:+(rd.x||0).toFixed(1),mx:+(rd.maxX||0).toFixed(1),d:rd.deaths,still:rd.still,stillAt:rd.stillAt&&{t:+rd.stillAt.t.toFixed(2),x:+rd.stillAt.x.toFixed(1)}})), err:r.err.slice(0,120)}));
  }
  console.log(`TOTAL seeds=${seeds.length} rounds=${total} decided=${done} deaths=${deaths} stallRounds=${stalls}`);
})();
