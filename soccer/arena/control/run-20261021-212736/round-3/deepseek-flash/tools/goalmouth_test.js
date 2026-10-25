'use strict';
const sim = require('/workspace/simulation.js');
function mk(n, ax, ay, keeperPos) {
  const g = sim.createMatch({ id:'gm', players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}], teamSize:n });
  g.freeze = 0;
  const A = g.units.filter(u=>u.team===0), B = g.units.filter(u=>u.team===1);
  A.forEach((u,i)=>{ u.x=10; u.y=4+i*3; });
  B.forEach((u,i)=>{ u.x=30+i; u.y=13; });
  A[0].x=ax; A[0].y=ay; A[0].facing={x:1,y:0};
  if (keeperPos) { B[0].x=keeperPos[0]; B[0].y=keeperPos[1]; }
  g.ball.x=ax+0.62; g.ball.y=ay; g.ball.owner=A[0].id; g.ball.vx=0; g.ball.vy=0;
  return g;
}
// Test 1: kick from just before line while ball owned crossing line
for (const ax of [41.0, 42.0, 42.4, 42.6]) {
  const g=mk(2, ax, 13, [43.2,13]);
  const A0=g.units.find(u=>u.id==='t0u0');
  A0.held={dir:'N',aim:0,kick:true};
  sim.step(g);
  console.log(`ax=${ax} -> score=${g.score} owner=${g.ball.owner} ball=(${g.ball.x.toFixed(2)},${g.ball.y.toFixed(2)})`);
}
// Test 2: dribble in from x=40 with keeper at (42.5,13), owner facing right moving right
for (const kx of [42.5, 43.2, 41.5]) {
  const g=mk(2, 40, 13, [kx,13]);
  const A0=g.units.find(u=>u.id==='t0u0');
  let res='';
  for(let f=0;f<60 && g.status==='playing' && g.score[0]===0;f++){
    A0.held={dir:'R',aim:0,kick: f>=14};
    sim.step(g);
  }
  console.log(`keeper=${kx} score=${g.score} framesowner=${g.ball.owner} ball=(${g.ball.x.toFixed(2)},${g.ball.y.toFixed(2)}) ownerpos=(${A0.x.toFixed(2)},${A0.y.toFixed(2)})`);
}
