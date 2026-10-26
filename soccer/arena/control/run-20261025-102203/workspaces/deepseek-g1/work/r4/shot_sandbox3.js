const path = require('path');
const sim = require(path.join(__dirname, '..', '..', 'simulation.js'));
const { createMatch, step } = sim;
function mk(n = 4) { return createMatch({ id: 'x', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], seed: 1, teamSize: n }); }
function setup(g, sx, sy, kx, ky, defs = []) {
  g.freeze = 0; g.freeKickFrames = 0;
  for (const u of g.units) { u.kickCd = 0; u.controlLock = 0; u.stealLock = 0; u.foulLock = 0; u.x = u.team === 0 ? 18 : 26; u.y = 2 + u.index * 2; }
  const shooter = g.units.find(u => u.team === 0 && u.index === 1); shooter.x = sx; shooter.y = sy;
  const keeper = g.units.find(u => u.team === 1 && u.index === 0); keeper.x = kx; keeper.y = ky;
  let di = 1;
  for (const [dx, dy] of defs) { const d = g.units.find(u => u.team === 1 && u.index === di); if (d) { d.x = dx; d.y = dy; di++; } }
  g.ball.x = sx; g.ball.y = sy; g.ball.vx = 0; g.ball.vy = 0; g.ball.owner = shooter.id; g.ball.lastTouch = shooter.id; g.ball.lastTeam = 0;
  return { shooter, keeper };
}
// keeper tracks the ball y with a proper stop-at-target plan (as our agent would)
function run(g, angDeg, keeperMoves, maxSpeed = 3.15) {
  let goal = null;
  let plan = [];   // per-frame dir for the keeper
  for (let f = 0; f < 40; f++) {
    if (f % 20 === 0 || plan.length === 0) {
      const kp = g.units.find(u => u.team === 1 && u.index === 0);
      const target = Math.max(10.4, Math.min(15.6, g.ball.y));
      const dy = target - kp.y;
      const need = Math.round(Math.abs(dy) / (maxSpeed * 0.05));
      const d = Math.abs(dy) < 0.05 ? 'N' : (dy < 0 ? 'U' : 'D');
      plan = [];
      for (let i = 0; i < 20; i++) plan.push(i < need ? d : 'N');
    }
    for (const u of g.units) {
      if (u.team === 0 && u.index === 1 && f === 0) u.held = { dir: 'N', aim: angDeg, kick: true };
      else if (u.team === 1 && u.index === 0 && keeperMoves) u.held = { dir: plan[f % 20], aim: null, kick: false };
      else u.held = { dir: 'N', aim: null, kick: false };
    }
    const before = g.score.slice();
    step(g);
    if (g.score[0] !== before[0] || g.score[1] !== before[1]) { goal = g.score.slice(); break; }
  }
  return goal;
}
const out = [];
for (const D of [9.5, 11, 12.5, 14, 16]) {
  for (const kMove of [false, true]) {
    let scored = 0, n = 0;
    for (const keeperY of [11.4, 12.2, 12.8, 13.4, 14.2]) {
      const sx = 43 - D, sy = 13;
      const corner = Math.abs(keeperY - 10.6) > Math.abs(keeperY - 15.4) ? 10.6 : 15.4;
      const ang = Math.atan2(corner - sy, 43 - sx) * 180 / Math.PI;
      const g = mk(4); setup(g, sx, sy, 40.7, keeperY);
      const goal = run(g, ang, kMove);
      n++; if (goal && goal[0] === 1) scored++;
    }
    out.push(`D=${D} keeperTracks=${kMove} far-corner scored=${scored}/${n}`);
  }
}
console.log(out.join('\n'));
