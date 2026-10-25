'use strict';
/* 自测用对手集合（只用于离线对局）。 */
const { plan, clamp, angleTo, ballTraj } = require('../dev/arena.js');

const W = 44, H = 26, R_B = 0.22;
const goalLine = t => (t === 0 ? 43 : 1);
const ownLine = t => (t === 0 ? 1 : 43);
const sgnOf = t => (t === 0 ? 1 : -1);
const oppBoxOf = t => (t === 0 ? { x1: 34, y1: 6, x2: 43, y2: 20 } : { x1: 1, y1: 6, x2: 10, y2: 20 });

/* 保证型射门评估：假设对手立刻以全速 3.15 移动（无反应延迟），
 * margin>0 表示「对手无论如何都够不到」=> 必进。 */
function guaranteed(bx, by, ty, opps, gl, react) {
  const dx = gl - bx, dy = ty - by, d = Math.hypot(dx, dy);
  if (d < 0.8) return null;
  const ux = dx / d, uy = dy / d;
  let x = bx, y = by, v = 11, t = 0, m = 1e9;
  for (let s = 0; s < 300; s++) {
    const dv = v * 0.05; x += ux * dv; y += uy * dv; v *= 0.978; t += 0.05;
    if (y < R_B + 0.05 || y > H - R_B - 0.05) return null;
    for (const o of opps) {
      const dd = Math.hypot(o.x - x, o.y - y) - 3.15 * Math.max(0, t - (react || 0)) - 0.82;
      if (dd < m) m = dd;
    }
    if (Math.abs(gl - x) < 0.35) break;
  }
  return { m, t };
}
function bestGuaranteed(bx, by, opps, gl, keeper, react) {
  let best = null;
  for (let ty = 10.6; ty <= 15.4; ty += 0.35) {
    const r = guaranteed(bx, by, ty, opps, gl, react);
    if (!r || r.m <= 0.02) continue;
    const kd = keeper ? Math.abs(keeper.y - ty) : 4;
    const sc = r.m + Math.min(kd, 6) * 0.5;
    if (!best || sc > best.sc) best = { sc, ty, m: r.m, t: r.t };
  }
  return best;
}

function oppList(view, me) { return view.units.filter(u => u.team !== me); }
function mineList(view, me) { return view.units.filter(u => u.team === me).sort((a, b) => a.index - b.index); }

/* 激进单兵：无脑抢球，拿到就射（1v1 专用） */
function aggro(view) {
  const me = view.yourTeam, ball = view.ball, gl = goalLine(me);
  const opps = oppList(view, me);
  const mine = mineList(view, me);
  const ownerIdx = mine.findIndex(u => u.id === ball.owner);
  return plan(view, (i, pos, f, hasBall) => {
    if (hasBall) {
      const keeper = opps.find(o => o.index === 0);
      const g = bestGuaranteed(pos.x + (pos.x < 22 ? 0.62 : -0.62), pos.y, opps, gl, keeper, 0);
      if (g) return { target: pos, aim: angleTo({ x: pos.x, y: pos.y }, { x: gl, y: g.ty }), kick: true };
      const ty = (opps[0] && opps[0].y < 13) ? 15.3 : 10.7;
      return { target: { x: gl, y: clamp(pos.y, 11, 15) }, aim: angleTo(pos, { x: gl, y: ty }) };
    }
    return { target: { x: ball.x, y: ball.y } };
  });
}

/* 稳健型：门将守线 + 最近者封堵 + 持球者保证射门/传球 */
function solid(view) {
  const me = view.yourTeam, n = view.teamSize, ball = view.ball, gl = goalLine(me), ol = ownLine(me), sgn = sgnOf(me);
  const mine = mineList(view, me), opps = oppList(view, me);
  const owner = ball.owner;
  const carrier = mine.find(u => u.id === owner) || null;
  const keeper = opps.find(u => u.index === 0) || null;
  const box = oppBoxOf(me);
  const safe = (x, y, m = 0.62) => {
    if (y > box.y1 - 0.4 && y < box.y2 + 0.4) {
      if (me === 0) { if (x > box.x1 - m) x = box.x1 - m; } else { if (x < box.x2 + m) x = box.x2 + m; }
    }
    return { x: clamp(x, 0.4, 43.6), y: clamp(y, 0.4, 25.6) };
  };
  const fld = n === 1 ? mine.slice() : mine.filter(u => u.index !== 0);
  const byD = fld.slice().sort((a, b) => Math.hypot(a.x - ball.x, a.y - ball.y) - Math.hypot(b.x - ball.x, b.y - ball.y));

  // 门将 y：预测门线交点，否则角平分线
  let ky = clamp(13 + (ball.y - 13) * 0.35, 11.0, 15.0);
  if (Math.hypot(ball.vx, ball.vy) > 0.8) {
    const tr = ballTraj(ball.x, ball.y, ball.vx, ball.vy, 160);
    for (const p of tr) {
      if ((sgn > 0 && p.x <= ol + 0.5) || (sgn < 0 && p.x >= ol - 0.5)) { ky = clamp(p.y, 10.8, 15.2); break; }
    }
  } else {
    const a1 = Math.atan2(10 - ball.y, ol - ball.x), a2 = Math.atan2(16 - ball.y, ol - ball.x);
    const mid = (a1 + a2) / 2;
    ky = clamp(ball.y + Math.tan(mid) * (ol - ball.x), 10.9, 15.1);
  }

  const acts = {}, tgts = {};
  if (n >= 2) {
    const k = mine[0];
    if (carrier && carrier.index === 0) {
      // 门将拿球：大脚开到前场
      acts[0] = { aim: angleTo({ x: ball.x, y: ball.y }, { x: gl - sgn * 12, y: clamp(13 + (ball.y - 13) * 0.3, 6, 20) }), kick: true };
      tgts[0] = { x: k.x, y: k.y };
    } else if (!owner && Math.hypot(ball.x - ol, ball.y - 13) < 9) {
      tgts[0] = { x: ol + sgn * 0.32, y: ky };
    } else {
      tgts[0] = { x: ol + sgn * 0.32, y: ky };
    }
  }

  if (carrier) {
    const g = bestGuaranteed(ball.x, ball.y, opps, gl, keeper, 0);
    tgts[carrier.index] = { x: carrier.x, y: carrier.y };
    if (g) {
      acts[carrier.index] = { aim: angleTo({ x: ball.x, y: ball.y }, { x: gl, y: g.ty }), kick: true };
    } else {
      // 传球给有空档的队友（简单：找射门角度最好的队友）
      let best = null;
      for (const t of mine) {
        if (t.index === carrier.index || t.index === 0) continue;
        const px = t.x + sgn * 3.0, py = t.y;
        const g2 = bestGuaranteed(px, py, opps, gl, keeper, 0.5);
        const sc = g2 ? g2.m + (px - ball.x) * sgn * 0.2 : -1;
        if (!best || sc > best.sc) best = { sc, px, py, t, g2 };
      }
      if (best && best.g2) {
        acts[carrier.index] = { aim: angleTo({ x: ball.x, y: ball.y }, { x: best.px, y: best.py }), kick: true };
        tgts[best.t.index] = { x: best.px, y: best.py };
        acts[best.t.index] = { aim: angleTo({ x: best.px, y: best.py }, { x: gl, y: best.g2.ty }), kick: true };
      } else if (Math.abs(gl - ball.x) > 20) {
        acts[carrier.index] = { aim: angleTo({ x: ball.x, y: ball.y }, { x: gl - sgn * 11, y: clamp(ball.y + (carrier.index % 2 ? 7 : -7), 5, 21) }), kick: true };
      } else {
        tgts[carrier.index] = safe(gl - sgn * 9.6, clamp(ball.y, 8, 18));
      }
    }
    for (const u of byD) if (!(u.index in tgts)) tgts[u.index] = safe(gl - sgn * 9.6, clamp(ball.y + (u.index - n / 2) * 6, 5, 21));
  } else if (owner) {
    // 对手持球：最近者贴身封堵，其余盯人
    const d0 = { x: ol - ball.x, y: 13 - ball.y };
    const l = Math.hypot(d0.x, d0.y) || 1;
    byD.forEach((u, idx) => {
      const r = idx === 0 ? 0.5 : idx === 1 ? 3.2 : 6.5;
      tgts[u.index] = safe(ball.x + d0.x / l * r, ball.y + d0.y / l * r);
    });
  } else {
    // 松球
    const tr = ballTraj(ball.x, ball.y, ball.vx, ball.vy, 45);
    byD.forEach((u, idx) => {
      let bk = 999;
      for (let k = 0; k < tr.length; k++) {
        if (Math.hypot(u.x - tr[k].x, u.y - tr[k].y) <= 3.15 * k * 0.05 + 0.6) { bk = k; break; }
      }
      if (bk >= 999) tgts[u.index] = safe(ball.x, ball.y);
      else if (idx === 0) tgts[u.index] = safe(tr[bk].x, tr[bk].y);
      else tgts[u.index] = safe(gl - sgn * 7, clamp(ball.y + (idx - 1) * 6 - 3, 4, 22));
    });
  }

  return plan(view, (i, pos, f, hasBall) => {
    const t = tgts[i] || pos;
    const a = acts[i];
    return { target: t, aim: a ? a.aim : null, kick: !!(a && a.kick) };
  });
}

module.exports = { aggro, solid, guaranteed, bestGuaranteed };
