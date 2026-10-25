'use strict';
/* Shot lab v3: shooter kicks at frame 0 of the window; the keeper is blind for
 * that whole window (its inputs are already committed) and only replans from the
 * next window on, running to the ball's predicted crossing point. Tooling only. */
const sim = require('../simulation.js');
const { rules, W, H } = require('../catalog.js');

const DT = 1 / rules.hz;
function predictBall(b, horizon) {
  const out = [];
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  for (let i = 0; i < horizon; i++) {
    for (let s = 0; s < 4; s++) {
      x += vx * DT / 4; y += vy * DT / 4;
      if (y >= 10.5 && y <= 15.5 && (x >= 43 || x <= 1)) { out.push([x, y]); return out; }
      // crude wall bounce
      if (x > W - 0.22) { x = W - 0.22; vx = -vx * rules.wallRestitution; }
      if (x < 0.22) { x = 0.22; vx = -vx * rules.wallRestitution; }
      if (y > H - 0.22) { y = H - 0.22; vy = -vy * rules.wallRestitution; }
      if (y < 0.22) { y = 0.22; vy = -vy * rules.wallRestitution; }
    }
    vx *= rules.ballFriction; vy *= rules.ballFriction;
    out.push([x, y]);
  }
  return out;
}
function dirTo(dx, dy) {
  const a = Math.atan2(dy, dx);
  const names = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'];
  let i = Math.round(a / (Math.PI / 4));
  return names[((i % 8) + 8) % 8];
}
function segDist(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1e-9;
  let t = ((px - ax) * vx + (py - ay) * vy) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

function setup(sx, sy, kx, ky) {
  const g = sim.createMatch({ id: 'lab', seed: 1, teamSize: 1, players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }] });
  for (const u of g.units) { u.x = 22; u.y = 1.2; }
  const a = g.units.find(u => u.team === 0);
  a.x = sx; a.y = sy;
  const k = g.units.find(u => u.team === 1);
  k.x = kx; k.y = ky;
  g.ball = { x: sx + 0.62, y: sy, vx: 0, vy: 0, owner: a.id, lastTouch: a.id, lastTeam: 0 };
  g.freeze = 0;
  return { g, a, k };
}

function trial({ sx, sy, kx, ky, ty, keeperAlsoShooter = false }) {
  const { g, a, k } = setup(sx, sy, kx, ky);
  const bx0 = g.ball.x, by0 = g.ball.y;
  const aimDeg = Math.atan2(ty - by0, 43 - bx0) * 180 / Math.PI;
  for (let w = 0; w < 4 && g.status === 'playing'; w++) {
    const w0 = [], w1 = [];
    // committed plan for this whole window, based on the state at window start
    let kdirs = [];
    if (w === 0) {
      // blind: hold current y (stay on the ball-goal line as at window start)
      kdirs = new Array(20).fill('N');
    } else {
      const path = predictBall(g.ball, 80);
      for (let f = 0; f < 20; f++) {
        const u = k;
        let best = null, bt = 1e9;
        for (let i = 0; i < path.length; i++) {
          const t = (i + 1) * DT;
          const reach = 3.15 * t + 0.82;
          const d = Math.hypot(path[i][0] - u.x, path[i][1] - u.y);
          if (d <= reach) { best = path[i]; bt = t; break; }
        }
        if (!best) best = path[path.length - 1] || [43, 13];
        kdirs.push(dirTo(best[0] - u.x, best[1] - u.y));
      }
    }
    for (let f = 0; f < 20; f++) {
      const ai = (w === 0 && f === 0) ? { dir: 'N', aim: aimDeg, kick: true } : { dir: 'N', aim: null, kick: false };
      w0.push([ai]);
      w1.push([{ dir: kdirs[f] || 'N', aim: null, kick: false }]);
    }
    sim.advanceWindow(g, [sim.submitWindow(g, 0, w0), sim.submitWindow(g, 1, w1)]);
    if (g.score[0] > 0) return 'goal';
    if (g.ball.owner === k.id) return 'save';
    if (g.ball.owner === a.id) return 'miss';
  }
  return g.score[0] > 0 ? 'goal' : 'miss';
}

function onLineKeeper(bx, by, depth) {
  const D = Math.hypot(43 - bx, 13 - by) || 1e-6;
  const ux = (43 - bx) / D, uy = (13 - by) / D;
  const d = Math.min(depth, D * 0.9);
  return { kx: 43 - ux * d, ky: 13 - uy * d };
}
function bestTarget(sx, sy, kx, ky) {
  let best = null, bd = -1;
  for (let i = 0; i <= 24; i++) {
    const ty = 10.55 + i * (15.45 - 10.55) / 24;
    const d = segDist(sx + 0.62, sy, 43, ty, kx, ky);
    if (d > bd) { bd = d; best = ty; }
  }
  return { ty: best, d: bd };
}

module.exports = { trial, bestTarget, segDist, onLineKeeper, predictBall, dirTo };

if (require.main === module) {
  console.log('conversion of one corner shot vs keeper depth (keeper on ball-goal line, blind 1 window, then ideal pursuit)');
  for (const depth of [0.6, 1, 2, 3, 4, 6, 8]) {
    const row = [];
    for (const sx of [33, 32, 31, 30, 29, 27, 25, 22]) {
      let goals = 0, n = 0;
      for (const sy of [9, 11, 13, 15, 17]) {
        const { kx, ky } = onLineKeeper(sx + 0.62, sy, depth);
        const { ty } = bestTarget(sx, sy, kx, ky);
        if (trial({ sx, sy, kx, ky, ty }) === 'goal') goals++;
        n++;
      }
      row.push(`x${sx}:${goals}/${n}`);
    }
    console.log(`depth=${depth}: ` + row.join('  '));
  }
}
