'use strict';
const sim = require('./simulation.js');
function trace(jumpFrame) {
  const s = sim.createMatch({ id: 'probe', seed: 8012, players: [{name:'a',kind:'api'},{name:'b',kind:'api'}] });
  s.monsterTimer = 1e9; s.phase = 'race'; s.freezeLeft = 0;
  const q = s.runners[1]; q.x = 161.68; q.y = 3; q.vx = 6.8; q.vy = 0; q.onGround = true; q.prevX = q.x;
  const o = s.runners[0]; o.x = 151; o.y = 3; o.vx = 6.8; o.prevX = 151;
  const rows = [];
  for (let f = 0; f < 30; f++) {
    q.held = { move: 1, jump: f === jumpFrame };
    o.held = { move: 1, jump: false };
    sim.step(s);
    rows.push([f, +q.x.toFixed(2), +q.y.toFixed(2), +q.vx.toFixed(2), +q.vy.toFixed(2), q.onGround]);
  }
  return rows;
}
for (const jf of [6, 7, 8]) {
  console.log('jumpFrame', jf);
  console.log(trace(jf).map(r => r.join(',')).join(' | '));
}
