// Sandbox: can a close-range corner shot beat the keeper?  Run from workspace root.
// node work/r4/shot_sandbox.js
const path = require('path');
const sim = require(path.join(__dirname, '..', '..', 'simulation.js'));
const { createMatch, step } = sim;

function mk(n = 4) {
  return createMatch({ id: 'x', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], seed: 1, teamSize: n });
}

function setup(g, sx, sy, kx, ky, defs = []) {
  g.freeze = 0; g.freeKickFrames = 0;
  for (const u of g.units) {
    u.kickCd = 0; u.controlLock = 0; u.stealLock = 0; u.foulLock = 0;
    u.x = u.team === 0 ? 18 : 26; u.y = 2 + u.index * 2;
  }
  const shooter = g.units.find(u => u.team === 0 && u.index === 1);
  shooter.x = sx; shooter.y = sy;
  const keeper = g.units.find(u => u.team === 1 && u.index === 0);
  keeper.x = kx; keeper.y = ky;
  let di = 1;
  for (const [dx, dy] of defs) {
    const d = g.units.find(u => u.team === 1 && u.index === di);
    if (d) { d.x = dx; d.y = dy; di++; }
  }
  g.ball.x = sx; g.ball.y = sy; g.ball.vx = 0; g.ball.vy = 0;
  g.ball.owner = shooter.id; g.ball.lastTouch = shooter.id; g.ball.lastTeam = 0;
  return { shooter, keeper };
}

// one 20-frame window: shooter kicks on frame 0 (aim=angDeg), everyone else neutral
function shoot(g, angDeg) {
  let goal = null;
  for (let f = 0; f < 40; f++) {
    for (const u of g.units) {
      if (u.team === 0 && u.index === 1 && f === 0) u.held = { dir: 'N', aim: angDeg, kick: true };
      else u.held = { dir: 'N', aim: null, kick: false };
    }
    const before = g.score.slice();
    step(g);
    if (g.score[0] !== before[0] || g.score[1] !== before[1]) { goal = g.score.slice(); break; }
  }
  return goal;
}

const out = [];
for (const D of [9.5, 10.5, 11.5, 12.5, 14, 16, 20]) {
  for (const corner of [10.7, 15.3]) {
    const sx = 43 - D, sy = 13;
    const ang = Math.atan2(corner - sy, 43 - sx) * 180 / Math.PI;
    let scored = 0, n = 0;
    for (const keeperY of [12.0, 12.8, 13.6, 11.0, 14.6]) {
      const g = mk(4);
      setup(g, sx, sy, 40.7, keeperY);
      const goal = shoot(g, ang);
      n++; if (goal && goal[0] === 1) scored++;
    }
    out.push(`D=${D} corner=${corner} scored=${scored}/${n}`);
  }
}
console.log(out.join('\n'));
