'use strict';
/* 复刻第 1 轮 sol 的打法（只用于自测）。
 * 从 r1-g1 / r1-g2 的逐帧回放反推：
 *   - 只要到对方门线的直线路径没被挡，就朝「低近门柱」(y≈10.5) 起脚，离门多远都打；
 *   - 路径被挡就把球捅向 (门线 ∓ 13, 1.5) 的上角，靠墙反弹到边路再补射；
 *   - 无球时按预测轨迹追球。
 * 实测 sol 在 g2 的 6 球里 5 球起脚点是 (32.5,6.6)、落点 y≈10.4；
 * g1 的 2 球起脚点在 (11.6,6.8)/(11.9,8.6)、落点 y≈15（远角）。
 */
const { plan, angleTo, clamp, ballTraj } = require('./arena.js');
const { evalShot } = require('./bots.js');

function goalXOf(t) { return t === 0 ? 43 : 1; }
function ownGoalXOf(t) { return t === 0 ? 1 : 43; }
function sgnOf(t) { return t === 0 ? 1 : -1; }

function solWing(view) {
  const me = view.yourTeam, ball = view.ball;
  const goalX = goalXOf(me), own = ownGoalXOf(me), sgn = sgnOf(me);
  const opps = view.units.filter(u => u.team !== me);

  return plan(view, (i, pos, f, hasBall) => {
    if (hasBall) {
      // 近门柱低角优先；被挡就试远角
      const cands = [10.6, 15.4, 13.0];
      let best = null;
      for (const ty of cands) {
        const e = evalShot(pos.x, pos.y, ty, opps, goalX);
        if (e.clear && (!best || e.margin > best.margin)) best = { ty, margin: e.margin };
      }
      if (best) {
        return { target: { x: pos.x, y: pos.y }, aim: angleTo(pos, { x: goalX, y: best.ty }), kick: true };
      }
      // 被挡：捅向上角，靠反弹去边路拿球
      const gd = Math.abs(goalX - pos.x);
      if (gd > 11) {
        return { target: { x: pos.x, y: pos.y }, aim: angleTo(pos, { x: goalX - sgn * 13, y: 1.5 }), kick: true };
      }
      // 离门已近：硬打近门柱
      return { target: { x: pos.x, y: pos.y }, aim: angleTo(pos, { x: goalX, y: 10.6 }), kick: true };
    }
    // 无球：追预测轨迹（提前量）
    const tr = ballTraj(ball.x, ball.y, ball.vx, ball.vy, 60);
    let t = 0;
    for (let k = 0; k < tr.length; k++) {
      if (Math.hypot(tr[k].x - pos.x, tr[k].y - pos.y) <= 3.15 * k * 0.05 + 0.6) { t = k; break; }
      t = k;
    }
    return { target: tr[t] || { x: ball.x, y: ball.y } };
  });
}

module.exports = { solWing, goalXOf, ownGoalXOf, sgnOf };
