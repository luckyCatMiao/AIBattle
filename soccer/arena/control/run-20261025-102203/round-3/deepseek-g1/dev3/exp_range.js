'use strict';
/* 射门射程实验：门将每 20 帧（一个决策窗口）才重新决策一次，目标 = 当时球所在 y。
 * 这比真实门将略强（它每窗口都盯着球），用来确定「多远起脚仍然能进球」。 */
const sim = require('../simulation.js');
const { DIRV } = require('../dev/arena.js');

function angleDeg(ax, ay, bx, by) { return Math.atan2(by - ay, bx - ax) * 180 / Math.PI; }
function dirOf(dx, dy) {
  if (!dx && !dy) return 'N';
  const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  let best = 'N', bd = -2;
  for (const k in DIRV) { const v = DIRV[k]; const d = v[0] * dx + v[1] * dy; if (d > bd) { bd = d; best = k; } }
  return best;
}

function trial({ shooterX, shooterY, aimY, keeperY = 13, updateEvery = 20, keeperX = 42.68, maxFrames = 90 }) {
  const g = sim.createMatch({ id: 'e', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: 2, teamSize: 2 });
  g.units.length = 0;
  const mk = (team, index, x, y, fx) => {
    const u = { id: 't' + team + 'u' + index, team, index, name: 'x', x, y, facing: { x: fx, y: 0 }, held: {}, inputHistory: [], kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0, goals: 0, kicks: 0, touches: 0 };
    g.units.push(u); return u;
  };
  mk(0, 0, 1.3, 13, 1);
  const s1 = mk(0, 1, shooterX, shooterY, 1);
  const k1 = mk(1, 0, keeperX, keeperY, -1);
  g.ball = { x: shooterX + 0.59, y: shooterY, vx: 0, vy: 0, owner: s1.id, lastTouch: s1.id, lastTeam: 0 };
  g.teamSize = 2;
  const deg = angleDeg(shooterX, shooterY, 43, aimY);
  let kdir = 'N';
  for (let f = 0; f < maxFrames; f++) {
    if (f % updateEvery === 0) {
      const ty = Math.max(10.85, Math.min(15.15, g.ball.y));
      kdir = dirOf(0, ty - k1.y);
    }
    s1.held = { dir: 'N', aim: deg, kick: f === 0 };
    k1.held = { dir: kdir, aim: null, kick: false };
    for (const u of g.units) { u.inputHistory.push(u.held); if (u.inputHistory.length > 8) u.inputHistory.shift(); }
    sim.step(g);
    if (g.score[0] > 0) return { goal: true, f };
    if (g.ball.owner === 't1u0') return { goal: false, saved: f };
  }
  return { goal: false, f: maxFrames };
}

if (require.main === module) {
  console.log('射手在 (x,13)；门将每 20 帧按球 y 重新定位；扫 x × aimY');
  console.log('  x    ' + [10.7, 11.5, 12.3, 13.1, 13.9, 14.7, 15.3].map(v => v.toFixed(1).padStart(6)).join(''));
  for (const x of [33.5, 33, 32, 31, 30, 29, 28, 27, 26, 25, 24, 22, 20]) {
    const row = [];
    for (const aimY of [10.7, 11.5, 12.3, 13.1, 13.9, 14.7, 15.3]) {
      const r = trial({ shooterX: x, shooterY: 13, aimY });
      row.push((r.goal ? 'G' : '.').padStart(6));
    }
    console.log(String(x).padStart(5) + '   ' + row.join(''));
  }
  console.log('\n射手在侧翼 (x, y)，门将居中');
  for (const y of [7, 9, 11, 13, 15, 17, 19]) {
    const row = [];
    for (const x of [33.5, 30, 28, 26, 24]) {
      let any = false;
      for (const aimY of [10.7, 11.5, 12.3, 13.1, 13.9, 14.7, 15.3]) {
        const r = trial({ shooterX: x, shooterY: y, aimY });
        if (r.goal) { any = true; break; }
      }
      row.push((any ? 'G' : '.').padStart(6));
    }
    console.log('y=' + String(y).padStart(2) + '   ' + row.join('') + '   (x=33.5,30,28,26,24)');
  }
}
module.exports = { trial };
