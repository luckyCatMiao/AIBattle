'use strict';
const S=require('./simulation'),{Driver,simulate}=require('./agent');
const {spawnSync}=require('child_process');
let maxError=0;
for(let seed=1001;seed<=1010;seed++) {
 const g=S.createMatch({seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});g.countdown=0;
 for(let i=0;i<200;i++){
  const c=g.cars[0], predicted={...c};
  const u={throttle:Math.sin(i*.3)>.0?1:-1,steer:Math.sin(i*.77),drift:i%8<4,boost:true};
  simulate({track:g.track},predicted,u); c.held=u; S.step(g);
  if(Math.hypot(c.x-g.cars[1].x,c.y-g.cars[1].y)>2)
   for(const k of ['x','y','angle','vx','vy','driftCharge','boostEnergy'])maxError=Math.max(maxError,Math.abs(c[k]-predicted[k]));
 }
}
console.log(JSON.stringify({physicsMaxError:maxError}));
const example=require('./example.json');
const p=spawnSync('python',['agent.py'],{input:JSON.stringify(example)+'\n'+JSON.stringify(example)+'\n',encoding:'utf8',timeout:5000});
if(p.status!==0)throw Error(p.stderr);
const lines=p.stdout.trim().split('\n');if(lines.length!==2)throw Error('protocol line count');
for(const line of lines){const x=JSON.parse(line);if(x.inputs.length!==20)throw Error('frame count');S.submitWindow(S.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]}),0,x.inputs);}
console.log(JSON.stringify({protocol:'passed',responses:lines.length}));
let stats={games:0,wins:0,offFrames:0,collisions:0,maxResponseMs:0,maxTime:0,sumTime:0,finished:0,losses:[]};
for(let k=0;k<200;k++) {
 const seed=(Math.imul(k+937,2654435761)>>>0), team=k%2;
 const g=S.createMatch({seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
 const d=new Driver(g.track,{plan:true}),b=new Driver(g.track,{look:12,drift:true,on:3});
 while(g.status==='playing'){
  const t=performance.now(),ours=d.window(S.view(g,team)).inputs;
  stats.maxResponseMs=Math.max(stats.maxResponseMs,performance.now()-t);
  const theirs=b.window(S.view(g,1-team)).inputs;
  for(let i=0;i<20&&g.status==='playing';i++){
   g.cars[team].held=ours[i][0];g.cars[1-team].held=theirs[i][0];S.step(g);
   if(g.cars[team].offRoad)stats.offFrames++;
  }
 }
 const c=g.cars[team];stats.games++;stats.wins+=g.winner===team;stats.collisions+=c.collisions;
 if(c.finished){stats.finished++;stats.maxTime=Math.max(stats.maxTime,c.finishTime);stats.sumTime+=c.finishTime;}
 if(g.winner!==team)stats.losses.push({seed,team,lap:c.lap,nextCp:c.nextCp,progress:c.progress});
}
stats.meanTime=stats.sumTime/stats.finished;console.log(JSON.stringify(stats));
