'use strict';
/* 统计“下包后转化率”：进攻方成功下包的回合里，最终有多少赢。 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'simulation.js'));

function makeAgent(cmd, extraEnv) {
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe','pipe','pipe'], env: { ...process.env, ...extraEnv } });
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [], waiters = [];
  p.stderr.on('data', d => process.stderr.write('[agent] '+d));
  rl.on('line', l => { let v=null; try{v=JSON.parse(l);}catch(e){} if(waiters.length) waiters.shift()(v); else queue.push(v); });
  p.on('exit', () => { while(waiters.length) waiters.shift()(null); });
  return { ask(o){ p.stdin.write(JSON.stringify(o)+'\n'); return new Promise((res,rej)=>{const t=setTimeout(()=>rej(new Error('timeout')),5000);const done=v=>{clearTimeout(t);res(v);}; if(queue.length)done(queue.shift()); else waiters.push(done);}); }, close(){try{p.kill();}catch(e){}} };
}
function parseSeeds(s){const o=[];for(const p of String(s).split(',')){const m=p.match(/^(\d+)-(\d+)$/);if(m){for(let i=+m[1];i<=+m[2];i++)o.push(i);}else if(p.trim())o.push(+p);}return o;}
const args=process.argv.slice(2); let seeds=[1], envA={}, envB={}, ca='python3 -u agent.py', cb='python3 -u tools/agent_r2.py';
for(let i=0;i<args.length;i++){ if(args[i]==='--seeds')seeds=parseSeeds(args[++i]); else if(args[i]==='--agentA')ca=args[++i]; else if(args[i]==='--agentB')cb=args[++i]; else if(args[i]==='--envA'){for(const kv of args[++i].split(',')){const j=kv.indexOf('=');envA[j<0?kv:kv.slice(0,j)]=j<0?'1':kv.slice(j+1);}} else if(args[i]==='--envB'){for(const kv of args[++i].split(',')){const j=kv.indexOf('=');envB[j<0?kv:kv.slice(0,j)]=j<0?'1':kv.slice(j+1);}} }
(async()=>{
  let stats={atkPlanted:0,atkPlantWin:0,atkNoPlant:0,atkNoPlantWin:0};
  let byTimer={};
  for(const seed of seeds){
    const g=sim.createMatch({id:'pp'+seed+'_'+Math.random().toString(36).slice(2,6),players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed});
    const ag=[makeAgent(ca.split(' '),envA),makeAgent(cb.split(' '),envB)];
    let plantedAt=null, plantSite=null;
    while(g.status==='playing'){
      if(g.phase==='buy'){ const v=[sim.view(g,0),sim.view(g,1)]; const b=await Promise.all([ag[0].ask(v[0]),ag[1].ask(v[1])]); sim.submitBuys(g,0,(b[0]&&b[0].buys)||[]); sim.submitBuys(g,1,(b[1]&&b[1].buys)||[]); }
      else if(g.phase==='live'){ const v=[sim.view(g,0),sim.view(g,1)]; const d=await Promise.all([ag[0].ask(v[0]),ag[1].ask(v[1])]);
        const w0=sim.submitWindow(g,0,(d[0]&&d[0].inputs)||[]); const w1=sim.submitWindow(g,1,(d[1]&&d[1].inputs)||[]);
        const wasPlanted = g.bomb.state==='planted';
        sim.advanceWindow(g,{0:w0,1:w1});
        if(!wasPlanted && g.bomb.state==='planted'){ plantedAt=g.roundFrames; plantSite=g.bomb.site; }
      } else break;
    }
    ag.forEach(a=>a.close());
    for(const r of g.roundLog){
      const aIsAtk = r.round<=3 ? r.winnerTeam===0 : r.winnerTeam===1;
      const attackerTeam = r.round<=3?0:1;
      const atkWon = r.winnerTeam===attackerTeam;
      const planted = ['planted','defused','exploded'].includes(r.bomb.state);
      if(planted){ stats.atkPlanted++; if(atkWon) stats.atkPlantWin++; }
      else { stats.atkNoPlant++; if(atkWon) stats.atkNoPlantWin++; }
    }
  }
  console.log(JSON.stringify(stats));
})();
