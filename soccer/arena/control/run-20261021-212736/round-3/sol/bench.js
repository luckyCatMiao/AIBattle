'use strict';
const sim=require('./simulation'),{spawn}=require('child_process'),rl=require('readline'),fs=require('fs');
function worker(args){const p=spawn('python3',['-u',...args],{cwd:'/workspace'});let pending;rl.createInterface({input:p.stdout}).on('line',s=>{if(!pending)return;const r=pending;pending=null;r(JSON.parse(s))});p.stderr.on('data',s=>process.stderr.write(s));return {p,ask:o=>new Promise((r,j)=>{pending=r;p.stdin.write(JSON.stringify(o)+'\n')})}}
async function main(){const file=process.argv[2]||'agent.py',opp=process.argv[3]||'agent_r1.py',style=process.argv[4]||'fast',sizes=(process.argv[5]||'1,2,3,4,5,6').split(',').map(Number);const a=worker([file]),b=worker([opp,style]);const results=[];let maxMs=0,totalMs=0,count=0;
for(const n of sizes)for(const seat of [0,1]){
 const g=sim.createMatch({teamSize:n,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
 while(g.status==='playing'){
 const t=performance.now();const [aa,bb]=await Promise.all([a.ask(sim.view(g,seat)),b.ask(sim.view(g,1-seat))]);let ms=performance.now()-t;maxMs=Math.max(maxMs,ms);totalMs+=ms;count++;
 const wa=sim.submitWindow(g,seat,aa.inputs),wb=sim.submitWindow(g,1-seat,bb.inputs);sim.advanceWindow(g,seat===0?[wa,wb]:[wb,wa]);
 }
 const r={n,seat,score:g.score,winner:g.winner,frame:g.frame,stats:g.stats};results.push(r);console.log(JSON.stringify(r));
}
a.p.stdin.end();b.p.stdin.end();let report={file,opp,style,results,maxMs,meanMs:totalMs/count,windows:count};fs.writeFileSync(`/workspace/r2_${file.replace('.py','')}_${opp.replace('.py','')}_${style}.json`,JSON.stringify(report,null,2));console.log(JSON.stringify({maxMs,meanMs:totalMs/count,windows:count}));
}main().catch(e=>{console.error(e);process.exit(1)});
