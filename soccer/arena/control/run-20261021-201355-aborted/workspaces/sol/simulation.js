'use strict';
/* 3V3 足球 · 确定性模拟。
 * 20 Hz 固定步长；每个决策窗口 20 帧（1 秒）。
 * 双方各 3 名球员；球是实体，可带球、传球、射门、抢断。
 * 无随机数：相同种子 + 相同输入，逐帧结果完全一致。 */

const catalog = require('./catalog');
const {
  rules, GOALS, SPAWNS, BALL_SPAWN, TILE, W, H, EMPTY, WALL,
  buildField, auditField, inGoalMouth,
} = catalog;

const DT = 1 / rules.hz;
const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};
const DIR_KEYS = Object.keys(DIRS);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round3 = v => Math.round(v * 1000) / 1000;
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

function emit(g, type, data = {}) {
  g.events.push({ id: ++g.eventId, t: Math.round(g.frame / rules.hz * 1000) / 1000, frame: g.frame, type, ...data });
}

/* ============================ 世界构造 ============================ */

function makeUnit(g, team, index) {
  return {
    id: 't' + team + 'u' + index,
    team, index,
    name: g.players[team].name + ' #' + (index + 1),
    x: 0, y: 0,
    facing: { x: team === 0 ? 1 : -1, y: 0 },
    held: { dir: 'N', aim: null, kick: false },
    inputHistory: [],
    kickCd: 0, controlLock: 0, stealLock: 0,
    goals: 0, kicks: 0, touches: 0,
  };
}

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('足球必须是两名选手');
  const g = {
    id, seed, status: 'playing', phase: 'live', winner: null, reason: '', eventId: 0,
    players: players.map((p, i) => {
      if (!p || typeof p.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(p.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return { id: i, name: String(p.name).slice(0, 32), kind: p.kind, wins: 0 };
    }),
    frame: 0, tick: 0, half: 1, score: [0, 0],
    golden: false, goldenEnd: 0, freeze: 0,
    tiles: buildField(), mapAudit: null,
    units: [], ball: null,
    stats: [{ kicks: 0, possession: 0 }, { kicks: 0, possession: 0 }],
    events: [], humanInput: null,
  };
  g.mapAudit = auditField(g.tiles);
  for (let team = 0; team < 2; team++) {
    for (let i = 0; i < rules.teamSize; i++) g.units.push(makeUnit(g, team, i));
  }
  kickoff(g, '开场', 0);
  return g;
}

/* ============================ 开球 / 进球 ============================ */

function resetUnit(u, team, index) {
  const [tx, ty] = SPAWNS[team][index];
  u.x = tx + 0.5; u.y = ty + 0.5;
  u.facing = { x: team === 0 ? 1 : -1, y: 0 };
  u.held = { dir: 'N', aim: null, kick: false };
  u.kickCd = 0; u.controlLock = 0; u.stealLock = 0;
}

function kickoff(g, text, freezeFrames = Math.round(rules.kickoffFreeze * rules.hz)) {
  for (const u of g.units) resetUnit(u, u.team, u.index);
  g.ball = {
    x: BALL_SPAWN.x, y: BALL_SPAWN.y, vx: 0, vy: 0,
    owner: null, lastTouch: null, lastTeam: null,
  };
  g.freeze = Math.max(0, freezeFrames);
  g.phase = g.golden ? 'golden' : 'live';
  emit(g, 'kickoff', { text });
}

function goal(g, team) {
  const last = g.ball.lastTouch ? g.units.find(u => u.id === g.ball.lastTouch) : null;
  const ownGoal = !last || last.team !== team;
  const scorer = last ? last.name : '乌龙球';
  g.score[team]++;
  if (last && !ownGoal) last.goals++;
  emit(g, 'goal', {
    team, scorer: last ? last.id : null, ownGoal,
    score: [...g.score],
    text: `进球！${g.players[team].name} ${g.score[0]} : ${g.score[1]}${ownGoal ? '（乌龙）' : ''}`,
  });
  if (g.golden) { finish(g, team, '金球制胜'); return; }
  kickoff(g, `中圈开球 · ${g.players[team].name} 进球`, Math.round(rules.kickoffFreeze * rules.hz));
}

function finish(g, winner, reason) {
  if (g.status === 'finished') return;
  g.status = 'finished'; g.phase = 'finished';
  g.winner = winner; g.reason = reason;
  emit(g, 'end', { text: reason });
}

function checkClock(g) {
  if (g.status !== 'playing') return;
  const halfFrames = Math.round(rules.halfSeconds * rules.hz);
  const matchFrames = Math.round(rules.matchSeconds * rules.hz);

  if (!g.golden) {
    if (g.half === 1 && g.frame >= halfFrames) {
      g.half = 2;
      emit(g, 'half', { text: '下半场开始' });
      kickoff(g, '下半场开球');
    }
    if (g.frame >= matchFrames) {
      if (g.score[0] === g.score[1]) {
        g.golden = true; g.phase = 'golden';
        g.goldenEnd = g.frame + Math.round(rules.goldenGoalSeconds * rules.hz);
        emit(g, 'golden', { text: '常规时间战平，金球决胜' });
      } else {
        finish(g, g.score[0] > g.score[1] ? 0 : 1, '常规时间结束');
      }
    }
  } else if (g.frame >= g.goldenEnd) {
    finish(g, null, '金球未分胜负，平局');
  }
}

/* ============================ 移动 / 碰撞 ============================ */

const tileIndex = (x, y) => y * W + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
function tileAt(g, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!inBounds(tx, ty)) return WALL;
  return g.tiles[tileIndex(tx, ty)];
}

function circleHitsWall(g, x, y, r) {
  const k = r * Math.SQRT1_2;
  const pts = [
    [x - r, y], [x + r, y], [x, y - r], [x, y + r],
    [x - k, y - k], [x + k, y - k], [x - k, y + k], [x + k, y + k],
  ];
  return pts.some(([px, py]) => tileAt(g, px, py) === WALL);
}
const ballHitsWall = (g, x, y) => circleHitsWall(g, x, y, rules.ballRadius);

function moveUnit(g, u, dx, dy) {
  const r = rules.unitRadius;
  let nx = u.x + dx;
  if (!circleHitsWall(g, nx, u.y, r)) u.x = nx;
  else {
    // 贴墙滑动：尝试沿墙方向的小步
    const slide = Math.sign(dx) * r * 0.5;
    if (!circleHitsWall(g, u.x + slide, u.y, r)) u.x += slide;
  }
  let ny = u.y + dy;
  if (!circleHitsWall(g, u.x, ny, r)) u.y = ny;
  else {
    const slide = Math.sign(dy) * r * 0.5;
    if (!circleHitsWall(g, u.x, u.y + slide, r)) u.y += slide;
  }
  u.x = clamp(u.x, r, W - r);
  u.y = clamp(u.y, r, H - r);
}

function separateUnits(g) {
  const r2 = rules.unitRadius * 2;
  for (let i = 0; i < g.units.length; i++) {
    for (let j = i + 1; j < g.units.length; j++) {
      const a = g.units[i], b = g.units[j];
      let dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= r2 || d < 1e-6) continue;
      const push = (r2 - d) / 2;
      dx /= d; dy /= d;
      const ax = a.x - dx * push, ay = a.y - dy * push;
      const bx = b.x + dx * push, by = b.y + dy * push;
      if (!circleHitsWall(g, ax, ay, rules.unitRadius)) { a.x = ax; a.y = ay; }
      if (!circleHitsWall(g, bx, by, rules.unitRadius)) { b.x = bx; b.y = by; }
    }
  }
}

/* ============================ 单位动作 ============================ */

function aimVector(aim) {
  if (typeof aim === 'number' && Number.isFinite(aim)) {
    const a = aim * Math.PI / 180;
    return { x: Math.cos(a), y: Math.sin(a), angle: a };
  }
  if (typeof aim === 'string' && DIRS[aim] && aim !== 'N') {
    const [x, y] = DIRS[aim];
    return { x, y, angle: Math.atan2(y, x) };
  }
  return null;
}

function updateUnit(g, u) {
  if (u.kickCd > 0) u.kickCd--;
  if (u.controlLock > 0) u.controlLock--;
  if (u.stealLock > 0) u.stealLock--;

  const inp = u.held || {};
  const dir = DIRS[inp.dir] || DIRS.N;
  const aim = aimVector(inp.aim);
  if (aim) u.facing = { x: aim.x, y: aim.y };
  else if (dir[0] || dir[1]) u.facing = { x: dir[0], y: dir[1] };

  if (dir[0] || dir[1]) moveUnit(g, u, dir[0] * rules.moveSpeed * DT, dir[1] * rules.moveSpeed * DT);

  if (inp.kick && g.ball.owner === u.id && u.kickCd <= 0 && u.controlLock <= 0) kickBall(g, u);
}

function kickBall(g, u) {
  const b = g.ball;
  const f = norm(u.facing.x, u.facing.y);
  const angle = Math.atan2(f.y, f.x);
  const off = rules.unitRadius + rules.ballRadius + 0.03;
  b.owner = null;
  b.x = u.x + f.x * off;
  b.y = u.y + f.y * off;
  if (ballHitsWall(g, b.x, b.y)) { b.x = u.x; b.y = u.y; }
  b.vx = f.x * rules.kickPower;
  b.vy = f.y * rules.kickPower;
  b.lastTouch = u.id; b.lastTeam = u.team;
  u.kickCd = Math.round(rules.kickCooldown * rules.hz);
  u.controlLock = Math.round(rules.controlLock * rules.hz);
  u.kicks++; g.stats[u.team].kicks++;
  emit(g, 'kick', { team: u.team, unit: u.id, x: round3(b.x), y: round3(b.y), angle: round3(angle) });
}

/* ============================ 球 ============================ */

function updateBall(g) {
  const b = g.ball;
  if (b.owner) {
    const u = g.units.find(x => x.id === b.owner);
    if (!u) { b.owner = null; return; }
    const off = rules.dribbleDistance;
    b.x = u.x + u.facing.x * off;
    b.y = u.y + u.facing.y * off;
    if (ballHitsWall(g, b.x, b.y)) { b.x = u.x; b.y = u.y; }
    b.vx = 0; b.vy = 0;
    tryPossession(g);
    return;
  }

  // 快速球用子步推进，避免穿过球门线或薄墙
  const steps = 4;
  for (let s = 0; s < steps; s++) {
    b.x += b.vx * DT / steps;
    b.y += b.vy * DT / steps;

    if (inGoalMouth(b.x, b.y)) {
      if (b.x <= 1.0) { goal(g, 1); return; }
      if (b.x >= W - 1.0) { goal(g, 0); return; }
    }

    if (ballHitsWall(g, b.x, b.y)) {
      // 按轴回退，撞哪面墙就翻哪一轴
      const px = b.x - b.vx * DT / steps;
      const py = b.y - b.vy * DT / steps;
      if (ballHitsWall(g, b.x, py)) { b.x = px; b.vx = -b.vx * rules.wallRestitution; }
      if (ballHitsWall(g, px, b.y)) { b.y = py; b.vy = -b.vy * rules.wallRestitution; }
      if (ballHitsWall(g, b.x, b.y)) { b.x = px; b.y = py; b.vx = -b.vx * rules.wallRestitution; b.vy = -b.vy * rules.wallRestitution; }
    }
  }

  b.vx *= rules.ballFriction;
  b.vy *= rules.ballFriction;
  if (Math.hypot(b.vx, b.vy) < 0.02) { b.vx = 0; b.vy = 0; }

  tryPossession(g);
}

function nearestEligible(g, x, y, filter) {
  let best = null, bestD = Infinity;
  for (const u of g.units) {
    if (filter && !filter(u)) continue;
    const d = Math.hypot(u.x - x, u.y - y);
    if (d < bestD) { bestD = d; best = u; }
  }
  return { u: best, d: bestD };
}

function tryPossession(g) {
  const b = g.ball;
  if (b.owner) {
    const owner = g.units.find(u => u.id === b.owner);
    if (!owner) { b.owner = null; return; }
    const ownerD = Math.hypot(owner.x - b.x, owner.y - b.y);
    const { u: thief, d } = nearestEligible(g, b.x, b.y,
      u => u.team !== owner.team && u.stealLock <= 0 && u.controlLock <= 0);
    if (thief && d < rules.controlRadius && d + rules.tackleMargin < ownerD) {
      b.owner = thief.id; b.lastTouch = thief.id; b.lastTeam = thief.team;
      thief.touches++;
      owner.stealLock = Math.round(rules.stealLock * rules.hz);
      emit(g, 'tackle', { team: thief.team, unit: thief.id, from: owner.id });
    }
    return;
  }

  const { u, d } = nearestEligible(g, b.x, b.y, u => u.controlLock <= 0 && u.stealLock <= 0);
  if (u && d < rules.controlRadius) {
    b.owner = u.id; b.lastTouch = u.id; b.lastTeam = u.team;
    u.touches++;
    b.vx = 0; b.vy = 0;
  }
}

/* ============================ 主循环 ============================ */

function step(g) {
  if (g.status !== 'playing') return;
  g.frame++; g.tick++;

  if (g.freeze > 0) { g.freeze--; checkClock(g); return; }

  for (const u of g.units) updateUnit(g, u);
  separateUnits(g);
  updateBall(g);
  if (g.ball.owner) {
    const u = g.units.find(x => x.id === g.ball.owner);
    if (u) g.stats[u.team].possession++;
  }
  checkClock(g);
}

function normalizeUnitInput(input) {
  const out = { dir: 'N', aim: null, kick: false };
  if (input == null) return out;
  if (typeof input !== 'object' || Array.isArray(input)) throw Error('单位输入必须是对象');
  if (input.dir != null) {
    if (!DIR_KEYS.includes(input.dir)) throw Error('非法方向: ' + input.dir);
    out.dir = input.dir;
  }
  if (input.aim != null) {
    if (typeof input.aim === 'number' && Number.isFinite(input.aim)) out.aim = input.aim;
    else if (typeof input.aim === 'string' && DIR_KEYS.includes(input.aim)) out.aim = input.aim;
    else throw Error('aim 必须是方向名或角度（度）');
  }
  if (input.kick != null) out.kick = !!input.kick;
  return out;
}

function normalizeFrame(frame) {
  if (!Array.isArray(frame) || frame.length !== rules.teamSize) {
    throw Error(`每一帧必须是 ${rules.teamSize} 个单位的输入数组`);
  }
  return frame.map(normalizeUnitInput);
}

function submitWindow(g, team, frames) {
  if (team !== 0 && team !== 1) throw Error('team 必须是 0 或 1');
  if (!Array.isArray(frames) || frames.length !== rules.decisionFrames) {
    throw Error(`窗口必须包含 ${rules.decisionFrames} 帧`);
  }
  return frames.map(normalizeFrame);
}

function advanceWindow(g, windows) {
  let steps = 0;
  for (let i = 0; i < rules.decisionFrames && g.status === 'playing'; i++) {
    for (const u of g.units) {
      const frame = windows[u.team] && windows[u.team][i];
      u.held = (frame && frame[u.index]) || { dir: 'N', aim: null, kick: false };
      u.inputHistory.push(u.held);
      if (u.inputHistory.length > 8) u.inputHistory.shift();
    }
    step(g);
    steps++;
  }
  return steps;
}

/* ============================ 观察 ============================ */

function publicUnit(u, g) {
  return {
    id: u.id, team: u.team, index: u.index, name: u.name,
    x: round3(u.x), y: round3(u.y),
    facing: { x: round3(u.facing.x), y: round3(u.facing.y) },
    hasBall: !!g.ball && g.ball.owner === u.id,
    kickCd: round3(u.kickCd / rules.hz),
    controlLock: round3(u.controlLock / rules.hz),
    goals: u.goals, kicks: u.kicks, touches: u.touches,
  };
}

const publicBall = b => ({
  x: round3(b.x), y: round3(b.y),
  vx: round3(b.vx), vy: round3(b.vy),
  owner: b.owner, lastTouch: b.lastTouch, lastTeam: b.lastTeam,
});

function timeLeft(g) {
  if (g.golden) return Math.max(0, (g.goldenEnd - g.frame) / rules.hz);
  return Math.max(0, rules.matchSeconds - g.frame / rules.hz);
}

function commonState(g, viewer = null) {
  return {
    id: g.id, seed: g.seed, tick: g.tick, frame: g.frame,
    status: g.status, phase: g.phase, winner: g.winner, reason: g.reason,
    yourTeam: viewer,
    players: g.players.map(p => ({ ...p })),
    score: [...g.score], half: g.half,
    timeLeft: Math.round(timeLeft(g) * 10) / 10,
    golden: g.golden,
    goldenLeft: g.golden ? Math.round(Math.max(0, (g.goldenEnd - g.frame) / rules.hz) * 10) / 10 : null,
    freeze: Math.round(g.freeze / rules.hz * 10) / 10,
    stats: g.stats.map(s => ({ ...s })),
    units: g.units.map(u => publicUnit(u, g)),
    ball: publicBall(g.ball),
    map: { width: W, height: H, tiles: Array.from(g.tiles), goals: GOALS, spawns: SPAWNS },
    rules: { ...rules },
    events: g.events.slice(-140),
  };
}

const snapshot = g => commonState(g, null);
const view = (g, team) => commonState(g, team);

module.exports = {
  createMatch, step, advanceWindow, submitWindow,
  normalizeUnitInput, normalizeFrame, snapshot, view,
  emit,
  circleHitsWall, tileAt, inBounds,
  DT, rules, TILE, W, H,
};
