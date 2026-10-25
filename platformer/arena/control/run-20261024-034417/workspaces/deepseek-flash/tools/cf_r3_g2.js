#!/usr/bin/env node
// 第 3 轮 r3-g2 第 3 子局：用真实引擎复现，并对 3751 帧前后的输入做开环反事实。
const fs = require('fs');
const zlib = require('zlib');
const sim = require('../simulation.js');

const RUN = require('path').resolve(__dirname, '../../..');
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(require('path').join(RUN, 'r3-g2.json.gz'))).toString('utf8'));
const MY = 1; // deepseek 在 r3-g2 坐 1 号位

function run(windows, mutate) {
  const g = sim.createMatch({ id: 'cf', players: [{ name: 'sol', kind: 'api' }, { name: 'deepseek', kind: 'api' }], seed: d.seed });
  const log = [];
  let died = null;
  for (const w of windows) {
    let a = w.inputs[0], b = w.inputs[1];
    if (mutate) {
      const r = mutate(w, a, b);
      if (r) { a = r[0]; b = r[1]; }
    }
    sim.advanceWindow(g, [a, b]);
    const me = g.runners[MY];
    if (me.deaths > 0 && died === null) died = { frame: g.frame, round: g.round, deaths: me.deaths };
    if (g.status === 'finished') break;
  }
  return { g, died };
}

const base = run(d.windows, null);
console.log('BASE status', base.g.status, 'winner', base.g.winner, 'reason', base.g.reason,
  'wins', base.g.wins, 'round', base.g.round, 'frame', base.g.frame,
  'me x', base.g.runners[MY].x.toFixed(2), 'deaths', base.g.runners[MY].deaths,
  'maxX', base.g.runners[MY].maxX.toFixed(2), 'firstDeath', base.died);

const W = 3755; // 该窗口应用帧 3751-3755，即致命推挤帧
const plans = {
  'all-run(recorded)': [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
  'brake-all': [[0, 0], [0, 0], [0, 0], [0, 0], [0, 0]],
  'brake-first': [[0, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
  'back-first': [[-1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
  'brake-two': [[0, 0], [0, 0], [1, 0], [1, 0], [1, 0]],
};
for (const [name, my] of Object.entries(plans)) {
  const r = run(d.windows, (w) => {
    if (w.frame !== W) return null;
    return [w.inputs[0], my.map(([m, j]) => [{ move: m, jump: !!j }])];
  });
  console.log('CF', name, 'status', r.g.status, 'winner', r.g.winner, 'reason', r.g.reason,
    'wins', r.g.wins, 'round', r.g.round, 'me x', r.g.runners[MY].x.toFixed(2),
    'deaths', r.g.runners[MY].deaths, 'maxX', r.g.runners[MY].maxX.toFixed(2),
    'firstDeath', r.died);
}

// 前一窗口（帧 3746-3750）改变刹车/跳跃时机的反事实
for (const [name, my] of Object.entries({
  'W3750 all-run': [[1, 0], [1, 0], [1, 0], [1, 0], [1, 0]],
  'W3750 brake3': [[1, 0], [1, 0], [1, 0], [0, 0], [0, 0]],
})) {
  const r = run(d.windows, (w) => {
    if (w.frame !== 3750) return null;
    return [w.inputs[0], my.map(([m, j]) => [{ move: m, jump: !!j }])];
  });
  console.log('CF', name, 'status', r.g.status, 'winner', r.g.winner,
    'wins', r.g.wins, 'me deaths', r.g.runners[MY].deaths, 'maxX', r.g.runners[MY].maxX.toFixed(2),
    'firstDeath', r.died);
}
