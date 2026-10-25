'use strict';
/* 用随机输入跑一局，逐窗口把观察+双方输入 dump 成 jsonl，供 python 端口验证。 */
const fs = require('fs');
const path = require('path');
const sim = require(path.resolve(__dirname, '..', 'simulation.js'));

const DIRS = ['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'];
function rnd(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

const seed = Number(process.argv[2] || 7);
const n = Number(process.argv[3] || 3);
const out = process.argv[4] || path.join(__dirname, 'dump.jsonl');

const g = sim.createMatch({ id: 'v', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed, teamSize: n });
const r = rnd(seed * 7919 + 13);
const lines = [];
let wi = 0;
while (g.status === 'playing' && wi < 60) {
  const obs = sim.view(g, 0);
  const w0 = [], w1 = [];
  for (let i = 0; i < 20; i++) {
    const f0 = [], f1 = [];
    for (let k = 0; k < n; k++) {
      f0.push({ dir: DIRS[Math.floor(r() * 9)], aim: Math.floor(r() * 360), kick: r() < 0.25 });
      f1.push({ dir: DIRS[Math.floor(r() * 9)], aim: Math.floor(r() * 360), kick: r() < 0.25 });
    }
    w0.push(f0); w1.push(f1);
  }
  lines.push(JSON.stringify({ wi, obs, w0, w1 }));
  const A = sim.submitWindow(g, 0, w0);
  const B = sim.submitWindow(g, 1, w1);
  sim.advanceWindow(g, [A, B]);
  wi++;
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log('wrote', lines.length, 'windows, final score', g.score.join(':'), 'status', g.status, 'frames', g.frame, 'teamSize', g.teamSize);
