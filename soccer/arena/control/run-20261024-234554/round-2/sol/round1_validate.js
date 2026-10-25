'use strict';
const sim=require('./simulation'),agent=require('./agent'),fs=require('fs');
let state=902373,count=0,maxMs=0;
const rnd=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
for(let n=1;n<=6;n++)for(let seat=0;seat<2;seat++)for(let r=0;r<20;r++){
 const g=sim.createMatch({seed:r+1,teamSize:n,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]});
 g.frame=20*(1+Math.floor(rnd()*110));
 for(const u of g.units){u.x=11+rnd()*21;u.y=2+rnd()*22;u.facing={x:Math.cos(r),y:Math.sin(r)};}
 g.ball={x:2+rnd()*40,y:2+rnd()*22,vx:(rnd()-.5)*20,vy:(rnd()-.5)*20,owner:null,lastTouch:null,lastTeam:null};
 if(r%3===0){const u=g.units[Math.floor(rnd()*g.units.length)];g.ball={...g.ball,x:u.x+.62*u.facing.x,y:u.y+.62*u.facing.y,vx:0,vy:0,owner:u.id,lastTouch:u.id,lastTeam:u.team};}
 const t=performance.now(),a=agent.decide(sim.view(g,seat));maxMs=Math.max(maxMs,performance.now()-t);sim.submitWindow(g,seat,a.inputs);
 for(const f of a.inputs)for(const u of f)if(!Number.isFinite(u.aim)||u.aim<0||u.aim>=360||typeof u.kick!=='boolean')throw Error('invalid');
 count++;
}
const example=JSON.parse(fs.readFileSync('example.json','utf8'));sim.submitWindow(sim.createMatch({seed:example.seed,teamSize:example.teamSize,players:[{name:'a',kind:'api'},{name:'b',kind:'api'}]}),example.yourTeam,agent.decide(example).inputs);
// Verify that historical foul/possession counts are not charged twice.
example.stats[0].fouls=3;example.stats[1].fouls=2;
const g=agent.restore(example);if(g.stats[0].fouls!==3||g.stats[1].fouls!==2)throw Error('stats restoration');
console.log(JSON.stringify({count,example:true,statsRestored:true,maxMs:+maxMs.toFixed(2)}));
