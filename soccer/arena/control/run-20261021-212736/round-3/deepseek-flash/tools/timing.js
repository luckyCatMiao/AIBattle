'use strict';
const { spawn } = require('child_process');
const sim = require('/workspace/simulation.js');
const { teamSizeForSeed } = require('/workspace/catalog.js');
function parseArgs(argv){const a={};for(let i=2;i<argv.length;i+=2)a[argv[i].replace(/^--/,'')]=argv[i+1];return a;}
const args=parseArgs(process.argv);
const seed=Number(args.seed||1);
const teamSize=Number(args.teamSize||3);
const aCmd=(args.a||'python3 /workspace/agent.py').split(' ');
const bCmd=(args.b||'python3 /workspace/agents/exp2.py').split(' ');
function start(cmd){const p=spawn(cmd[0],cmd.slice(1),{stdio:['pipe','pipe','pipe']});let buf='';const w=[];p.stdout.on('data',d=>{buf+=d.toString();let i;while((i=buf.indexOf('\n'))>=0){const l=buf.slice(0,i);buf=buf.slice(i+1);if(w.length)w.shift()(l);}});p.on('exit',()=>{while(w.length)w.shift()(null);});return{p,ask(l){return new Promise(r=>{w.push(r);p.stdin.write(l+'\n');});},kill(){p.kill('SIGKILL');}};}
(async()=>{
 const g=sim.createMatch({id:'t',players:[{name:'A',kind:'api'},{name:'B',kind:'api'}],seed,teamSize});
 const A=start(aCmd),B=start(bCmd);const times=[];let wins=0;
 while(g.status==='playing'&&wins<200){
   const t0=process.hrtime.bigint();
   const ra=await A.ask(JSON.stringify(sim.view(g,0)));
   const t1=process.hrtime.bigint();
   times.push(Number(t1-t0)/1e6);
   const rb=await B.ask(JSON.stringify(sim.view(g,1)));
   const fa=sim.submitWindow(g,0,JSON.parse(ra).inputs);
   const fb=sim.submitWindow(g,1,JSON.parse(rb).inputs);
   sim.advanceWindow(g,[fa,fb]);wins++;
 }
 A.kill();B.kill();
 times.sort((a,b)=>a-b);
 const sum=times.reduce((a,b)=>a+b,0);
 console.log(JSON.stringify({teamSize,score:g.score,windows:wins,mean_ms:+(sum/times.length).toFixed(2),p50_ms:+times[Math.floor(times.length/2)].toFixed(2),max_ms:+times[times.length-1].toFixed(2),p99_ms:+times[Math.floor(times.length*0.99)].toFixed(2)}));
})();
