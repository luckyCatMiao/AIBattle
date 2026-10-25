'use strict';
const assert=require('assert'),sim=require('./simulation'),{plan,buildState}=require('./agent_core');
function empty(seed=1) {
 const g=sim.createMatch({seed,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
 g.phase='race';g.tiles.fill(0);for(let x=0;x<g.w;x++)for(let y=13;y<16;y++)g.tiles[y*g.w+x]=1;
 g.platforms=[];g.plants=[];g.saws=[];g.monsters=[];g.monsterTimer=999;
 g.platformRects=[];g.plantStates=[];g.sawStates=[];
 return g;
}
const reports=[];
for(const type of ['gap2','gap3','step','monster','rearPush','frontBlock']) {
 for(const me of [0,1]) {
  const g=empty();const p=g.runners[me],e=g.runners[1-me];p.x=8;p.vx=6.8;e.x=2;
  if(type.startsWith('gap'))for(let x=12;x<12+Number(type.slice(-1));x++)for(let y=13;y<16;y++)g.tiles[y*g.w+x]=0;
  if(type==='step')for(let x=12;x<15;x++)g.tiles[12*g.w+x]=1;
  if(type==='monster')g.monsters=[{id:'test',x:13,y:3,dir:-1,alive:true}];
  if(type==='rearPush') {e.x=7.4;e.vx=6.8;for(let x=12;x<15;x++)for(let y=13;y<16;y++)g.tiles[y*g.w+x]=0;}
  if(type==='frontBlock') {e.x=9;e.vx=0;for(let x=12;x<14;x++)for(let y=13;y<16;y++)g.tiles[y*g.w+x]=0;}
  // No seeded machinery in these hand-built scenarios.
  for(let w=0;w<20&&p.x<20;w++) {
   const o=sim.view(g,me);o.seed=1;
   // Planner reconstructs seeded machines; remove only its own prediction's machines through optional test state.
   const actions=plan(o,{state:g});
   for(let k=0;k<5;k++) {p.held=actions[k];e.held={move:type==='frontBlock'?0:1,jump:false};sim.step(g);}
  }
  reports.push({type,me,x:p.x,deaths:p.deaths,passed:p.x>=20&&p.deaths===0});
 }
}
// Check public reconstruction on an unmodified generated map for 100 frames.
const g=sim.createMatch({seed:8301,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
for(let k=0;k<20;k++)sim.step(g);
const pred=buildState(sim.view(g,0));let maxError=0;
for(let k=0;k<100;k++) {
 for(let i=0;i<2;i++)g.runners[i].held=pred.runners[i].held={move:1,jump:k%13===0};
 sim.step(g);sim.step(pred);
 for(let i=0;i<2;i++)maxError=Math.max(maxError,Math.abs(g.runners[i].x-pred.runners[i].x),Math.abs(g.runners[i].y-pred.runners[i].y));
}
console.log(JSON.stringify({reports,maxReconstructionError:maxError},null,2));
assert(reports.every(r=>r.passed),'targeted obstacle failed');assert(maxError<.001,'reconstruction differs');
