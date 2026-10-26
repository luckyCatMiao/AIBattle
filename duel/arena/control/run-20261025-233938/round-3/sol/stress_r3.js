'use strict';
const fs=require('fs');
const assert=require('assert');
const sim=require('./simulation');
const {DIRS,tileAt,WALL}=require('./catalog');
const {Agent,move,bulletStep}=require('./agent');
const {Agent:Previous}=require('./agent_r2');
let seed=36091;
function random(){seed=(Math.imul(seed,1664525)+1013904223)|0;return(seed>>>0)/4294967296;}
const keys=Object.keys(DIRS);
const results={cases:0,withSafeWindow:0,currentDeaths:0,previousDeaths:0,currentAvoidableDeaths:0,previousAvoidableDeaths:0,maxMS:0};
for(let n=0;n<240;n++){
 const g=sim.createMatch({id:'stress-'+n,players:[{name:'A'},{name:'B'}]});
 const seat=n%2,p=g.players[seat];
 for(let i=0;i<30+n%3*30;i++){
  let x,y;do{x=1+38*random();y=1+28*random();}while(tileAt(x,y)===WALL||Math.hypot(x-p.x,y-p.y)<.8);
  const v=DIRS[keys[1+Math.floor(random()*8)]];
  g.bullets.push({id:'s'+i,owner:1-seat,x,y,vx:v[0]*8.5,vy:v[1]*8.5,bounces:0});
 }
 g.players.forEach(q=>q.cooldown=24);
 const future=[g.bullets.map(b=>[b.x,b.y,b.vx,b.vy])];
 for(let t=1;t<=3;t++)future.push(future[t-1].map(bulletStep));
 function safe(x,y,t){
  if(t===4)return true;
  for(const key of keys){const [nx,ny]=move(x,y,...DIRS[key]);
   if(future[t].every(b=>Math.hypot(nx-b[0],ny-b[1])>.67)&&safe(nx,ny,t+1))return true;
  }
  return false;
 }
 const possible=safe(p.x,p.y,1);if(possible)results.withSafeWindow++;
 for(const [name,Controller] of [['current',Agent],['previous',Previous]]){
  const start=performance.now(),out=new Controller().act(sim.view(g,seat));
  if(name==='current')results.maxMS=Math.max(results.maxMS,performance.now()-start);
  const copy=structuredClone(g),windows=[[],[]];windows[seat]=sim.submitWindow(copy,seat,out.inputs);
  windows[1-seat]=Array.from({length:3},()=>({dir:'N',aim:null,fire:false}));
  sim.advanceWindow(copy,windows);
  if(!copy.players[seat].alive){results[name+'Deaths']++;if(possible)results[name+'AvoidableDeaths']++;}
 }
 results.cases++;
}
results.maxMS=+results.maxMS.toFixed(3);
fs.writeFileSync('stress_results_r3.json',JSON.stringify(results,null,2));console.log(results);
assert.strictEqual(results.currentAvoidableDeaths,0,'An available safe three-frame route was missed');
