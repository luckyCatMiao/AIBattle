'use strict';
/* 单场景调试：打印每窗口双方位置与 agent 的 JUMP-OVER 日志 */
const path=require('node:path'); const {spawn}=require('node:child_process'); const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));
const WS=path.resolve(__dirname,'..');
class PyAgent{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe'],env:{...process.env,PLAT_DEBUG:'1'}});
 this.rl=readline.createInterface({input:this.proc.stdout});this.waiters=[];this.lines=[];
 this.rl.on('line',l=>{if(this.waiters.length)this.waiters.shift()(l);else this.lines.push(l);});
 this.stderr='';this.proc.stderr.on('data',d=>{this.stderr+=d.toString();});}
 ask(o){this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res({reply:JSON.parse(l)});}catch(e){rej(e);}};if(this.lines.length)done(this.lines.shift());else this.waiters.push(done);});}
 close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
const NEU=[[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}],[{move:0,jump:false}]];
function norm(raw){const o=[];for(let i=0;i<5;i++){const f=raw[i];if(Array.isArray(f))o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);else if(f&&typeof f==='object')o.push([{move:Number(f.move)||0,jump:!!f.jump}]);else o.push([{move:0,jump:false}]);}return o;}
(async()=>{
 const seed=Number(process.argv[2]||7005), stopAt=Number(process.argv[3]||40), hold=Number(process.argv[4]||2.0);
 const g=sim.createMatch({id:'b',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
 const A=new PyAgent('agent.py'), B=new PyAgent('tools/agent_r1.py');
 let stoppedUntil=null, w=0;
 while(g.status==='playing'&&w<120){
   const ans=[];
   for(let s=0;s<2;s++){const obs=Object.assign({},sim.view(g,s));obs.yourPlayer=s;ans[s]=norm((await (s===0?A:B).ask(obs)).reply.inputs);}
   const o=g.runners[1];
   if(stoppedUntil===null&&o.x>=stopAt) stoppedUntil=g.time+hold;
   if(stoppedUntil!==null&&g.time<stoppedUntil&&o.x>=stopAt-1) ans[1]=NEU;
   const b0={a:g.runners[0].x,b:g.runners[1].x};
   sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);
   if(g.time>0) console.log(`t=${g.time.toFixed(2)} A ${b0.a.toFixed(2)}->${g.runners[0].x.toFixed(2)} B ${b0.b.toFixed(2)}->${g.runners[1].x.toFixed(2)} gap=${(g.runners[1].x-g.runners[0].x).toFixed(2)} inA=${JSON.stringify(ans[0])}`);
   w++;
 }
 console.log('--- A stderr (JUMP-OVER lines) ---');
 console.log(A.stderr.split('\n').filter(l=>l.includes('JUMP-OVER')||l.includes('ESCAPE')||l.includes('FALLBACK')).slice(0,40).join('\n'));
 A.close();B.close();
})();
