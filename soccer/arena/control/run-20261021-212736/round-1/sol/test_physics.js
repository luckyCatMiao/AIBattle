'use strict';
const sim=require('./simulation'),{spawn}=require('child_process'),rl=require('readline'),fs=require('fs');
const p=spawn('python3',['-u','/workspace/physics_probe.py']);let pending;rl.createInterface({input:p.stdout}).on('line',s=>pending(JSON.parse(s)));p.stderr.on('data',s=>process.stderr.write(s));const ask=o=>new Promise(r=>{pending=r;p.stdin.write(JSON.stringify(o)+'\n')});
let seed=87654;function rand(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296}
async function main(){let maxUnitError=0,maxBallError=0,ownerMismatch=0,goals=0;const dirs=['N','R','DR','D','DL','L','UL','U','UR'];
for(let trial=0;trial<300;trial++){
let n=1+trial%6;let g=sim.createMatch({teamSize:n,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
for(const u of g.units){u.x=1.5+rand()*41;u.y=1.5+rand()*23;u.facing={x:1,y:0};u.kickCd=Math.floor(rand()*7);u.controlLock=Math.floor(rand()*6)}
g.ball.x=1.3+rand()*41.4;g.ball.y=1.3+rand()*23.4;g.ball.vx=(rand()-.5)*28;g.ball.vy=(rand()-.5)*28;
if(trial%2===0){let u=g.units[trial%g.units.length];g.ball.owner=u.id;g.ball.x=u.x+.62;g.ball.y=u.y;g.ball.vx=g.ball.vy=0}
const observation=sim.view(g,0),actions=[];let scored=false;
for(let f=0;f<20;f++){let aa=g.units.map(u=>({dir:dirs[Math.floor(rand()*9)],aim:rand()*360,kick:rand()<.35}));actions.push(aa);g.units.forEach((u,i)=>u.held=aa[i]);sim.step(g);if(g.score[0]+g.score[1]>0){scored=true;break}}
const pred=await ask({observation,actions});if(scored||pred.goal){goals++;continue}
for(let i=0;i<g.units.length;i++)maxUnitError=Math.max(maxUnitError,Math.hypot(g.units[i].x-pred.units[i].x,g.units[i].y-pred.units[i].y));
maxBallError=Math.max(maxBallError,Math.hypot(g.ball.x-pred.ball.x,g.ball.y-pred.ball.y));if(g.ball.owner!==pred.ball.owner)ownerMismatch++;
}
p.stdin.end();const report={trials:300,maxUnitError,maxBallError,ownerMismatch,goalCases:goals};console.log(report);fs.writeFileSync('/workspace/physics_results.json',JSON.stringify(report,null,2));}main();