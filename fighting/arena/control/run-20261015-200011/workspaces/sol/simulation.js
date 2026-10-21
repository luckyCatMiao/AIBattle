'use strict';
/* 铁拳谱 / IRON CODEX — 帧精确格斗裁判。
 * 纯规则引擎：没有内置控制器（练习用电脑在文件末尾单独隔离），没有随机数，同样的输入必然得到同样的结果。
 *
 * 时间单位：一物理帧 = 1/20 秒。一次决策窗口 = 15 帧 = 0.75 秒，双方在此期间同时提交逐帧输入。
 *
 * 比赛结构：每方 3 名角色，车轮战。双方当前出场的角色单挑，败者退场，由该方下一名角色接替，
 * 胜者保留剩余生命继续。一方三名角色全部被击败则该方落败。
 */
const catalog = require('./catalog');
const { rules, characters } = catalog;

const DT = 1 / rules.hz;
const FRAMES_PER_DECISION = rules.decisionFrames;
const STAGE = rules.stage;
const GROUND = STAGE.ground;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = v => (v < 0 ? -1 : 1);

const isUp = d => d === 'U' || d === 'UF' || d === 'UB';
const isDown = d => d === 'D' || d === 'DF' || d === 'DB';
const isForward = d => d === 'F' || d === 'UF' || d === 'DF';
const isBack = d => d === 'B' || d === 'UB' || d === 'DB';
const isGuardDir = d => d === 'B' || d === 'DB';

/* ============================ 世界构造 ============================ */

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('格斗对局必须是两名选手');
  const g = {
    id, seed, now: 0, tick: 0, status: 'picking', winner: null, reason: '',
    nextId: 1, eventId: 0, hitstop: 0,
    players: players.map((v, i) => {
      if (!v || typeof v.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(v.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return {
        id: i, name: String(v.name).slice(0, 32), kind: v.kind,
        team: [], active: 0, eliminated: false, wins: 0,
        damageDealt: 0, hits: 0, blocks: 0, throws: 0, parries: 0, maxCombo: 0,
      };
    }),
    fighters: [], projectiles: [], events: [],
    round: 1, roundLog: [], frames: 0, roundFrames: 0, botAt: 0,
  };
  for (let i = 0; i < 2; i++) if (Array.isArray(players[i].team)) setTeam(g, i, players[i].team);
  if (g.players.every(p => p.team.length === rules.teamSize)) beginMatch(g);
  return g;
}

function setTeam(g, owner, team) {
  if (g.status !== 'picking') throw Error('选角阶段已结束');
  if (!g.players[owner]) throw Error('席位不存在');
  if (!Array.isArray(team) || team.length !== rules.teamSize) throw Error(`每方必须恰好选 ${rules.teamSize} 名角色`);
  const seen = new Set();
  for (const id of team) {
    if (!characters[id]) throw Error('未知角色：' + id);
    if (seen.has(id)) throw Error('同一方不能重复选择同一名角色');
    seen.add(id);
  }
  g.players[owner].team = team.slice();
}

/* ============================ 角色装配 ============================ */

function makeFighter(g, owner, charId, x, facing) {
  const c = characters[charId];
  if (!c) throw Error('未知角色：' + charId);
  return {
    id: 'f' + g.nextId++,
    owner, char: charId, def: c,
    x, y: GROUND, vx: 0, vy: 0, facing,
    hp: rules.health, maxHp: rules.health,
    meter: rules.meterStart, guard: rules.guardMax,
    state: 'stand', stateAt: 0,
    move: null,
    inputHistory: [], held: { dir: 'N', btn: null },
    hitTaken: 0, hitTakenAt: -999, hitstunLeft: 0, blockstunLeft: 0,
    invulnUntil: 0, armorUntil: 0,
    airborne: false, airMoveUsed: false,
    parryActive: 0, guardBreakAt: -999,
    lastMoveName: '', totalDamage: 0, totalHits: 0,
  };
}

function beginMatch(g) {
  g.status = 'playing';
  g.round = 1; g.roundFrames = 0; g.frames = 0; g.hitstop = 0;
  g.projectiles = [];
  g.fighters = [
    makeFighter(g, 0, g.players[0].team[0], 420, 1),
    makeFighter(g, 1, g.players[1].team[0], 860, -1),
  ];
  emit(g, 'round', { text: `第 1 局 · ${characters[g.players[0].team[0]].name} 对 ${characters[g.players[1].team[0]].name}` });
}

function emit(g, type, data = {}) { g.events.push({ id: ++g.eventId, t: Math.round(g.now * 1000) / 1000, frame: g.frames, type, ...data }); }
const opponent = (g, f) => g.fighters[1 - f.owner];

/* ============================ 判定盒 ============================ */

// 身体受击盒。六名角色完全一致——体型不构成优势。
function hurtbox(f) {
  const h = rules.pushbox;
  const height = f.state === 'crouch' ? h.h * 0.72 : h.h;
  return { x: f.x - h.w / 2, y: f.y - height, w: h.w, h: height };
}

// 招式判定盒：hitbox.x = 从身体中心朝前偏移，y = 相对脚底再向上偏移（负值表示在脚底上方）。按朝向镜像。
function hitboxes(f) {
  const m = f.move;
  if (!m || !m.data || !m.data.hitbox) return [];
  const st = m.data.startup || 0, ac = m.data.active || 0;
  if (m.frame < st || m.frame >= st + ac) return [];
  const h = m.data.hitbox;
  const box = { y: f.y + h.y, h: h.h, w: h.w };
  box.x = f.facing > 0 ? f.x + h.x - h.w / 2 : f.x - h.x - h.w / 2;
  return [box];
}

const overlaps = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;

/* ============================ 输入解析 ============================ */

function normalizeInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('每一帧的输入必须是对象');
  const dir = raw.dir === null || raw.dir === undefined ? 'N' : String(raw.dir).toUpperCase();
  const btn = raw.btn === null || raw.btn === undefined ? null : String(raw.btn).toUpperCase();
  if (!catalog.directionKeys.includes(dir)) throw Error('非法方向：' + raw.dir);
  if (btn !== null && !catalog.buttons.includes(btn)) throw Error('非法按钮：' + raw.btn);
  return { dir, btn };
}

function pushInput(f, input) {
  f.inputHistory.push(input);
  if (f.inputHistory.length > 30) f.inputHistory.shift();
  f.held = input;
}

// 「方向序列 + 按钮」检测：最后一帧的按钮必须匹配，方向序列在 12 帧内按倒序出现（允许夹入无关方向帧）。
function motionMatched(f, motion, btn) {
  const seq = catalog.parseMotion(motion);
  if (!seq) return false;
  const h = f.inputHistory;
  if (!h.length) return false;
  if (h[h.length - 1].btn !== btn) return false;
  let k = seq.length - 1, lookback = 12;
  for (let i = h.length - 1; i >= 0 && lookback >= 0; i--, lookback--) {
    if (h[i].dir === seq[k]) { k--; if (k < 0) return true; }
  }
  return false;
}

/* ============================ 动作发起 ============================ */

function startMove(g, f, name, data, kind) {
  const prevDepth = (f.move && f.move.linkDepth) || 0;
  f.state = (kind === 'stance') ? 'stance' : 'attack';
  f.stateAt = g.frames;
  f.move = {
    kind, name, data, frame: 0,
    hasHit: false, projectileFired: false,
    travelLeft: data.travel ? data.travel.frames : 0,
    hitsLeft: data.hits || 1, hitsDone: 0, hitsConsumed: 0,
    canCancelUntil: null,
    // 命中后可链接到下一个普通技的窗口（按招式总帧数推算）
    linkDepth: (kind === 'normal' || kind === 'air') ? (prevDepth || 1) : 0,
    linkKey: null,
    linkUntil: null,
  };
  if (kind === 'normal' || kind === 'air') {
    // 可链接窗口从判定帧一开始就打开，直到收招结束。
    // 必须这么宽：选手每 15 帧才提交一次输入，而且下一招自己也有起手帧。
    // 窗口太窄的话，在同一个决策窗口里根本打不出第二招，连段就形同虚设。
    const active = (data.active || 0);
    const total = (data.startup || 0) + active + (data.recovery || 0);
    f.move.linkFrom = (data.startup || 0) + 1;
    f.move.linkUntil = total;
  }
  f.lastMoveName = name;
  if (data.armor) f.armorUntil = g.frames + data.armor[1];
  if (data.invuln) f.invulnUntil = Math.max(f.invulnUntil, g.frames + data.invuln[1]);
  if (data.teleport && kind === 'move') f.move.teleported = false;
  emit(g, 'move', { owner: f.owner, name, x: Math.round(f.x), text: characters[f.char].name + ' 发动 ' + name });
}

const AIR_MOVE = {
  lp: { name: '空中轻拳', startup: 4, active: 6, recovery: 6, damage: 60, chip: 6, hitstun: 12, blockstun: 8, guard: 'overhead',
    hitbox: { x: 54, y: -30, w: 70, h: 46 }, pushback: 14, hitstop: 4, meterGain: 8, cancelable: false },
  hp: { name: '空中重拳', startup: 8, active: 6, recovery: 10, damage: 108, chip: 12, hitstun: 16, blockstun: 10, guard: 'overhead',
    hitbox: { x: 60, y: -34, w: 84, h: 52 }, pushback: 22, hitstop: 6, meterGain: 10, cancelable: false },
  lk: { name: '空中轻腿', startup: 4, active: 6, recovery: 6, damage: 58, chip: 6, hitstun: 12, blockstun: 8, guard: 'overhead',
    hitbox: { x: 56, y: -28, w: 72, h: 48 }, pushback: 14, hitstop: 4, meterGain: 8, cancelable: false },
  hk: { name: '空中重腿', startup: 9, active: 6, recovery: 12, damage: 114, chip: 13, hitstun: 17, blockstun: 11, guard: 'overhead',
    hitbox: { x: 62, y: -36, w: 90, h: 56 }, pushback: 24, hitstop: 6, meterGain: 10, cancelable: false },
};

// 决定本帧发起什么。优先级：超必杀 > 必杀 > 普通技。
// 「按下」是上升沿：同一按钮连续按住只算一次，所以长按不会自动连打。
function pressedEdge(f, btn) {
  const h = f.inputHistory;
  if (!h.length || h[h.length - 1].btn !== btn) return false;
  return h.length < 2 || h[h.length - 2].btn !== btn;
}

function tryStartMove(g, f) {
  const c = f.def;
  const last = f.inputHistory[f.inputHistory.length - 1];
  if (!last) return false;
  const btn = last.btn;

  if (f.airborne) {
    if (!btn || !pressedEdge(f, btn)) return false;
    for (const s of Object.values(c.specials)) {
      if (!s.airOnly || btn !== s.button) continue;
      startMove(g, f, s.name, s, 'special'); f.airMoveUsed = true; return true;
    }
    const key = { LP: 'lp', HP: 'hp', LK: 'lk', HK: 'hk' }[btn];
    if (key) {
      const m = AIR_MOVE[key];
      startMove(g, f, m.name, { ...m, kind: 'strike' }, 'air');
      f.airMoveUsed = true; return true;
    }
    return false;
  }

  if (!btn) return false;

  // 指令类招式允许按住不放（方向序列已经表达了意图），普通技与世界规则要求上升沿。
  if (f.meter >= c.super.cost && btn === c.super.button && motionMatched(f, c.super.motion, c.super.button)) {
    f.meter = 0;
    startMove(g, f, c.super.name, c.super, 'super');
    emit(g, 'super', { owner: f.owner, x: Math.round(f.x), text: characters[f.char].name + ' 发动超必杀 ' + c.super.name });
    return true;
  }

  for (const s of Object.values(c.specials)) {
    if (s.airOnly || btn !== s.button || !motionMatched(f, s.motion, s.button)) continue;
    if (s.kind === 'throw') {
      if (!pressedEdge(f, btn)) continue;
      const o = opponent(g, f);
      const near = Math.abs(o.x - f.x) <= s.range && !o.airborne && o.state !== 'down' && o.state !== 'ko' && o.invulnUntil <= g.frames;
      if (!near) continue;
      f.state = 'attack'; f.stateAt = g.frames;
      f.move = { kind: 'throw', name: s.name, data: s, frame: 0, hasHit: true, hitsLeft: 1, hitsDone: 1, hitsConsumed: 1, canCancelUntil: null };
      f.lastMoveName = s.name;
      resolveThrow(g, f, o, Math.round(s.damage * rules.throwScale));
      emit(g, 'throw', { owner: f.owner, x: Math.round(f.x), text: characters[f.char].name + ' 抓住对手！' });
      g.players[f.owner].throws++;
      return true;
    }
    if (s.kind === 'stance') {
      if (!pressedEdge(f, btn)) continue;
      startMove(g, f, s.name, s, 'stance');
      f.parryActive = g.frames + s.parryWindow;
      return true;
    }
    if (s.kind === 'move') {
      if (!pressedEdge(f, btn)) continue;
      startMove(g, f, s.name, s, 'move'); return true;
    }
    startMove(g, f, s.name, s, 'special');
    return true;
  }

  for (const [key, b] of [['lp', 'LP'], ['hp', 'HP'], ['lk', 'LK'], ['hk', 'HK']]) {
    if (btn === b && pressedEdge(f, btn)) {
      const m = f.airborne ? AIR_MOVE[key] : c.normals[key];
      startMove(g, f, m.name, m, f.airborne ? 'air' : 'normal');
      return true;
    }
  }
  return false;
}

/* ============================ 伤害结算 ============================ */

function scaleFor(i) {
  const s = rules.comboScale;
  return i < s.length ? s[i] : rules.minScale;
}

function resolveThrow(g, attacker, victim, damage) {
  victim.hp = Math.max(0, victim.hp - damage);
  victim.state = 'down'; victim.stateAt = g.frames;
  victim.airborne = false; victim.vx = 0; victim.vy = 0; victim.move = null;
  victim.invulnUntil = g.frames + 30 + rules.wakeupInvuln[1];
  attacker.meter = Math.min(rules.meterMax, attacker.meter + (attacker.def.specials.grab ? 16 : 10));
  g.players[attacker.owner].damageDealt += damage;
  g.players[attacker.owner].hits++;
  attacker.totalDamage += damage; attacker.totalHits++;
  emit(g, 'hit', { owner: attacker.owner, x: Math.round(victim.x), hard: true, damage, text: `投技命中 ${damage}` });
  if (victim.hp <= 0) knockout(g, victim);
}

function applyHit(g, attacker, victim, data, kind) {
  const now = g.frames;
  if (now - victim.hitTakenAt > 45) victim.hitTaken = 0;
  const scale = scaleFor(victim.hitTaken);
  const dmg = Math.max(1, Math.round((data.damage || 0) * scale));

  victim.hp = Math.max(0, victim.hp - dmg);
  victim.hitTaken += 1;
  victim.hitTakenAt = now;

  g.hitstop = Math.max(g.hitstop, data.hitstop || 4);

  attacker.totalDamage += dmg; attacker.totalHits += 1;
  attacker.meter = Math.min(rules.meterMax, attacker.meter + (data.meterGain || 0));
  victim.meter = Math.min(rules.meterMax, victim.meter + (data.meterGainOnHitAsVictim || 5));
  const P = g.players;
  P[attacker.owner].damageDealt += dmg;
  P[attacker.owner].hits++;
  P[attacker.owner].maxCombo = Math.max(P[attacker.owner].maxCombo, victim.hitTaken);

  if (data.knockup || data.launcher) {
    victim.state = 'hitstun'; victim.stateAt = now;
    victim.airborne = true;
    victim.vx = -victim.facing * 2.0;
    victim.vy = -(data.knockup || 12);
    victim.move = null;
  } else if (data.hardKnockdown) {
    victim.state = 'down'; victim.stateAt = now; victim.move = null; victim.airborne = false;
    victim.invulnUntil = now + 26 + rules.wakeupInvuln[1];
  } else {
    victim.state = 'hitstun'; victim.stateAt = now; victim.move = null;
    victim.airborne = false;
  }
  victim.hitstunLeft = data.hitstun || 12;
  applyPushback(g, attacker, victim, data.pushback || 20);
  emit(g, 'hit', { owner: attacker.owner, x: Math.round(victim.x), damage: dmg, combo: victim.hitTaken,
    text: `命中 ${dmg}` + (victim.hitTaken > 1 ? ` · ${victim.hitTaken} 连` : '') });
  if (victim.hp <= 0) knockout(g, victim);
  return dmg;
}

// 防御成立：削减、防御硬直、削防与气槽。防御不会致死。
function applyBlock(g, attacker, victim, data) {
  const chip = Math.max(0, Math.round(data.chip || 0));
  if (chip) victim.hp = Math.max(1, victim.hp - chip);
  victim.guard = Math.max(0, victim.guard - (chip ? 4 : 2));
  victim.state = 'blockstun'; victim.stateAt = g.frames;
  victim.blockstunLeft = data.blockstun || 7;
  victim.move = null;
  g.hitstop = Math.max(g.hitstop, Math.min(4, data.hitstop || 4));
  attacker.meter = Math.min(rules.meterMax, attacker.meter + (data.meterGainOnBlock || 3));
  victim.meter = Math.min(rules.meterMax, victim.meter + 2);
  applyPushback(g, attacker, victim, data.guardPushback || 14);
  g.players[victim.owner].blocks++;
  emit(g, 'block', { owner: victim.owner, x: Math.round(victim.x), text: chip ? `防御 · 削防 ${chip}` : '防御' });
  if (victim.guard <= 0) guardBreak(g, victim);
}

function applyPushback(g, attacker, victim, amount) {
  const dir = sign(victim.x - attacker.x) || -victim.facing;
  victim.vx += dir * amount * 0.16;
  attacker.vx += -dir * amount * 0.07;
}

function guardBreak(g, victim) {
  victim.guard = rules.guardMax * 0.35;
  victim.state = 'hitstun'; victim.stateAt = g.frames;
  victim.hitstunLeft = 30; victim.move = null;
  victim.guardBreakAt = g.frames;
  emit(g, 'guardBreak', { owner: victim.owner, x: Math.round(victim.x), text: characters[victim.char].name + ' 防御崩解！' });
}

function knockout(g, victim) {
  victim.state = 'ko'; victim.stateAt = g.frames; victim.move = null;
  victim.airborne = false; victim.vx = 0; victim.vy = 0;
  emit(g, 'ko', { owner: victim.owner, x: Math.round(victim.x), text: characters[victim.char].name + ' 被击败' });
  endRound(g, 1 - victim.owner, '击倒');
}

/* ============================ 回合与车轮战 ============================ */

function endRound(g, winnerOwner, reason) {
  if (g.status !== 'playing') return;
  const loserOwner = 1 - winnerOwner;
  const w = g.fighters[winnerOwner], l = g.fighters[loserOwner];
  g.players[winnerOwner].wins++;
  g.roundLog.push({
    round: g.round, frames: g.roundFrames,
    winner: g.players[winnerOwner].name, winnerChar: w.char, loserChar: l.char,
    winnerHp: Math.round(w.hp), loserHp: Math.round(Math.max(0, l.hp)), reason,
  });
  emit(g, 'roundEnd', { owner: winnerOwner, text: `第 ${g.round} 局：${characters[w.char].name} 胜（${reason}）` });

  g.players[loserOwner].active += 1;
  if (g.players[loserOwner].active >= rules.teamSize) {
    g.status = 'finished';
    g.winner = winnerOwner;
    g.reason = '车轮战全胜';
    g.players[loserOwner].eliminated = true;
    emit(g, 'matchEnd', { owner: winnerOwner, text: g.players[winnerOwner].name + ' 获胜（' + g.players[winnerOwner].wins + ' 局）' });
    return;
  }

  // 下一局：胜者保留剩余生命、气槽与防御槽，败者换人。
  const kept = { hp: w.hp, meter: w.meter, guard: w.guard };
  g.round += 1;
  g.roundFrames = 0;
  g.projectiles = [];
  g.fighters = [
    makeFighter(g, 0, g.players[0].team[g.players[0].active], 420, 1),
    makeFighter(g, 1, g.players[1].team[g.players[1].active], 860, -1),
  ];
  const next = g.fighters[winnerOwner];
  next.hp = Math.max(1, kept.hp);
  next.meter = kept.meter;
  next.guard = kept.guard;
  emit(g, 'round', { text: `第 ${g.round} 局 · ${characters[g.fighters[0].char].name} 对 ${characters[g.fighters[1].char].name}` });
}

/* ============================ 每帧推进 ============================ */

function step(g, dt = DT) {
  if (g.status !== 'playing') return g;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) throw Error('dt 必须在 (0, 0.25] 之间');

  if (g.hitstop > 0) {
    g.hitstop--;
  } else {
    updateProjectiles(g);
    for (const f of g.fighters) updateFighter(g, f);
    resolveHits(g);
    separate(g);
  }
  g.tick++; g.frames++; g.roundFrames++; g.now = g.frames * DT;

  // 生命归零就立即结算，不论是被判定命中还是被外部直接改动。
  if (g.status === 'playing') {
    const dead = g.fighters.find(f => f.hp <= 0 && f.state !== 'ko');
    if (dead) knockout(g, dead);
  }

  if (g.status === 'playing' && g.roundFrames >= rules.timer * rules.hz) {
    // 超时按「剩余生命的百分比」判定，不能按绝对值：
    // 车轮战里胜者保留残血继续，下一局要面对对方刚换上场的满血角色，
    // 拿绝对血量比较对残血的一方系统性不利，会直接把「拖时间」变成稳赢策略。
    const frac = f => f.hp / f.maxHp;
    const a = frac(g.fighters[0]), b = frac(g.fighters[1]);
    if (Math.abs(a - b) < 0.001) {
      g.status = 'finished'; g.winner = null;
      g.reason = '时间到，双方生命比例相同，判为平局';
      g.roundLog.push({ round: g.round, frames: g.roundFrames, winner: null, reason: '时间到平局' });
      emit(g, 'matchEnd', { text: '时间到，平局' });
    } else endRound(g, a > b ? 0 : 1, '时间到（生命比例较高）');
  }
  return g;
}

function updateFighter(g, f) {
  const now = g.frames;
  const o = opponent(g, f);
  const input = f.held;

  if (!f.airborne && f.state !== 'attack' && f.state !== 'hitstun' && f.state !== 'stance') f.facing = sign(o.x - f.x) || f.facing;

  if (f.state !== 'blockstun' && f.state !== 'hitstun' && f.state !== 'down')
    f.guard = Math.min(rules.guardMax, f.guard + rules.guardRegen);

  switch (f.state) {
    case 'ko': return tickKo(g, f);
    case 'attack': return tickAttack(g, f);
    case 'stance': return tickStance(g, f);
    case 'hitstun': return tickHitstun(g, f);
    case 'blockstun':
      f.blockstunLeft--;
      f.vx *= 0.85;
      if (f.blockstunLeft <= 0) { f.state = 'stand'; f.stateAt = now; }
      return applyPhysics(g, f);
    case 'down':
      f.vx *= 0.9;
      if (now - f.stateAt > 26 && !f.airborne) {
        f.state = 'wakeup'; f.stateAt = now;
        f.invulnUntil = Math.max(f.invulnUntil, now + rules.wakeupInvuln[1]);
      }
      return applyPhysics(g, f);
    case 'wakeup':
      f.vx *= 0.8;
      if (now - f.stateAt > 6) { f.state = 'stand'; f.stateAt = now; }
      return applyPhysics(g, f);
    case 'jump':
    case 'air':
      if (f.airborne) return tickAir(g, f);
      f.state = 'stand'; return tickGround(g, f, input);
    default:
      return tickGround(g, f, input);
  }
}

function tickKo(g, f) {
  f.vy += 0.9; f.y += f.vy; f.x += f.vx; f.vx *= 0.92;
  if (f.y >= GROUND) { f.y = GROUND; f.vy = 0; f.vx *= 0.6; }
  f.x = clamp(f.x, STAGE.wallLeft, STAGE.wallRight);
}

function tickHitstun(g, f) {
  if (f.airborne) {
    f.vy += 0.85; f.x += f.vx; f.y += f.vy; f.vx *= 0.985;
    if (f.y >= GROUND) {
      f.y = GROUND; f.vy = 0; f.airborne = false;
      f.state = 'down'; f.stateAt = g.frames;
      f.invulnUntil = Math.max(f.invulnUntil, g.frames + 4 + rules.wakeupInvuln[1]);
      emit(g, 'down', { owner: f.owner, x: Math.round(f.x) });
    }
  } else {
    f.vx *= 0.86; f.x += f.vx;
    f.hitstunLeft--;
    if (f.hitstunLeft <= 0) { f.state = 'stand'; f.stateAt = g.frames; }
  }
  f.x = clamp(f.x, STAGE.wallLeft, STAGE.wallRight);
}

function tickStance(g, f) {
  const m = f.move;
  if (!m) { f.state = 'stand'; return; }
  m.frame++;
  if (m.frame >= m.data.stance) {
    f.state = 'stand'; f.stateAt = g.frames; f.move = null; f.parryActive = 0;
  }
}

function tickAir(g, f) {
  if (f.state === 'jump' && !f.airMoveUsed && g.frames - f.stateAt >= 2) {
    if (tryStartMove(g, f)) { /* 已经转为 attack 状态 */ }
  }
  f.vy += 0.62; f.x += f.vx; f.y += f.vy;
  if (f.y >= GROUND && f.vy > 0) {
    f.y = GROUND; f.vy = 0; f.airborne = false; f.airMoveUsed = false;
    f.state = 'stand'; f.stateAt = g.frames;
  }
  f.x = clamp(f.x, STAGE.wallLeft, STAGE.wallRight);
}

function tickGround(g, f, input) {
  const dir = input.dir;

  if (f.state === 'dash') {
    f.x += f.facing * (rules.dashDistance / rules.dashFrames);
    if (g.frames - f.stateAt >= rules.dashFrames) { f.state = 'stand'; f.stateAt = g.frames; }
    return clampX(g, f);
  }
  if (f.state === 'backdash') {
    f.x -= f.facing * (rules.backdashDistance / rules.backdashFrames);
    if (g.frames - f.stateAt >= rules.backdashFrames) { f.state = 'stand'; f.stateAt = g.frames; }
    return clampX(g, f);
  }

  if (tryStartMove(g, f)) return;

  if (isUp(dir)) {
    f.state = 'jump'; f.stateAt = g.frames; f.airborne = true; f.airMoveUsed = false;
    f.vy = -Math.sqrt(2 * 0.62 * rules.jumpHeight);
    const fwd = isForward(dir), back = isBack(dir);
    f.vx = fwd ? f.facing * (rules.jumpForward / rules.jumpFrames)
      : back ? -f.facing * (rules.jumpBackward / rules.jumpFrames) : 0;
    emit(g, 'jump', { owner: f.owner, x: Math.round(f.x) });
    return clampX(g, f);
  }
  if (isDown(dir)) { f.state = 'crouch'; f.stateAt = g.frames; return; }
  f.state = 'stand';
  if (isForward(dir)) f.x += f.facing * f.def.speed;
  else if (isBack(dir)) f.x -= f.facing * f.def.speed * 0.78;
  return clampX(g, f);
}

function clampX(g, f) { f.x = clamp(f.x, STAGE.wallLeft, STAGE.wallRight); return f; }

function applyPhysics(g, f) { f.x += f.vx; f.vx *= 0.86; return clampX(g, f); }

function tickAttack(g, f) {
  const m = f.move;
  if (!m) { f.state = 'stand'; return; }
  m.frame++;

  if (m.data.travel && m.travelLeft > 0) {
    f.x += f.facing * (m.data.travel.distance / m.data.travel.frames);
    f.vx = 0; m.travelLeft--; clampX(g, f);
  }
  if (m.data.teleport && !m.teleported) {
    m.teleported = true;
    const t = m.data.teleport;
    if (t.toBehind) { const o = opponent(g, f); f.x = clamp(o.x - o.facing * Math.abs(t.distance), STAGE.wallLeft, STAGE.wallRight); }
    else f.x = clamp(f.x + f.facing * t.distance, STAGE.wallLeft, STAGE.wallRight);
    f.facing = sign(opponent(g, f).x - f.x) || f.facing;
  }

  if (m.data.projectile && !m.projectileFired && m.frame >= (m.data.startup || 0)) {
    spawnProjectile(g, f, m.data.projectile, m.name);
    m.projectileFired = true;
  }

  if (m.data.hits && m.data.hits > 1) {
    const per = Math.max(1, Math.floor((m.data.active || 1) / m.data.hits));
    const target = Math.min(m.data.hits, Math.floor(Math.max(0, m.frame - (m.data.startup || 0)) / per));
    if (target > m.hitsDone) m.hitsDone = target;
  }

  // 命中后的取消窗口：普通技可以取消成必杀/超必杀
  if ((m.kind === 'normal' || m.kind === 'air') && m.canCancelUntil !== null && g.frames <= m.canCancelUntil) {
    if (tryCancel(g, f)) return;
  }

  // 链接（连段）：普通技的判定帧一开始就可以接下一招，不必等命中结算。
  //
  // 为什么要开得这么早：一次决策提交 15 帧，而这 15 帧就是全部的可操作时间。
  // 如果链接必须等到命中确认（第 startup+1 帧）才响应，第二招的起手帧就会被推出窗口，
  // 连段在 15 帧粒度下根本无法成立。判定帧内提前输入即为「取消」，这是格斗游戏的标准约定，
  // 打空则会白交一帧——这正是操作水平的体现。
  if ((m.kind === 'normal' || m.kind === 'air') && m.frame >= (m.data.startup || 0)) {
    if (tryLink(g, f)) return;
  }

  const total = (m.data.startup || 0) + (m.data.active || 0) + (m.data.recovery || 0) + (m.data.cinematic || 0);
  if (m.frame >= total) {
    f.state = 'stand'; f.stateAt = g.frames; f.move = null;
    if (f.airborne) f.state = 'air';
  }
}

// 取消：普通技命中后可以接必杀技或超必杀（不能接普通技，避免无限连）。
function tryCancel(g, f) {
  const c = f.def;
  const last = f.inputHistory[f.inputHistory.length - 1];
  if (!last || !last.btn) return false;
  if (f.meter >= c.super.cost && last.btn === c.super.button && motionMatched(f, c.super.motion, c.super.button)) {
    f.meter = 0;
    startMove(g, f, c.super.name, c.super, 'super');
    emit(g, 'super', { owner: f.owner, x: Math.round(f.x), text: characters[f.char].name + ' 取消接超必杀 ' + c.super.name });
    return true;
  }
  for (const s of Object.values(c.specials)) {
    if (s.airOnly || s.kind === 'throw' || s.kind === 'stance' || s.kind === 'move') continue;
    if (last.btn !== s.button || !motionMatched(f, s.motion, s.button)) continue;
    startMove(g, f, s.name, s, 'special');
    return true;
  }
  return false;
}

/* 链接（连段）：命中后，在对手受击硬直结束前用下一招接上。
 *
 * 判定依据是「上一招造成的硬直帧数」减去「下一招的起手帧数」，为负才连得成：
 *   轻拳命中 → 11 帧硬直；接轻腿（起手 5）→ 刚好成立
 *   轻拳命中 → 11 帧硬直；接重拳（起手 11）→ 卡在临界，必须提前输入
 *   重腿命中 → 19 帧硬直；接重拳（起手 11）→ 成立
 * 所以「怎么连」由帧数据决定，选手读不读得懂 catalog 会直接体现在这里。
 * 硬性限制：一段连段最多三个普通技，同一按钮不能连续重复（挡住无脑连打）。 */
function tryLink(g, f) {
  const m = f.move;
  if (!m || !m.hasHit) return false;
  const last = f.inputHistory[f.inputHistory.length - 1];
  if (!last || !last.btn || !pressedEdge(f, last.btn)) return false;
  const key = { LP: 'lp', HP: 'hp', LK: 'lk', HK: 'hk' }[last.btn];
  if (!key) return false;
  const prev = m.linkKey || '';
  if (m.linkDepth >= 3) return false;
  if (prev === key) return false;
  const opp = opponent(g, f);
  // 对手必须在受击硬直里——这一条就是连段的定义。
  if (opp.state !== 'hitstun') return false;
  const next = { ...f.def.normals[key] };
  startMove(g, f, next.name, next, 'normal');
  f.move.linkDepth = (m.linkDepth || 1) + 1;
  f.move.linkKey = key;
  return true;
}

/* ============================ 投射物 ============================ */

function spawnProjectile(g, owner, p, label) {
  const x = owner.x + owner.facing * 72;
  const y = owner.y - 62;
  g.projectiles.push({
    id: 'p' + g.nextId++, owner: owner.owner,
    x, y, vx: p.speed * owner.facing, vy: 0,
    w: p.w, h: p.h, life: p.life || 120,
    data: p, color: p.color || '#dfe7f5',
    fuseAt: p.fuse || 0, arc: p.arc || null, arcFrame: 0, dead: false,
  });
  emit(g, 'projectile', { owner: owner.owner, x: Math.round(x), text: characters[owner.char].name + ' 发射 ' + (label || '投射物') });
}

function updateProjectiles(g) {
  for (const p of g.projectiles) {
    if (p.dead) continue;
    if (p.arc) {
      p.arcFrame++;
      p.x += (p.arc.distance / p.arc.frames) * sign(p.vx || 1);
      p.y = GROUND - 62 - Math.sin(Math.PI * Math.min(1, p.arcFrame / p.arc.frames)) * p.arc.height;
      if (p.arcFrame >= p.arc.frames) { p.arc = null; p.vx = 0; p.y = GROUND - 20; }
    } else {
      p.x += p.vx; p.y += p.vy;
    }
    if (p.fuseAt > 0) { p.fuseAt--; if (p.fuseAt <= 0) { p.dead = true; explode(g, p); continue; } }
    p.life--;
    if (p.life <= 0 || p.x < 0 || p.x > STAGE.width) p.dead = true;
  }
  g.projectiles = g.projectiles.filter(p => !p.dead);
}

function explode(g, p) {
  const box = { x: p.x - p.w, y: p.y - p.h, w: p.w * 2, h: p.h * 2 };
  for (const f of g.fighters) {
    if (f.owner === p.owner || f.hp <= 0 || f.invulnUntil > g.frames) continue;
    if (!overlaps(box, hurtbox(f))) continue;
    applyHit(g, g.fighters[p.owner], f, p.data, 'projectileHit');
  }
  emit(g, 'explode', { owner: p.owner, x: Math.round(p.x), text: '缚雷引爆' });
}

/* ============================ 命中判定 ============================ */

function resolveHits(g) {
  for (const atk of g.fighters) {
    if (atk.hp <= 0) continue;
    const m = atk.move;
    if (!m || !m.data) continue;
    if (m.kind === 'throw' || m.kind === 'move' || m.kind === 'stance') continue;
    const def = opponent(g, atk);
    if (def.hp <= 0) continue;

    const boxes = hitboxes(atk);
    if (!boxes.length) continue;

    // 单段招式命中一次即止；多段招式每段最多命中一次
    const multi = !!(m.data.hits && m.data.hits > 1);
    if (!multi && m.hasHit) continue;
    if (multi && m.hitsDone <= m.hitsConsumed) continue;

    for (const box of boxes) {
      if (!overlaps(box, hurtbox(def))) continue;
      // 命中后立刻进入受击/防御状态：非多段招式的判定帧不允许重复结算。
      const consumed = multi ? m.hitsDone : 1;
      if (multi) m.hitsConsumed = m.hitsDone;
      if (!multi) m.hasHit = true;

      if (def.invulnUntil > g.frames) { emit(g, 'whiff', { owner: atk.owner, x: Math.round(def.x), text: '无敌帧躲开' }); break; }

      // 架式格挡：吃下伤害并立即反击
      if (def.state === 'stance' && def.parryActive > g.frames && def.move) {
        const sp = def.def.specials.parry;
        def.hp = Math.max(1, def.hp - Math.round((m.data.damage || 0) * sp.channelDamage));
        def.parryActive = 0;
        g.players[def.owner].parries++;
        def.meter = Math.min(rules.meterMax, def.meter + (sp.meterOnParry || 20));
        g.hitstop = Math.max(g.hitstop, 8);
        emit(g, 'parry', { owner: def.owner, x: Math.round(def.x), text: '架式格挡！' });
        startMove(g, def, sp.riposte.name || '架式反击', { ...sp.riposte, kind: 'strike' }, 'special');
        break;
      }

      // 霸体：吃下这一击继续进攻
      if (def.armorUntil > g.frames && def.state === 'attack') {
        const dmg = Math.round((m.data.damage || 0) * 0.5);
        def.hp = Math.max(1, def.hp - dmg);
        g.hitstop = Math.max(g.hitstop, 4);
        emit(g, 'armor', { owner: def.owner, x: Math.round(def.x), text: `霸体吃下 ${dmg}` });
        break;
      }

      const guardType = m.data.guard || 'mid';
      const blocking = (def.state === 'stand' || def.state === 'crouch' || def.state === 'blockstun') && isGuardDir(def.held.dir);
      const crouchBlock = def.held.dir === 'DB';
      let guarded = false;
      if (blocking) {
        if (guardType === 'mid') guarded = true;
        else if (guardType === 'low') guarded = crouchBlock;
        else if (guardType === 'overhead') guarded = !crouchBlock;
      }

      if (guarded) {
        applyBlock(g, atk, def, m.data);
        m.hasHit = true;
      } else {
        applyHit(g, atk, def, m.data, m.kind);
        m.hasHit = true;
        // 允许链接与取消的截止点：多给 2 帧，让判定帧内的后续帧也能接招
        m.canCancelUntil = g.frames + Math.max(6, (m.data.strikeAdvantage || 10));
      }
      // 命中标记在整个判定期间保持有效，供链接使用
      m.hitAt = g.frames;
      break;
    }
    if (g.status !== 'playing') return;
  }

  for (const p of g.projectiles) {
    if (p.dead) continue;
    if (p.data.fuse && p.arc) continue;
    if (p.data.fuse && p.fuseAt > 0) continue;
    const box = { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
    for (const f of g.fighters) {
      if (f.owner === p.owner || f.hp <= 0) continue;
      if (!overlaps(box, hurtbox(f))) continue;
      if (f.invulnUntil > g.frames) continue;
      const attacker = g.fighters[p.owner];
      // 超必杀的反弹属性可以把投射物打回去
      if (f.state === 'attack' && f.move && f.move.data.reflect
        && f.move.frame >= (f.move.data.startup || 0) && f.move.frame < (f.move.data.startup || 0) + (f.move.data.active || 0)) {
        p.owner = f.owner; p.vx = -p.vx * 1.35;
        emit(g, 'reflect', { owner: f.owner, x: Math.round(p.x), text: '弹开投射物！' });
        continue;
      }
      const blocking = (f.state === 'stand' || f.state === 'crouch' || f.state === 'blockstun') && isGuardDir(f.held.dir);
      const crouchBlock = f.held.dir === 'DB';
      const guardType = p.data.low ? 'low' : 'mid';
      const guarded = blocking && (guardType === 'mid' ? true : crouchBlock);
      if (guarded) applyBlock(g, attacker, f, p.data);
      else applyHit(g, attacker, f, p.data, 'projectileHit');
      p.dead = true;
      break;
    }
  }
  g.projectiles = g.projectiles.filter(p => !p.dead);
}

function separate(g) {
  const [a, b] = g.fighters;
  if (a.hp <= 0 || b.hp <= 0) return;
  const half = rules.pushbox.w;
  const d = b.x - a.x, abs = Math.abs(d);
  if (abs >= half || abs < 0.001) return;
  const push = (half - abs) / 2, dir = sign(d);
  if (a.airborne && !b.airborne) b.x += dir * push * 2;
  else if (b.airborne && !a.airborne) a.x -= dir * push * 2;
  else { a.x -= dir * push; b.x += dir * push; }
  clampX(g, a); clampX(g, b);
}

/* ============================ 决策窗口 ============================ */

function submitWindow(g, owner, inputs) {
  if (g.status !== 'playing') throw Error('对局未在进行中');
  const f = g.fighters[owner];
  if (!f || f.hp <= 0) throw Error('该席位当前没有出场角色');
  if (!Array.isArray(inputs)) throw Error('inputs 必须是数组');
  if (inputs.length > FRAMES_PER_DECISION) throw Error(`一个决策窗口最多 ${FRAMES_PER_DECISION} 帧输入`);
  const norm = [];
  for (let i = 0; i < FRAMES_PER_DECISION; i++) norm.push(inputs[i] === undefined ? { dir: 'N', btn: null } : normalizeInput(inputs[i]));
  return norm;
}

// 双方都提交后由裁判调用：逐帧灌入输入并推进 15 帧。
function advanceWindow(g, windowInputs) {
  if (g.status !== 'playing') return g;
  for (let i = 0; i < FRAMES_PER_DECISION && g.status === 'playing'; i++) {
    for (let owner = 0; owner < 2; owner++) {
      const f = g.fighters[owner];
      if (!f || f.hp <= 0) continue;
      const w = windowInputs[owner];
      pushInput(f, w && w[i] ? w[i] : { dir: 'N', btn: null });
    }
    step(g);
  }
  return g;
}

/* ============================ 观察快照 ============================ */

function publicFighter(f) {
  const m = f.move;
  return {
    id: f.id, owner: f.owner, char: f.char, name: f.def.name, archetype: f.def.archetype,
    x: Math.round(f.x * 10) / 10, y: Math.round(f.y * 10) / 10,
    vx: Math.round(f.vx * 100) / 100, vy: Math.round(f.vy * 100) / 100,
    facing: f.facing, hp: Math.round(f.hp), maxHp: f.maxHp,
    meter: Math.round(f.meter), guard: Math.round(f.guard),
    state: f.state, airborne: f.airborne,
    move: m ? { name: m.name, kind: m.kind, frame: m.frame, startup: m.data.startup || 0, active: m.data.active || 0, recovery: m.data.recovery || 0 } : null,
    invulnerable: f.invulnUntil > g_now(f),
    armored: f.armorUntil > g_now(f),
    combo: f.hitTaken,
  };
}
// publicFighter 需要当前帧号；用一个闭包外的可变引用避免层层传参。
let CURRENT_FRAME = 0;
const g_now = () => CURRENT_FRAME;

function snapshot(g, owner = null) {
  CURRENT_FRAME = g.frames;
  return {
    id: g.id, seed: g.seed, now: Math.round(g.now * 1000) / 1000, tick: g.tick,
    frame: g.frames, roundFrame: g.roundFrames,
    status: g.status, winner: g.winner, reason: g.reason, yourPlayer: owner,
    round: g.round, roundLog: g.roundLog,
    players: g.players.map(p => ({
      id: p.id, name: p.name, kind: p.kind, team: p.team, active: p.active,
      eliminated: p.eliminated, wins: p.wins,
      damageDealt: Math.round(p.damageDealt), hits: p.hits, blocks: p.blocks,
      throws: p.throws, parries: p.parries, maxCombo: p.maxCombo, score: score(g, p),
    })),
    fighters: g.fighters.map(publicFighter),
    projectiles: g.projectiles.map(p => ({ id: p.id, owner: p.owner, x: Math.round(p.x), y: Math.round(p.y), w: p.w, h: p.h, fuse: p.fuseAt || 0, color: p.color })),
    events: g.events.slice(-120),
    stage: STAGE,
    rules: {
      hz: rules.hz, decisionFrames: rules.decisionFrames, timer: rules.timer,
      health: rules.health, meterMax: rules.meterMax, guardMax: rules.guardMax,
      teamSize: rules.teamSize, comboScale: rules.comboScale, minScale: rules.minScale,
      decisionSeconds: rules.decisionFrames / rules.hz,
    },
    catalog: characters,
  };
}

function score(g, p) {
  return Math.round(p.damageDealt + p.hits * 40 + p.blocks * 12 + p.throws * 180 + p.parries * 200 + p.maxCombo * 150);
}

/* ---------- 导出 ---------- */

module.exports = {
  createMatch, setTeam, beginMatch, step, advanceWindow, submitWindow,
  snapshot, score, emit, normalizeInput, bot,
  DT, FRAMES_PER_DECISION, characters, rules,
  hurtbox, hitboxes, overlaps, motionMatched, AIR_MOVE,
};
