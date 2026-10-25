'use strict';
/* 决策核心：把观察重建为引擎状态，前向模拟候选方案，挑最优。
 * 观察是 round2 的近似值，误差 ~0.01，对 0.38 判定半径足够。 */
const sim = require('./engine.js');
const { rules } = require('./catalog.js');

const DT = 1 / rules.hz;
const SUB = DT / rules.substeps;
const NET = rules.netX;
const L = rules.courtLength;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------------- 状态重建 ---------------- */
function rebuild(obs) {
  const batsmen = obs.batsmen.map(b => ({
    id: b.id, team: b.team, index: b.index, name: b.name || b.id,
    x: b.x, y: b.y, vx: b.vx, vy: b.vy, onGround: b.onGround,
    facing: b.facing, swing: b.swing, swingElapsed: b.swingElapsed,
    swingType: b.swingType, swingCd: b.swingCd, lastHitFrame: -999,
    held: { move: 0, jump: false, swing: 0, charge: false, sprint: false },
    inputHistory: [], hits: b.hits, smashes: b.smashes, errors: 0, points: b.points,
    stamina: b.stamina, charge: b.charge || 0, sprinting: !!b.sprinting,
  }));
  const g = {
    id: obs.id || 'live', seed: obs.seed || 1,
    status: obs.status, phase: obs.phase, winner: obs.winner || null, reason: '',
    eventId: 0, frame: obs.frame, tick: obs.tick || 0,
    players: batsmen.map(b => ({ id: b.team, name: b.name, kind: 'api', wins: 0 })),
    score: (obs.score || [0, 0]).slice(), server: obs.server, serveTimer: 0, pointTimer: 0,
    rally: obs.rally || 0, longestRally: obs.longestRally || 0, lastPoint: null,
    batsmen, shuttle: null, events: [], pendingLanding: null,
  };
  const s = obs.shuttle;
  if (s) {
    g.shuttle = {
      x: s.x, y: s.y, vx: s.vx, vy: s.vy, lastTeam: s.lastTeam, owner: s.owner,
      lastHitFrame: -999, alive: s.alive, trail: [],
    };
  }
  // 计时器：观察里是秒（round2）
  g.serveTimer = Math.round((obs.serveLeft || 0) * rules.hz);
  g.pointTimer = Math.round((obs.pointLeft || 0) * rules.hz);
  // 事件：重建 lastHitFrame 与 eventId
  for (const e of obs.events || []) {
    g.events.push(e);
    if (e.id > g.eventId) g.eventId = e.id;
    if (e.type === 'hit' && e.team != null) {
      const p = g.batsmen[e.team];
      if (p && e.frame > p.lastHitFrame) p.lastHitFrame = e.frame;
    }
  }
  return g;
}

function cloneGame(g) {
  const c = {
    id: g.id, seed: g.seed, status: g.status, phase: g.phase, winner: g.winner, reason: g.reason,
    eventId: g.eventId, frame: g.frame, tick: g.tick || 0, players: g.players, score: g.score.slice(), server: g.server,
    serveTimer: g.serveTimer, pointTimer: g.pointTimer, rally: g.rally,
    longestRally: g.longestRally, lastPoint: g.lastPoint, pendingLanding: null,
    batsmen: g.batsmen.map(b => ({ ...b, held: { ...b.held }, inputHistory: [] })),
    shuttle: g.shuttle ? { ...g.shuttle, trail: [] } : null,
    events: [],
  };
  return c;
}

/* ---------------- 纯弹道预测（不处理球拍） ---------------- */
function stepShuttleOnly(s, dt, out) {
  const sp = Math.hypot(s.vx, s.vy);
  const drag = rules.shuttleDrag * sp;
  s.vx -= s.vx * drag * dt;
  s.vy -= s.vy * drag * dt;
  s.vy -= rules.gravity * dt;
  const prevX = s.x, prevY = s.y;
  let nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
  if (ny > rules.ceiling) { ny = rules.ceiling; s.vy = -Math.abs(s.vy) * 0.25; }
  const crossed = (prevX - NET) * (nx - NET) < 0;
  if (crossed) {
    const yAtNet = Math.min(prevY, ny);
    if (yAtNet < rules.netHeight + rules.shuttleRadius) {
      s.x = NET - Math.sign(s.vx) * (rules.netThickness + rules.shuttleRadius);
      s.vx *= -0.08; s.vy *= 0.2;
      out.net = true; out.alive = false;
      return;
    }
  }
  s.x = nx; s.y = ny;
  if (s.x < -0.15 || s.x > L + 0.15) { out.alive = false; out.out = true; return; }
  if (s.y <= rules.shuttleRadius) { s.y = 0; out.alive = false; out.land = true; return; }
}

/* 从当前局面推演球（考虑到球网/落地），返回每帧位置数组 */
function predictShuttle(g, frames = 70) {
  const out = { pts: [], land: null, out: false, net: false };
  if (!g.shuttle || !g.shuttle.alive) return out;
  const s = { x: g.shuttle.x, y: g.shuttle.y, vx: g.shuttle.vx, vy: g.shuttle.vy };
  let serveTimer = g.phase === 'serve' ? g.serveTimer : 0;
  const traj = [{ x: s.x, y: s.y, t: 0, serve: serveTimer > 0 }];
  for (let f = 0; f < frames; f++) {
    if (serveTimer > 0) {
      serveTimer--;
      if (serveTimer > 0) {
        traj.push({ x: s.x, y: s.y, t: (f + 1) * DT, serve: true });
        continue;
      }
      // 发球在这一帧发射，并立即推进（与引擎 step() 同序）
      const p = g.batsmen[g.server];
      const target = NET + p.facing * (rules.serve.targetFromNet || 2.8);
      const angle = 0.72;
      const speed = solveSpeed(s.x, s.y, angle, p.facing, target);
      s.vx = p.facing * speed * Math.cos(angle);
      s.vy = speed * Math.sin(angle);
    }
    const o = { alive: true };
    for (let k = 0; k < rules.substeps; k++) stepShuttleOnly(s, SUB, o);
    traj.push({ x: s.x, y: s.y, vx: s.vx, vy: s.vy, t: (f + 1) * DT });
    if (!o.alive) {
      if (o.land) out.land = { x: s.x, y: 0, t: (f + 1) * DT };
      if (o.out) { out.out = true; out.land = { x: s.x, t: (f + 1) * DT }; }
      if (o.net) { out.net = true; out.land = { x: s.x, y: s.y, t: (f + 1) * DT }; }
      break;
    }
  }
  out.pts = traj;
  return out;
}

/* ---------------- 击球解算（抄自引擎，供评估用） ---------------- */
function flightLanding(x, y, vx, vy) {
  const dt = SUB;
  for (let t = 0; t < 5; t += dt) {
    const sp = Math.hypot(vx, vy);
    vx -= vx * rules.shuttleDrag * sp * dt;
    vy -= vy * rules.shuttleDrag * sp * dt;
    vy -= rules.gravity * dt;
    x += vx * dt; y += vy * dt;
    if (y > rules.ceiling) { y = rules.ceiling; vy = -Math.abs(vy) * 0.25; }
    if (y <= rules.shuttleRadius) return x;
    if (x < -0.5 || x > L + 0.5) return x;
  }
  return x;
}
function solveSpeed(x0, y0, angle, dir, targetX) {
  let lo = 5, hi = 34;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const land = flightLanding(x0, y0, dir * mid * Math.cos(angle), mid * Math.sin(angle));
    if ((land - targetX) * dir < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* 完整弹道（含网/边界），返回落点与飞行时间 */
function shotTrace(x0, y0, angle, speed, dir) {
  let x = x0, y = y0;
  let vx = dir * speed * Math.cos(angle), vy = speed * Math.sin(angle);
  const dt = SUB;
  let netY = null;
  for (let n = 0; n < 20 * 5; n++) {
    for (let k = 0; k < rules.substeps; k++) {
      const sp = Math.hypot(vx, vy);
      vx -= vx * rules.shuttleDrag * sp * dt;
      vy -= vy * rules.shuttleDrag * sp * dt;
      vy -= rules.gravity * dt;
      const px = x, py = y;
      x += vx * dt; y += vy * dt;
      if (netY === null && (px - NET) * (x - NET) <= 0 && Math.abs(x - px) > 1e-9) {
        const f = (NET - px) / (x - px);
        netY = py + (y - py) * f;
      }
      if (y > rules.ceiling) { y = rules.ceiling; vy = -Math.abs(vy) * 0.25; }
      const netHit = netY !== null && netY < rules.netHeight + rules.shuttleRadius + 0.03;
      if (y <= rules.shuttleRadius) return { netY, landX: x, landT: (n + (k + 1) / rules.substeps) * DT, netHit };
      if (x < -0.2 || x > L + 0.2) return { netY, landX: x, landT: (n + (k + 1) / rules.substeps) * DT, netHit };
    }
  }
  return { netY, landX: x, landT: 5, netHit: netY !== null && netY < rules.netHeight + rules.shuttleRadius + 0.03 };
}

module.exports = {
  DT, SUB, NET, L, clamp, rebuild, cloneGame, predictShuttle, stepShuttleOnly,
  flightLanding, solveSpeed, shotTrace, chooseShot, strikeModel,
};

/* 在候选角度里挑第一拍“过网且落在场内”的球（抄自引擎 chooseShot） */
function chooseShot(x, y, dir, kind, target) {
  const ranges = {
    smash: [-0.42, -0.30, -0.18, -0.06, 0.06, 0.16, 0.26, 0.34],
    clear: [0.60, 0.72, 0.85],
    drop: [0.42, 0.55, 0.68],
    lift: [1.05, 1.20],
  };
  for (const angle of ranges[kind]) {
    const speed = solveSpeed(x, y, angle, dir, target);
    const tr = shotTrace(x, y, angle, speed, dir);
    if (!tr.netHit && tr.landX > -0.05 && tr.landX < L + 0.05) return { angle, speed };
  }
  const angle = kind === 'smash' ? 0.30 : kind === 'clear' ? 0.75 : kind === 'drop' ? 0.60 : 1.15;
  return { angle, speed: solveSpeed(x, y, angle, dir, target) };
}

/* 复刻引擎 strike()：给定接触点/挥拍类型/移动输入，算出出球速度与种类 */
function strikeModel(g, p, sx, sy, move, chargeOverride) {
  const dir = p.facing;
  const forward = clamp((move || 0) * p.facing, 0, 1);
  const shot = rules.shot;
  let kind, target;
  if (p.swingType > 0) {
    const t = clamp((sy - shot.clearHeight) / (shot.smashHeight - shot.clearHeight), 0, 1);
    const distNet = Math.abs(sx - NET);
    const near = clamp(1 - (distNet - 3.2) / 2.5, 0, 1);
    const smash = t * near;
    const opp = g.batsmen[1 - p.team];
    const oppDeep = Math.abs(opp.x - NET) > 3.0;
    if (smash > 0.55) {
      kind = 'smash';
      const shortX = dir > 0 ? NET + 1.6 : NET - 1.6;
      const deepX = dir > 0 ? L - 1.0 : 1.0;
      target = Math.abs(shortX - opp.x) >= Math.abs(deepX - opp.x) ? shortX : deepX;
    } else if (t > 0.5 && oppDeep && distNet > 2.6) {
      kind = 'drop';
      target = NET + dir * 2.7;
    } else {
      kind = 'clear';
      target = dir > 0 ? 11.9 : L - 11.9;
    }
  } else {
    kind = 'lift';
    target = dir > 0 ? 11.4 : L - 11.4;
  }
  target += dir * forward * 0.6;
  let { angle, speed } = chooseShot(sx, sy, dir, kind, target);
  const charge = chargeOverride != null ? chargeOverride : (p.charge || 0);
  speed *= 1 + rules.chargeBoost * charge;
  return { kind, angle, speed, vx: dir * speed * Math.cos(angle), vy: speed * Math.sin(angle), target };
}
