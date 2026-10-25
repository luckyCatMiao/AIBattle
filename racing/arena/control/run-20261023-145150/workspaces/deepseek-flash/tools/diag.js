'use strict';
/* Per-frame diagnostics for one seed: drives the real sim with our agent and
 * dumps position, model-line offset, checkpoint proximity. */
const sim = require('../simulation.js');
const { Agent, projectFull, pointAtS, DEFAULTS } = require('../agent.js');

const seed = Number(process.argv[2] || 8008);
const cfg = process.argv[3] ? JSON.parse(process.argv[3]) : {};
const f0 = Number(process.argv[4] || 0), f1 = Number(process.argv[5] || 1e9);

const agent = new Agent(Object.assign({}, DEFAULTS, cfg));
const g = sim.createMatch({ id: 'd', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
const neutralWindow = () => Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]);
const c = g.cars[1]; c.x = 2; c.y = 2;

let prevS = null;
while (g.status === 'playing' && g.frame < 6000) {
  const obs = sim.view(g, 0);
  const reply = agent.plan(obs);
  const w0 = sim.submitWindow(g, 0, reply.inputs);
  const w1 = sim.submitWindow(g, 1, neutralWindow());
  for (let i = 0; i < 20 && g.status === 'playing'; i++) {
    g.cars[0].held = w0[i][0]; g.cars[1].held = w1[i][0];
    sim.step(g);
    c.x = 2; c.y = 2; c.vx = 0; c.vy = 0;
    if (g.phase !== 'live') continue;
    const car = g.cars[0];
    if (g.frame < f0 || g.frame > f1) continue;
    const m = agent.model;
    const p = projectFull(m, car.x, car.y, agent.hint);
    const cp = g.track.checkpoints[car.nextCp];
    const dcp = Math.hypot(car.x - cp.x, car.y - cp.y);
    const q = pointAtS(m, p.s);
    console.log(JSON.stringify({
      f: g.frame, x: +car.x.toFixed(1), y: +car.y.toFixed(1), sp: +Math.hypot(car.vx, car.vy).toFixed(1),
      ang: +car.angle.toFixed(2), vdir: +Math.atan2(car.vy, car.vx).toFixed(2),
      s: +p.s.toFixed(1), d: +p.d.toFixed(2), lap: car.lap, cp: car.nextCp, dcp: +dcp.toFixed(1),
      off: car.offRoad ? 1 : 0, be: +car.boostEnergy.toFixed(2), dc: +car.driftCharge.toFixed(2),
      line: [+q.x.toFixed(1), +q.y.toFixed(1)], cpx: cp.x, cpy: cp.y,
    }));
  }
}
