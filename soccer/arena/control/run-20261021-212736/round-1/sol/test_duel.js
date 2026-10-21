'use strict';
const sim=require('./simulation'),{spawn}=require('child_process'),rl=require('readline'),fs=require('fs');
function worker(file){const p=spawn('python3',['-u',file]);let pending;rl.createInterface({input:p.stdout}).on('line',s=>{const r=pending;pending=null;r(JSON.parse(s))});p.stderr.on('data',s=>process.stderr.write(s));return {p,ask:o=>new Promise(r=>{pending=r;p.stdin.write(JSON.stringify(o)+'\n')})}}
async function main(){const a=worker('/workspace/agent.py'),b=worker(process.argv[2]||'/workspace/agent_v1.py');let results=[];let maxMs=0;
for(let n=1;n<=6;n++)for(const seat of [0,1]){
const g=sim.createMatch({teamSize:n,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
while(g.status==='playing'){
const t=performance.now();const [aa,bb]=await Promise.all([a.ask(sim.view(g,seat)),b.ask(sim.view(g,1-seat))]);maxMs=Math.max(maxMs,performance.now()-t);
const wa=sim.submitWindow(g,seat,aa.inputs),wb=sim.submitWindow(g,1-seat,bb.inputs);sim.advanceWindow(g,seat===0?[wa,wb]:[wb,wa]);
}
let r={n,seat,score:g.score,winner:g.winner,frame:g.frame,stats:g.stats};results.push(r);console.log(JSON.stringify(r))}
a.p.stdin.end();b.p.stdin.end();fs.writeFileSync('/workspace/duel_results.json',JSON.stringify({opponent:process.argv[2]||'agent_v1.py',results,maxMs},null,2))
}main().catch(e=>{console.error(e);process.exit(1)});
