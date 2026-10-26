'use strict';
/* Replay Sol's actual on-target shots against candidate static walls.
   Normalize: defender = team 1 (right goal x=43), shooter = team 0.
   Input shots were extracted from practice replays; mirror when our team was team 0. */
const fs = require('fs');
const SIM = require('../simulation.js');

const raw = JSON.parse(fs.readFileSync('work/opp_ontarget.json', 'utf8'));

function blank() {
  const g = SIM.createMatch({ id: 'lab2', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], seed: 7, teamSize: 6 });
  g.units.length = 0; g.freeze = 0; g.events.length = 0;
  return g;
}
function addUnit(g, team, index, x, y) {
  g.units.push({ id: 't' + team + 'u' + index, team, index, name: 'x', x, y,
    facing: { x: team === 0 ? 1 : -1, y: 0 }, held: { dir: 'N', aim: null, kick: false },
    inputHistory: [], kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0,
    goals: 0, kicks: 0, touches: 0 });
}
function runShot(wall, shot) {
  const g = blank();
  for (let i = 0; i < wall.length; i++) addUnit(g, 1, i, wall[i][0], wall[i][1]);
  // ball post-kick, moving
  g.ball = { x: shot.x, y: shot.y, vx: shot.vx, vy: shot.vy, owner: null, lastTouch: 't0u1', lastTeam: 0 };
  // no shooter needed; but keep a shooter far away
  addUnit(g, 0, 1, 20, 25);
  for (let f = 0; f < 80; f++) {
    for (const u of g.units) u.held = { dir: 'N', aim: null, kick: false };
    const b0 = g.score.slice();
    SIM.step(g);
    if (g.score[0] !== b0[0]) return { goal: true, f };
    if (g.score[1] !== b0[1]) return { goal: true, own: true, f }; // shouldn't happen
    if (g.ball.owner) return { goal: false, caughtBy: g.ball.owner, f };
    if (g.ball.vx === 0 && g.ball.vy === 0) return { goal: false, stopped: true, f, x: g.ball.x, y: g.ball.y };
  }
  return { goal: false, timeout: true, x: g.ball.x, y: g.ball.y };
}

// normalize all shots to defender team 1
const shots = raw.map(r => {
  if (r.n === 0) { /* not used */ }
  // r has 'me'? our team index stored? We stored game/n only. Determine team from angle: shooters attack our goal.
  return r;
});

// We need the defending side. Re-extract with 'defTeam' info: team 0 attacks x=43, team1 attacks x=1.
// If the shooter was team 0 (our team was 1) -> goal right x=43, no mirror.
// If shooter was team 1 (our team was 0) -> mirror x.
const fs2 = fs;
function norm(r) {
  if (r.team === 0) return { x: r.x, y: r.y, vx: 11 * Math.cos(r.a), vy: 11 * Math.sin(r.a), src: r };
  return { x: 44 - r.x, y: r.y, vx: -11 * Math.cos(r.a), vy: 11 * Math.sin(r.a), src: r };
}
const normShots = raw.map(norm);
// filter only those attacking right goal (team 0 shooters)
const shotsR = raw.filter(r => r.team === 0).map(r => ({ x: r.x, y: r.y, vx: 11 * Math.cos(r.a), vy: 11 * Math.sin(r.a) }));
const shotsL = raw.filter(r => r.team === 1).map(r => ({ x: 44 - r.x, y: r.y, vx: -11 * Math.cos(r.a), vy: 11 * Math.sin(r.a) }));
const all = shotsR.concat(shotsL);
console.log('shots', all.length, 'R', shotsR.length, 'L', shotsL.length);

const configs = {
  keeper_only: [[40.7, 13.0]],
  keeper_line: [[42.6, 13.0]],
  n2_42: [[42.6, 10.9], [42.6, 15.1]],
  n2_42b: [[42.2, 11.0], [42.2, 15.0]],
  n3_422: [[42.2, 10.9], [42.2, 12.9], [42.2, 14.9]],
  n3_426: [[42.6, 10.9], [42.6, 12.9], [42.6, 14.9]],
  n3_428: [[42.8, 10.9], [42.8, 12.9], [42.8, 14.9]],
  n3_426b: [[42.6, 10.8], [42.6, 12.5], [42.6, 15.2]],
  n4_426: [[42.6, 10.6], [42.6, 12.2], [42.6, 13.8], [42.6, 15.4]],
  n3_far: [[40.0, 10.9], [40.0, 12.9], [40.0, 14.9]],
  n3_mix: [[41.8, 10.9], [42.8, 13.0], [41.8, 15.1]],
};
for (const [name, wall] of Object.entries(configs)) {
  let goals = 0; const details = [];
  for (const s of all) {
    const r = runShot(wall, s);
    if (r.goal) { goals++; details.push([+s.x.toFixed(1), +s.y.toFixed(1), r.f]); }
  }
  console.log(name.padEnd(12), 'goals', String(goals).padStart(2), '/', all.length, JSON.stringify(details.slice(0, 8)));
}
