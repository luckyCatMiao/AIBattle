'use strict';
/* 受控射门实验：把状态摆好，验证「窗口第 0 帧起脚，门将已锁定本窗口移动」时
 * 射击不同落点/不同门将起始位置的进球率。用官方 simulation.js 逐帧推进。 */
const sim = require('../simulation.js');
const { DIRV } = require('../dev/arena.js');

function setup({ shooterX = 32, shooterY = 13, keeperY = 13, keeperX = 42.68, others = 0 }) {
  const g = sim.createMatch({ id: 'e', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: 2, teamSize: 2 });
  g.units.length = 0;
  const mk = (team, index, x, y, fx) => {
    const u = { id: 't' + team + 'u' + index, team, index, name: 'x', x, y, facing: { x: fx, y: 0 }, held: {}, inputHistory: [], kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0, goals: 0, kicks: 0, touches: 0 };
    g.units.push(u); return u;
  };
  const s0 = mk(0, 0, 1.3, 13, 1);   // 我方（team0）守左门
  const s1 = mk(0, 1, shooterX, shooterY, 1); // 射手
  const k1 = mk(1, 0, keeperX, keeperY, -1);  // 对方门将
  const k2 = mk(1, 1, 41, 5, -1);   // 对方站位很远的球员（不参与）
  g.ball = { x: shooterX + 0.59, y: shooterY, vx: 0, vy: 0, owner: s1.id, lastTouch: s1.id, lastTeam: 0 };
  g.teamSize = 2;
  return { g, s0, s1, k1, k2 };
}

function ang(a, b) { return Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI; }

/* 门将策略：startY -> 每帧朝 keepTarget 移动 */
function runShot({ shooterX = 32, shooterY = 13, aimY = 15.4, keeperY = 13, keeperX = 42.68, keeperMode = 'center', frames = 45 }) {
  const { g, s1, k1 } = setup({ shooterX, shooterY, keeperY, keeperX });
  const deg = ang({ x: shooterX, y: shooterY }, { x: 43, y: aimY });
  const goalY = 10.5 + ((aimY - 10.5)); // 目标
  let scored = false, savedAt = -1; const ev0 = g.events.length;
  const dirOf = (dx, dy) => {
    if (!dx && !dy) return 'N';
    const l = Math.hypot(dx, dy); dx /= l; dy /= l;
    let best = 'N', bd = -2;
    for (const k in DIRV) { const v = DIRV[k]; const d = v[0] * dx + v[1] * dy; if (d > bd) { bd = d; best = k; } }
    return best;
  };
  for (let f = 0; f < frames; f++) {
    // 射手第 0 帧起脚
    s1.held = { dir: 'N', aim: deg, kick: f === 0 };
    // 门将：本窗口目标固定（模拟「已锁定」）
    let ty = keeperY;
    if (keeperMode === 'center') ty = 13;
    else if (keeperMode === 'track035') ty = Math.max(11, Math.min(15, 13 + (shooterY - 13) * 0.35));
    else if (keeperMode === 'ball') ty = Math.max(10.85, Math.min(15.15, g.ball.y));
    const d = dirOf(0, ty - k1.y);
    k1.held = { dir: d, aim: null, kick: false };
    // 其它单位不动
    for (const u of g.units) if (u !== s1 && u !== k1) u.held = { dir: 'N', aim: null, kick: false };
    for (const u of g.units) { u.inputHistory.push(u.held); if (u.inputHistory.length > 8) u.inputHistory.shift(); }
    const before = [...g.score];
    sim.step(g);
    if (g.score[0] > before[0]) { scored = true; break; }
    const ev = g.events.slice(ev0);
    if (ev.some(e => e.type === 'save')) { savedAt = f; break; }
    if (ev.some(e => e.type === 'goal')) { scored = true; break; }
  }
  return { scored, savedAt, score: g.score, ballOwner: g.ball.owner, ball: [g.ball.x, g.ball.y] };
}

if (require.main === module) {
  console.log('== 射手在 (32,13)，门将在 (42.68,13)，窗口第0帧起脚 ==');
  for (const aimY of [10.6, 11.2, 11.8, 12.4, 13, 13.6, 14.2, 14.8, 15.4]) {
    const r = runShot({ aimY });
    console.log(` aimY=${aimY}  ${r.scored ? 'GOAL' : (r.savedAt >= 0 ? 'SAVED@' + r.savedAt : 'nogoal')} owner=${r.ballOwner} ball=${r.ball.map(v => v.toFixed(2))}`);
  }
  console.log('== 门将起始偏下 (42.68, 15.0) ==');
  for (const aimY of [10.6, 11.2, 13, 15.4]) {
    const r = runShot({ aimY, keeperY: 15.0, keeperMode: 'none' });
    console.log(` aimY=${aimY}  ${r.scored ? 'GOAL' : (r.savedAt >= 0 ? 'SAVED@' + r.savedAt : 'nogoal')} owner=${r.ballOwner} ball=${r.ball.map(v => v.toFixed(2))}`);
  }
  console.log('== 距离扫描（门将居中，aimY=15.4）==');
  for (const sx of [33.5, 32, 30, 28, 26, 24]) {
    const r = runShot({ shooterX: sx, aimY: 15.4 });
    console.log(` x=${sx}  ${r.scored ? 'GOAL' : (r.savedAt >= 0 ? 'SAVED@' + r.savedAt : 'nogoal')} owner=${r.ballOwner} ball=${r.ball.map(v => v.toFixed(2))}`);
  }
}
module.exports = { runShot, setup };
