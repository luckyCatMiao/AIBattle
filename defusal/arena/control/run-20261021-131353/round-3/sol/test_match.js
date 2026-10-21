'use strict';
const sim=require('./simulation');
const {spawn}=require('child_process');
const readline=require('readline');
function controller(file,args=[]){
 const p=spawn('python3',[file,...args],{cwd:'/workspace',stdio:['pipe','pipe','inherit']});
 const waiting=[]; readline.createInterface({input:p.stdout}).on('line',s=>{const cb=waiting.shift();if(cb)cb(JSON.parse(s));});
 return {p, ask:o=>new Promise(resolve=>{waiting.push(resolve);p.stdin.write(JSON.stringify(o)+'\n');})};
}
async function run(seed,seat,opponent){
 const a=controller('agent.py'), b=controller('baseline.py',[opponent]);
 const cs=seat===0?[a,b]:[b,a];
 const g=sim.createMatch({seed,players:[{name:'seat0',kind:'api'},{name:'seat1',kind:'api'}]});
 let windows=0,maxms=0; let plants=0;const events=[];
 while(g.status==='playing' && windows<750){
  const st=performance.now();
  const acts=await Promise.all(cs.map((c,t)=>c.ask(sim.view(g,t))));
  maxms=Math.max(maxms,performance.now()-st);
  if(g.phase==='buy') for(let t=0;t<2;t++)sim.submitBuys(g,t,acts[t].buys);
  else {sim.advanceWindow(g,acts.map((a,t)=>sim.submitWindow(g,t,a.inputs)));windows++;}
 }
 a.p.kill();b.p.kill();
 const result={seed,seat,opponent,score:g.roundWins,ours:g.roundWins[seat],theirs:g.roundWins[1-seat],windows,maxms:Math.round(maxms),rounds:g.roundLog.map(r=>({r:r.round,w:r.winnerTeam===seat?'ours':'theirs',reason:r.reason,sec:r.frames/20,alive:r.units.filter(u=>u.alive).map(u=>u.team+':'+u.index)}))};
 console.log(JSON.stringify(result));return result;
}
(async()=>{const args=process.argv.slice(2);await run(+args[0]||1,+(args[1]||0),args[2]||'rush');})();
