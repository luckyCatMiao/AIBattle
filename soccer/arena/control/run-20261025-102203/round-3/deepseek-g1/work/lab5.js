'use strict';
/* Test shots vs a windowed, ball-tracking keeper (Sol-like).
   Defender team 1 (goal x=43). Shooter team 0.
   Keeper decisions every 20 frames; moves at 3.15 toward either the projected
   crossing point (if ball heading to goal within ~2.5s) or a near-post stance. */
const SIM = require('../simulation.js');

function blank() {
  const g = SIM.createMatch({ id: 'l4', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], seed: 3, teamSize: 6 });
  g.units.length = 0; g.freeze = 0; g.events.length = 0;
  return g;
}
function addUnit(g, team, index, x, y) {
  g.units.push({ id: 't' + team + 'u' + index, team, index, name: 'x', x, y,
    facing: { x: team === 0 ? 1 : -1, y: 0 }, held: { dir: 'N', aim: null, kick: false },
    inputHistory: [], kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0, goals: 0, kicks: 0, touches: 0 });
}
// ball future path (straight + friction + wall bounces), return first crossing of x=43 in mouth or null
function future(g, maxf = 120) {
  const b = g.ball;
  let x = b.x, y = b.y, vx = b.vx, vy = b.vy;
  const DT = 0.05, R = 0.22;
  const path = [];
  for (let f = 0; f < maxf; f++) {
    for (let s = 0; s < 4; s++) {
      x += vx * DT / 4; y += vy * DT / 4;
      if (y >= 10.5 && y <= 15.5 && x >= 42.0) return { f, x, y };
      // walls: use simple bounds at 0.22
      if (x < R) { x = R; vx = -vx * 0.72; }
      if (x > 44 - R) { x = 44 - R; vx = -vx * 0.72; }
      if (y < R) { y = R; vy = -vy * 0.72; }
      if (y > 26 - R) { y = 26 - R; vy = -vy * 0.72; }
    }
    vx *= 0.978; vy *= 0.978;
    if (Math.hypot(vx, vy) < 0.02) break;
    path.push([x, y]);
  }
  return null;
}
function nearestPost(by) { return by < 13 ? 10.9 : 15.1; }
function runScenario(origin, targetY, keeperMode, shotFrame = 1) {
  const g = blank();
  const [ox, oy] = origin;
  addUnit(g, 0, 1, ox, oy);
  addUnit(g, 1, 0, 40.7, nearestPost(oy));
  // ball at shooter (owner), then kick
  g.ball = { x: ox, y: oy, vx: 0, vy: 0, owner: 't0u1', lastTouch: null, lastTeam: null };
  let goal = false, caught = false;
  let aim = Math.atan2(targetY - oy, 43 - ox) * 180 / Math.PI;
  for (let f = 0; f < 80; f++) {
    const k = g.units.find(u => u.team === 1);
    if (f % 20 === 0 && !goal) {
      let tx = 43 - 2.3, ty = nearestPost(g.ball.y);
      if (keeperMode === 'track') {
        const fu = future(g);
        if (fu) { tx = 40.7; ty = Math.max(10.5, Math.min(15.5, fu.y)); }
        else if (g.ball.owner === null && (g.ball.vx !== 0 || g.ball.vy !== 0)) {
          // ball moving but not to goal: return to near post
          ty = nearestPost(g.ball.y);
        }
      }
      // direction toward target
      const dx = tx - k.x, dy = ty - k.y, d = Math.hypot(dx, dy) || 1;
      g.kdir = d > 0.25 ? [dx / d, dy / d] : [0, 0];
    }
    for (const u of g.units) {
      if (u.team === 0) u.held = { dir: 'N', aim: (f === shotFrame ? aim : null), kick: (f === shotFrame) };
      else {
        const dd = g.kdir || [0, 0];
        u.held = { dir: 'N', aim: null, kick: false };
        // manually move keeper (bypass 8-dir): use small steps toward target
        u.x += dd[0] * 3.15 * 0.05 * 0.999;
        u.y += dd[1] * 3.15 * 0.05 * 0.999;
        u.x = Math.max(0.34, Math.min(43.66, u.x));
        u.y = Math.max(0.34, Math.min(25.66, u.y));
      }
    }
    SIM.step(g);
    if (g.score[0] > 0) { goal = true; break; }
    if (g.ball.owner && String(g.ball.owner).startsWith('t1')) { caught = true; break; }
    if (!g.ball.owner && g.ball.vx === 0 && g.ball.vy === 0) break;
  }
  return { goal, caught };
}
const origins = [[33.0, 13], [33.0, 10.6], [33.0, 15.4], [36.5, 4.8], [36.5, 21.2],
  [39.5, 4.5], [39.5, 21.5], [41.0, 4.6], [41.0, 21.4], [37.0, 3.0], [37.0, 23.0]];
const targets = [10.55, 11.0, 12.0, 13.0, 14.0, 15.0, 15.45];
for (const mode of ['static', 'track']) {
  let goals = 0, shots = 0, caught = 0;
  const per = [];
  for (const o of origins) {
    let gg = 0;
    for (const t of targets) { const r = runScenario(o, t, mode); shots++; if (r.goal) { goals++; gg++; } if (r.caught) caught++; }
    per.push([o.join(','), gg]);
  }
  console.log(mode, 'goals', goals, '/', shots, 'caught', caught, JSON.stringify(per));
}
