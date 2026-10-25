'use strict';
/* 鲁棒性模糊测试：随机输入推进比赛，随机抽样观察喂给 agent，检查输出合法性与耗时。 */
const path=require('node:path');const {spawn}=require('node:child_process');const readline=require('node:readline');
const sim=require(path.resolve(__dirname,'../../../../../../simulation.js'));const WS=path.resolve(__dirname,'..');
class Py{constructor(s){this.proc=spawn('python',['-I',s],{cwd:WS,stdio:['pipe','pipe','pipe']});this.rl=readline.createInterface({input:this.proc.stdout});this.w=[];this.l=[];this.rl.on('line',l=>{if(this.w.length)this.w.shift()(l);else this.l.push(l);});this.err='';this.proc.stderr.on('data',d=>{this.err+=d;});}
ask(o){const t0=Date.now();this.proc.stdin.write(JSON.stringify(o)+'\n');return new Promise((res,rej)=>{const done=l=>{try{res({j:JSON.parse(l),ms:Date.now()-t0});}catch(e){rej(new Error('bad json: '+l.slice(0,120)));}};if(this.l.length)done(this.l.shift());else this.w.push(done);});}
close(){try{this.proc.stdin.end();}catch(e){}try{this.proc.kill();}catch(e){}}}
function rndFrame(){const m=[-1,0,1][Math.floor(Math.random()*3)];const j=Math.random()<0.15;return [[{move:m,jump:j}],[{move:m,jump:j}],[{move:m,jump:j}],[{move:m,jump:j}],[{move:m,jump:j}]];}
(async()=>{
 const seeds=(process.argv[2]||'11,12,13').split(',').map(Number);
 const N=Number(process.argv[3]||120);
 let maxMs=0, bad=0, n=0, errs=[];
 for(const seed of seeds){
  const g=sim.createMatch({id:'fz',seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
  const py=new Py('agent.py');
  let w=0;
  try{
   while(g.status==='playing'&&w<1400){
    if(Math.random()<0.18){
      const s=Math.floor(Math.random()*2);
      const obs=Object.assign({},sim.view(g,s));obs.yourPlayer=s;
      try{
        const r=await py.ask(obs); n++; maxMs=Math.max(maxMs,r.ms);
        const inps=r.j&&r.j.inputs;
        if(!Array.isArray(inps)||inps.length!==5){bad++;errs.push('seed'+seed+' bad shape');}
        else for(const f of inps){const u=Array.isArray(f)?f[0]:f; if(!u||typeof u.move!=='number'||u.move<-1.001||u.move>1.001){bad++;errs.push('seed'+seed+' bad move');break;}}
      }catch(e){bad++;errs.push('seed'+seed+' '+e.message);}
    }
    const A=rndFrame(),B=rndFrame();
    sim.advanceWindow(g,[sim.submitWindow(g,0,A),sim.submitWindow(g,1,B)]);
    w++;
   }
  } finally{py.close();}
  console.log(JSON.stringify({seed,status:g.status,round:g.round,wins:g.wins,windows:w,agentErr:py.err.split('\n').slice(-1)[0]||''}));
 }
 console.log(`FUZZ n=${n} maxMs=${maxMs} bad=${bad}`, errs.slice(0,5));
})();
