'use strict';
// Validate the Python physics port against simulation.js.
// Usage: node validate.js <seed> <windows>
const sim = require('./simulation.js');

const seed = Number(process.argv[2] || 1);
const windows = Number(process.argv[3] || 20);

const g = sim.createMatch({ id: 'v', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });

// Deterministic control sequence generated from a simple LCG.
let s = 123456789 >>> 0;
const rnd = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
const seq = [];
for (let w = 0; w < windows; w++) {
  const frames = [];
  for (let i = 0; i < 20; i++) {
    frames.push([{
      throttle: rnd() < 0.15 ? -0.4 : (0.5 + rnd() * 0.5),
      steer: (rnd() * 2 - 1),
      drift: rnd() < 0.35,
      boost: rnd() < 0.2,
    }]);
  }
  seq.push(frames);
}

const states = [];
function snap() {
  const c = g.cars[0];
  states.push({
    frame: g.frame, x: c.x, y: c.y, angle: c.angle, vx: c.vx, vy: c.vy,
    lap: c.lap, nextCp: c.nextCp, progress: c.progress,
    driftCharge: c.driftCharge, boostEnergy: c.boostEnergy,
    drifting: c.drifting, boosting: c.boosting, offRoad: c.offRoad, finished: c.finished,
  });
}
snap();
for (let w = 0; w < windows; w++) {
  const neutral = Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]);
  sim.advanceWindow(g, [seq[w], neutral]);
  snap();
}

console.log(JSON.stringify({
  seed,
  track: {
    width: 128, height: 88, tiles: Array.from(g.track.tiles),
    points: g.track.points, halfWidth: g.track.halfWidth, length: g.track.length,
    checkpoints: g.track.checkpoints, start: g.track.start, grid: g.track.grid,
  },
  inputs: seq,
  states,
}));
