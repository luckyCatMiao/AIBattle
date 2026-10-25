'use strict';
const path=require('node:path'); const {spawn}=require('node:child_process'); const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));
const WS=path.resolve(__dirname,'..');
class PyAgent{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe'],env:{...process.env,PLAT_DEBUG:'1'}});
 this.rl=readline.createInterface({input:this.proc.stdout});this.waiters=[];this.lines=[];
 this.rl.on('line',l=>{if(this.waiters.length)this.waiters.shift()(l);else this.lines.push(l);});
 this.buf='';this.proc.stderr.on('data',d=>{this.buf+=d.toString();});}
 ask(o){this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res({reply:JSON.parse(l)});}catch(e){rej(e);}};if(this.lines.length)done(this.lines.shift());else this.waiters.push(done);});}
 take(){const s=this.buf;this.buf='';return s.split('\n').filter(Boolean);}
 close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
function norm(raw){const o=[];for(let i=0;i<5;i++){const f=raw[i];if(Array.isArray(f))o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);else if(f&&typeof f==='object')o.push([{move:Number(f.move)||0,jump:!!f.jump}]);else o.push([{move:0,jump:false}]);}return o;}
(async()=>{
  const seed=Number(process.argv[2]), seatA=Number(process.argv[3]||1);
  const scriptA=process.argv[4]||'agent.py', scriptB=process.argv[5]||'tools/agent_r1.py';
  const g=sim.createMatch({id:'d',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const A=new PyAgent(scriptA), B=new PyAgent(scriptB);
  const ctr=[seatA===0?A:B, seatA===0?B:A];
  let w=0, evN=0;
  while(g.status==='playing'&&w<1600){
    const ans=[];
    for(let s=0;s<2;s++){const obs=Object.assign({},sim.view(g,s));obs.yourPlayer=s;ans[s]=norm((await ctr[s].ask(obs)).reply.inputs);}
    const aDbg = seatA===0? A.take() : A.take();
    const bx=g.runners[seatA].x, ox=g.runners[1-seatA].x, t=g.time;
    sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
    const dx=g.runners[seatA].x-bx;
    if (g.runners[seatA].x<g.goalX-2 && dx<1.0 && g.phase==='race')
      console.log(`t=${t.toFixed(2)} A=${bx.toFixed(2)}->${g.runners[seatA].x.toFixed(2)} (dx=${dx.toFixed(2)}) opp=${ox.toFixed(2)}->${g.runners[1-seatA].x.toFixed(2)} plan=${JSON.stringify(ans[seatA].map(f=>[f[0].move,f[0].jump?1:0]))} dbg=${JSON.stringify(aDbg.slice(-2))}`);
    for(const e of g.events.slice(evN)) if(e.type==='round') console.log(`ROUND ${e.round} winner=${e.winner}`);
    evN=g.events.length;
    w++;
  }
  A.close();B.close();
})();
