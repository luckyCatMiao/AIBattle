'use strict';
const sim = require('../simulation.js');
const A = require('../agent.js');

const seed = Number(process.argv[2] || 1000);
const g = sim.createMatch({ id: 'v', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
g.countdown = 0; g.phase = 'live';
const c = g.cars[0];
// start on the racing line near the grid
const m = A.buildModel(g.track, A.DEFAULTS);
c.x = m.x[0]; c.y = m.y[0]; c.angle = m.tang[0];
c.vx = 0; c.vy = 0;
g.cars[1].x = 2; g.cars[1].y = 2;

const st = { x: c.x, y: c.y, angle: c.angle, vx: 0, vy: 0, driftCharge: 0, boostEnergy: 0, drifting: false, boosting: false };
let worst = 0;
let rngState = 12345;
const rnd = () => { rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0; return rngState / 4294967296; };
for (let i = 0; i < 600; i++) {
  const inp = {
    throttle: Math.round((rnd() * 2 - 1) * 100) / 100,
    steer: Math.round((rnd() * 2 - 1) * 100) / 100,
    drift: rnd() < 0.35, boost: rnd() < 0.2,
  };
  c.held = inp;
  sim.step(g);
  A.stepCar(st, inp, g.track.tiles);
  // note: sim also collides with the parked car far away; skip
  const d = Math.max(
    Math.abs(c.x - st.x), Math.abs(c.y - st.y), Math.abs(c.angle - st.angle),
    Math.abs(c.vx - st.vx), Math.abs(c.vy - st.vy),
    Math.abs(c.driftCharge - st.driftCharge), Math.abs(c.boostEnergy - st.boostEnergy),
  );
  if (d > worst) worst = d;
  if (d > 1e-9) {
    console.log('MISMATCH frame', i, 'd=', d);
    console.log('real', { x: c.x, y: c.y, a: c.angle, vx: c.vx, vy: c.vy, dc: c.driftCharge, be: c.boostEnergy, dr: c.drifting });
    console.log('mine', st);
    break;
  }
}
console.log('worst diff', worst);
