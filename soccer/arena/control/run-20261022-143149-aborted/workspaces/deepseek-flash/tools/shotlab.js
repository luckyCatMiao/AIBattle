'use strict';
/* Shot lab v2: pure geometry/mechanics probe.
 * Team 0 shooter with the ball at (sx,sy), lone team 1 keeper near the right goal.
 * The keeper's whole 20-frame input is committed before the shot (simultaneous
 * window), so its policy sees only the pre-shot state. Tooling only. */
const sim = require('../simulation.js');

function segDist(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay;
  const L = vx * vx + vy * vy || 1e-9;
  let t = ((px - ax) * vx + (py - ay) * vy) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function setup(sx, sy, kx, ky) {
  const g = sim.createMatch({
    id: 'lab', seed: 1, teamSize: 1,
    players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }],
  });
  for (const u of g.units) { u.x = 22; u.y = 1.2; }
  const a = g.units.find(u => u.team === 0);
  a.x = sx; a.y = sy;
  const k = g.units.find(u => u.team === 1);
  k.x = kx; k.y = ky;
  g.ball = { x: sx + 0.62, y: sy, vx: 0, vy: 0, owner: a.id, lastTouch: a.id, lastTeam: 0 };
  g.freeze = 0;
  return { g, a, k };
}

/* keeper policy given pre-shot state -> closed-loop-less dir sequence */
function keeperTargets(policy, kx, ky, bx, by) {
  // returns per-frame direction for 20 frames given the committed policy
  const dirs = [];
  let x = kx, y = ky;
  for (let f = 0; f < 20; f++) {
    let ty = y;
    if (policy === 'track') ty = by;
    else if (policy === 'line') {
      // point on ball->goal-center line at the keeper's x
      const t = (x - 43) / ((bx - 43) || -1e-6);
      ty = 13 + (by - 13) * t;
    } else if (policy === 'center') ty = 13;
    let dir = 'N';
    const dy = ty - y;
    if (Math.abs(dy) > 0.05) { dir = dy < 0 ? 'U' : 'D'; y += Math.sign(dy) * Math.min(Math.abs(dy), 3.15 / 20); }
    dirs.push(dir);
  }
  return dirs;
}

function trial({ sx, sy, kx, ky, ty, policy = 'line' }) {
  const { g, a, k } = setup(sx, sy, kx, ky);
  const bx = g.ball.x, by = g.ball.y;
  const aimDeg = Math.atan2(ty - by, 43 - bx) * 180 / Math.PI;
  const kd = keeperTargets(policy, kx, ky, bx, by);
  let kicked = false;
  for (let w = 0; w < 4 && g.status === 'playing'; w++) {
    const w0 = [], w1 = [];
    for (let f = 0; f < 20; f++) {
      const ai = (w === 0 && f === 0)
        ? { dir: 'N', aim: aimDeg, kick: true }
        : { dir: 'N', aim: null, kick: false };
      w0.push([ai]);
      w1.push([{ dir: w === 0 ? kd[f] : 'N', aim: null, kick: false }]);
    }
    sim.advanceWindow(g, [sim.submitWindow(g, 0, w0), sim.submitWindow(g, 1, w1)]);
    if (g.score[0] > 0) return 'goal';
    if (g.ball.owner === k.id) return 'save';
    if (g.ball.owner === a.id) return 'miss';
  }
  return g.score[0] > 0 ? 'goal' : 'miss';
}

function bestTarget(sx, sy, kx, ky) {
  let best = null, bd = -1;
  for (let i = 0; i <= 20; i++) {
    const ty = 10.6 + i * (15.4 - 10.6) / 20;
    const d = segDist(sx + 0.62, sy, 43, ty, kx, ky);
    if (d > bd) { bd = d; best = ty; }
  }
  return { ty: best, d: bd };
}

function lineKeeper(bx, by, depth) {
  // keeper at given depth from goal on the ball->goal-center line
  const D = Math.hypot(43 - bx, 13 - by) || 1e-6;
  const ux = (43 - bx) / D, uy = (13 - by) / D;
  return { kx: 43 - ux * Math.min(depth, D * 0.9), ky: 13 - uy * Math.min(depth, D * 0.9) };
}

module.exports = { trial, bestTarget, segDist, lineKeeper, keeperTargets };

if (require.main === module) {
  const pols = ['line', 'track'];
  console.log('goal% of a corner shot from a static shooter, keeper already positioned on the ball-goal line');
  for (const sx of [33.0, 32, 31, 30, 28, 26, 24]) {
    const out = [];
    for (const depth of [0.5, 1, 2, 3, 4, 5, 6, 7]) {
      for (const pol of pols) {
        let goals = 0, n = 0;
        for (const sy of [8, 10, 13, 16, 18]) {
          const { kx, ky } = lineKeeper(sx + 0.62, sy, depth);
          const { ty } = bestTarget(sx, sy, kx, ky);
          if (trial({ sx, sy, kx, ky, ty, policy: pol }) === 'goal') goals++;
          n++;
        }
        out.push(`${depth}${pol[0]}:${goals}`);
      }
    }
    console.log(`sx=${sx}: ` + out.join(' '));
  }
}
