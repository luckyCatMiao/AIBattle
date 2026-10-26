'use strict';
/* 无尽弹墙对决 · 物理与规则实现（20 Hz，定步长，纯函数式推进）
 *
 * 一枪致命：谁先被对方的子弹碰到谁就输。
 * 子弹永不消失、永不减速，只会在墙上完全弹性反射，所以场面会越来越乱。
 */
const catalog = require('./catalog');
const { W, H, rules, SPAWNS, DIRS, tileAt, circleHitsWall, fieldAudit } = (() => {
  const c = require('./catalog');
  return { ...c, fieldAudit: c.auditField() };
})();

const DT = 1 / rules.hz;
const FRAMES_PER_DECISION = rules.decisionFrames;
const TAU = Math.PI * 2;

// 可复现的 LCG：同一个 seed 在任何机器上得到同一串扰动。
function makeRng(seed) {
  let s = (Number(seed) >>> 0) || 1;
  const next = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  return { next, range: (a, b) => a + (b - a) * next() };
}

const dirVec = key => {
  const d = DIRS[String(key || 'N').toUpperCase()];
  return d ? { x: d[0], y: d[1] } : { x: 0, y: 0 };
};

function emit(g, type, data = {}) {
  g.eventId++;
  const e = { id: g.eventId, t: Math.round(g.now * 1000) / 1000, frame: g.frame, type, ...data };
  g.events.push(e);
  if (g.events.length > 400) g.events.shift();
  return e;
}

function createMatch({ id = 'test', seed = 1, players } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('对决必须是两名选手');
  const tiles = catalog.buildMaze(seed);
  const fieldAudit = catalog.auditField(tiles);
  if (!fieldAudit.ok) throw Error('地图不合法：' + fieldAudit.problems.join('；'));
  // 出生点按 seed 小幅抖动：同一套地图下也能出现不同开局。
  const rng = makeRng((Number(seed) >>> 0) ^ 0x9e3779b9);
  const jitter = () => rng.range(-1.1, 1.1);
  const g = {
    id, seed, status: 'playing', winner: null, reason: '',
    frame: 0, now: 0, eventId: 0,
    players: players.map((p, i) => ({
      id: 'p' + i, index: i, name: String(p.name || ('P' + i)).slice(0, 32), kind: p.kind || 'api',
      x: SPAWNS[i].x + jitter(), y: SPAWNS[i].y + jitter(),
      facing: dirVec(SPAWNS[i].dir), move: { x: 0, y: 0 },
      alive: true, cooldown: 0, shots: 0, hits: 0,
      held: { dir: 'N', aim: null, fire: false },
      inputHistory: [],
    })),
    bullets: [], nextBullet: 1,
    events: [],
    tiles,
    mapAudit: fieldAudit,
  };
  emit(g, 'start', { text: '对决开始' });
  return g;
}

function finish(g, winner, reason) {
  if (g.status === 'finished') return;
  g.status = 'finished';
  g.winner = winner;
  g.reason = reason;
  emit(g, 'end', { text: reason });
}

function step(g) {
  if (g.status !== 'playing') return;
  g.frame += 1;
  g.now += DT;

  // 1) 球员移动（8 方向、瞬时转向）
  for (const p of g.players) {
    if (!p.alive) continue;
    const held = p.held || {};
    const m = dirVec(held.dir);
    p.move = m;
    if (m.x || m.y) p.facing = { x: m.x, y: m.y };
    const speed = rules.playerSpeed;
    const nx = p.x + m.x * speed * DT;
    const ny = p.y + m.y * speed * DT;
    if (!circleHitsWall(nx, p.y, rules.playerRadius, g.tiles)) p.x = nx;
    if (!circleHitsWall(p.x, ny, rules.playerRadius, g.tiles)) p.y = ny;
  }

  // 2) 开火（冷却到点才允许；一发一发打）
  for (const p of g.players) {
    if (!p.alive) continue;
    if (p.cooldown > 0) { p.cooldown -= 1; continue; }
    const held = p.held || {};
    if (held.aim) p.facing = dirVec(held.aim);
    if (!held.fire) continue;
    const f = p.facing;
    const len = Math.hypot(f.x, f.y) || 1;
    const ux = f.x / len, uy = f.y / len;
    const bx = p.x + ux * (rules.playerRadius + rules.bulletRadius + 0.12);
    const by = p.y + uy * (rules.playerRadius + rules.bulletRadius + 0.12);
    if (tileAt(bx, by, g.tiles) === catalog.WALL) continue;
    g.bullets.push({
      id: 'b' + g.nextBullet++, owner: p.index,
      x: bx, y: by, vx: ux * rules.bulletSpeed, vy: uy * rules.bulletSpeed,
      bounces: 0,
    });
    p.shots += 1;
    // 60 秒后进入火力全开：射击冷却减半，场上子弹密度加速上升。
    const cd = g.now >= rules.lateAt ? rules.fireCooldownLate : rules.fireCooldown;
    p.cooldown = Math.round(cd * rules.hz);
    emit(g, 'fire', { owner: p.index, x: round3(bx), y: round3(by) });
  }

  // 3) 子弹推进（子步 + 轴分离反射，永不减速）
  const SUB = 3;
  for (const b of g.bullets) {
    for (let s = 0; s < SUB; s++) {
      const nx = b.x + b.vx * DT / SUB;
      const ny = b.y + b.vy * DT / SUB;
      if (tileAt(nx, b.y, g.tiles) === catalog.WALL) { b.vx = -b.vx * rules.wallRestitution; b.bounces++; }
      else b.x = nx;
      if (tileAt(b.x, ny, g.tiles) === catalog.WALL) { b.vy = -b.vy * rules.wallRestitution; b.bounces++; }
      else b.y = ny;
    }
  }

  // 4) 命中判定：只判定对方的子弹；自己的子弹永远不打自己
  for (const b of g.bullets) {
    for (const p of g.players) {
      if (!p.alive || p.index === b.owner) continue;
      const d = Math.hypot(p.x - b.x, p.y - b.y);
      if (d <= rules.playerRadius + rules.bulletRadius) {
        p.alive = false;
        const shooter = g.players[b.owner];
        if (shooter) shooter.hits += 1;
        emit(g, 'hit', { owner: b.owner, victim: p.index, x: round3(b.x), y: round3(b.y),
          text: `${shooter ? shooter.name : '流弹'} 命中 ${p.name}` });
        finish(g, 1 - p.index, `${p.name} 被击中`);
        return;
      }
    }
  }

  // 5) 时间到
  if (g.now >= rules.matchSeconds) {
    finish(g, null, '时间到，双方都还活着');
  }
}

function round3(v) { return Math.round(v * 1000) / 1000; }

function normalizeInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('每一帧的输入必须是对象');
  const dir = raw.dir === null || raw.dir === undefined ? 'N' : String(raw.dir).toUpperCase();
  if (!(dir in DIRS)) throw Error('非法移动方向：' + raw.dir);
  let aim = raw.aim === null || raw.aim === undefined ? null : String(raw.aim).toUpperCase();
  if (aim !== null && !(aim in DIRS)) throw Error('非法瞄准方向：' + raw.aim);
  const fire = raw.fire === undefined || raw.fire === null ? false : raw.fire;
  if (typeof fire !== 'boolean') throw Error('fire 必须是布尔值');
  return { dir, aim, fire };
}

function submitWindow(g, owner, inputs) {
  if (g.status !== 'playing') throw Error('对局已结束');
  if (!Array.isArray(inputs)) throw Error('inputs 必须是数组');
  if (inputs.length > FRAMES_PER_DECISION) throw Error(`一个决策窗口最多 ${FRAMES_PER_DECISION} 帧输入`);
  const norm = [];
  for (let i = 0; i < FRAMES_PER_DECISION; i++) {
    norm.push(inputs[i] === undefined ? { dir: 'N', aim: null, fire: false } : normalizeInput(inputs[i]));
  }
  return norm;
}

function advanceWindow(g, windowInputs) {
  if (g.status !== 'playing') return g;
  for (let i = 0; i < FRAMES_PER_DECISION && g.status === 'playing'; i++) {
    for (let owner = 0; owner < 2; owner++) {
      const p = g.players[owner];
      if (!p || !p.alive) continue;
      const w = windowInputs[owner];
      const f = w && w[i] ? w[i] : { dir: 'N', aim: null, fire: false };
      p.held = f;
      p.inputHistory.push(f);
      if (p.inputHistory.length > 8) p.inputHistory.shift();
    }
    step(g);
  }
  return g;
}

function snapshot(g, owner = null) {
  return {
    id: g.id, seed: g.seed, frame: g.frame, now: Math.round(g.now * 1000) / 1000,
    status: g.status, winner: g.winner, reason: g.reason, yourPlayer: owner,
    timeLeft: Math.max(0, Math.round((rules.matchSeconds - g.now) * 10) / 10),
    map: { width: W, height: H, tiles: Array.from(g.tiles), audit: g.mapAudit },
    players: g.players.map(p => ({
      id: p.id, index: p.index, name: p.name, alive: p.alive,
      x: round3(p.x), y: round3(p.y),
      fx: round3(p.facing.x), fy: round3(p.facing.y),
      cooldown: p.cooldown, shots: p.shots, hits: p.hits,
    })),
    bullets: g.bullets.map(b => ({
      id: b.id, owner: b.owner, x: round3(b.x), y: round3(b.y),
      vx: round3(b.vx), vy: round3(b.vy), speed: Math.round(Math.hypot(b.vx, b.vy) * 100) / 100,
      bounces: b.bounces,
    })),
    events: g.events.slice(-120),
    rules: {
      hz: rules.hz, decisionFrames: rules.decisionFrames,
      playerRadius: rules.playerRadius, playerSpeed: rules.playerSpeed,
      bulletRadius: rules.bulletRadius, bulletSpeed: rules.bulletSpeed,
      fireCooldown: rules.fireCooldown, fireCooldownLate: rules.fireCooldownLate,
      lateAt: rules.lateAt, matchSeconds: rules.matchSeconds,
    },
  };
}

const view = (g, owner) => snapshot(g, owner);

function vecToDir(x, y) {
  if (Math.abs(x) < 1e-6 && Math.abs(y) < 1e-6) return 'N';
  let best = 'N', bestDot = -Infinity;
  for (const [k, [dx, dy]] of Object.entries(DIRS)) {
    if (k === 'N') continue;
    const l = Math.hypot(dx, dy) || 1;
    const dot = (x / Math.hypot(x, y)) * (dx / l) + (y / Math.hypot(x, y)) * (dy / l);
    if (dot > bestDot) { bestDot = dot; best = k; }
  }
  return best;
}

module.exports = {
  createMatch, step, advanceWindow, submitWindow, normalizeInput,
  snapshot, view, emit, vecToDir,
  DT, FRAMES_PER_DECISION, rules, W, H, TILE: catalog.TILE,
};
