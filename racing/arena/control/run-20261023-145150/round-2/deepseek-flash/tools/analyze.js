'use strict';
const { runGame } = require('./harness.js');
const A = require('../agent.js');
const seed = Number(process.argv[2] || 1000);
const cfg = process.argv[3] ? JSON.parse(process.argv[3]) : {};
cfg.debug = true;
const r = runGame(seed, { cfg, trace: true });
// rerun to get detailed per-frame log: patch runGame? simpler: run again manually here
const sim = require('../simulation.js');
const agent = new A.Agent(cfg);
const g = sim.createMatch({ id: 'a', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
g.cars[1].x = 2; g.cars[1].y = 2;
const all = [];
while (g.status === 'playing' && all.length < 7000) {
  const obs = sim.view(g, 0);
  const rep = agent.plan(obs);
  const w0 = sim.submitWindow(g, 0, rep.inputs);
  const w1 = sim.submitWindow(g, 1, Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]));
  sim.advanceWindow(g, [w0, w1]);
  g.cars[1].x = 2; g.cars[1].y = 2; g.cars[1].vx = 0; g.cars[1].vy = 0;
  for (const l of agent.lastLog) all.push(l);
}
console.log('frames', all.length, 'finish', g.cars[0].finishTime, 'best', g.cars[0].bestLap, 'offroadPct', (all.filter(f => f.off).length / all.length * 100).toFixed(1));
// episodes of offroad
let i = 0, eps = [];
while (i < all.length) {
  if (all[i].off) { let j = i; while (j < all.length && all[j].off) j++; eps.push([i, j]); i = j; } else i++;
}
console.log('offroad episodes:', eps.length);
for (const [a, b] of eps) {
  const seg = all.slice(Math.max(0, a - 6), Math.min(all.length, b + 6));
  console.log('--- frames', a, '-', b, 'dur', (b - a) * 0.05, 's at', all[a].s.toFixed(1),
    'v', all[a].v.toFixed(1), 'vt', all[a].vt.toFixed(1), 'drift', all[a].drift);
  console.log(seg.map(f => `${f.s.toFixed(0)}:v${f.v.toFixed(1)}/t${f.vt.toFixed(1)}:st${f.steer.toFixed(2)}${f.drift ? 'D' : ' '}${f.off ? 'OFF' : ''}`).join(' | '));
}
// speed histogram and curvature vs speed on drifted frames
