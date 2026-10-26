'use strict';
const assert=require('assert');
const fs=require('fs');
const sim=require('./simulation');
const {Agent,move,bulletStep}=require('./agent');
const {DIRS,tileAt,WALL}=require('./catalog');
let seed=941;
function rand(){seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;}
const g=sim.createMatch({players:[{name:'A'},{name:'B'}]});
g.players.forEach(p=>p.alive=false);
for(let i=0;i<100;i++) {
 let x,y;do{x=1+38*rand();y=1+28*rand();}while(tileAt(x,y)===WALL);
 const dir=Object.values(DIRS)[1+Math.floor(rand()*8)];
 g.bullets.push({id:'v'+i,owner:0,x,y,vx:dir[0]*8.5,vy:dir[1]*8.5,bounces:0});
}
let predicted=g.bullets.map(b=>[b.x,b.y,b.vx,b.vy]);
let maxError=0;
for(let frame=0;frame<1000;frame++) {
 predicted=predicted.map(bulletStep);sim.step(g);
 for(let i=0;i<100;i++) {
  const b=g.bullets[i],p=predicted[i];
  maxError=Math.max(maxError,Math.abs(b.x-p[0]),Math.abs(b.y-p[1]));
  assert(maxError<1e-9);assert(Math.abs(b.vx-p[2])<1e-9);assert(Math.abs(b.vy-p[3])<1e-9);
 }
}
const movement=sim.createMatch({players:[{name:'A'},{name:'B'}]});
let p=movement.players[0];
for(let i=0;i<1500;i++) {
 const key=Object.keys(DIRS)[Math.floor(rand()*9)];
 const expected=move(p.x,p.y,...DIRS[key]);p.held={dir:key,fire:false};sim.step(movement);
 assert(Math.abs(p.x-expected[0])<1e-9);assert(Math.abs(p.y-expected[1])<1e-9);
}
const obs=JSON.parse(fs.readFileSync('example.json','utf8'));
obs.frame=1800;obs.now=90;
obs.bullets=g.bullets.map((b,i)=>({...b,owner:1,id:'stress'+i}));
let maxMs=0;
const agent=new Agent();
for(let i=0;i<20;i++) {
 const start=performance.now();const result=agent.act(obs);maxMs=Math.max(maxMs,performance.now()-start);
 assert(result.inputs.length===3);result.inputs.forEach(sim.normalizeInput);
}
const results={bulletFrames:100000,maxPhysicsError:maxError,movementFrames:1500,stressEnemyBullets:100,stressResponses:20,maxStressResponseMS:+maxMs.toFixed(3)};
fs.writeFileSync('verification_results.json',JSON.stringify(results,null,2));console.log(results);
