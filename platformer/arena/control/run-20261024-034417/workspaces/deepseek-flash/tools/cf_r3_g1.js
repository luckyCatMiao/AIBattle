#!/usr/bin/env node
// 第 3 轮 r3-g1 第 1 子局：用真实引擎复现，并对 191-195 帧的输入做开环反事实。
const fs = require('fs');
const zlib = require('zlib');
const sim = require('../simulation.js');
const path = require('path');

const RUN = path.resolve(__dirname, '../../..');
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RUN, 'r3-g1.json.gz'))).toString('utf8'));
const MY = 0;

function run(windows, mutate) {
  const g = sim.createMatch({ id: 'cf', players: [{ name: 'deepseek', kind: 'api' }, { name: 'sol', kind: 'api' }], seed: d.seed });
  let firstDeath = null;
  for (const w of windows) {
    let a = w.inputs[0], b = w.inputs[1];
    if (mutate) {
      const r = mutate(w, a, b);
      if (r) { a = r[0]; b = r[1]; }
    }
    sim.advanceWindow(g, [a, b]);
    const me = g.runners[MY];
    if (me.deaths > 0 && firstDeath === null) firstDeath = { frame: g.frame, round: g.round };
    if (g.status === 'finished') break;
  }
  return { g, firstDeath };
}

const base = run(d.windows, null);
console.log('BASE status', base.g.status, 'winner', base.g.winner, 'reason', base.g.reason,
  'wins', base.g.wins, 'round', base.g.round, 'frame', base.g.frame,
  'me x', base.g.runners[MY].x.toFixed(2), 'deaths', base.g.runners[MY].deaths,
  'maxX', base.g.runners[MY].maxX.toFixed(2), 'firstDeath', base.firstDeath);

const W = 195; // 应用帧 191-195，含 192 起跳与 193 撞锯
for (const [name, my] of Object.entries({
  'recorded(run,jump)': [[1, 0], [1, 1], [1, 0], [1, 0], [1, 0]],
  'jump-first': [[1, 1], [1, 0], [1, 0], [1, 0], [1, 0]],
  'all-run': [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
  'brake-first': [[0, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
  'back-first': [[-1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
})) {
  const r = run(d.windows, (w) => {
    if (w.frame !== W) return null;
    return [my.map(([m, j]) => [{ move: m, jump: !!j }]), w.inputs[1]];
  });
  console.log('CF', name, 'status', r.g.status, 'winner', r.g.winner, 'reason', r.g.reason,
    'wins', r.g.wins, 'round', r.g.round, 'me x', r.g.runners[MY].x.toFixed(2),
    'deaths', r.g.runners[MY].deaths, 'maxX', r.g.runners[MY].maxX.toFixed(2),
    'firstDeath', r.firstDeath);
}
