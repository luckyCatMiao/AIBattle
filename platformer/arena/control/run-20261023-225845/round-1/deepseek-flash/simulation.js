'use strict';
/* 横版闯关竞速 · 确定性模拟。
 * 20 Hz；每 5 帧一个决策窗口。随机生成的横版关卡，两名玩家从起点出发，
 * 先摸到终点旗帜者赢一局；掉坑/碰怪回到起点重跑；后面的人可以推前面的人。 */

const { rules, TILE_EMPTY, TILE_GROUND, TILE_BRICK, clamp, makeRng } = require('./catalog');

const DT = 1 / rules.hz;
const round2 = v => Math.round(v * 100) / 100;

function emit(g, type, data = {}) {
  g.events.push({ id: ++g.eventId, t: round2(g.frame / rules.hz), frame: g.frame, type, ...data });
}

/* ============================ 关卡生成 ============================ */

function generateLevel(seed) {
  const rng = makeRng((Number(seed) || 1) * 7919 + 104729);
  const w = rules.minWidth + Math.floor(rng() * (rules.maxWidth - rules.minWidth + 1));
  const h = rules.height;
  const tiles = new Uint8Array(w * h);
  const put = (x, y) => { if (x >= 0 && x < w && y >= 0 && y < h) tiles[y * w + x] = TILE_GROUND; };

  const fillGround = (x0, x1, top = rules.groundY) => {
    for (let x = x0; x <= x1; x++) for (let y = top; y < h; y++) put(x, y);
  };

  // 起点与终点保证平地
  fillGround(0, 11);
  fillGround(w - 13, w - 1);

  let x = 12;
  while (x < w - 14) {
    const kind = rng();
    if (kind < 0.42) {
      const len = 4 + Math.floor(rng() * 6);
      fillGround(x, x + len - 1);
      x += len;
    } else if (kind < 0.72) {
      // 坑（2–3 格，跳得过去）
      x += 2 + Math.floor(rng() * 2);
      const len = 4 + Math.floor(rng() * 5);
      fillGround(x, x + len - 1);
      x += len;
    } else {
      // 台阶（1 格高，保证跳得上去），后面接平地
      const step = 1;
      const len = 2 + Math.floor(rng() * 3);
      fillGround(x, x + len - 1, rules.groundY - step);
      x += len;
      fillGround(x, x + 4);
      x += 5;
    }
  }
  // 浮空砖块（可选路线/装饰）
  for (let i = 0; i < 6; i++) {
    const bx = 16 + Math.floor(rng() * (w - 40));
    const by = rules.groundY - 5 - Math.floor(rng() * 2);
    const bl = 3 + Math.floor(rng() * 3);
    for (let k = 0; k < bl; k++) {
      const yy = by * w + bx + k;
      if (bx + k < w) tiles[yy] = TILE_BRICK;
    }
  }
  return { w, h, tiles, goalX: w - rules.goalPad, startX: 2.5, rng };
}

const tileIndex = (g, tx, ty) => ty * g.w + tx;

function solidAt(g, tx, ty) {
  if (tx < 0 || tx >= g.w) return true;
  if (ty < 0 || ty >= g.h) return false;
  // 世界坐标 y 向上；格子行 ty 对应世界高度 [h-ty-1, h-ty]
  return g.tiles[tileIndex(g, tx, ty)] !== TILE_EMPTY;
}

// 世界坐标（y 向上，脚底 y=0）→ 是否实心
function solidWorld(g, x, y) {
  const tx = Math.floor(x);
  const ty = g.h - 1 - Math.floor(y);
  return solidAt(g, tx, ty);
}

function solidBox(g, l, b, r, t) {
  const x0 = Math.floor(l), x1 = Math.floor(r - 1e-9);
  const y0 = Math.floor(b), y1 = Math.floor(t - 1e-9);
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) if (solidWorld(g, x + 0.5, y + 0.5)) return true;
  return false;
}

/* ============================ 玩家与怪物 ============================ */

function makePlayer(team, name, g) {
  return {
    id: 'p' + team, team, index: team, name,
    x: g.startX + team * 0.9, prevX: g.startX + team * 0.9, y: g.h - rules.groundY,
    vx: 0, vy: 0, onGround: true, facing: 1,
    held: { move: 0, jump: false },
    invuln: 0, deaths: 0, finished: false, finishTime: null, maxX: g.startX,
    inputHistory: [],
  };
}

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('闯关竞速必须是两名选手');
  const g = {
    id, seed: Number(seed) || 1,
    status: 'playing', phase: 'freeze', winner: null, reason: '', eventId: 0,
    players: players.map((p, i) => {
      if (!p || typeof p.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(p.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return { id: i, name: String(p.name).slice(0, 32), kind: p.kind, wins: 0 };
    }),
    frame: 0, tick: 0, round: 1, wins: [0, 0],
    roundLeft: rules.roundSeconds, freezeLeft: 1.0,
    runners: [], monsters: [], events: [],
  };
  g.rng = makeRng(g.seed * 2654435761 + 12345);
  setupRound(g);
  emit(g, 'ready', { text: '准备' });
  return g;
}

function setupRound(g) {
  const level = generateLevel(g.seed * 131 + g.round * 977);
  g.w = level.w; g.h = level.h; g.tiles = level.tiles;
  g.goalX = level.goalX; g.startX = level.startX; g.rng = level.rng;
  g.runners = [];
  for (let team = 0; team < 2; team++) {
    const name = g.players[team].name;
    g.runners.push(makePlayer(team, name, g));
  }
  g.monsters = [];
  g.monsterTimer = rules.monsterSpawnMin + g.rng() * (rules.monsterSpawnMax - rules.monsterSpawnMin);
  g.roundLeft = rules.roundSeconds;
  g.freezeLeft = 1.0;
  g.phase = 'freeze';
}

/* ============================ 物理 ============================ */

function updateRunner(g, p) {
  if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - DT);
  const inp = p.held || {};
  const move = clamp(Number(inp.move) || 0, -1, 1);
  const accel = (p.onGround ? rules.accel : rules.airAccel);
  const target = move * rules.moveSpeed;
  if (move !== 0) {
    p.vx += clamp(target - p.vx, -accel * DT, accel * DT);
    p.facing = move > 0 ? 1 : -1;
  } else if (p.onGround) {
    p.vx *= Math.exp(-rules.friction * DT);
    if (Math.abs(p.vx) < 0.05) p.vx = 0;
  }
  if (inp.jump && p.onGround) { p.vy = rules.jumpSpeed; p.onGround = false; }
  p.vy = Math.max(-rules.maxFall, p.vy - rules.gravity * DT);

  p.prevX = p.x;
  // X
  p.x += p.vx * DT;
  const half = rules.playerW / 2;
  let l = p.x - half, r = p.x + half, b = p.y, t = p.y + rules.playerH;
  if (solidBox(g, l, b, r, t)) {
    if (p.vx > 0) p.x = Math.floor(r) - half - 1e-4;
    else if (p.vx < 0) p.x = Math.floor(l) + 1 + half + 1e-4;
    p.vx = 0;
  }
  // Y
  p.y += p.vy * DT;
  l = p.x - half; r = p.x + half; b = p.y; t = p.y + rules.playerH;
  if (solidBox(g, l, b, r, t)) {
    if (p.vy <= 0) { p.y = Math.floor(b) + 1 + 1e-4; p.vy = 0; p.onGround = true; }
    else { p.y = Math.floor(t) - rules.playerH - 1e-4; p.vy = 0; }
  } else p.onGround = false;

  if (!Number.isFinite(p.y) || p.y < -3) respawn(g, p, '掉坑');
  p.maxX = Math.max(p.maxX, p.x);
}

function respawn(g, p, reason) {
  p.deaths++;
  p.x = g.startX + p.team * 0.9;
  p.y = g.h - rules.groundY;
  p.vx = 0; p.vy = 0; p.onGround = true; p.invuln = 2.0;
  // 回到起点重跑：把起点附近的怪物清掉，避免复活即死循环。
  g.monsters = g.monsters.filter(m => m.x > g.startX + 12);
  emit(g, 'respawn', { team: p.team, reason, x: p.x, y: p.y });
}

/* 后面的人推前面的人；前面的人能挡住，但推不动后面的。 */
function resolvePush(g) {
  const [a, b] = g.runners;
  const half = rules.playerW / 2;
  const overlapX = Math.min(a.x + half, b.x + half) - Math.max(a.x - half, b.x - half);
  if (overlapX <= 0) return;
  const overlapY = Math.min(a.y + rules.playerH, b.y + rules.playerH) - Math.max(a.y, b.y);
  if (overlapY <= 0.3) return;
  const rear = a.x <= b.x ? a : b;
  const front = rear === a ? b : a;
  const step = Math.min(overlapX, rules.pushSpeed * DT);
  const nx = front.x + step;
  const fl = nx - half, fr = nx + half;
  const blocked = solidBox(g, fl, front.y, fr, front.y + rules.playerH);
  if (!blocked) {
    front.x = nx;
    if (front.onGround) front.vx = Math.max(front.vx, 1.6);
    emit(g, 'push', { from: rear.team, to: front.team, x: round2(front.x) });
  }
  // 前后都不能互相穿过：后面的人只能贴住前面，前面的人也退不过后面。
  const maxRear = front.x - half * 2 - 1e-3;
  if (rear.x > maxRear) {
    // 后面的人不能穿进前面；但也不能被弹回到这一帧起点之后。
    rear.x = Math.max(rear.prevX, maxRear);
    if (rear.vx > 0) rear.vx = Math.min(rear.vx, rules.pushSpeed);
  }
  const minFront = rear.x + half * 2 + 1e-3;
  if (front.x < minFront) { front.x = minFront; if (front.vx < 0) front.vx = 0; }
}

/* ============================ 怪物 ============================ */

function spawnMonster(g) {
  if (g.monsters.length >= rules.monsterMax) return;
  const lead = Math.max(g.runners[0].x, g.runners[1].x);
  for (let attempt = 0; attempt < 8; attempt++) {
    const x = clamp(lead + 16 + g.rng() * 18, 8, g.w - 10);
    const footY = g.h - rules.groundY;
    // 必须站在连续平地上（左右各一格都有地面）
    if (!solidWorld(g, x, footY - 0.3) || !solidWorld(g, x - 1.2, footY - 0.3) || !solidWorld(g, x + 1.2, footY - 0.3)) continue;
    if (g.runners.some(p => Math.abs(p.x - x) < 6)) continue;
    g.monsters.push({ id: 'm' + (++g.monsterId), x, y: footY, dir: -1, alive: true });
    emit(g, 'monster', { x: round2(x), y: footY });
    return;
  }
}

function updateMonsters(g) {
  const footY = g.h - rules.groundY;
  for (const m of g.monsters) {
    if (!m.alive) continue;
    const nx = m.x + m.dir * rules.monsterSpeed * DT;
    const aheadY = m.y - 0.2;
    const wallAhead = solidWorld(g, nx + m.dir * 0.5, m.y + 0.4);
    const gapAhead = !solidWorld(g, nx + m.dir * 0.6, aheadY);
    if (wallAhead || gapAhead) { m.dir *= -1; continue; }
    m.x = nx;
    if (m.x < -2) m.alive = false;
  }
  g.monsters = g.monsters.filter(m => m.alive && m.x > g.runners[0].x - 25);
  // 刷新计时
  g.monsterTimer -= DT;
  if (g.monsterTimer <= 0) {
    spawnMonster(g);
    g.monsterTimer = rules.monsterSpawnMin + g.rng() * (rules.monsterSpawnMax - rules.monsterSpawnMin);
  }
}

function monsterHits(g, p) {
  if (p.invuln > 0) return null;
  for (const m of g.monsters) {
    if (!m.alive) continue;
    if (Math.abs(p.x - m.x) < (rules.playerW + rules.monsterW) / 2
      && p.y < m.y + rules.monsterH && p.y + rules.playerH > m.y) return m;
  }
  return null;
}

/* ============================ 主循环 ============================ */

function step(g) {
  if (g.status !== 'playing') return;
  g.frame++;
  if (g.phase === 'freeze') {
    g.freezeLeft = Math.max(0, g.freezeLeft - DT);
    if (g.freezeLeft <= 0) { g.phase = 'race'; emit(g, 'go', { round: g.round }); }
    return;
  }
  if (g.phase !== 'race') return;

  for (const p of g.runners) updateRunner(g, p);
  resolvePush(g);
  updateMonsters(g);

  for (const p of g.runners) {
    const m = monsterHits(g, p);
    if (m) { m.alive = false; respawn(g, p, '撞怪'); }
  }

  for (const p of g.runners) {
    if (!p.finished && p.x >= g.goalX) {
      p.finished = true; p.finishTime = g.frame / rules.hz;
      endRound(g, p.team, '到达终点');
      return;
    }
  }

  g.roundLeft = Math.max(0, g.roundLeft - DT);
  if (g.roundLeft <= 0) {
    const [a, b] = g.runners;
    endRound(g, Math.abs(a.maxX - b.maxX) < 0.5 ? null : (a.maxX > b.maxX ? 0 : 1), '时间到');
    return;
  }
  if (g.frame >= rules.matchSeconds * rules.hz) {
    const [a, b] = g.wins;
    finish(g, a === b ? null : (a > b ? 0 : 1), `总时间到，${a}:${b}`);
  }
}

function endRound(g, winner, reason) {
  if (g.phase !== 'race' && g.phase !== 'freeze') return;
  if (winner != null) { g.wins[winner]++; g.players[winner].wins = g.wins[winner]; }
  emit(g, 'round', { round: g.round, team: winner, reason, wins: [...g.wins] });
  if ((winner != null && g.wins[winner] >= rules.roundsToWin) || g.round >= rules.maxRounds) {
    const [a, b] = g.wins;
    finish(g, a === b ? null : (a > b ? 0 : 1), `比分 ${a}:${b}`);
    return;
  }
  g.round++;
  setupRound(g);
}

function finish(g, winner, reason) {
  if (g.status === 'finished') return;
  g.status = 'finished'; g.phase = 'finished';
  g.winner = winner; g.reason = reason;
  emit(g, 'finish', { team: winner, reason, wins: [...g.wins] });
}

/* ============================ 输入与观察 ============================ */

function normalizeUnitInput(input) {
  const out = { move: 0, jump: false };
  if (input == null) return out;
  if (typeof input !== 'object' || Array.isArray(input)) throw Error('玩家输入必须是对象');
  if (input.move != null) {
    const v = Number(input.move);
    if (!Number.isFinite(v)) throw Error('move 必须是数字');
    out.move = clamp(v, -1, 1);
  }
  out.jump = !!input.jump;
  return out;
}

function normalizeFrame(frame) {
  if (Array.isArray(frame)) {
    if (frame.length !== 1) throw Error('每一帧必须是 1 名玩家的输入');
    return [normalizeUnitInput(frame[0])];
  }
  return [normalizeUnitInput(frame)];
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
    for (const p of g.runners) {
      const frame = windows[p.team] && windows[p.team][i];
      p.held = (frame && frame[0]) || { move: 0, jump: false };
      p.inputHistory.push(p.held);
      if (p.inputHistory.length > 8) p.inputHistory.shift();
    }
    step(g);
    steps++;
  }
  return steps;
}

function publicRunner(p) {
  return {
    id: p.id, team: p.team, index: p.index, name: p.name,
    x: round2(p.x), y: round2(p.y), vx: round2(p.vx), vy: round2(p.vy),
    onGround: p.onGround, facing: p.facing, invuln: round2(p.invuln),
    deaths: p.deaths, finished: p.finished, maxX: round2(p.maxX),
  };
}

function commonState(g, viewer = null) {
  return {
    id: g.id, seed: g.seed, tick: g.tick, frame: g.frame,
    status: g.status, phase: g.phase, winner: g.winner, reason: g.reason,
    yourPlayer: viewer,
    players: g.players.map(p => ({ ...p })),
    round: g.round, wins: [...g.wins],
    roundLeft: round2(g.roundLeft), freezeLeft: round2(g.freezeLeft),
    runners: g.runners.map(publicRunner),
    monsters: g.monsters.map(m => ({ id: m.id, x: round2(m.x), y: round2(m.y), dir: m.dir })),
    level: {
      width: g.w, height: g.h, goalX: g.goalX, startX: g.startX,
      tiles: Array.from(g.tiles),
    },
    rules: { ...rules },
    events: g.events.slice(-60),
  };
}

const snapshot = g => commonState(g, null);
const view = (g, team) => commonState(g, team);
const leanState = g => {
  const s = commonState(g, null);
  delete s.level; delete s.rules; delete s.events;
  return s;
};

module.exports = {
  createMatch, step, advanceWindow, submitWindow,
  normalizeUnitInput, normalizeFrame, snapshot, view, leanState, emit,
  solidWorld, solidBox, generateLevel, DT, rules,
};
