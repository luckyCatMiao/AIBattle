'use strict';
/* Per-physics-frame race analyzer: logs the agent's own per-frame control/state. */
const sim = require('../simulation.js');
const { Agent } = require('../agent.js');

const seed = Number(process.argv[2] || 4000);
const cfg = process.argv[3] ? JSON.parse(process.argv[3]) : { debug: true };
cfg.debug = true;

const agent = new Agent(cfg);
const g = sim.createMatch({ id: 'a', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
g.cars[1].x = 2; g.cars[1].y = 2;
const neutral = Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]);
const log = [];
let w = 0;
while (g.status === 'playing' && w < 340) {
  const obs = sim.view(g, 0);
  const rep = agent.plan(obs);
  const w0 = sim.submitWindow(g, 0, rep.inputs);
  const w1 = sim.submitWindow(g, 1, neutral);
  for (let i = 0; i < 20 && g.status === 'playing'; i++) {
    g.cars[0].held = w0[i][0];
    sim.step(g);
    g.cars[1].x = 2; g.cars[1].y = 2; g.cars[1].vx = 0; g.cars[1].vy = 0;
    if (g.phase === 'live') {
      const c = g.cars[0];
      const v = Math.hypot(c.vx, c.vy);
      const psi = v > 0.5 ? Math.atan2(c.vy, c.vx) : c.angle;
      let slip = ((psi - c.angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
      log.push({ f: g.frame, x: c.x, y: c.y, v, slip: Math.abs(slip), drifting: c.drifting, off: c.offRoad,
        be: c.boostEnergy, dc: c.driftCharge, lap: c.lap, s: c.progress });
    }
  }
  w++;
}
const fin = g.cars[0].finishTime;
const moving = log.filter(a => a.v > 1);
const slipBuckets = [0, 5, 10, 20, 30, 45, 60, 90];
const hist = new Array(slipBuckets.length - 1).fill(0);
for (const a of moving) {
  const d = a.slip * 180 / Math.PI;
  for (let i = 0; i < slipBuckets.length - 1; i++) if (d >= slipBuckets[i] && d < slipBuckets[i + 1]) { hist[i]++; break; }
}
console.log('seed', seed, 'fin', fin, 'frames', log.length, 'drift%', (100 * moving.filter(a => a.drifting).length / moving.length).toFixed(1),
  'off%', (100 * log.filter(a => a.off).length / log.length).toFixed(2),
  'be0%', (100 * log.filter(a => a.be < 0.05).length / log.length).toFixed(1),
  'dcCapped%', (100 * log.filter(a => a.dc > 0.95).length / log.length).toFixed(1));
console.log('slip histogram (deg):', slipBuckets.slice(1).map((b, i) => `${slipBuckets[i]}-${b}:${(100 * hist[i] / moving.length).toFixed(1)}`).join(' '));
const vs = moving.map(a => a.v).sort((a, b) => a - b);
const q = f => vs[Math.floor(f * (vs.length - 1))].toFixed(1);
console.log('speed q10/q50/q90/max', q(0.1), q(0.5), q(0.9), vs[vs.length - 1].toFixed(1));
// time-weighted: fraction of frames with v<16
console.log('v<16%', (100 * moving.filter(a => a.v < 16).length / moving.length).toFixed(1),
  'v>=22%', (100 * moving.filter(a => a.v >= 22).length / moving.length).toFixed(1));
