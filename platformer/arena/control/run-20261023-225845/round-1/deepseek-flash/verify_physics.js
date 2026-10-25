'use strict';
// 物理一致性校验：用真实 simulation.js 跑固定输入序列，导出逐帧状态。
const fs = require('fs');
const sim = require('./simulation.js');

const seed = Number(process.argv[2] || 12345);
const nframes = Number(process.argv[3] || 300);
const outFile = process.argv[4] || 'js_trace.json';

// 可复现的伪随机输入脚本
let s = (seed * 2654435761) >>> 0;
const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const script = [];
for (let i = 0; i < nframes; i++) {
  const r = rnd();
  let move = 1;
  if (r < 0.12) move = 0; else if (r < 0.2) move = -1;
  script.push({ move, jump: rnd() < 0.22 });
}

const g = sim.createMatch({
  id: 'v', seed,
  players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'bot' }],
});
g.runners[1].x = -1000; g.runners[1].y = 3; g.runners[1].vx = 0;  // 移出地图，避免干扰/抢终点

while (g.phase === 'freeze') { g.runners[0].held = { move: 0, jump: false }; sim.step(g); }

const level = {
  width: g.w, height: g.h, goalX: g.goalX, startX: g.startX,
  tiles: Array.from(g.tiles),
};
const trace = [];
const snap = (f) => {
  const p = g.runners[0];
  trace.push({ f, x: p.x, y: p.y, vx: p.vx, vy: p.vy, og: p.onGround, deaths: p.deaths });
};
snap(0);
for (let i = 0; i < script.length; i++) {
  if (g.status !== 'playing' || g.phase !== 'race') break;
  g.runners[0].held = { move: script[i].move, jump: !!script[i].jump };
  sim.step(g);
  snap(i + 1);
}
fs.writeFileSync(outFile, JSON.stringify({ seed, level, script, trace }));
console.log('wrote', outFile, 'frames', trace.length, 'deaths', g.runners[0].deaths,
            'goalX', g.goalX, 'phase', g.phase, 'status', g.status);
