'use strict';
/* 决策核心（第 2 轮）：把观察重建为引擎状态，前向模拟候选击球方案并挑最优。
 *
 * 第 1 轮复盘得到的四条硬约束，本轮直接写进代码：
 *  1. 绝不碰自己刚打出的球（发球后 shuttle.lastTeam === 我方时禁止规划击球）。
 *  2. 接发杀球的唯一合法拦截方式是“预挥”：发球出手后约 10 帧起拍下手，
 *     等看到球再起拍一定来不及（实测第 31 帧后起拍全部失败）。
 *  3. 起跳很贵（−10 体力）且多数球地面拍面够得到，给起跳加高额分数成本。
 *  4. 引擎的 move 是“目标速度比例”，不是“加速度比例”；控制器按此重写。
 */
const sim = require('../../engine.js');
const core = require('../../core.js');
const { rules } = require('../../catalog.js');

const DT = 1 / rules.hz;
const NET = rules.netX;
const L = rules.courtLength;
const clamp = core.clamp;

const NEUTRAL = { move: 0, jump: false, swing: 0, charge: false, sprint: false };
const TUNE = {
  readyOff: 3.4, defOff: 3.4, freeSpeed: 3.18,
  allowJump: true, jumpMinStamina: 45, jumpCostHigh: 14, jumpCostLow: 24,
  serveDef: true, serveDefLead: 3, counterDef: true, counterLead: 0,
  serveStyle: 'auto', rushLead: 3, autoDefault: 'block', smashContactY: 2.12,
};

function readyX(team) { return team === 0 ? NET - TUNE.readyOff : NET + TUNE.readyOff; }
function defX(team) { return team === 0 ? NET - TUNE.defOff : NET + TUNE.defOff; }
function rushX(team) { return team === 0 ? NET - 0.35 : NET + 0.35; }
function courtX(team, x) {
  const lo = team === 0 ? 0.35 : NET + 0.35;
  const hi = team === 0 ? NET - 0.35 : L - 0.35;
  return clamp(x, lo, hi);
}

/* 速度控制器：引擎语义 move = 目标速度 / 当前最大速度，加速上限交给引擎。
 * 旧版写成了 (desired-vx)/(a*DT)，会在接近目标时把目标速度拉回 0，形成抖动。 */
function moveCtrl(me, targetX, hard) {
  const d = targetX - me.x;
  if (Math.abs(d) < 0.04 && Math.abs(me.vx) < 0.5) return 0;
  const tired = 0.62 + 0.38 * me.stamina / 100;
  const maxS = rules.playerSpeed * tired;
  const cap = hard ? maxS : Math.min(maxS, TUNE.freeSpeed);
  const brake = Math.sqrt(2 * 15 * Math.abs(d));
  const desired = Math.sign(d) * Math.min(cap, brake, Math.abs(d) * 9 + 0.3);
  return clamp(desired / maxS, -1, 1);
}

/* 一维推演：返回接下来 n 帧的 move 序列（与引擎同样的速度/摩擦模型） */
function moveSeq(me, targetX, n, stamina) {
  let x = me.x, vx = me.vx;
  const st = stamina == null ? me.stamina : stamina;
  const maxS = rules.playerSpeed * (0.62 + 0.38 * st / 100);
  const cap = Math.min(maxS, TUNE.freeSpeed);
  const seq = [];
  for (let i = 0; i < n; i++) {
    const d = targetX - x;
    let mv = 0;
    if (!(Math.abs(d) < 0.04 && Math.abs(vx) < 0.5)) {
      const brake = Math.sqrt(2 * 15 * Math.abs(d));
      const desired = Math.sign(d) * Math.min(cap, brake, Math.abs(d) * 9 + 0.3);
      mv = clamp(desired / maxS, -1, 1);
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

/* ---------------- 发球防守 ----------------
 * 我方发球后 (lastTeam === 我方, rally === 0)，对手常在网前最高点直接下压杀球。
 * 杀球从触球到落地只有 3~4 帧，看到球再起拍必然来不及：实测第 31 帧以后
 * 起拍全部失败，必须预挥。预挥时机优先用“上一次接发的触球帧偏移”学习，
 * 第一分才退回物理预测；触球高度决定冲网截击(rush)还是深位下手(block)。
 */

/* 从事件流学习对手上一次接我方发球的触球特征：
 *   h  = 触球高度（>=2.12 必出杀球；低于它多半是挑高/平高球）
 *   dt = 触球帧 - 发球帧（发球轨迹固定，对手的接发时机通常稳定）
 */
function serveHistory(g, team) {
  let cur = null, out = null;
  for (const e of g.events) {
    if (e.type === 'serve' && e.team === team) cur = e.frame;
    else if (e.type === 'point') cur = null;
    else if (cur != null && e.type === 'hit' && e.team !== team && e.frame > cur) {
      out = { h: e.y, dt: e.frame - cur, x: e.x };   // 发球后的第一拍就是接发
      cur = null;
    }
  }
  return out;
}
function currentServeFrame(g, team) {
  for (let i = g.events.length - 1; i >= 0; i--) {
    const e = g.events[i];
    if (e.type === 'serve' && e.team === team) return e.frame;
  }
  return null;
}
function useRush(g, team, hist) {
  if (TUNE.serveStyle === 'rush') return true;
  if (TUNE.serveStyle === 'block') return false;
  if (!hist) return TUNE.autoDefault === 'rush';
  return hist.h >= TUNE.smashContactY;
}

function serveDefense(g, team) {
  const me = g.batsmen[team], opp = g.batsmen[1 - team];
  const hist = serveHistory(g, team);
  const rush = useRush(g, team, hist);
  const rx = rush ? rushX(team) : courtX(team, defX(team));
  const seq = moveSeq(me, rx, 10);
  const frames = seq.map(mv => ({ move: mv, jump: false, swing: 0, charge: false, sprint: false }));
  let S = -1, src = 'none', c = null;
  if (hist) {
    // 已经见过对手的接发：只有高点（必出杀球）才预挥；低点球交给常规追击，
    // 不预挥就不会空挥。
    const sf = currentServeFrame(g, team);
    if (hist.h >= TUNE.smashContactY && sf != null) {
      S = sf + hist.dt - (rush ? TUNE.rushLead : TUNE.serveDefLead);
      src = 'learned';
    }
  } else {
    // 第一分：用物理预测估触球点
    const pred = core.predictShuttle(g, 45);
    c = predictContact(g, 1 - team, pred.pts, 2.32);
    if (c && c.y >= TUNE.smashContactY && c.distNet <= 1.8) {
      S = g.frame + c.frame - (rush ? TUNE.rushLead : TUNE.serveDefLead);
      src = 'predict';
    }
  }
  if (S >= 0) {
    const idx = S - g.frame - 1;
    if (idx >= 0 && idx <= 9) {
      frames[idx].swing = rush ? 1 : -1;
      frames[idx].move = 0;
    } else S = -1;
  }
  return {
    frames,
    debug: { mode: 'serveDef', style: rush ? 'rush' : 'block', swingAt: S, src,
      hist: hist ? { h: hist.h, dt: hist.dt, x: hist.x } : null },
  };
}

/* 通用的“对手最早触球”预测：假设对手以最大速度追球。
 * maxY 用地面拍面可及高度（2.32）；对手起跳会更早，但预挥容差可覆盖。 */
function predictContact(g, oppTeam, tr, maxY = 2.32) {
  const opp = g.batsmen[oppTeam];
  const facing = opp.facing;
  const tired = 0.62 + 0.38 * opp.stamina / 100;
  const maxS = rules.playerSpeed * tired;
  // 对手从当前位置出发、t 秒内能覆盖的最大距离（含初速）
  const maxDisp = (t, dir) => {
    let x = 0, vx = Math.max(0, opp.vx * dir);
    const dir0 = 1;
    for (let i = 0; i < Math.ceil(t / DT); i++) {
      vx += clamp(dir0 * maxS - vx, -rules.playerAccel * DT, rules.playerAccel * DT);
      x += vx * DT;
    }
    return x;
  };
  for (let i = 1; i < tr.length; i++) {
    const p = tr[i];
    const sideOk = oppTeam === 0 ? p.x <= NET + 0.25 : p.x >= NET - 0.25;
    if (!sideOk) continue;
    if (p.y > maxY || p.y < 0.30) continue;
    // 要在 p.x 处触球，身体应站在球后方约 0.45 格（拍面前伸）
    const bodyNeed = p.x - facing * 0.45;
    const dist = Math.abs(bodyNeed - opp.x);
    if (dist <= maxDisp(i * DT, Math.sign(bodyNeed - opp.x) || 1) + 0.05) {
      return { frame: i, x: p.x, y: p.y, distNet: Math.abs(p.x - NET), bodyNeed };
    }
  }
  return null;
}

/* 连续性防守：我方球在对方半场时，预测对手的高点回球（必为杀球），
 * 提前在防守位起拍下手，争取把第二拍杀球也接起来。 */
function counterDefense(g, team) {
  const me = g.batsmen[team];
  const rx = courtX(team, defX(team));
  const seq = moveSeq(me, rx, 10);
  const frames = seq.map(mv => ({ move: mv, jump: false, swing: 0, charge: false, sprint: false }));
  const pred = core.predictShuttle(g, 55);
  // 地面模型预测的触球通常略晚；对手若起跳会早 1~2 帧，靠 5 帧主动窗口覆盖。
  const c = predictContact(g, 1 - team, pred.pts, 2.32);
  let S = -1, cj = null;
  if (c && c.y >= 2.05 && c.frame >= 3) {
    cj = c;
    S = g.frame + c.frame + TUNE.counterLead;
    const idx = S - g.frame - 1;
    if (idx >= 0 && idx <= 9) {
      frames[idx].swing = -1;
      frames[idx].move = 0;
    } else S = -1;
  }
  return {
    frames,
    debug: { mode: 'counterDef', swingAt: S, contact: cj ? { f: g.frame + cj.frame, x: +cj.x.toFixed(2), y: +cj.y.toFixed(2) } : null },
  };
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
  if (g.phase === 'serve') {
    // 我方发球：球还冻结在发球点，站着回体力，等出手后再进入防守。
    if (g.server === team) { const h = serveHistory(g, team); const rush = useRush(g, team, h); return { frames: idleFrames(me, rush ? rushX(team) : courtX(team, defX(team))), debug: { mode: 'serveWait', style: rush ? 'rush' : 'block', hist: h } }; }
  }

  /* P0：球是我方打出的（发球后 / 上一拍之后），绝不规划击球。
   * 发球后进入预挥防守；其余情况回位回体力。 */
  if (g.shuttle.lastTeam === team) {
    if (g.rally === 0 && TUNE.serveDef) return serveDefense(g, team);
    if (TUNE.counterDef) return counterDefense(g, team);
    return { frames: idleFrames(me, courtX(team, defX(team))), debug: { mode: 'ownShot' } };
  }

  const pred = core.predictShuttle(g, 95);
  const traj = pred.pts;

  // 球会出界 / 落在对方半场 → 不碰，回位
  if (pred.land) {
    const landMine = (pred.land.x - NET) * dir < 0;
    if (pred.out || !landMine) {
      return { frames: idleFrames(me, courtX(team, rx)), debug: { mode: 'letgo', land: pred.land.x } };
    }
  }

  const mySide = x => (x - NET) * dir < 0.3;
  let best = null;
  const KMAX = Math.min(traj.length - 1, 80);
  const canJump = TUNE.allowJump && me.stamina > TUNE.jumpMinStamina && me.onGround;
  const jumpCost = me.stamina < 70 ? TUNE.jumpCostLow : TUNE.jumpCostHigh;

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
      if (canJump) {
        variants.push({ type: 1, jumpAt: Math.max(0, k - 4), swingAt: Math.max(0, k - 2) });
        variants.push({ type: 1, jumpAt: Math.max(0, k - 3), swingAt: Math.max(0, k - 2) });
      }
      variants.push({ type: 1, jumpAt: -1, swingAt: Math.max(0, k - 2) });
      variants.push({ type: 1, jumpAt: -1, swingAt: Math.max(0, k - 3) });
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
      if (score < -100) continue;
      if (plan.strike.y > 2.1) score += 5;
      if (v.jumpAt >= 0) score -= jumpCost;
      // 低体力时不建议用高消耗/高风险的高点球，优先把回合重置
      if (me.stamina < 30 && plan.strike.y > 1.9) score -= 12;
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
  return { frames, debug: { mode: 'hit', k: best.k, score: Math.round(best.score), kind: best.kind, jump: best.v.jumpAt >= 0, hitX: best.plan.strike.x.toFixed(2), hitY: best.plan.strike.y.toFixed(2), land: best.tr.landX.toFixed(2), t: best.tr.landT.toFixed(2) } };
}

function idleFrames(me, targetX) {
  const seq = moveSeq(me, targetX, 10);
  return seq.map(mv => ({ move: mv, jump: false, swing: 0, charge: false, sprint: false }));
}

module.exports = {
  decide, moveCtrl, moveSeq, traceVel, evalShot, maxTravel, readyX, courtX,
  serveHistory, serveDefense, TUNE,
};
