'use strict';
/* 验证「禁区护球」机制：领先方把球控在本方禁区内，对手是否真的抢不到、会不会犯规。 */
const sim = require('../simulation.js');
const { DIRV } = require('../dev/arena.js');

function dirOf(dx, dy) {
  if (!dx && !dy) return 'N';
  const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  let best = 'N', bd = -2;
  for (const k in DIRV) { const v = DIRV[k]; const d = v[0] * dx + v[1] * dy; if (d > bd) { bd = d; best = k; } }
  return best;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function run({ holderX = 9.3, holderY = 13, nOpp = 3, frames = 1200, holdDir = 'N', oppStopX = 10.02 }) {
  const g = sim.createMatch({ id: 'e', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: 2, teamSize: 3 });
  g.units.length = 0;
  const mk = (team, index, x, y, fx) => {
    const u = { id: 't' + team + 'u' + index, team, index, name: 'x', x, y, facing: { x: fx, y: 0 }, held: {}, inputHistory: [], kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0, goals: 0, kicks: 0, touches: 0 };
    g.units.push(u); return u;
  };
  const holder = mk(0, 1, holderX, holderY, -1);
  const gk = mk(0, 0, 1.35, 13, 1);
  mk(0, 2, 20, 20, 1);
  const opps = [];
  for (let i = 0; i < nOpp; i++) opps.push(mk(1, i, 14 + i * 2, 7 + i * 6, -1));
  g.teamSize = 3;
  g.ball = { x: holderX + Math.cos(Math.PI) * 0.62, y: holderY, vx: 0, vy: 0, owner: holder.id, lastTouch: holder.id, lastTeam: 0 };
  g.score = [1, 0];
  const ev0 = g.events.length;
  for (let f = 0; f < frames && g.status === 'playing'; f++) {
    holder.held = { dir: holdDir, aim: 180, kick: false };
    gk.held = { dir: 'N', aim: null, kick: false };
    for (const u of g.units) {
      if (u.team === 1) {
        // 对手：冲向球，但不越过禁区边界（x>10.02）
        const tx = Math.max(oppStopX, g.ball.x), ty = g.ball.y;
        const d = dirOf(tx - u.x, ty - u.y);
        u.held = { dir: d, aim: null, kick: false };
      } else if (u !== holder && u !== gk) {
        u.held = { dir: 'N', aim: null, kick: false };
      }
      u.inputHistory.push(u.held); if (u.inputHistory.length > 8) u.inputHistory.shift();
    }
    sim.step(g);
  }
  const ev = g.events.slice(ev0);
  return {
    score: g.score, frame: g.frame, status: g.status,
    owner: g.ball.owner, ball: [g.ball.x.toFixed(2), g.ball.y.toFixed(2)],
    fouls: ev.filter(e => e.type === 'foul').length,
    goals: ev.filter(e => e.type === 'goal').map(e => ({ t: e.team, own: e.ownGoal })),
    tackles: ev.filter(e => e.type === 'tackle').length,
  };
}

if (require.main === module) {
  for (const hx of [9.3, 9.0, 8.5, 6, 3]) {
    for (const hy of [13, 8, 17.5]) {
      const r = run({ holderX: hx, holderY: hy });
      console.log(`护球点 (${hx},${hy})  ${JSON.stringify(r)}`);
    }
  }
}
module.exports = { run };
