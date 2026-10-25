'use strict';
/* 更强的离线对手机器人（只用于自测）。 */
const { plan, dirFor, clamp, angleTo, ballTraj } = require('./arena.js');

const W = 44, H = 26, R_B = 0.22;
const MOUTH_LO = 10.5, MOUTH_HI = 15.5;
const goalLine = t => (t === 0 ? 43 : 1);
const ownLine = t => (t === 0 ? 1 : 43);
const sgnOf = t => (t === 0 ? 1 : -1);
const oppBoxOf = t => (t === 0 ? { x1: 34, y1: 6, x2: 43, y2: 20 } : { x1: 1, y1: 6, x2: 10, y2: 20 });
const ownBoxOf = t => (t === 0 ? { x1: 1, y1: 6, x2: 10, y2: 20 } : { x1: 34, y1: 6, x2: 43, y2: 20 });

function safeFn(me) {
  const b = oppBoxOf(me);
  return (x, y, m = 0.62) => {
    if (y > b.y1 - 0.4 && y < b.y2 + 0.4) {
      if (me === 0) { if (x > b.x1 - m) x = b.x1 - m; }
      else { if (x < b.x2 + m) x = b.x2 + m; }
    }
    return [clamp(x, 0.4, 43.6), clamp(y, 0.4, 25.6)];
  };
}

/* 射门评估：从 (bx,by) 射向门线 ty；react=对手反应延迟 */
function shotClear(bx, by, ty, opps, gl, react) {
  const dx = gl - bx, dy = ty - by, d = Math.hypot(dx, dy);
  if (d < 0.8) return { ok: false, m: -9 };
  const ux = dx / d, uy = dy / d;
  let x = bx, y = by, v = 11, t = 0, m = 1e9;
  for (let s = 0; s < 260; s++) {
    const dv = v * 0.05; x += ux * dv; y += uy * dv; v *= 0.978; t += 0.05;
    if (y < R_B + 0.05 || y > H - R_B - 0.05) return { ok: false, m: -9 };
    for (const o of opps) {
      const dd = Math.hypot(o.x - x, o.y - y) - 3.15 * Math.max(0, t - react) - 0.82;
      if (dd < m) m = dd;
    }
    if (t > 3.2 || Math.abs(x - gl) < 0.35) break;
  }
  return { ok: m > 0.03, m };
}
function bestShot(bx, by, opps, gl, keeper, react) {
  let best = null;
  for (const ty of [10.7, 11.4, 12.1, 12.8, 13.2, 13.9, 14.6, 15.3]) {
    const r = shotClear(bx, by, ty, opps, gl, react);
    if (!r.ok) continue;
    const kd = keeper ? Math.abs(keeper.y - ty) : 4;
    const sc = r.m + Math.min(kd, 6) * 0.5;
    if (!best || sc > best.sc) best = { sc, ty };
  }
  return best;
}

/* 铁桶防守 + 一次性进攻 */
function botBlock(view) {
  const me = view.yourTeam, n = view.teamSize, ball = view.ball;
  const gl = goalLine(me), ol = ownLine(me), sgn = sgnOf(me);
  const mine = view.units.filter(u => u.team === me).sort((a, b) => a.index - b.index);
  const opps = view.units.filter(u => u.team !== me);
  const owner = ball.owner;
  const carrier = mine.find(u => u.id === owner) || null;
  const keeper = opps.find(u => u.index === 0) || null;
  const safe = safeFn(me);
  const fld = mine.filter(u => u.index !== 0);
  const byD = fld.slice().sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));
  const oppOwner = opps.find(u => u.id === owner) || null;

  // 门将
  let ky = clamp(13 + (ball.y - 13) * 0.55, 11, 15);
  if (Math.hypot(ball.vx, ball.vy) > 0.8) {
    const tr = ballTraj(ball.x, ball.y, ball.vx, ball.vy, 140);
    for (const p of tr) {
      if ((sgn > 0 && p.x <= ol + 0.4) || (sgn < 0 && p.x >= ol - 0.4)) { ky = clamp(p.y, 10.9, 15.1); break; }
    }
  }

  // 进攻：谁能射门
  let shooterIdx = -1, shotTy = 0;
  if (carrier) {
    const s = bestShot(ball.x, ball.y, opps, gl, keeper, 1.0);
    if (s) { shooterIdx = carrier.index; shotTy = s.ty; }
  }

  return plan(view, (i, pos, f, hasBall) => {
    if (i === 0 && n >= 2) {
      if (hasBall) {
        const s = bestShot(ball.x, ball.y, opps, gl, keeper, 1.0);
        if (s) return { target: pos, aim: angleTo(pos, { x: gl, y: s.ty }), kick: true };
        return { target: pos, aim: angleTo(pos, { x: gl, y: clamp(pos.y, 5, 21) }), kick: true };
      }
      return { target: { x: ol + sgn * 0.32, y: ky } };
    }
    if (hasBall) {
      if (shooterIdx === i && f === 0) return { target: pos, aim: angleTo(pos, { x: gl, y: shotTy }), kick: true };
      if (shooterIdx === i) return { target: pos };
      // 无射门机会：传给无人盯防且能射门的队友
      let bestP = null;
      for (const T of mine) {
        if (T.index === i) continue;
        const d = Math.hypot(T.x - ball.x, T.y - ball.y);
        if (d < 2.5 || d > 24) continue;
        const r = shotClear(ball.x, ball.y, T.y, opps, gl, 0.9);
        // 直接判传线是否被挡
        const ux = (T.x - ball.x) / d, uy = (T.y - ball.y) / d;
        let ok = true;
        for (let s2 = 1; s2 <= 30; s2++) {
          const px = ball.x + ux * d * (s2 / 30), py = ball.y + uy * d * (s2 / 30);
          for (const o of opps) if (Math.hypot(o.x - px, o.y - py) < 0.9) { ok = false; break; }
          if (!ok) break;
        }
        if (!ok) continue;
        const gain = (T.x - ball.x) * sgn;
        if (!bestP || gain > bestP.gain) bestP = { T, gain };
      }
      if (bestP) return { target: pos, aim: angleTo(pos, { x: bestP.T.x, y: bestP.T.y }), kick: true };
      // 推进
      return { target: safe(gl - sgn * 9.9, clamp(pos.y, 11, 15)) };
    }
    if (oppOwner) {
      const dx = ol - ball.x, dy = 13 - ball.y, l = Math.hypot(dx, dy) || 1;
      if (byD[0] && i === byD[0].index) return { target: safe(ball.x + dx / l * 0.45, ball.y + dy / l * 0.45) };
      if (byD[1] && i === byD[1].index) return { target: safe(ball.x + dx / l * 4.0, ball.y + dy / l * 4.0) };
      return { target: safe(ol + sgn * 12, 13) };
    }
    // 松球
    const track = ballTraj(ball.x, ball.y, ball.vx, ball.vy, 45);
    if (byD[0] && i === byD[0].index) {
      for (let k = 0; k < track.length; k++) if (Math.hypot(pos.x - track[k].x, pos.y - track[k].y) <= 3.15 * k * 0.05 + 0.6) return { target: safe(track[k].x, track[k].y) };
      return { target: safe(ball.x, ball.y) };
    }
    if (byD[1] && i === byD[1].index) {
      for (let k = 0; k < track.length; k++) if (Math.hypot(pos.x - track[k].x, pos.y - track[k].y) <= 3.15 * k * 0.05 + 0.6) return { target: safe(track[k].x, track[k].y) };
    }
    return { target: safe(gl - sgn * 6, clamp(ball.y, 3, 23)) };
  });
}

/* 全场紧逼 + 见球就射（极端进攻型） */
function botRush(view) {
  const me = view.yourTeam, n = view.teamSize, ball = view.ball;
  const gl = goalLine(me), ol = ownLine(me), sgn = sgnOf(me);
  const mine = view.units.filter(u => u.team === me).sort((a, b) => a.index - b.index);
  const opps = view.units.filter(u => u.team !== me);
  const keeper = opps.find(u => u.index === 0) || null;
  const owner = ball.owner;
  const safe = safeFn(me);
  const fld = mine.filter(u => u.index !== 0);
  const byD = fld.slice().sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));
  let ky = clamp(13 + (ball.y - 13) * 0.5, 11, 15);
  return plan(view, (i, pos, f, hasBall) => {
    if (i === 0 && n >= 2) return { target: { x: ol + sgn * 0.32, y: ky } };
    if (hasBall) {
      const s = bestShot(ball.x, ball.y, opps, gl, keeper, 1.0);
      if (s && f === 0) return { target: pos, aim: angleTo(pos, { x: gl, y: s.ty }), kick: true };
      if (s) return { target: pos };
      return { target: safe(gl - sgn * 9.9, clamp(pos.y, 11, 15)) };
    }
    return { target: safe(ball.x, ball.y) };
  });
}

module.exports = { botBlock, botRush, shotClear, bestShot };
