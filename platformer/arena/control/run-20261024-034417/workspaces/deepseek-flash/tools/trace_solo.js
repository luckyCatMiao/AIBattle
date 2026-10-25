'use strict';
/* 逐窗口追踪单人跑图，打印慢窗口（dx<1.5）与分支日志 */
const path=require('node:path'); const {spawn}=require('node:child_process'); const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));
const WS=path.resolve(__dirname,'..');
class PyAgent{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe'],env:{...process.env,PLAT_DEBUG:'1'}});
 this.rl=readline.createInterface({input:this.proc.stdout});this.waiters=[];this.lines=[];
 this.rl.on('line',l=>{if(this.waiters.length)this.waiters.shift()(l);else this.lines.push(l);});
 this.err=[];this.proc.stderr.on('data',d=>{this.err.push(...d.toString().split('\n').filter(Boolean));});}
 ask(o){this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res({reply:JSON.parse(l)});}catch(e){rej(e);}};if(this.lines.length)done(this.lines.shift());else this.waiters.push(done);});}
 close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
const NEU=[[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]];
function norm(raw){const o=[];for(let i=0;i<5;i++){const f=raw[i];if(Array.isArray(f))o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);else if(f&&typeof f==='object')o.push([{move:Number(f.move)||0,jump:!!f.jump}]);else o.push([{move:0,jump:false}]);}return o;}
(async()=>{
  const seed=Number(process.argv[2]), wantRound=Number(process.argv[3]||0), script=process.argv[4]||'agent.py', seat=1;
  const g=sim.createMatch({id:'s',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const py=new PyAgent(script); let windows=0; const slow=[];
  while(g.status==='playing'&&windows<2600){
    const obs=Object.assign({},sim.view(g,seat));obs.yourPlayer=seat;
    const before={x:g.runners[seat].x,t:g.time,phase:g.phase,round:g.round,y:g.runners[seat].y,vx:g.runners[seat].vx,og:g.runners[seat].onGround};
    const r=await py.ask(obs);
    const ans=[]; ans[seat]=norm(r.reply.inputs||r.reply); ans[1-seat]=NEU;
    const dbg=py.err.splice(0);
    sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
    if(before.phase==='race'&&(!wantRound||before.round===wantRound)){
      const dx=g.runners[seat].x-before.x;
      if(dx<1.5) slow.push({t:+before.t.toFixed(2),x:+before.x.toFixed(2),y:+before.y.toFixed(2),vx:+before.vx.toFixed(1),og:before.og,dx:+dx.toFixed(2),plan:ans[seat].map(f=>[f[0].move,f[0].jump?1:0]),dbg:dbg.slice(-2)});
    }
    windows++;
  }
  console.log(`seed=${seed} round=${wantRound} slow windows=${slow.length}`);
  for(const s of slow.slice(0,40)) console.log(JSON.stringify(s));
  py.close();
})();
