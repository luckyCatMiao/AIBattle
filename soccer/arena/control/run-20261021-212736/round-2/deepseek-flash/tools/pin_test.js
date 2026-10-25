'use strict';
const sim = require('/workspace/simulation.js');
function mk(n, ax, ay, facing) {
  const g = sim.createMatch({ id:'pin', players:[{name:'A',kind:'bot'},{name:'B',kind:'bot'}], teamSize:n });
  g.freeze = 0;
  const A = g.units.filter(u=>u.team===0), B = g.units.filter(u=>u.team===1);
  A.forEach((u,i)=>{ u.x = 3 + i*0.1; u.y = 13 + i*2; });
  A[0].x = ax; A[0].y = ay; A[0].facing = {x:facing[0],y:facing[1]};
  B.forEach((u,i)=>{ u.x = ax + 1.0 + i*0.5; u.y = ay + (i-1)*0.6; });
  g.ball.x = ax + facing[0]*0.62; g.ball.y = ay + facing[1]*0.62;
  g.ball.owner = A[0].id; g.ball.vx = 0; g.ball.vy = 0;
  return g;
}
for (const n of [1,2,3,6]) {
  for (const facing of [[-1,0],[-1,-0.3],[0,-1]]) {
    const g = mk(n, 0.35, facing[1] ? 0.35 : 20, facing);
    let lost = 0, firstLost = -1, minOwnerDist=1e9;
    for (let f=0; f<400 && g.status==='playing'; f++) {
      for (const u of g.units) {
        if (u.team===0) u.held = { dir: facing[0]<0?'L':(facing[1]<0?'U':'N'), aim: Math.atan2(facing[1],facing[0])*180/Math.PI, kick:false };
        else {
          const b=g.ball;
          const dx=b.x-u.x, dy=b.y-u.y, l=Math.hypot(dx,dy)||1;
          u.held = { dir: 'N', aim: null, kick:false };
          // move toward ball using nearest dir
          const ang=Math.atan2(dy,dx); const k=Math.round(ang/(Math.PI/4));
          const nm=['R','DR','D','DL','L','UL','U','UR'][(k+8)%8];
          u.held.dir=nm;
        }
      }
      sim.step(g);
      const b=g.ball;
      if (b.owner !== 't0u0') { lost++; if(firstLost<0) firstLost=f; }
      const o=g.units.find(u=>u.id==='t0u0');
      minOwnerDist=Math.min(minOwnerDist, Math.hypot(o.x-b.x,o.y-b.y));
    }
    console.log(`n=${n} facing=${facing} owner=${g.ball.owner} lostFrames=${lost} first=${firstLost} minOwnerDist=${minOwnerDist.toFixed(3)} ball=(${g.ball.x.toFixed(2)},${g.ball.y.toFixed(2)}) A=(${g.units[0].x.toFixed(2)},${g.units[0].y.toFixed(2)}) score=${g.score}`);
  }
}
