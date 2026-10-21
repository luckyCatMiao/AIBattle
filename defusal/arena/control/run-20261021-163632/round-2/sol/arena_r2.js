'use strict';
const sim=require('./simulation');
const {spawn}=require('child_process');
const readline=require('readline');
class Client {
 constructor(file,args=[]){this.p=spawn('python3',['-u',file,...args],{cwd:'/workspace'});this.q=[];this.max=0;readline.createInterface({input:this.p.stdout}).on('line',s=>{let q=this.q.shift();if(!q)return;clearTimeout(q.timer);this.max=Math.max(this.max,performance.now()-q.start);try{q.resolve(JSON.parse(s));}catch(e){q.reject(e);}});this.p.stderr.on('data',b=>process.stderr.write(b));}
 ask(o){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('timeout')),4900);this.q.push({resolve,reject,timer,start:performance.now()});this.p.stdin.write(JSON.stringify(o)+'\n');});}
 close(){this.p.kill();}
}
async function run(seed,style,seat,ours='agent.py'){
 const cmds=style==='old'?['round1_agent.py',[]]:['opponent_r2.py',[style]];
 const bots=seat===0?[new Client(ours),new Client(...cmds)]:[new Client(...cmds),new Client(ours)];
 const g=sim.createMatch({seed,players:[{name:'p0',kind:'api'},{name:'p1',kind:'api'}]});let windows=0;
 try{while(g.status==='playing'){
 const a=await Promise.all(bots.map((b,t)=>b.ask(sim.view(g,t))));
 if(g.phase==='buy')a.forEach((v,t)=>sim.submitBuys(g,t,v.buys));
 else {sim.advanceWindow(g,a.map((v,t)=>sim.submitWindow(g,t,v.inputs)));windows++;}
 if(windows>850)throw Error('too long');
 if(g.events.length>1000)g.events=g.events.slice(-300);
 }
 return {seed,style,seat,score:g.roundWins,result:g.winner===null?'draw':g.winner===seat?'win':'loss',windows,maxMs:Math.max(...bots.map(b=>b.max)),rounds:g.roundLog.map(r=>({winner:r.winnerTeam,reason:r.reason,seconds:r.frames/20}))};
 }finally{bots.forEach(b=>b.close());}
}
(async()=>{const seeds=(process.argv[2]||'17,42,109').split(',').map(Number);const styles=(process.argv[3]||'left,right,rush,turret,old').split(',');for(const style of styles)for(const seed of seeds){console.log(JSON.stringify(await run(seed,style,seed%2,process.argv[4]||'agent.py')));}})().catch(e=>{console.error(e);process.exit(1)});
