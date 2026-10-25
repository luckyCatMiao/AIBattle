'use strict';
// 逐帧录制真实模拟：随机输入 + 每帧完整动态状态，供 Python 物理对照。
const sim = require('../simulation.js');
const seed = parseInt(process.argv[2] || '7001', 10);
const g = sim.createMatch({ id: 't', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
for (let i = 0; i < 20; i++) {
  g.runners[0].held = { move: 0, jump: false };
  g.runners[1].held = { move: 0, jump: false };
  sim.step(g);
}
const level = JSON.parse(JSON.stringify(sim.view(g, 0).level));
const start = JSON.parse(JSON.stringify(sim.view(g, 0).runners[0]));
let rs = 12345 + seed;
const rnd = () => { rs = (Math.imul(rs, 1664525) + 1013904223) >>> 0; return rs / 4294967296; };
const frames = [];
const r0 = g.round;
for (let f = 0; f < 900 && g.status === 'playing' && g.phase === 'race' && g.round === r0; f++) {
  const inp = { move: rnd() < 0.82 ? 1 : (rnd() < 0.25 ? -1 : 0), jump: rnd() < 0.22 };
  g.runners[0].held = inp;
  g.runners[1].held = inp;
  sim.step(g);
  // 隔离推挤：把对手挪远（只验证玩家物理）
  g.runners[1].x = g.runners[0].x + 50; g.runners[1].y = 3; g.runners[1].vx = 0; g.runners[1].vy = 0; g.runners[1].onGround = true;
  const v = sim.view(g, 0);
  if (g.round !== r0) break;
  frames.push({
    inp, time: v.time, timeExact: g.time, runner: v.runners[0],
    monsters: v.monsters, platforms: v.platforms, plants: v.plants, saws: v.saws,
    gone: v.gone, crumbling: v.crumbling,
  });
  if (v.runners[0].finished) break;
}
console.log(JSON.stringify({ seed, level, start, frames }));
