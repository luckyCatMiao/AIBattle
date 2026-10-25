'use strict';
/* Scan gate pass distances on many seeds: for each checkpoint, record the closest
 * approach during the FIRST pass (before the car is >6 models-units past it). */
const sim = require('../simulation.js');
const { Agent, projectFull, pointAtS } = require('../agent.js');

const base = Number(process.argv[2] || 8000);
const n = Number(process.argv[3] || 50);
const cfg = process.argv[4] ? JSON.parse(process.argv[4]) : {};

const rows = [];
for (let si = 0; si < n; si++) {
  const seed = base + si;
  const agent = new Agent(cfg);
  const g = sim.createMatch({ id: 'g', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const neutralWindow = () => Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]);
  const c1 = g.cars[1]; c1.x = 2; c1.y = 2;
  const state = {}; // cpIndex -> {min, started, done}
  let cpSeen = -1;
  while (g.status === 'playing' && g.frame < 6000) {
    const obs = sim.view(g, 0);
    const reply = agent.plan(obs);
    const w0 = sim.submitWindow(g, 0, reply.inputs);
    const w1 = sim.submitWindow(g, 1, neutralWindow());
    for (let i = 0; i < 20 && g.status === 'playing'; i++) {
      g.cars[0].held = w0[i][0]; g.cars[1].held = w1[i][0];
      sim.step(g);
      c1.x = 2; c1.y = 2; c1.vx = 0; c1.vy = 0;
      if (g.phase !== 'live') continue;
      const car = g.cars[0];
      const cp = car.nextCp, cpo = g.track.checkpoints[cp];
      const dd = Math.hypot(car.x - cpo.x, car.y - cpo.y);
      const p = projectFull(agent.model, car.x, car.y, agent.hint);
      let dcp = p.s - projectFull(agent.model, cpo.x, cpo.y, null).s;
      if (dcp > agent.model.total / 2) dcp -= agent.model.total;
      if (dcp < -agent.model.total / 2) dcp += agent.model.total;
      if (!state[cp]) state[cp] = { min: Infinity, passedAt: null, lap: car.lap, frame: g.frame };
      const s = state[cp];
      if (s.passedAt == null) {
        if (dcp > -12 && dcp < 7 && dd < s.min) s.min = dd;
        if (dcp >= 7) s.passedAt = g.frame;
      }
    }
  }
  for (const k of Object.keys(state)) {
    const s = state[k];
    rows.push({ seed, cp: Number(k), min: +s.min.toFixed(2), pass: s.passedAt != null });
  }
}
const hw = g => g;
const bins = [0, 2, 3, 3.5, 4, 4.5, 5, 6, 100];
const hist = new Array(bins.length - 1).fill(0);
for (const r of rows) for (let b = 0; b < bins.length - 1; b++) if (r.min >= bins[b] && r.min < bins[b + 1]) hist[b]++;
console.log('gates', rows.length, 'bins', bins.slice(0, -1).map((b, i) => `${b}-${bins[i + 1]}:${hist[i]}`).join(' '));
const bad = rows.filter(r => r.min >= 3.6);
console.log('risky(>=3.6):', bad.length, 'neverPassed:', rows.filter(r => !r.pass).length);
const byCp = {};
for (const r of rows) { if (!byCp[r.cp]) byCp[r.cp] = { n: 0, bad: 0, mean: 0 }; byCp[r.cp].n++; byCp[r.cp].mean += r.min; if (r.min >= 3.6) byCp[r.cp].bad++; }
for (const k of Object.keys(byCp).sort((a, b) => a - b)) {
  const b = byCp[k];
  console.log(`cp${k}: n=${b.n} meanMin=${(b.mean / b.n).toFixed(2)} risky=${b.bad}`);
}
console.log('sample risky:', JSON.stringify(rows.filter(r => r.min >= 3.6).slice(0, 25)));
