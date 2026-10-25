'use strict';
/* 单人跑图评测 v3：按 round 事件精确统计每局时长 / 是否到终点 / 死亡 / maxX。 */
const path=require('node:path'); const {spawn}=require('node:child_process'); const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));
const WS=path.resolve(__dirname,'..');
class PyAgent{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe']});
 this.rl=readline.createInterface({input:this.proc.stdout});this.waiters=[];this.lines=[];
 this.rl.on('line',l=>{if(this.waiters.length)this.waiters.shift()(l);else this.lines.push(l);});
 this.stderr='';this.proc.stderr.on('data',d=>{this.stderr+=d.toString();});}
 ask(o){const t0=Date.now();this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res({reply:JSON.parse(l),ms:Date.now()-t0});}catch(e){rej(e);}};if(this.lines.length)done(this.lines.shift());else this.waiters.push(done);});}
 close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
const NEU=[[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]];
function norm(raw){const o=[];for(let i=0;i<5;i++){const f=raw[i];if(Array.isArray(f))o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);else if(f&&typeof f==='object')o.push([{move:Number(f.move)||0,jump:!!f.jump}]);else o.push([{move:0,jump:false}]);}return o;}
async function one(seed, script, seat=1){
  const g=sim.createMatch({id:'s',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const py=new PyAgent(script);
  let maxMs=0,sumMs=0,nMs=0,windows=0; const evIdx={n:0}; const roundRes=[];
  let deathsByRound={}, curRound=1, seenDeaths=0;
  while(g.status==='playing'&&windows<2600){
    const obs=Object.assign({},sim.view(g,seat));obs.yourPlayer=seat;
    const before={x:g.runners[seat].x,t:g.time,deaths:g.runners[seat].deaths,phase:g.phase,maxX:g.runners[seat].maxX,frame:g.frame,round:g.round};
    const r=await py.ask(obs); maxMs=Math.max(maxMs,r.ms); sumMs+=r.ms; nMs++;
    const ans=[]; ans[seat]=norm(r.reply.inputs||r.reply); ans[1-seat]=NEU;
    sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
    const R=g.runners[seat];
    // 事件
    for(const e of g.events.slice(evIdx.n)){
      if(e.type==='respawn'&&e.team===seat) deathsByRound[before.round]=(deathsByRound[before.round]||0)+1;
      if(e.type==='round'){
        roundRes.push({round:e.round,winner:e.team,reason:e.reason,endFrame:e.frame,
          startFrame: (e.round-1)*0, dur:+(e.frame/20).toFixed(2), maxX:before.maxX, x:before.x,
          deaths:deathsByRound[before.round]||0, reached: e.reason==='到达终点' && e.team===seat, winner:e.team});
      }
    }
    evIdx.n=g.events.length;
    windows++;
  }
  py.close();
  // 计算每局时长：用 round 事件帧差
  let last=0; const rounds=[];
  for(const r of roundRes){ rounds.push({...r, dur:+((r.endFrame-last)/20).toFixed(2)}); last=r.endFrame; }
  return {seed, rounds, maxMs, avgMs:nMs?Math.round(sumMs/nMs):0, windows, err:py.stderr?py.stderr.split('\n').slice(-1)[0]:''};
}
(async()=>{
  const seeds=(process.argv[2]||'1').split(',').map(Number);
  const script=process.argv[3]||'agent.py';
  let sumT=0, reached=0, tot=0, deaths=0, sumMaxX=0, maxMs=0;
  const lines=[];
  for(const s of seeds){
    const r=await one(s,script);
    maxMs=Math.max(maxMs,r.maxMs);
    for(const rd of r.rounds){
      tot++; deaths+=rd.deaths; sumMaxX+=rd.maxX;
      if(rd.reached){reached++; sumT+=rd.dur;}
      lines.push({seed:s, r:rd.round, dur:rd.dur, reached:rd.reached, reason:rd.reason, d:rd.deaths, mx:+rd.maxX.toFixed(2)});
    }
  }
  if(process.env.VERBOSE) for(const l of lines) console.log(JSON.stringify(l));
  console.log(`TOTAL ${script} rounds=${tot} reached=${reached} sumReachedDur=${sumT.toFixed(2)} deaths=${deaths} avgMaxX=${(sumMaxX/tot).toFixed(1)} maxMs=${maxMs}`);
})();
