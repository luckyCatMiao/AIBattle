'use strict';
const path=require('node:path');const {spawn}=require('node:child_process');const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));const WS=path.resolve(__dirname,'..');
class Py{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe']});this.rl=readline.createInterface({input:this.proc.stdout});this.w=[];this.l=[];this.rl.on('line',l=>{if(this.w.length)this.w.shift()(l);else this.l.push(l);});this.proc.stderr.on('data',d=>process.stderr.write(d));}
ask(o){this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res(JSON.parse(l));}catch(e){rej(e);}};if(this.l.length)done(this.l.shift());else this.w.push(done);});}
close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
const NEU=Array.from({length:5},()=>[{move:0,jump:false}]);
function norm(raw){const o=[];for(let i=0;i<5;i++){const f=raw[i];if(Array.isArray(f))o.push([{move:Number(f[0]?.move)||0,jump:!!f[0]?.jump}]);else if(f&&typeof f==='object')o.push([{move:Number(f.move)||0,jump:!!f.jump}]);else o.push([{move:0,jump:false}]);}return o;}
(async()=>{
const seed=Number(process.argv[2]||1);const script=process.argv[3]||'agent.py';const seat=Number(process.argv[4]||1);
const g=sim.createMatch({id:'d',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
const py=new Py(script);let win=0;
while(g.status==='playing'&&win<3000){
  const obs=Object.assign({},sim.view(g,seat));obs.yourPlayer=seat;
  const r=await py.ask(obs);
  const ans=[];ans[seat]=norm(r.inputs||r);ans[1-seat]=NEU;
  sim.advanceWindow(g,[sim.submitWindow(g,0,ans[0]),sim.submitWindow(g,1,ans[1])]);win++;
  for(const e of g.events){if(e.type==='round'&&!e._p){e._p=1;console.error('ROUND',e.round,'winner',e.team,'reason',e.reason,'wins',JSON.stringify(e.wins),'frame',e.frame);}}
}
py.close();
console.error('END status',g.status,'wins',JSON.stringify(g.wins),'round',g.round,'frame',g.frame,'windows',win,'reason',g.reason);
})();
