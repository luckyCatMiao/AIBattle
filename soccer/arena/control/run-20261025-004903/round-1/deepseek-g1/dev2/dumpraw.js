'use strict';
/* 用随机输入跑一局，dump 原始（未取整）内部状态，供 python 端口做精确比对。 */
const fs = require('fs');
const path = require('path');
const sim = require(path.resolve(__dirname, '..', 'simulation.js'));

const DIRS = ['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'];
function rnd(seed) { let x = seed >>> 0; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

const seed = Number(process.argv[2] || 7);
const n = Number(process.argv[3] || 3);
const out = process.argv[4] || path.join(__dirname, 'raw.jsonl');
const NW = Number(process.argv[5] || 60);

const g = sim.createMatch({ id: 'v', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed, teamSize: n });
const r = rnd(seed * 7919 + 13);
const lines = [];

const raw = () => ({
  frame: g.frame, freeze: g.freeze, score: [...g.score], status: g.status, half: g.half,
  golden: g.golden, goldenEnd: g.goldenEnd, kickoffTeam: g.kickoffTeam,
  units: g.units.map(u => ({ team: u.team, index: u.index, x: u.x, y: u.y, fx: u.facing.x, fy: u.facing.y, kickCd: u.kickCd, controlLock: u.controlLock, stealLock: u.stealLock, foulLock: u.foulLock })),
  ball: { x: g.ball.x, y: g.ball.y, vx: g.ball.vx, vy: g.ball.vy, owner: g.ball.owner },
});

lines.push(JSON.stringify({ state: raw() }));
let wi = 0;
while (g.status === 'playing' && wi < NW) {
  const w0 = [], w1 = [];
  for (let i = 0; i < 20; i++) {
    const f0 = [], f1 = [];
    for (let k = 0; k < n; k++) {
      f0.push({ dir: DIRS[Math.floor(r() * 9)], aim: Math.floor(r() * 360), kick: r() < 0.3 });
      f1.push({ dir: DIRS[Math.floor(r() * 9)], aim: Math.floor(r() * 360), kick: r() < 0.3 });
    }
    w0.push(f0); w1.push(f1);
  }
  const A = sim.submitWindow(g, 0, w0);
  const B = sim.submitWindow(g, 1, w1);
  sim.advanceWindow(g, [A, B]);
  wi++;
  lines.push(JSON.stringify({ w0, w1, state: raw() }));
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log('wrote', lines.length, 'records; score', g.score.join(':'), 'status', g.status, 'teamSize', g.teamSize);
