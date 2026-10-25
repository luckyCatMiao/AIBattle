'use strict';
const fs=require('fs'),assert=require('assert'),sim=require('./simulation');
const current=require('./agent_core'),previous=require('./round1_core');
const reports=[];let maxMs=0,calls=0,totalMs=0;
function actions(g,me,opts) {
 const t=performance.now(),a=current.plan(sim.view(g,me),opts);
 const ms=performance.now()-t;maxMs=Math.max(maxMs,ms);totalMs+=ms;calls++;
 assert(a.length===5 && a.every(x=>Number.isFinite(x.move)&&Math.abs(x.move)<=1&&typeof x.jump==='boolean'));
 return a;
}
function empty() {
 const g=sim.createMatch({seed:1,players:[{name:'us',kind:'api'},{name:'test',kind:'api'}]});
 g.phase='race';g.tiles.fill(0);
 for(let x=0;x<g.w;x++)for(let y=13;y<16;y++)g.tiles[y*g.w+x]=1;
 g.platforms=[];g.plants=[];g.saws=[];g.monsters=[];g.monsterTimer=999;
 g.platformRects=[];g.plantStates=[];g.sawStates=[];return g;
}
for(const type of ['spike1','spike2','saw','plant','rearPushSpike','switchPush','record','recordAhead'])for(const me of [0,1]) {
 const g=empty(),p=g.runners[me],e=g.runners[1-me];p.x=8;p.maxX=8;p.vx=6.8;e.x=2;e.maxX=2;
 if(type.startsWith('spike')||type==='rearPushSpike') {
  for(let x=12;x<12+(type==='spike1'?1:2);x++)g.tiles[12*g.w+x]=3;
  if(type==='rearPushSpike') {e.x=7.35;e.vx=6.8;}
 }
 if(type==='switchPush') {e.x=8.8;e.vx=0;for(let x=12;x<15;x++)for(let y=13;y<16;y++)g.tiles[y*g.w+x]=0;}
 if(type==='saw') {g.saws=[{from:{x:12,y:4},to:{x:16,y:4},period:3.1,phase:1.2}];g.sawStates=[{x:13,y:4}];}
 if(type==='plant') {g.plants=[{x:13,y:3,period:3.5,phase:.3,out:1.25}];g.plantStates=[{height:1.15}];}
 if(type.startsWith('record')) {
  for(let x=12;x<15;x++)g.tiles[12*g.w+x]=3;
  p.x=11.3;p.maxX=11.3;p.vx=0;g.roundLeft=4;
  e.maxX=type==='recordAhead'?10:13;g.time=86;
 }
 let windows=0,peak=p.maxX,deaths=0;
 while(g.round===1&&g.status==='playing'&&windows<45&&(type.startsWith('record')||p.x<21)) {
  const a=actions(g,me,{state:g});
  for(let k=0;k<5;k++) {
   p.held=a[k];e.held={move:type==='switchPush'?(windows%3===0?0:1):type==='rearPushSpike'?1:0,jump:type==='switchPush'&&windows%4===1};
   sim.step(g);peak=Math.max(peak,p.maxX);deaths=p.deaths;
   if(g.round!==1||g.status!=='playing')break;
  }
  windows++;
 }
 const passed=type==='record'?peak>13.5:type==='recordAhead'?deaths===0:peak>=21&&deaths===0;
 reports.push({type,me,peak,deaths,windows,passed});
}
fs.writeFileSync('round2_adversarial_targeted.json',JSON.stringify({reports,calls,maxMs,meanMs:totalMs/calls},null,2));
console.log(JSON.stringify({reports,calls,maxMs,meanMs:totalMs/calls},null,2));
assert(reports.every(r=>r.passed),'adversarial targeted scenario failed');
