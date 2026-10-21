'use strict';
const sim=require('./simulation');const {spawn}=require('child_process');const readline=require('readline');
class Client{
 constructor(file,args=[]){this.p=spawn(file.endsWith('.js')?'node':'python3',file.endsWith('.js')?[file,...args]:['-u',file,...args],{cwd:'/workspace'});this.q=[];this.max=0;readline.createInterface({input:this.p.stdout}).on('line',s=>{const q=this.q.shift();if(!q)return;clearTimeout(q.timer);this.max=Math.max(this.max,performance.now()-q.start);try{q.resolve(JSON.parse(s))}catch(e){q.reject(e)}});this.p.stderr.on('data',b=>process.stderr.write(b));}
 ask(o){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),4900);this.q.push({resolve,reject,timer,start:performance.now()});this.p.stdin.write(JSON.stringify(o)+'\n')})}
 close(){this.p.kill()}
}
async function run(seed,style,seat,file){
 const cmd=style.startsWith('ind-')?['sparring_independent.js',[style.slice(4)]]:style==='previous'?['round2_agent.py',[]]:style==='self'?['agent.py',[]]:['sparring_r3.py',[style]];
 const bs=seat===0?[new Client(file),new Client(...cmd)]:[new Client(...cmd),new Client(file)];const g=sim.createMatch({seed,players:[{name:'local0',kind:'api'},{name:'local1',kind:'api'}]});let n=0;
 try{while(g.status==='playing'){
 const a=await Promise.all(bs.map((b,t)=>b.ask(sim.view(g,t))));
 if(g.phase==='buy')a.forEach((v,t)=>sim.submitBuys(g,t,v.buys));else{sim.advanceWindow(g,a.map((v,t)=>sim.submitWindow(g,t,v.inputs)));n++}
 if(n>850)throw Error('too long');if(g.events.length>1000)g.events=g.events.slice(-300);
 }return {seed,style,seat,score:g.roundWins,result:g.winner===null?'draw':g.winner===seat?'win':'loss',maxMs:Math.max(...bs.map(b=>b.max)),rounds:g.roundLog.map(r=>({winner:r.winnerTeam,reason:r.reason,seconds:r.frames/20,kills:r.units.filter(u=>u.team===seat).reduce((s,u)=>s+u.kills,0)}))};}finally{bs.forEach(b=>b.close())}
}
(async()=>{for(const style of (process.argv[3]||'orbit,previous,left,charge,split').split(','))for(const seed of (process.argv[2]||'17,42,109').split(',').map(Number)){console.log(JSON.stringify(await run(seed,style,seed%2,process.argv[4]||'agent.py')))}})().catch(e=>{console.error(e);process.exit(1)});
