'use strict';
// 搜索引擎：从观察重建对局状态，用公开规则逐帧模拟「我的候选窗口 × 对手模型」，选综合得分最高的窗口。
globalThis.bot = null; // simulation.js 导出了已移除的 bot，补一个全局占位
const path = require('path');
const sim = require(path.join(__dirname, 'simulation.js'));
const { characters, rules } = sim;
const readline = require('readline');

const N = (dir = 'N', btn = null) => ({ dir, btn });

function findMoveData(f, name, kind) {
  const c = characters[f.char];
  for (const k of Object.keys(sim.AIR_MOVE)) if (sim.AIR_MOVE[k].name === name) return { ...sim.AIR_MOVE[k], kind: 'strike' };
  for (const m of Object.values(c.normals)) if (m.name === name) return m;
  for (const m of Object.values(c.specials)) if (m.name === name) return m;
  if (c.super.name === name) return c.super;
  if (c.specials.parry) return { ...c.specials.parry.riposte, kind: 'strike' };
  return null;
}

function lastEventFrame(obs, pred) {
  const ev = obs.events || [];
  for (let i = ev.length - 1; i >= 0; i--) if (pred(ev[i])) return ev[i].frame;
  return null;
}

function rebuild(obs, myHist) {
  const teams = obs.players.map(p => p.team);
  const g = sim.createMatch({ players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  g.players.forEach((p, i) => { p.team = teams[i].slice(); p.active = obs.players[i].active; });
  g.status = 'playing'; g.roundLog = (obs.roundLog || []).slice();
  g.fighters = [0, 1].map(i => ({ id: obs.fighters[i].id, owner: i, char: obs.fighters[i].char, maxHp: 1000, parryActive: 0, guardBreakAt: -999, airMoveUsed: false, lastMoveName: '', totalDamage: 0, totalHits: 0, hitTaken: 0 }));
  g.frames = obs.frame; g.tick = obs.tick; g.roundFrames = obs.roundFrame; g.round = obs.round;
  g.events = [];
  g.fighters = obs.fighters.map((of, i) => {
    const f = { ...g.fighters[i] };
    Object.assign(f, {
      char: of.char, def: characters[of.char], x: of.x, y: of.y, vx: of.vx, vy: of.vy, facing: of.facing,
      hp: of.hp, meter: of.meter, guard: of.guard, state: of.state, airborne: of.airborne,
      hitTaken: of.combo || 0, inputHistory: [], held: N(),
    });
    const now = obs.frame;
    f.invulnUntil = of.invulnerable ? now + 3 : 0;
    f.armorUntil = of.armored ? now + 4 : 0;
    const hitF = lastEventFrame(obs, e => (e.type === 'hit') && e.owner !== i);
    f.hitTakenAt = hitF !== null ? hitF : -999;
    f.stateAt = now - 3;
    if (of.state === 'hitstun') f.hitstunLeft = Math.max(2, 12 - (hitF !== null ? now - hitF : 6));
    if (of.state === 'blockstun') f.blockstunLeft = 4;
    if (of.state === 'down') { const d = lastEventFrame(obs, e => (e.type === 'down' && e.owner === i) || (e.type === 'hit' && e.hard && e.owner !== i)); f.stateAt = d !== null ? d : now - 10; }
    if (of.state === 'jump' || of.state === 'air') { f.stateAt = now - 8; f.airMoveUsed = of.state === 'air'; }
    if (of.move) {
      const data = findMoveData(f, of.move.name, of.move.kind) || { startup: of.move.startup, active: of.move.active, recovery: of.move.recovery };
      f.move = { kind: of.move.kind, name: of.move.name, data, frame: of.move.frame, hasHit: false, projectileFired: !!data.projectile && of.move.frame >= (data.startup || 0),
        travelLeft: data.travel ? Math.max(0, data.travel.frames - of.move.frame) : 0, hitsLeft: data.hits || 1, hitsDone: 0, hitsConsumed: 0,
        canCancelUntil: null, linkDepth: 1, linkKey: null, linkFrom: (data.startup || 0) + 1, linkUntil: 99, teleported: true };
      if (data.hits > 1) { const per = Math.max(1, Math.floor((data.active || 1) / data.hits)); const t = Math.min(data.hits, Math.floor(Math.max(0, of.move.frame - (data.startup || 0)) / per)); f.move.hitsDone = f.move.hitsConsumed = t; }
      if (of.move.kind === 'stance') f.parryActive = now + Math.max(0, 16 - of.move.frame);
    } else f.move = null;
    if (i === obs.yourPlayer && myHist) f.inputHistory = myHist.slice(-30);
    return f;
  });
  g.projectiles = (obs.projectiles || []).map(p => {
    const owner = g.fighters[p.owner];
    const sp = Object.values(characters[owner.char].specials).find(s => s.projectile);
    const data = sp ? sp.projectile : { speed: 8, damage: 80, chip: 10, hitstun: 14, blockstun: 9, w: p.w, h: p.h };
    const dir = sign(g.fighters[1 - p.owner].x - p.x);
    const q = { id: p.id, owner: p.owner, x: p.x, y: p.y, vx: data.speed * dir, vy: 0, w: p.w, h: p.h, life: 100, data, fuseAt: p.fuse || 0, arc: null, arcFrame: 0, dead: false };
    if (data.arc && data.fuse) { const af = data.fuse - (p.fuse || 0); if (af < data.arc.frames) { q.arc = data.arc; q.arcFrame = af; q.vx = dir; } }
    return q;
  });
  return g;
}
const sign = v => (v < 0 ? -1 : 1);

function clone(g) {
  const c = { ...g, players: g.players.map(p => ({ ...p })), events: [], roundLog: g.roundLog.slice() };
  c.fighters = g.fighters.map(f => ({ ...f, inputHistory: f.inputHistory.slice(), held: { ...f.held }, move: f.move ? { ...f.move } : null }));
  c.projectiles = g.projectiles.map(p => ({ ...p }));
  return c;
}

/* ---------- 计划生成 ---------- */
const fill = (arr, n = 15, pad = N('B')) => { const a = arr.slice(0, n); while (a.length < n) a.push(pad); return a; };
const rep = (x, n) => Array.from({ length: n }, () => ({ ...x }));
const MOT = { qcf: ['D', 'DF', 'F'], qcb: ['D', 'DB', 'B'], dp: ['F', 'D', 'DF'], hcb: ['F', 'DF', 'D', 'DB', 'B'] };
function motion(m, btn, hold = 4) { const s = MOT[m]; return [...s.slice(0, -1).map(d => N(d)), ...rep(N(s[s.length - 1], btn), hold)]; }
// 普通技连打 + 取消：每个按钮按一帧放一帧，最后一段方向与按钮同帧并多按几帧以穿过命中停顿
function chain(btns, cancel) {
  const out = [];
  for (const b of btns) { out.push(N('N', b)); out.push(N('N', null)); out.push(N('N', b)); out.push(N('N', null)); }
  if (cancel) out.push(...motion(cancel.motion, cancel.button, 5));
  return out;
}

function myPlans(f, opp) {
  const c = characters[f.char], P = [];
  const add = (name, frames, tail) => P.push({ name, frames: fill(frames), tail: tail || 'B' });
  add('后退防御', rep(N('B'), 15));
  add('蹲防', rep(N('DB'), 15), 'DB');
  add('前进', rep(N('F'), 15));
  add('前进后防', [...rep(N('F'), 7), ...rep(N('B'), 8)]);
  add('后退', rep(N('B'), 15));
  add('站立', rep(N('N'), 15), 'N');
  add('前跳', [N('UF'), ...rep(N('N'), 14)]);
  add('后跳', [N('UB'), ...rep(N('N'), 14)]);
  for (const t of [4, 7, 10, 13]) for (const b of ['HK', 'HP', 'LK']) add(`前跳${b}@${t}`, [N('UF'), ...rep(N('N'), t - 1), N('N', b), ...rep(N('N'), 14)]);
  add('垂直跳HP', [N('U'), ...rep(N('N'), 5), N('N', 'HP')]);
  const specials = Object.entries(c.specials).filter(([, s]) => !s.airOnly);
  const cancelable = specials.filter(([, s]) => s.kind !== 'throw' && s.kind !== 'stance' && s.kind !== 'move').map(([, s]) => s);
  for (const [k, s] of specials) for (const d of [0, 4, 8, 11]) {
    if (s.motion === 'hcb' && d > 9) continue;
    add(`${s.name}@${d}`, [...rep(N('B'), d), ...motion(s.motion, s.button, s.kind === 'throw' || s.kind === 'stance' || s.kind === 'move' ? 1 : 3)]);
  }
  for (const d of [0, 5]) for (const [, s] of specials) if (s.airOnly) add(`跳${s.name}@${d}`, [N('UF'), ...rep(N('N'), 3 + d), ...motion(s.motion, s.button, 2)]);
  if (f.meter >= 100) for (const d of [0, 3, 6, 9]) add(`超必杀@${d}`, [...rep(N('B'), d), ...motion(c.super.motion, c.super.button, 4)]);
  const norms = ['LP', 'LK', 'HP', 'HK'];
  for (const walk of [0, 4, 8]) {
    const pre = rep(N('F'), walk);
    for (const b of norms) {
      add(`走${walk}+${b}`, [...pre, N('N', b)]);
      add(`走${walk}+${b}蹲`, [...pre, N('D', b)], 'DB');
      for (const s of cancelable) add(`走${walk}+${b}>${s.name}`, [...pre, ...chain([b], s)]);
      for (const b2 of norms) if (b2 !== b) {
        add(`走${walk}+${b}${b2}`, [...pre, ...chain([b, b2])]);
        for (const s of cancelable) if (walk === 0) add(`${b}${b2}>${s.name}`, [...pre, ...chain([b, b2], s)]);
      }
    }
  }
  add('LP LK HK', chain(['LP', 'LK', 'HK']));
  for (const s of cancelable) add(`LP LK HP>${s.name}`, chain(['LP', 'LK', 'HP'], s));
  if (f.meter >= 100) for (const b of norms) add(`${b}>超必杀`, [N('N', b), N('N'), ...motion(c.super.motion, c.super.button, 6)]);
  return P;
}

// 对手模型：以对手自身朝向写的相对输入
function oppModels(o) {
  const c = characters[o.char], M = [];
  const add = (name, w, frames, tail) => M.push({ name, w, frames: fill(frames, 30, N(tail || 'B')) });
  add('站立', 1, rep(N('N'), 30), 'N');
  add('站防', 1.2, rep(N('B'), 30));
  add('蹲防', 1, rep(N('DB'), 30), 'DB');
  add('前进', 1.2, rep(N('F'), 30), 'F');
  add('前进轻拳', 1, [...rep(N('F'), 4), ...chain(['LP', 'LK'])]);
  add('轻腿连', 1, [...chain(['LK', 'LP'])]);
  add('前进重拳', 0.8, [...rep(N('F'), 6), N('N', 'HP')]);
  add('重腿', 0.6, [N('N', 'HK')]);
  add('前跳攻', 0.8, [N('UF'), ...rep(N('N'), 9), N('N', 'HK')]);
  for (const s of Object.values(c.specials)) {
    if (s.airOnly) { add('跳' + s.name, 0.4, [N('UF'), ...rep(N('N'), 5), ...motion(s.motion, s.button, 2)]); continue; }
    add(s.name, 0.7, motion(s.motion, s.button, 2));
    add(s.name + '迟', 0.6, [...rep(N('B'), 7), ...motion(s.motion, s.button, 2)]);
  }
  if (o.meter >= 100) add('超必杀', 0.8, motion(c.super.motion, c.super.button, 3));
  const later = M.length; // 「下一窗口才出手」：前 15 帧防御，后 15 帧进攻
  for (const m of M.slice(4, later)) M.push({ name: '后' + m.name, w: m.w * 0.5, frames: [...rep(N('B'), 15), ...m.frames.slice(0, 15)] });
  return M;
}

const PREF = { kestrel: [260, 420], aegis: [180, 330], vex: [110, 220], torv: [70, 180], nyx: [200, 360], sable: [160, 300] };

function evaluate(g0, me, plan, model) {
  const g = clone(g0);
  const opp = 1 - me;
  const hp0 = [g.fighters[0].hp, g.fighters[1].hp];
  const fids = g.fighters.map(f => f.id);
  const TAIL = 15;
  let tailBtn = 'B';
  for (let i = 0; i < 15 + TAIL && g.status === 'playing'; i++) {
    if (g.fighters[0].id !== fids[0] || g.fighters[1].id !== fids[1]) break;
    const mine = i < 15 ? plan.frames[i] : N(plan.tail);
    const theirs = model.frames[i] || N('B');
    for (let o = 0; o < 2; o++) {
      const f = g.fighters[o];
      const inp = o === me ? mine : theirs;
      f.inputHistory.push(inp); if (f.inputHistory.length > 30) f.inputHistory.shift(); f.held = inp;
    }
    sim.step(g);
  }
  const roundOver = g.fighters[0].id !== fids[0] || g.fighters[1].id !== fids[1] || g.status !== 'playing';
  const log = g.roundLog[g.roundLog.length - 1];
  if (roundOver && g.roundLog.length > g0.roundLog.length) {
    const wonByMe = g.status === 'finished' ? g.winner === me : (log && log.loserChar === g0.fighters[opp].char && g.players[opp].active > g0.players[opp].active);
    return wonByMe ? 5000 : -5000;
  }
  const M = g.fighters[me], O = g.fighters[opp];
  let s = (hp0[opp] - O.hp) * 1.0 - (hp0[me] - M.hp) * 1.15;
  s += (M.meter - g0.fighters[me].meter) * 0.4;
  s -= (g0.fighters[me].guard - M.guard) * 1.5;
  s += (g0.fighters[opp].guard - O.guard) * 0.8;
  // 结束时的处境：对手在硬直/倒地加分，自己处于收招被惩罚风险扣分
  if (O.state === 'hitstun' || O.state === 'down') s += 25;
  if (M.state === 'hitstun' || M.state === 'down') s -= 25;
  const dist = Math.abs(M.x - O.x);
  const [lo, hi] = PREF[M.char] || [150, 300];
  if (dist < lo) s -= (lo - dist) * 0.06; else if (dist > hi) s -= (dist - hi) * 0.06;
  // 靠墙被压扣分
  const wallDist = M.facing > 0 ? M.x - rules.stage.wallLeft : rules.stage.wallRight - M.x;
  if (wallDist < 90) s -= (90 - wallDist) * 0.15;
  // 领先时偏保守
  return s;
}

function decide(obs, myHist) {
  const me = obs.yourPlayer;
  const g0 = rebuild(obs, myHist);
  const f = g0.fighters[me], o = g0.fighters[1 - me];
  const plans = myPlans(f, o), models = oppModels(o);
  // 领先比例越大越保守（决着阶段对领先者有利）
  const lead = f.hp / f.maxHp - o.hp / o.maxHp;
  const late = obs.roundFrame > (rules.timer - rules.finishSeconds - 10) * rules.hz;
  const minW = lead > 0.05 ? (late ? 0.7 : 0.5) : 0.3;
  const t0 = Date.now();
  let best = null;
  const W = models.reduce((a, m) => a + m.w, 0);
  for (const p of plans) {
    if (Date.now() - t0 > 2600) break;
    let sum = 0, mn = Infinity;
    for (const m of models) { const v = evaluate(g0, me, p, m); sum += v * m.w; mn = Math.min(mn, v); }
    const score = (1 - minW) * sum / W + minW * mn;
    if (!best || score > best.score) best = { plan: p, score, mean: sum / W, min: mn };
  }
  return { inputs: best.plan.frames, note: `${best.plan.name} 均${best.mean.toFixed(0)} 底${best.min.toFixed(0)}`, plans: plans.length, models: models.length, ms: Date.now() - t0 };
}

module.exports = { decide, rebuild, clone, myPlans, oppModels, evaluate };

if (require.main === module) {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', line => {
    let out;
    try { const req = JSON.parse(line); out = decide(req.obs, req.hist || []); }
    catch (e) { out = { error: String(e && e.stack || e) }; }
    process.stdout.write(JSON.stringify(out) + '\n');
  });
}
