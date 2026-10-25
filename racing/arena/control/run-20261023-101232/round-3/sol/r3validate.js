'use strict';
const S=require('./simulation'),{Driver,simulate}=require('./agent'),{spawnSync}=require('child_process');
const fs=require('fs');
const example=JSON.parse(fs.readFileSync('example.json','utf8'));
const t=performance.now();
const p=spawnSync('python',['agent.py'],{input:(JSON.stringify(example)+'\n').repeat(3),encoding:'utf8',timeout:5000});
if(p.status!==0)throw Error(p.stderr);
const lines=p.stdout.trim().split('\n');if(lines.length!==3)throw Error('line count');
const g0=S.createMatch({players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});
for(const l of lines){const o=JSON.parse(l);S.submitWindow(g0,0,o.inputs);for(const [u] of o.inputs)if(!Number.isFinite(u.steer)||Math.abs(u.steer)>1||Math.abs(u.throttle)>1||typeof u.drift!=='boolean'||typeof u.boost!=='boolean')throw Error('invalid input');}
console.log(JSON.stringify({protocol:'passed',responses:3,totalMs:performance.now()-t}));
let st={tests:60,recovered:0,finished:0,maxTime:0,failures:[]};
for(let k=0;k<60;k++){
 const seed=Math.imul(k+17001,2246822519)>>>0,team=k%2;
 const g=S.createMatch({seed,players:[{name:'A',kind:'api'},{name:'B',kind:'api'}]});g.countdown=0;
 const d=new Driver(S.view(g,team).track,{plan:true}),c=g.cars[team],cp=1+k%11;
 const pos=d.at(cp*d.length/12+g.track.checkpoints[cp].radius+1.5);
 Object.assign(c,{x:pos.x,y:pos.y,angle:pos.angle,vx:12*Math.cos(pos.angle),vy:12*Math.sin(pos.angle),nextCp:cp});
 let recovered=false;
 while(g.status==='playing'&&g.frame<1000){
  const out=d.window(S.view(g,team)).inputs;
  for(let i=0;i<20&&g.status==='playing';i++){
   c.held=out[i][0];S.step(g);if(c.nextCp!==cp)recovered=true;
  }
 }
 st.recovered+=recovered;st.finished+=c.finished;if(c.finished)st.maxTime=Math.max(st.maxTime,c.finishTime);else st.failures.push({seed,team,cp,lap:c.lap,nextCp:c.nextCp});
}
console.log(JSON.stringify(st));
let error=0,frames=0;
for(let k=0;k<10;k++){
 const g=S.createMatch({seed:k+4521,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});g.countdown=0;
 g.cars[1].x=1;g.cars[1].y=1;
 for(let i=0;i<200;i++){
  const c=g.cars[0],copy={...c},u={throttle:i%9<7?1:-1,steer:Math.sin(i*.37),drift:i%8<4,boost:true};
  simulate(g,copy,u);c.held=u;S.step(g);
  if(Math.hypot(c.x-g.cars[1].x,c.y-g.cars[1].y)>2){for(const key of ['x','y','vx','vy','angle','driftCharge','boostEnergy'])error=Math.max(error,Math.abs(c[key]-copy[key]));frames++;}
 }
}
console.log(JSON.stringify({physicsMaxError:error,checkedFrames:frames}));
