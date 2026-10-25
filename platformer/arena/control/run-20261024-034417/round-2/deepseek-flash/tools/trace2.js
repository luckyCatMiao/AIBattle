'use strict';
const path=require('node:path'); const {spawn}=require('node:child_process'); const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));
const WS=path.resolve(__dirname,'..');
class PyAgent{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe']});
 this.rl=readline.createInterface({input:this.proc.stdout});this.waiters=[];this.lines=[];
 this.rl.on('line',l=>{if(this.waiters.length)this.waiters.shift()(l);else this.lines.push(l);});
 this.proc.stderr.on('data',d=>{});}
 ask(o){this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res({reply:JSON.parse(l)});}catch(e){rej(e);}};if(this.lines.length)done(this.lines.shift());else this.waiters.push(done);});}
 close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
const NEU=[[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]];
function norm(raw){const o=[];for(let i=0;i<5;i++){const f=raw[i];if(Array.isArray(f))o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);else if(f&&typeof f==='object')o.push([{move:Number(f.move)||0,jump:!!f.jump}]);else o.push([{move:0,jump:false}]);}return o;}
(async()=>{
  const seed=Number(process.argv[2]), fromT=Number(process.argv[3]||0), toT=Number(process.argv[4]||3), seat=1;
  const g=sim.createMatch({id:'s',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const py=new PyAgent('agent.py'); let w=0; let lastEv=0;
  while(g.status==='playing'&&w<2600){
    const obs=Object.assign({},sim.view(g,seat));obs.yourPlayer=seat;
    const before={x:g.runners[seat].x,t:g.time,phase:g.phase,round:g.round,frame:g.frame,frac:g.frame%5};
    const r=await py.ask(obs);
    const ans=[]; ans[seat]=norm(r.reply.inputs||r.reply); ans[1-seat]=NEU;
    sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
    for(const e of g.events.slice(lastEv)) console.log('EVENT', JSON.stringify(e));
    lastEv=g.events.length;
    if(before.phase==='race'&&before.round===2&&before.t>=fromT&&before.t<=toT){
      console.log(`t=${before.t.toFixed(2)} f=${before.frame} x=${before.x.toFixed(2)} -> ${g.runners[seat].x.toFixed(2)} mon=${JSON.stringify(g.monsters.map(m=>[+m.x.toFixed(2),m.dir]))} plan=${JSON.stringify(ans[seat].map(f=>[f[0].move,f[0].jump?1:0]))}`);
    }
    w++;
  }
  py.close();
})();
