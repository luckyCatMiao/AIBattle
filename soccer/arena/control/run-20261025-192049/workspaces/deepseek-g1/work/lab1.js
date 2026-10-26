'use strict';
/* Mechanics lab: walls vs shots using real simulation.js. */
const SIM = require('../simulation.js');
const CAT = require('../catalog.js');

function blank(n, seed = 1) {
  const g = SIM.createMatch({ id: 'lab', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], seed, teamSize: n });
  g.units.length = 0;
  g.freeze = 0;
  g.events.length = 0;
  return g;
}
function unit(g, team, index, x, y, keeper = false) {
  g.units.push({
    id: 't' + team + 'u' + index, team, index, name: 'x', x, y,
    facing: { x: team === 0 ? 1 : -1, y: 0 },
    held: { dir: 'N', aim: null, kick: false }, inputHistory: [],
    kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0,
    goals: 0, kicks: 0, touches: 0,
  });
}
function setBall(g, x, y, owner, vx = 0, vy = 0) {
  g.ball = { x, y, vx, vy, owner, lastTouch: null, lastTeam: null };
}
const A = (x, y, tx, ty) => Math.atan2(ty - y, tx - x) * 180 / Math.PI;

/* shooter team 1 at (shotX, shotY), target (1, targetY); wall units team 0.
   wallSpec = [[x,y],...]. run 60 frames, kick at frame 1. */
function shotScenario(wallSpec, shotY, targetY, shotX = 10.1) {
  const g = blank(6);
  unit(g, 1, 1, shotX, shotY);
  wallSpec.forEach(([x, y], i) => unit(g, 0, i, x, y, i === 0));
  setBall(g, shotX, shotY, 't1u1');
  const aim = A(shotX, shotY, 1, targetY);
  let goalTeam = null, caught = null, ballAt = null;
  for (let f = 0; f < 60; f++) {
    for (const u of g.units) {
      u.held = { dir: 'N', aim: u.team === 1 ? aim : null, kick: (u.team === 1 && f === 1) };
    }
    const before = g.score.slice();
    SIM.step(g);
    if (g.score[0] !== before[0] || g.score[1] !== before[1]) {
      goalTeam = g.score[0] > before[0] ? 0 : 1;
      ballAt = { x: g.ball.x, y: g.ball.y };
      break;
    }
    if (g.ball.owner && g.ball.owner.startsWith('t0') && !caught) {
      caught = { f, owner: g.ball.owner, x: g.ball.x, y: g.ball.y };
      break;
    }
  }
  return { wallSpec, shotY, targetY, goalTeam, caught, ballAt };
}

const configs = {
  flat3: [[2.5, 10.9], [2.5, 12.9], [2.5, 14.9]],
  flat3b: [[2.5, 10.7], [2.5, 12.5], [2.5, 14.3]],
  flat3c: [[2.5, 10.6], [2.5, 12.1], [2.5, 13.6], [2.5, 15.1]], // 4 (n>=4)
  stagger3: [[1.6, 11.1], [2.9, 12.9], [1.6, 14.7]],
  stagger3b: [[1.6, 10.9], [2.9, 13.0], [1.6, 15.1]],
  stagger4: [[1.4, 10.7], [1.4, 12.0], [1.4, 14.0], [1.4, 15.3]],
  two: [[2.4, 10.9], [2.4, 15.1]],
};
const shotYs = [13, 10.5, 8, 5, 18, 21, 23];
const targets = [10.55, 11.2, 12.0, 12.8, 13.5, 14.2, 15.0, 15.45];
for (const [name, spec] of Object.entries(configs)) {
  let blocked = 0, goals = 0, total = 0;
  const leaks = [];
  for (const sy of shotYs) for (const ty of targets) {
    const r = shotScenario(spec, sy, ty);
    total++;
    if (r.goalTeam === 1) { goals++; leaks.push([sy, ty, 'GOAL']); }
    else blocked++;
  }
  console.log(name, 'blocked', blocked, '/', total, 'goals', goals, 'leaks', JSON.stringify(leaks.slice(0, 12)));
}
