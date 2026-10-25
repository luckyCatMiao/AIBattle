'use strict';
/* 决策核心：把观察重建为引擎状态，前向模拟候选击球方案并挑最优。 */
const sim = require('./engine.js');
const core = require('./core.js');
const { rules } = require('./catalog.js');

const DT = 1 / rules.hz;
const NET = rules.netX;
const L = rules.courtLength;
const clamp = core.clamp;

const NEUTRAL = { move: 0, jump: false, swing: 0, charge: false, sprint: false };
const READY_OFF = 2.8;    // 常规站位：离网 2.8 格

function readyX(team) { return team === 0 ? NET - READY_OFF : NET + READY_OFF; }
function courtX(team, x) {
  const lo = team === 0 ? 0.35 : NET + 0.35;
  const hi = team === 0 ? NET - 0.35 : L - 0.35;
  return clamp(x, lo, hi);
}

/* 体力只在 |vx|>3.2 时消耗；低于该速度移动完全免费。
 * 因此常规移动把目标速度压在 3.18，只有明确需要时（FREE_SPEED 上限）才更快。 */
const FREE_SPEED = 3.18;

/* 速度控制器：朝 targetX 用理想刹车曲线逼近 */
function moveCtrl(me, targetX, hard) {
  const d = targetX - me.x;
  if (Math.abs(d) < 0.05 && Math.abs(me.vx) < 0.6) return 0;
  const tired = 0.62 + 0.38 * me.stamina / 100;
  const maxS = rules.playerSpeed * tired;
  const cap = hard ? maxS : Math.min(maxS, FREE_SPEED);
  const brake = Math.sqrt(2 * 14 * Math.abs(d));
  const desired = Math.sign(d) * Math.min(cap, brake, Math.abs(d) * 8);
  return clamp((desired - me.vx) / (rules.playerAccel * DT), -1, 1);
}

/* 一维推演：返回接下来 n 帧的 move 序列（与引擎同样的速度/摩擦模型） */
function moveSeq(me, targetX, n, stamina) {
  let x = me.x, vx = me.vx;
  const st = stamina == null ? me.stamina : stamina;
  const maxS = rules.playerSpeed * (0.62 + 0.38 * st / 100);
  const cap = Math.min(maxS, FREE_SPEED);
  const seq = [];
  for (let i = 0; i < n; i++) {
    const d = targetX - x;
    let mv = 0;
    if (!(Math.abs(d) < 0.05 && Math.abs(vx) < 0.6)) {
      const brake = Math.sqrt(2 * 14 * Math.abs(d));
      const desired = Math.sign(d) * Math.min(cap, brake, Math.abs(d) * 8);
      mv = clamp((desired - vx) / (rules.playerAccel * DT), -1, 1);
    }
    if (mv !== 0) vx += clamp(mv * maxS - vx, -rules.playerAccel * DT, rules.playerAccel * DT);
    else vx *= Math.exp(-rules.playerFriction * DT);
    x += vx * DT;
    seq.push(mv);
  }
  return seq;
}

/* ---------------- 纯弹道（含网） ---------------- */
function traceVel(x0, y0, vx, vy) {
  const pts = [{ x: x0, y: y0, vx, vy, t: 0 }];
  const dt = core.SUB;
  let netY = null;
  for (let n = 0; n < 20 * 5; n++) {
    for (let k = 0; k < rules.substeps; k++) {
      const sp = Math.hypot(vx, vy);
      vx -= vx * rules.shuttleDrag * sp * dt;
      vy -= vy * rules.shuttleDrag * sp * dt;
      vy -= rules.gravity * dt;
      const px = x0, py = y0;
      x0 += vx * dt; y0 += vy * dt;
      if (netY === null && (px - NET) * (x0 - NET) <= 0 && Math.abs(x0 - px) > 1e-9) {
        const f = (NET - px) / (x0 - px);
        netY = py + (y0 - py) * f;
      }
      if (y0 > rules.ceiling) { y0 = rules.ceiling; vy = -Math.abs(vy) * 0.25; }
      const t = (n + (k + 1) / rules.substeps) * DT;
      if (y0 <= rules.shuttleRadius) {
        pts.push({ x: x0, y: Math.max(0, y0), vx, vy, t });
        return { pts, landX: x0, landT: t, netHit: netY !== null && netY < rules.netHeight + rules.shuttleRadius + 0.03, netY, out: false };
      }
      if (x0 < -0.15 || x0 > L + 0.15) {
        pts.push({ x: x0, y: y0, vx, vy, t });
        return { pts, landX: x0, landT: t, netHit: netY !== null && netY < rules.netHeight + rules.shuttleRadius + 0.03, netY, out: true };
      }
    }
    pts.push({ x: x0, y: y0, vx, vy, t: (n + 1) * DT });
  }
  return { pts, landX: x0, landT: 5, netHit: false, netY, out: false };
}

/* 对手在 t 秒内最多能移动多远（从静止，含加速段） */
function maxTravel(t, tired = 1) {
  const v = rules.playerSpeed * tired;
  const a = rules.playerAccel;
  const tAcc = v / a;
  if (t <= 0) return 0;
  if (t <= tAcc) return 0.5 * a * t * t;
  return 0.5 * a * tAcc * tAcc + v * (t - tAcc);
}

/* 评估这一拍：对手能不能接？分数越大越难接 */
function evalShot(tr, opp, dir) {
  if (tr.netHit) return -900;
  if ((tr.landX - NET) * dir < 0) return -900;      // 落回自己半场
  if (tr.landX < -0.15 || tr.landX > L + 0.15) return -900;
  const oppDir = -dir;
  const tired = 0.62 + 0.38 * opp.stamina / 100;
  let easiest = Infinity;
  for (const p of tr.pts) {
    if (p.t <= 0.02) continue;
    if ((p.x - NET) * dir < -0.3) continue;
    if (p.y > 2.85 || p.y < 0.05) continue;
    const reqBody = p.x - oppDir * 0.38;
    const reqDist = Math.max(0, Math.abs(reqBody - opp.x) - 0.45);
    const avail = Math.max(0, p.t - 0.08);
    const need = reqDist - maxTravel(avail, tired);
    if (need < easiest) easiest = need;
  }
  if (!Number.isFinite(easiest)) easiest = 0.5;
  const landBonus = Math.max(0, Math.abs(tr.landX - opp.x) - 1.0) * 3;
  const timeBonus = Math.max(0, 1.2 - tr.landT) * 8;
  return 100 * Math.min(1, Math.max(0, easiest + 0.30) * 2) + landBonus + timeBonus;
}

/* ---------------- 方案模拟 ---------------- */
function simulatePlan(g, team, opts) {
  const c = core.cloneGame(g);
  const me = c.batsmen[team], opp = c.batsmen[1 - team];
  const seq = [];
  let hitFrame = -1, hitEvent = null, strike = null, hitModel = null;
  const horizon = opts.horizon || 60;
  for (let i = 0; i < horizon; i++) {
    let inp;
    if (hitFrame < 0) {
      const sw = (i === opts.swingAt) ? opts.type : 0;
      inp = {
        move: sw !== 0 ? 0 : moveCtrl(me, opts.aimX),
        jump: i === opts.jumpAt, swing: sw, charge: !!opts.charge, sprint: false,
      };
    } else {
      inp = { move: moveCtrl(me, opts.readyX), jump: false, swing: 0, charge: false, sprint: false };
    }
    seq.push(inp);
    me.held = inp;
    opp.held = NEUTRAL;
    const nb = c.events.length;
    sim.step(c);
    if (hitFrame < 0) {
      const ev = c.events.slice(nb).find(e => e.type === 'hit' && e.team === team);
      if (ev) {
        hitFrame = i; hitEvent = ev;
        // 事件里的 x/y 是真实击球点；速度用 strike 复刻重算（模拟里球已多走几个子步）
        const savedCharge = me.charge;
        me.charge = opts.charge ? savedCharge : 0;
        hitModel = core.strikeModel(c, me, ev.x, ev.y, inp.move);
        strike = { x: ev.x, y: ev.y, vx: hitModel.vx, vy: hitModel.vy };
        me.charge = savedCharge;
      }
    }
    if (!c.shuttle.alive || c.pendingLanding) break;
  }
  return { seq, hitFrame, hitEvent, strike, hitModel, clone: c };
}

/* ---------------- 预判对手回球 ---------------- */
const NEUTRAL_FRAMES = Array.from({ length: 10 }, () => ({ ...NEUTRAL }));

/* 用“浅层自己”模拟对手，返回对手下一拍击球（绝对帧 + 触点 + 出球速度） */
function predictOppHit(g, oppTeam, maxWin = 3) {
  if (!g.shuttle || !g.shuttle.alive) return null;
  const c = core.cloneGame(g);
  for (let w = 0; w < maxWin; w++) {
    if (c.status !== 'playing') return null;
    const obs = sim.view(c, oppTeam);
    const frames = decide(obs, { shallow: true }).frames;
    const inputs = oppTeam === 0 ? [frames, NEUTRAL_FRAMES] : [NEUTRAL_FRAMES, frames];
    const before = c.events.length;
    sim.advanceWindow(c, [sim.submitWindow(c, 0, inputs[0]), sim.submitWindow(c, 1, inputs[1])]);
    const ev = c.events.slice(before).find(e => e.type === 'hit' && e.team === oppTeam);
    if (ev) {
      const p = c.batsmen[oppTeam];
      const model = core.strikeModel(c, p, ev.x, ev.y, 0);
      return { frame: ev.frame, frameRel: ev.frame - g.frame, x: ev.x, y: ev.y, model, kind: ev.kind };
    }
    if (c.pendingLanding || !c.shuttle.alive) return null;
  }
  return null;
}

/* 在克隆局里于第 T 帧注入对手的出球，再模拟我方候选方案 */
function simulateWithShot(g, team, T, shot, opts) {
  const c = core.cloneGame(g);
  const me = c.batsmen[team], opp = c.batsmen[1 - team];
  const seq = [];
  let hitFrame = -1, hitEvent = null, strike = null, model = null, illegal = false;
  const horizon = opts.horizon || 60;
  for (let i = 0; i < horizon; i++) {
    if (i === T && shot) {
      c.shuttle.x = shot.x; c.shuttle.y = shot.y; c.shuttle.vx = shot.vx; c.shuttle.vy = shot.vy;
      c.shuttle.alive = true; c.shuttle.lastTeam = 1 - team; c.shuttle.trail = [];
    }
    let inp;
    if (hitFrame < 0) {
      const sw = (i === opts.swingAt) ? opts.type : 0;
      inp = {
        move: sw !== 0 ? 0 : moveCtrl(me, opts.aimX),
        jump: i === opts.jumpAt, swing: sw, charge: false, sprint: false,
      };
    } else {
      inp = { move: moveCtrl(me, opts.readyX), jump: false, swing: 0, charge: false, sprint: false };
    }
    seq.push(inp);
    me.held = inp; opp.held = NEUTRAL;
    const nb = c.events.length;
    sim.step(c);
    if (hitFrame < 0) {
      const ev = c.events.slice(nb).find(e => e.type === 'hit' && e.team === team);
      if (ev) {
        if (i < T) { illegal = true; break; }
        hitFrame = i; hitEvent = ev;
        model = core.strikeModel(c, me, ev.x, ev.y, inp.move);
        strike = { x: ev.x, y: ev.y, vx: model.vx, vy: model.vy };
      }
    }
    if (!c.shuttle.alive || c.pendingLanding) break;
  }
  return { seq, hitFrame, hitEvent, strike, model, clone: c, illegal };
}

/* 预判防守：对手即将回球时，提前站位/起拍。返回 null 表示交给常规逻辑。 */
function anticipate(g, team, opts) {
  const me = g.batsmen[team], opp = g.batsmen[1 - team];
  const dir = me.facing;
  const rx = courtX(team, readyX(team));
  const ph = predictOppHit(g, 1 - team, 3);
  if (!ph || ph.frameRel < 0 || ph.frameRel > 34) return null;
  // 只有“反应不过来的快球”（杀球）才值得提前起拍；慢球交给常规追击，避免空挥进冷却
  if (ph.kind !== 'smash') return null;
  // 离对手触球还早（>14 帧）时不要提前压上，否则对手改打高远球我会回不去
  if (ph.frameRel > 16) return null;
  const T = ph.frameRel;
  const tr = traceVel(ph.x, ph.y, ph.model.vx, ph.model.vy);
  // 对手这一拍会失误（出界/下网/落他自己半场）→ 不用接
  if (tr.netHit) return null;
  if ((tr.landX - NET) * dir > 0) return null;
  if (tr.landX < -0.15 || tr.landX > L + 0.15) return null;

  let best = null;
  const maxK = Math.min(tr.pts.length - 1, 30);
  for (let k = 1; k <= maxK; k++) {
    const p = tr.pts[k];
    if (!p) continue;
    if ((p.x - NET) * dir > 0.3) continue;      // 还没到我方半场
    if (p.y > 2.95 || p.y < 0.1) continue;
    const aimX = courtX(team, p.x - dir * 0.38);
    const avail = (T + k) * DT;
    if (Math.abs(aimX - me.x) > maxTravel(avail + 0.2, 0.62 + 0.38 * me.stamina / 100) + 1.2) continue;
    const variants = [];
    if (p.y >= 1.25) {
      variants.push({ type: 1, jumpAt: Math.max(0, T + k - 4), swingAt: Math.max(0, T + k - 4) });
      variants.push({ type: 1, jumpAt: -1, swingAt: Math.max(0, T + k - 4) });
    } else {
      variants.push({ type: -1, jumpAt: -1, swingAt: Math.max(0, T + k - 4) });
    }
    for (const v of variants) {
      const plan = simulateWithShot(g, team, T, { x: ph.x, y: ph.y, vx: ph.model.vx, vy: ph.model.vy }, {
        aimX, jumpAt: v.jumpAt, swingAt: v.swingAt, type: v.type, readyX: rx, horizon: Math.min(T + k + 12, 70),
      });
      if (plan.illegal || plan.hitFrame < 0 || !plan.strike) continue;
      const tr2 = traceVel(plan.strike.x, plan.strike.y, plan.strike.vx, plan.strike.vy);
      let score = evalShot(tr2, opp, dir);
      if (!best || score > best.score) best = { score, plan, k };
    }
    if (best && k > best.k + 10) break;
  }
  if (!best) return null;
  const frames = [];
  for (let i = 0; i < 10; i++) frames.push(best.plan.seq[i] || { ...NEUTRAL });
  return { frames, debug: { mode: 'anticipate', oppKind: ph.kind, oppHitAt: ph.frame, k: best.k, score: Math.round(best.score) } };
}

/* ---------------- 主决策 ---------------- */
function decide(obs, opts = {}) {
  const g = core.rebuild(obs);
  const team = obs.yourPlayer;
  const me = g.batsmen[team];
  const opp = g.batsmen[1 - team];
  const dir = me.facing;
  const rx = readyX(team);

  if (g.phase === 'point') {
    // 站定回体力（beginServe 会把位置复位，此时移动无意义）
    return { frames: Array.from({ length: 10 }, () => ({ ...NEUTRAL })), debug: { mode: 'rest' } };
  }
  if (!g.shuttle || !g.shuttle.alive || g.phase === 'finished') {
    return { frames: idleFrames(me, courtX(team, rx)), debug: { mode: 'idle' } };
  }
  if (g.phase === 'serve' && g.server === team) {
    if (!opts.shallow) {
      const a = anticipate(g, team, opts);
      if (a) return a;
    }
    return { frames: idleFrames(me, courtX(team, rx)), debug: { mode: 'serve' } };
  }

  const pred = core.predictShuttle(g, 95);
  const traj = pred.pts;

  // 球会出界 / 落在对方半场 → 不碰，回位
  if (pred.land) {
    const landMine = (pred.land.x - NET) * dir < 0;
    if (pred.out || !landMine) {
      if (!opts.shallow) {
        const a = anticipate(g, team, opts);
        if (a) return a;
      }
      return { frames: idleFrames(me, courtX(team, rx)), debug: { mode: 'letgo', land: pred.land.x } };
    }
  }

  const mySide = x => (x - NET) * dir < 0.3;
  let best = null;
  const KMAX = Math.min(traj.length - 1, 80);

  for (let k = 1; k <= KMAX; k++) {
    if (best && k > best.k + 16) break;
    const pt = traj[k];
    if (!pt || !mySide(pt.x)) continue;
    if (pt.y > 3.15 || pt.y < 0.04) continue;
    const aimX = courtX(team, pt.x - dir * 0.38);
    // 粗略可达性剪枝
    const reach = maxTravel(k * DT + 0.3, 0.62 + 0.38 * me.stamina / 100) + 1.5;
    if (Math.abs(aimX - me.x) > reach) continue;

    const variants = [];
    if (pt.y >= 1.9) {
      variants.push({ type: 1, jumpAt: Math.max(0, k - 4), swingAt: Math.max(0, k - 2) });
      variants.push({ type: 1, jumpAt: Math.max(0, k - 3), swingAt: Math.max(0, k - 2) });
      variants.push({ type: 1, jumpAt: -1, swingAt: Math.max(0, k - 2) });
    } else if (pt.y >= 1.15) {
      variants.push({ type: 1, jumpAt: -1, swingAt: Math.max(0, k - 2) });
      variants.push({ type: 1, jumpAt: -1, swingAt: Math.max(0, k - 4) });
    } else {
      variants.push({ type: -1, jumpAt: -1, swingAt: Math.max(0, k - 2) });
      variants.push({ type: -1, jumpAt: -1, swingAt: Math.max(0, k - 4) });
    }

    for (const v of variants) {
      const plan = simulatePlan(g, team, {
        aimX, jumpAt: v.jumpAt, swingAt: v.swingAt, type: v.type,
        readyX: courtX(team, rx), horizon: Math.min(k + 14, 95),
      });
      if (plan.hitFrame < 0 || !plan.strike) continue;
      const tr = traceVel(plan.strike.x, plan.strike.y, plan.strike.vx, plan.strike.vy);
      let score = evalShot(tr, opp, dir);
      if (plan.strike.y > 2.1) score += 5;
      if (!best || score > best.score) {
        best = { score, plan, k, v, tr, kind: plan.hitModel && plan.hitModel.kind };
      }
    }
  }

  if (!best) {
    const tx = pred.land ? courtX(team, pred.land.x - dir * 0.35) : courtX(team, rx);
    return { frames: idleFrames(me, tx), debug: { mode: 'chase-none', land: pred.land && pred.land.x } };
  }

  const frames = [];
  for (let i = 0; i < 10; i++) frames.push(best.plan.seq[i] || { ...NEUTRAL });
  return { frames, debug: { mode: 'hit', k: best.k, score: Math.round(best.score), kind: best.kind, hitX: best.plan.strike.x.toFixed(2), hitY: best.plan.strike.y.toFixed(2), land: best.tr.landX.toFixed(2), t: best.tr.landT.toFixed(2) } };
}

function idleFrames(me, targetX) {
  const seq = moveSeq(me, targetX, 10);
  return seq.map(mv => ({ move: mv, jump: false, swing: 0, charge: false, sprint: false }));
}

module.exports = { decide, moveCtrl, moveSeq, traceVel, evalShot, maxTravel, readyX, courtX };
