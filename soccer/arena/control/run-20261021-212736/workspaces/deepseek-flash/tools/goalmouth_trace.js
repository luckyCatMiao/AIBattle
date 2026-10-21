'use strict';
const sim = require('/workspace/simulation.js');
const g = sim.createMatch({ id:'gm', players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}], teamSize:2 });
g.freeze = 0;
const A = g.units.filter(u=>u.team===0), B = g.units.filter(u=>u.team===1);
A.forEach((u,i)=>{ u.x=10; u.y=4+i*3; });
B.forEach((u,i)=>{ u.x=30+i; u.y=13; });
A[0].x=40; A[0].y=13; A[0].facing={x:1,y:0};
B[0].x=42.5; B[0].y=13;
g.ball.x=40.62; g.ball.y=13; g.ball.owner='t0u0'; g.ball.vx=0; g.ball.vy=0;
for(let f=0; f<20 && g.status==='playing'; f++){
  const A0=g.units.find(u=>u.id==='t0u0'), B0=g.units.find(u=>u.id==='t1u0');
  A0.held={dir:'R',aim:0,kick: f>=14};
  B0.held={dir:'N',aim:null,kick:false};
  const em=g.units.find(u=>u.id==='t1u1'); em.held={dir:'N',aim:null,kick:false};
  sim.step(g);
  const b=g.ball;
  console.log(`f=${f} score=${g.score} owner=${b.owner} ball=(${b.x.toFixed(2)},${b.y.toFixed(2)}) A0=(${A0.x.toFixed(2)},${A0.y.toFixed(2)}) B0=(${B0.x.toFixed(2)},${B0.y.toFixed(2)}) dBallB0=${Math.hypot(b.x-B0.x,b.y-B0.y).toFixed(2)}`);
}
