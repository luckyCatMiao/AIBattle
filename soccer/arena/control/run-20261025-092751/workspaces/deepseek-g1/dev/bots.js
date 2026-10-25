'use strict';
/* 离线测试用对手机器人（只用于自测）。 */
const { plan, dirFor, clamp, angleTo, ballTraj } = require('./arena.js');

const W = 44, H = 26;
const MOUTH_LO = 10.5, MOUTH_HI = 15.5;

function goalXOf(team) { return team === 0 ? 43 : 1; }      // 该队进攻的门线
function ownGoalXOf(team) { return team === 0 ? 1 : 43; }
function sgnOf(team) { return team === 0 ? 1 : -1; }
function boxOf(team) { return team === 0 ? { x1: 34, y1: 6, x2: 43, y2: 20 } : { x1: 1, y1: 6, x2: 10, y2: 20 }; }
function ownBoxOf(team) { return boxOf(1 - team); }

/* 射门评估：从 (bx,by) 打到对方球门线 target y，返回 {clear, margin, tGoal} */
function evalShot(bx, by, ty, opps, goalX) {
  const dx = goalX - bx, dy = ty - by;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return { clear: false, margin: -99, tGoal: 0 };
  const ux = dx / dist, uy = dy / dist;
  let x = bx, y = by, v = 11.0;
  let t = 0, margin = Infinity;
  const steps = 160;
  for (let s = 0; s < steps; s++) {
    const dv = v * 0.05;
    x += ux * dv; y += uy * dv;
    v *= 0.978; t += 0.05;
    if (y < 0.25 || y > 25.75) return { clear: false, margin: -99, tGoal: t }; // 打墙
    for (const o of opps) {
      const d = Math.hypot(o.x - x, o.y - y);
      margin = Math.min(margin, d - 0.85 - 3.15 * t);
    }
    if (Math.abs(goalX - x) < 0.4) break;
  }
  return { clear: margin > 0, margin, tGoal: t };
}

/* 简单追球机器人 */
function botChase(view) {
  const me = view.yourTeam, ball = view.ball, goalX = goalXOf(me), sgn = sgnOf(me);
  return plan(view, (i, pos, f, hasBall) => {
    if (hasBall) {
      const d = Math.abs(goalX - pos.x);
      if (d < 12) return { target: { x: goalX, y: 13 }, aim: angleTo(pos, { x: goalX, y: 13 }), kick: true };
      return { target: { x: goalX, y: clamp(pos.y, 11, 15) } };
    }
    return { target: { x: ball.x, y: ball.y } };
  });
}

/* 有门将的追球机器人 */
function botKeeper(view) {
  const me = view.yourTeam, ball = view.ball, goalX = goalXOf(me), own = ownGoalXOf(me), sgn = sgnOf(me);
  const mine = view.units.filter(u => u.team === me);
  const ownerIdx = mine.findIndex(u => u.id === ball.owner);
  return plan(view, (i, pos, f, hasBall) => {
    if (i === 0) return { target: { x: own + sgn * 0.32, y: clamp(ball.y, 11, 15) } };
    if (hasBall) {
      const d = Math.abs(goalX - pos.x);
      if (d < 12) return { target: { x: goalX, y: 13 }, aim: angleTo(pos, { x: goalX, y: 13 }), kick: true };
      return { target: { x: goalX, y: clamp(pos.y, 11, 15) } };
    }
    return { target: { x: ball.x, y: ball.y } };
  });
}

/* 稍强的机器人：门将 + 最近者贴身封堵 + 持球者选角度射门 */
function botSmart(view) {
  const me = view.yourTeam, ball = view.ball, goalX = goalXOf(me), own = ownGoalXOf(me), sgn = sgnOf(me);
  const mine = view.units.filter(u => u.team === me).sort((a, b) => a.index - b.index);
  const opps = view.units.filter(u => u.team !== me);
  const ownerIdx = mine.findIndex(u => u.id === ball.owner);
  const oppOwner = opps.find(u => u.id === ball.owner);
  const keeper = opps.find(u => u.index === 0);
  const myBox = ownBoxOf(me);

  // 我方非门将按到球距离排序
  const fielders = mine.filter(u => u.index !== 0).map(u => ({ u, d: Math.hypot(u.x - ball.x, u.y - ball.y) })).sort((a, b) => a.d - b.d);
  const chaseIdx = fielders.length ? fielders[0].u.index : -1;
  const secondIdx = fielders.length > 1 ? fielders[1].u.index : -1;

  // 门将目标：预测球到本方门线的交点
  let kTargetY = clamp(13 + (ball.y - 13) * 0.5, 11.2, 14.8);
  if (Math.hypot(ball.vx, ball.vy) > 1.5) {
    const tr = ballTraj(ball.x, ball.y, ball.vx, ball.vy, 200);
    for (const p of tr) {
      if ((sgn > 0 && p.x <= own + 1.4) || (sgn < 0 && p.x >= own - 1.4)) {
        if (p.y > MOUTH_LO - 1.5 && p.y < MOUTH_HI + 1.5) kTargetY = clamp(p.y, 10.8, 15.2);
        break;
      }
    }
  }

  return plan(view, (i, pos, f, hasBall) => {
    if (i === 0) return { target: { x: own + sgn * 0.32, y: kTargetY } };

    if (hasBall) {
      // 选角度射门
      let best = null;
      for (let ty = 10.7; ty <= 15.3; ty += 0.4) {
        const e = evalShot(pos.x, pos.y, ty, opps, goalX);
        if (e.clear && (!best || e.margin > best.margin)) best = { ty, ...e };
      }
      if (best && Math.abs(goalX - pos.x) < 16) {
        return { target: { x: pos.x, y: pos.y }, aim: angleTo(pos, { x: goalX, y: best.ty }), kick: true };
      }
      // 有压迫就传/大脚，否则带球推进
      const near = opps.reduce((m, o) => Math.min(m, Math.hypot(o.x - pos.x, o.y - pos.y)), 99);
      const goalDist = Math.abs(goalX - pos.x);
      if (near < 2.6 && goalDist > 8) {
        // 大脚往前场开
        return { target: { x: pos.x, y: pos.y }, aim: angleTo(pos, { x: goalX, y: clamp(pos.y, 11, 15) }), kick: true };
      }
      return { target: { x: goalX, y: clamp(pos.y, 11, 15) } };
    }

    // 无球
    if (oppOwner) {
      // 最近者封堵射门线路
      if (i === chaseIdx) {
        const dx = own - ball.x, dy = 13 - ball.y;
        const l = Math.hypot(dx, dy) || 1;
        return { target: { x: ball.x + dx / l * 1.2, y: ball.y + dy / l * 1.2 } };
      }
      if (i === secondIdx) {
        const dx = own - ball.x, dy = 13 - ball.y;
        const l = Math.hypot(dx, dy) || 1;
        return { target: { x: ball.x + dx / l * 4.0, y: ball.y + dy / l * 4.0 } };
      }
      return { target: { x: (ball.x + own) / 2, y: 13 } };
    }
    // 松球：最近者抢
    if (i === chaseIdx) {
      const tr = ballTraj(ball.x, ball.y, ball.vx, ball.vy, 40);
      const t = Math.min(tr.length - 1, Math.max(0, Math.round(Math.hypot(ball.x - pos.x, ball.y - pos.y) / 3.15 / 0.05)));
      return { target: tr[t] || { x: ball.x, y: ball.y } };
    }
    return { target: { x: ball.x - sgn * 6, y: clamp(ball.y + (i - view.teamSize / 2) * 4, 2, 24) } };
  });
}

module.exports = { botChase, botKeeper, botSmart, evalShot, goalXOf, ownGoalXOf, sgnOf, boxOf, ownBoxOf };
