'use strict';
/* 单人调试：打印事故（死亡）时的位置、原因与前后窗口 agent 分支日志 */
const path=require('node:path'); const {spawn}=require('node:child_process'); const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));
const WS=path.resolve(__dirname,'..');
class PyAgent{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe'],env:{...process.env,PLAT_DEBUG:'1'}});
 this.rl=readline.createInterface({input:this.proc.stdout});this.waiters=[];this.lines=[];
 this.rl.on('line',l=>{if(this.waiters.length)this.waiters.shift()(l);else this.lines.push(l);});
 this.stderr='';this.chunks=[];this.proc.stderr.on('data',d=>{const s=d.toString();this.stderr+=s;this.chunks.push(s);});}
 ask(o){this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res({reply:JSON.parse(l)});}catch(e){rej(e);}};if(this.lines.length)done(this.lines.shift());else this.waiters.push(done);});}
 close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
const NEU=[[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]];
function norm(raw){const o=[];for(let i=0;i<5;i++){const f=raw[i];if(Array.isArray(f))o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);else if(f&&typeof f==='object')o.push([{move:Number(f.move)||0,jump:!!f.jump}]);else o.push([{move:0,jump:false}]);}return o;}
(async()=>{
  const seed=Number(process.argv[2]||7022), script=process.argv[3]||'agent.py', seat=1;
  const g=sim.createMatch({id:'s',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const py=new PyAgent(script);
  let evIdx=0, windows=0; const hist=[];
  while(g.status==='playing'&&windows<2600){
    const obs=Object.assign({},sim.view(g,seat));obs.yourPlayer=seat;
    const before={x:g.runners[seat].x,y:g.runners[seat].y,t:g.time,vx:g.runners[seat].vx,vy:g.runners[seat].vy,og:g.runners[seat].onGround,frame:g.frame,round:g.round,mon:JSON.parse(JSON.stringify(g.monsters))};
    const reply=await py.ask(obs);
    const ans=[]; ans[seat]=norm(reply.reply.inputs||reply.reply); ans[1-seat]=NEU;
    const dbg=py.chunks.join(''); py.chunks.length=0;
    sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
    hist.push({...before, plan:ans[seat], dbg:dbg.trim().split('\n').filter(Boolean).slice(-3)});
    if(hist.length>8) hist.shift();
    for(const e of g.events.slice(evIdx)){
      if(e.type==='respawn'&&e.team===seat){
        console.log(`\n### DEATH ${e.reason} round=${e.round} t=${e.t} x=${e.x} y=${e.y}`);
        for(const h of hist) console.log(`  t=${h.t.toFixed(2)} x=${h.x.toFixed(2)} y=${h.y.toFixed(2)} vx=${h.vx.toFixed(1)} vy=${h.vy.toFixed(1)} og=${h.og} plan=${JSON.stringify(h.plan)} dbg=${JSON.stringify(h.dbg)}`);
      }
    }
    evIdx=g.events.length;
    windows++;
  }
  console.log('\n--- final stderr tail ---');
  console.log(py.stderr.split('\n').slice(-12).join('\n'));
  py.close();
})();
