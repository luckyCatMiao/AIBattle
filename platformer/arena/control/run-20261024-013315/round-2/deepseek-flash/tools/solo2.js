'use strict';
/* 单人跑图评测 v2：agent 坐 1 号位，逐局统计 到达用时/理论用时/死亡/maxX。 */
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
  let rounds=[], cur={r:1,deaths:0,t0:null,lastEvent:0}, maxMs=0, sumMs=0, nMs=0, windows=0, stalls=0, still=0;
  let prevRound=1, roundStartT=0;
  while(g.status==='playing'&&windows<2400){
    const obs=Object.assign({},sim.view(g,seat));obs.yourPlayer=seat;
    const before={x:g.runners[seat].x,t:g.time,deaths:g.runners[seat].deaths,phase:g.phase,maxX:g.runners[seat].maxX,round:g.round};
    const r=await py.ask(obs); maxMs=Math.max(maxMs,r.ms); sumMs+=r.ms; nMs++;
    const ans=[]; ans[seat]=norm(r.reply.inputs||r.reply); ans[1-seat]=NEU;
    sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
    const R=g.runners[seat];
    if(before.phase==='race'){
      if(R.deaths>before.deaths) cur.deaths++;
      const dx=R.x-before.x;
      if(dx<0.35&&R.onGround){still++; if(still>=6) stalls++;} else still=0;
    }
    if(g.round!==before.round){
      // 用窗口前快照记录上一局
      rounds.push({r:before.round, t:+(g.time).toFixed(2), x:+before.x.toFixed(1), mx:+before.maxX.toFixed(2), d:cur.deaths});
      cur={r:g.round,deaths:0};
    }
    windows++;
  }
  rounds.push({r:g.round,t:+g.time.toFixed(2),x:+g.runners[seat].x.toFixed(1),mx:+g.runners[seat].maxX.toFixed(2),d:cur.deaths});
  py.close();
  return {seed, rounds, maxMs, avgMs:nMs?Math.round(sumMs/nMs):0, windows, stalls,
          err:py.stderr?py.stderr.split('\n').slice(-1)[0]:''};
}
(async()=>{
  const seeds=(process.argv[2]||'1').split(',').map(Number);
  const script=process.argv[3]||'agent.py';
  let tot=0,done=0,deaths=0,stall=0,sumLoss=0,detRounds=0;
  for(const s of seeds){
    const r=await one(s,script);
    for(const rd of r.rounds){
      tot++; if(rd.x>=rd.mx&&rd.mx>0){} // ignore
      deaths+=rd.d;
    }
    const dec=r.rounds.filter(x=>x.mx>0).length;
    console.log(JSON.stringify({seed:s, rounds:r.rounds, maxMs:r.maxMs, avgMs:r.avgMs, stalls:r.stalls, err:r.err.slice(0,80)}));
  }
  console.log(`TOTAL seeds=${seeds.length} deaths=${deaths} stalls=${stall}`);
})();
