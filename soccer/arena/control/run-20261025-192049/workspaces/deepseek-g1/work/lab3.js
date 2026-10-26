'use strict';
/* Test reactive keeper rules against Sol's actual on-target shots. */
const fs = require('fs');
const SIM = require('../simulation.js');
const raw = JSON.parse(fs.readFileSync('work/opp_ontarget.json', 'utf8'));

function normShot(r) {
  // return shot in normalized frame: defender team 1 (goal x=43), shooter team 0
  if (r.team === 0) return { x: r.x, y: r.y, vx: 11 * Math.cos(r.a), vy: 11 * Math.sin(r.a), oy: r.y };
  return { x: 44 - r.x, y: r.y, vx: -11 * Math.cos(r.a), vy: 11 * Math.sin(r.a), oy: r.y };
}
const shots = raw.map(normShot);

function blank() {
  const g = SIM.createMatch({ id: 'k', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], seed: 7, teamSize: 6 });
  g.units.length = 0; g.freeze = 0; g.events.length = 0; return g;
}
function addUnit(g, team, index, x, y) {
  g.units.push({ id: 't' + team + 'u' + index, team, index, name: 'x', x, y,
    facing: { x: team === 0 ? 1 : -1, y: 0 }, held: { dir: 'N', aim: null, kick: false },
    inputHistory: [], kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0, goals: 0, kicks: 0, touches: 0 });
}
function testRule(name, keeperFn, extraFn) {
  let goals = 0; const leaks = [];
  for (const s of shots) {
    const g = blank();
    // keeper = team1 index0
    const kp = keeperFn(s);
    addUnit(g, 1, 0, kp[0], kp[1]);
    if (extraFn) extraFn(g, s).forEach((p, i) => addUnit(g, 1, i + 1, p[0], p[1]));
    addUnit(g, 0, 1, 10, 25);
    g.ball = { x: s.x, y: s.y, vx: s.vx, vy: s.vy, owner: null, lastTouch: 't0u1', lastTeam: 0 };
    let out = null;
    for (let f = 0; f < 90; f++) {
      for (const u of g.units) u.held = { dir: 'N', aim: null, kick: false };
      SIM.step(g);
      if (g.score[0] > 0) { out = { goal: true, f }; break; }
      if (g.ball.owner) { out = { goal: false, caught: g.ball.owner, f }; break; }
      if (g.ball.vx === 0 && g.ball.vy === 0) { out = { goal: false, stopped: true, f, x: g.ball.x, y: g.ball.y }; break; }
    }
    if (out && out.goal) { goals++; leaks.push([+s.x.toFixed(1), +s.y.toFixed(1), out.f]); }
  }
  console.log(name.padEnd(26), 'goals', String(goals).padStart(2), '/', shots.length, JSON.stringify(leaks.slice(0, 10)));
}
const near = s => s.oy < 13 ? 10.9 : 15.1;
const far = s => s.oy < 13 ? 15.1 : 10.9;
const kAt = (depth, fn) => s => { const y = fn(s); return [43 - depth, y]; };

testRule('keeper_center_40.7', kAt(2.3, () => 13));
testRule('keeper_near_40.7', kAt(2.3, near));
testRule('keeper_far_40.7', kAt(2.3, far));
testRule('keeper_near_42.6', kAt(0.4, near));
testRule('keeper_far_42.6', kAt(0.4, far));
testRule('keeper_near_42.6 +oppPost', kAt(0.4, near), (g, s) => [[42.6, far(s)]]);
testRule('keeper_center42.6 +bothPosts', kAt(0.4, () => 13), (g, s) => [[42.6, 10.9], [42.6, 15.1]]);
testRule('posts only', s => [42.6, 10.9], (g, s) => [[42.6, 15.1]]);
