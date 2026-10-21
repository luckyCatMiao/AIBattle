'use strict';
const sim=require('./simulation');
const {spawn}=require('child_process');
const readline=require('readline');
class Bot {
 constructor(mode){this.p=spawn('python3',['-u','/workspace/agent.py',mode]);this.q=[];readline.createInterface({input:this.p.stdout}).on('line',l=>{const f=this.q.shift();if(f)f(JSON.parse(l));});this.p.stderr.on('data',b=>process.stderr.write(b));}
 act(o){return new Promise((resolve,reject)=>{const t=setTimeout(()=>reject(Error('response timeout')),4900);this.q.push(v=>{clearTimeout(t);resolve(v)});this.p.stdin.write(JSON.stringify(o)+'\n');});}
 close(){this.p.kill();}
}
async function run(seed,mode,seat){
 const bots=seat===0?[new Bot('main'),new Bot(mode)]:[new Bot(mode),new Bot('main')];
 const g=sim.createMatch({seed,players:[{name:'P0',kind:'api'},{name:'P1',kind:'api'}]});let windows=0,maxMs=0;
 try{
 while(g.status==='playing'){
  const start=Date.now();const acts=await Promise.all(bots.map((b,t)=>b.act(sim.view(g,t))));maxMs=Math.max(maxMs,Date.now()-start);
  if(g.phase==='buy'){acts.forEach((a,t)=>sim.submitBuys(g,t,a.buys));}
  else{const ws=acts.map((a,t)=>sim.submitWindow(g,t,a.inputs));sim.advanceWindow(g,ws);windows++;}
  if(windows>850)throw Error('too long');
 }
 return {seed,mode,seat,score:g.roundWins,winner:g.winner,windows,maxMs,rounds:g.roundLog.map(r=>({winner:r.winnerTeam,reason:r.reason,seconds:r.frames/20,alive:r.units.filter(u=>u.alive).map(u=>u.team+':'+u.index)}))};
 }finally{bots.forEach(b=>b.close());}
}
(async()=>{let rows=[];const modes=(process.argv[2]||'rushA,rushB,rush,camp').split(',');const seeds=(process.argv[3]||'1,2,3').split(',').map(Number);for(const mode of modes)for(const seed of seeds){const row=await run(seed,mode,seed%2);rows.push(row);console.log(JSON.stringify(row));}require('fs').writeFileSync(process.argv[4]||'/workspace/test_results.json',JSON.stringify(rows,null,2));})().catch(e=>{console.error(e);process.exit(1)});
