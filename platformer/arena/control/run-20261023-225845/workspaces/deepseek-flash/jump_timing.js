'use strict';
/* 从 g2r1 第 486 帧的状态出发，穷举"第几帧起跳"对 88 帧后位置的影响。 */
const sim = require('./simulation.js');
const g = sim.createMatch({ id: 'probe', seed: 8012, players: [{name:'a',kind:'api'},{name:'b',kind:'api'}] });
// 强制进入第 1 轮（createMatch 已是第 1 轮），去掉怪物刷新
g.monsterTimer = 1e9;
const p = g.runners[1];
p.x = 161.68; p.y = 3; p.vx = 6.8; p.vy = 0; p.onGround = true; p.prevX = p.x;
g.runners[0].x = 151; g.runners[0].y = 3; g.runners[0].vx = 6.8; g.runners[0].prevX = 151; // 远离，避免推挤
g.phase = 'race'; g.freezeLeft = 0;
function run(jumpFrame, horizon) {
  const s = sim.createMatch({ id: 'probe', seed: 8012, players: [{name:'a',kind:'api'},{name:'b',kind:'api'}] });
  s.monsterTimer = 1e9; s.phase = 'race'; s.freezeLeft = 0;
  const q = s.runners[1];
  q.x = p.x; q.y = p.y; q.vx = p.vx; q.vy = p.vy; q.onGround = true; q.prevX = q.x;
  const o = s.runners[0]; o.x = 151; o.y = 3; o.vx = 6.8; o.prevX = 151;
  let stuck = 0;
  for (let f = 0; f < horizon; f++) {
    q.held = { move: 1, jump: f === jumpFrame };
    o.held = { move: 1, jump: false };
    sim.step(s);
    if (q.onGround && Math.abs(q.vx) < 1) stuck++;
  }
  return { jumpFrame, x: +q.x.toFixed(2), y: +q.y.toFixed(2), stuck, onGround: q.onGround };
}
const out = [];
for (let j = 0; j <= 16; j++) out.push(run(j, 88));
console.table(out);
