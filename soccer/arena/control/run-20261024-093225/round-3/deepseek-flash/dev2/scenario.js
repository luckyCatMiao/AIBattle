'use strict';
/* 微场景实验：验证「禁区外沿射门是否不可防」。用官方 simulation.js 当裁判。 */
const path = require('path');
const sim = require(path.resolve(__dirname, '..', 'simulation.js'));

function mk(n, seed) {
  const g = sim.createMatch({ id: 'x', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: seed || 1, teamSize: n });
  return g;
}

/* 手动摆位：attacker 持球，keeper 在门线，可选一名防守者 */
function setup(g, atk, keeperPos, defenderPos) {
  // 冻结取消，清空事件
  g.freeze = 0;
  for (const u of g.units) { u.x = -50; u.y = -50; u.kickCd = 0; u.controlLock = 0; u.stealLock = 0; u.foulLock = 0; }
  const a = g.units.find(u => u.id === atk.id);
  a.x = atk.x; a.y = atk.y; a.facing = { x: 1, y: 0 };
  g.ball = { x: atk.x + 0.62, y: atk.y, vx: 0, vy: 0, owner: a.id, lastTouch: a.id, lastTeam: a.team };
  if (keeperPos) { const k = g.units.find(u => u.id === keeperPos.id); k.x = keeperPos.x; k.y = keeperPos.y; }
  if (defenderPos) { const d = g.units.find(u => u.id === defenderPos.id); d.x = defenderPos.x; d.y = defenderPos.y; }
}

/* 让 attacker 在第 f0 帧起脚射向 (43, ty) */
function shotWindow(f0, ty) {
  const frames = [];
  for (let i = 0; i < 20; i++) {
    frames.push([{ dir: 'N', aim: i === f0 ? Math.atan2(ty - 13, 43 - 33.0) * 180 / Math.PI : null, kick: i === f0 }]);
  }
  return frames;
}
function keeperWindow(kx, ky) { // 门将站住不动
  const frames = [];
  for (let i = 0; i < 20; i++) frames.push([{ dir: 'N', aim: null, kick: false }]);
  return frames;
}

function run(atkPos, kPos, dPos, f0, ty) {
  const g = mk(3, 1);
  const a = g.units.find(u => u.id === 't0u1');
  const k = g.units.find(u => u.id === 't1u0');
  const d = g.units.find(u => u.id === 't1u1');
  setup(g, { id: 't0u1', x: atkPos[0], y: atkPos[1], team: 0 },
    { id: 't1u0', x: kPos[0], y: kPos[1] }, dPos ? { id: 't1u1', x: dPos[0], y: dPos[1] } : null);
  // 射门窗口
  const ax = atkPos[0] + 0.62, ay = atkPos[1];
  const ang = Math.atan2(ty - ay, 43 - ax) * 180 / Math.PI;
  const w0 = [];
  for (let i = 0; i < 20; i++) w0.push([{ dir: 'N', aim: null, kick: false }, { dir: 'N', aim: i === f0 ? ang : null, kick: i === f0 }, { dir: 'N', aim: null, kick: false }]);
  const w1 = [];
  for (let i = 0; i < 20; i++) w1.push([{ dir: 'N', aim: null, kick: false }, { dir: 'N', aim: null, kick: false }, { dir: 'N', aim: null, kick: false }]);
  let framesUsed = 0;
  const before = g.score[0];
  // 两个窗口
  for (let w = 0; w < 3; w++) {
    const A = sim.submitWindow(g, 0, w0);
    const B = sim.submitWindow(g, 1, w1);
    sim.advanceWindow(g, [A, B]);
    framesUsed += 20;
    if (g.score[0] !== before) break;
  }
  const b = g.ball;
  return { scored: g.score[0] > before, ball: [Math.round(b.x * 100) / 100, Math.round(b.y * 100) / 100], frames: framesUsed, events: g.events.filter(e => e.type === 'goal' || e.type === 'save').map(e => e.type + '@' + e.frame) };
}

console.log('== 场景1: 射手 (33.0,13) 起脚角度射向门线 ty；门将站 (42.68,13) 不动 ==');
for (const f0 of [0, 5, 10, 19]) {
  for (const ty of [10.7, 11.5, 13.0, 14.5, 15.3]) {
    const r = run([33.0, 13.0], [42.68, 13.0], null, f0, ty);
    console.log(`  f0=${String(f0).padStart(2)} ty=${ty}  -> ${r.scored ? 'GOAL' : 'no'}  ball=${r.ball} f=${r.frames} ${r.events.join(',')}`);
  }
}

console.log('\n== 场景2: 门将站在球-门连线中点 (37.8,13) ==');
for (const f0 of [0, 10]) {
  for (const ty of [10.7, 13.0, 15.3]) {
    const r = run([33.0, 13.0], [37.8, 13.0], null, f0, ty);
    console.log(`  f0=${String(f0).padStart(2)} ty=${ty}  -> ${r.scored ? 'GOAL' : 'no'}  ${r.events.join(',')}`);
  }
}

console.log('\n== 场景3: 一名防守者站在 (35.5, 13) 门前 1.5 格 ==');
for (const ty of [10.7, 13.0, 15.3]) {
  const r = run([33.0, 13.0], [42.68, 13.0], [35.5, 13.0], 0, ty);
  console.log(`  ty=${ty}  -> ${r.scored ? 'GOAL' : 'no'}  ${r.events.join(',')}`);
}

console.log('\n== 场景4: 防守者 (35.5,12.2) 微偏 ==');
for (const ty of [10.7, 13.0, 15.3]) {
  const r = run([33.0, 13.0], [42.68, 13.0], [35.5, 12.2], 0, ty);
  console.log(`  ty=${ty}  -> ${r.scored ? 'GOAL' : 'no'}  ${r.events.join(',')}`);
}

console.log('\n== 场景5: 从更远处射门 (28,13)，门将站 (42.68,13) 不动 ==');
for (const f0 of [0, 10]) {
  for (const ty of [10.7, 13.0, 15.3]) {
    const r = run([28.0, 13.0], [42.68, 13.0], null, f0, ty);
    console.log(`  f0=${f0} ty=${ty}  -> ${r.scored ? 'GOAL' : 'no'}  ball=${r.ball} ${r.events.join(',')}`);
  }
}
