'use strict';
/* 测试「沿 y<6 或 y>20 的走廊直插门线」是否是可利用的进攻通道。 */
const path = require('path');
const sim = require(path.resolve(__dirname, '..', 'simulation.js'));

function run(atkPos, kPos, dPos, aimPt, f0, nMove) {
  const g = sim.createMatch({ id: 'x', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: 1, teamSize: 3 });
  g.freeze = 0;
  for (const u of g.units) { u.x = -50; u.y = -50; u.kickCd = 0; u.controlLock = 0; u.stealLock = 0; u.foulLock = 0; }
  const a = g.units.find(u => u.id === 't0u1');
  a.x = atkPos[0]; a.y = atkPos[1]; a.facing = { x: 1, y: 0 };
  g.ball = { x: atkPos[0] + 0.62, y: atkPos[1], vx: 0, vy: 0, owner: a.id, lastTouch: a.id, lastTeam: 0 };
  const k = g.units.find(u => u.id === 't1u0'); k.x = kPos[0]; k.y = kPos[1];
  if (dPos) { const d = g.units.find(u => u.id === 't1u1'); d.x = dPos[0]; d.y = dPos[1]; }
  const ax = atkPos[0] + 0.62, ay = atkPos[1];
  const ang = Math.atan2(aimPt[1] - ay, aimPt[0] - ax) * 180 / Math.PI;
  const w0 = [], w1 = [];
  for (let i = 0; i < 20; i++) {
    w0.push([{ dir: 'N', aim: null, kick: false }, { dir: 'N', aim: i === (f0 || 0) ? ang : null, kick: i === (f0 || 0) }, { dir: 'N', aim: null, kick: false }]);
    w1.push([{ dir: 'N', aim: null, kick: false }, { dir: 'N', aim: null, kick: false }, { dir: 'N', aim: null, kick: false }]);
  }
  const before = g.score[0];
  for (let w = 0; w < 3; w++) {
    sim.advanceWindow(g, [sim.submitWindow(g, 0, w0), sim.submitWindow(g, 1, w1)]);
    if (g.score[0] !== before) break;
  }
  return { scored: g.score[0] > before, ev: g.events.filter(e => e.type === 'goal' || e.type === 'save').map(e => e.type + '@' + e.frame) };
}

console.log('== 走廊射门：射手在 y<6 的门线附近，门将站门线中央 (42.68,13) ==');
for (const ax of [42.6, 42.0, 41.0, 40.0, 38.0, 36.0]) {
  for (const ty of [10.6, 11.5, 13.0]) {
    const r = run([ax, 5.0], [42.68, 13.0], null, [43, ty], 0);
    console.log(`  atk(${ax},5.0) -> (43,${ty}) : ${r.scored ? 'GOAL' : 'no'} ${r.ev.join(',')}`);
  }
}
console.log('\n== 同上但门将站近门柱 (42.68,10.8) ==');
for (const ax of [42.6, 41.0, 38.0]) {
  for (const ty of [10.6, 12.0, 13.5, 15.3]) {
    const r = run([ax, 5.0], [42.68, 10.8], null, [43, ty], 0);
    console.log(`  atk(${ax},5.0) -> (43,${ty}) : ${r.scored ? 'GOAL' : 'no'} ${r.ev.join(',')}`);
  }
}
console.log('\n== 下侧走廊 y=21 ==');
for (const ax of [42.6, 41.0, 38.0, 35.0]) {
  for (const ty of [15.3, 13.0, 10.6]) {
    const r = run([ax, 21.0], [42.68, 13.0], null, [43, ty], 0);
    console.log(`  atk(${ax},21.0) -> (43,${ty}) : ${r.scored ? 'GOAL' : 'no'} ${r.ev.join(',')}`);
  }
}
