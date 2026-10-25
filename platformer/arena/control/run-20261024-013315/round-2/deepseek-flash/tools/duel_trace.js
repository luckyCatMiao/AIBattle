'use strict';
/* 单场对打逐窗口追踪：谁在哪个位置落后/死亡 */
const path=require('node:path'); const {spawn}=require('node:child_process'); const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));
const WS=path.resolve(__dirname,'..');
class PyAgent{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe']});
 this.rl=readline.createInterface({input:this.proc.stdout});this.waiters=[];this.lines=[];
 this.rl.on('line',l=>{if(this.waiters.length)this.waiters.shift()(l);else this.lines.push(l);});
 this.err='';this.proc.stderr.on('data',d=>{this.err+=d.toString();});}
 ask(o){this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res({reply:JSON.parse(l)});}catch(e){rej(e);}};if(this.lines.length)done(this.lines.shift());else this.waiters.push(done);});}
 close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
function norm(raw){const o=[];for(let i=0;i<5;i++){const f=raw[i];if(Array.isArray(f))o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);else if(f&&typeof f==='object')o.push([{move:Number(f.move)||0,jump:!!f.jump}]);else o.push([{move:0,jump:false}]);}return o;}
(async()=>{
  const seed=Number(process.argv[2]), seatA=Number(process.argv[3]||0);
  const scriptA=process.argv[4]||'agent.py', scriptB=process.argv[5]||'tools/agent_r1.py';
  const g=sim.createMatch({id:'d',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const A=new PyAgent(scriptA), B=new PyAgent(scriptB);
  const ctr=[seatA===0?A:B, seatA===0?B:A];
  let w=0, evN=0; const trace=[];
  while(g.status==='playing'&&w<1600){
    const ans=[];
    for(let s=0;s<2;s++){const obs=Object.assign({},sim.view(g,s));obs.yourPlayer=s;ans[s]=norm((await ctr[s].ask(obs)).reply.inputs||(await 0));}
    const before=[{x:g.runners[0].x,d:g.runners[0].deaths,r:g.round},{x:g.runners[1].x,d:g.runners[1].deaths,r:g.round}];
    sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
    for(const e of g.events.slice(evN)){ if(e.type==='respawn') trace.push(`RESPAWN team=${e.team}(${e.team===seatA?'A':'B'}) ${e.reason} x=${e.x}`); if(e.type==='round') trace.push(`ROUND ${e.round} winner=${e.winner}(${e.winner===null?'-':(e.winner===seatA?'A':'B')}) ${e.reason} t=${e.t}`); }
    evN=g.events.length;
    // 每 0.25s 记录一次差距
    if (g.runners[0].x < g.goalX-2 && g.phase==='race') trace.push(`t=${g.time.toFixed(2)} team0=${g.runners[0].x.toFixed(1)} team1=${g.runners[1].x.toFixed(1)} gap(A-other)=${(g.runners[seatA].x-g.runners[1-seatA].x).toFixed(2)}`);
    w++;
  }
  // 只输出每局的末尾 25 行 + 所有事件
  const evts=trace.filter(l=>l.startsWith('RESPAWN')||l.startsWith('ROUND'));
  console.log("EVENTS:"); for(const e of evts) console.log("  "+e);
  console.log("LAST 30 FRAMES:"); for(const l of trace.filter(l=>l.startsWith('t=')).slice(-30)) console.log("  "+l);
  console.log("final wins", g.wins, "maxX", g.runners.map(r=>r.maxX.toFixed(1)));
  A.close();B.close();
})();
