'use strict';
const fs=require('fs'),sim=require('./simulation'),now=require('./agent_core'),old=require('./round1_core');
const count=Number(process.argv[2]||8),base=Number(process.argv[3]||8111),results=[];
let calls=0,maxMs=0,totalMs=0;
for(let i=0;i<count;i++) {
 const me=i%2,g=sim.createMatch({seed:base+i,players:[{name:'new',kind:'api'},{name:'old',kind:'api'}]});
 const rounds=[];let start=0;let deaths=[0,0],peak=[0,0];
 while(g.status==='playing') {
  const round=g.round,t=performance.now(),a=now.plan(sim.view(g,me));
  const ms=performance.now()-t;calls++;maxMs=Math.max(ms,maxMs);totalMs+=ms;
  const b=old.plan(sim.view(g,1-me));
  for(let k=0;k<5;k++) {
   g.runners[me].held=a[k];g.runners[1-me].held=b[k];
   sim.step(g);
   if(g.round!==round||g.status!=='playing') {
    const ev=g.events.filter(e=>e.type==='round').at(-1);
    rounds.push({round,team:ev.team,reason:ev.reason,frames:g.frame-start,deaths,peak});
    start=g.frame;deaths=[0,0];peak=[0,0];break;
   }
   deaths=g.runners.map(p=>p.deaths);peak=g.runners.map(p=>p.maxX);
  }
 }
 const r={seed:base+i,me,winner:g.winner,wins:g.wins,rounds};results.push(r);console.log(JSON.stringify(r));
}
fs.writeFileSync(`round2_duel_${base}.json`,JSON.stringify({calls,meanMs:totalMs/calls,maxMs,results},null,2));
