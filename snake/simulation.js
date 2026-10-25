'use strict';
/* 贪吃蛇对战 · 确定性模拟。
 * 20 Hz；每 4 帧所有蛇同时走一格。每局三颗食物，吃一颗长 2 节。
 * 撞墙、撞到自己或对方身体即死；一局定胜负，五局三胜。 */

const { rules, DIRS, OPPOSITE, clamp, makeRng } = require('./catalog');

const DT = 1 / rules.hz;
const round2 = v => Math.round(v * 100) / 100;

function emit(g, type, data = {}) {
  g.events.push({ id: ++g.eventId, t: round2(g.frame / rules.hz), frame: g.frame, type, ...data });
}

const key = (x, y) => y * rules.width + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < rules.width && y < rules.height;

function makeSnake(team, name) {
  const mid = Math.floor(rules.height / 2);
  const body = [];
  if (team === 0) {
    const headX = 4;
    for (let i = 0; i < rules.startLength; i++) body.push({ x: headX - i, y: mid });
  } else {
    const headX = rules.width - 5;
    for (let i = 0; i < rules.startLength; i++) body.push({ x: headX + i, y: mid });
  }
  return {
    id: 's' + team, team, index: team, name,
    body, dir: team === 0 ? 'R' : 'L', wantDir: null,
    alive: true, food: 0, deaths: 0,
    inputHistory: [],
  };
}

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('贪吃蛇必须是两名选手');
  const g = {
    id, seed: Number(seed) || 1,
    status: 'playing', phase: 'freeze', winner: null, reason: '', eventId: 0,
    players: players.map((p, i) => {
      if (!p || typeof p.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(p.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return { id: i, name: String(p.name).slice(0, 32), kind: p.kind, wins: 0 };
    }),
    frame: 0, tick: 0, round: 1, wins: [0, 0],
    roundLeft: rules.roundSeconds, freezeLeft: rules.roundFreeze,
    snakes: [], food: [], walls: new Set(), wallList: [], events: [],
  };
  g.rng = makeRng(g.seed * 2654435761 + 12345);
  for (let team = 0; team < 2; team++) g.snakes.push(makeSnake(team, g.players[team].name));
  buildWalls(g);
  for (let i = 0; i < rules.foodCount; i++) spawnFood(g);
  emit(g, 'ready', { text: '准备' });
  return g;
}

/* 每局随机生成障碍：3–7 个小方块，避开出生走廊，保证连通。 */
function buildWalls(g) {
  const mid = Math.floor(rules.height / 2);
  const rng = makeRng(g.seed * 7919 + g.round * 104729 + 17);
  const W = rules.width, H = rules.height, maxS = rules.wallBlockSize;

  const connectivity = (set) => {
    const free = W * H - set.size;
    if (free <= 0) return 0;
    const seen = new Uint8Array(W * H);
    const start = key(4, mid);
    const stack = [start]; seen[start] = 1;
    let n = 0;
    while (stack.length) {
      const k = stack.pop(); n++;
      const x = k % W, y = (k - x) / W;
      for (const d of DIR_KEYS) {
        const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
        if (!inBounds(nx, ny)) continue;
        const nk = key(nx, ny);
        if (seen[nk] || set.has(nk)) continue;
        seen[nk] = 1; stack.push(nk);
      }
    }
    return n / free;
  };

  for (let attempt = 0; attempt < 40; attempt++) {
    const set = new Set();
    const blocks = rules.wallBlocksMin + Math.floor(rng() * (rules.wallBlocksMax - rules.wallBlocksMin + 1));
    for (let i = 0; i < blocks; i++) {
      const bw = 1 + Math.floor(rng() * maxS);
      const bh = 1 + Math.floor(rng() * maxS);
      const x = 2 + Math.floor(rng() * (W - 4 - bw));
      const y = 2 + Math.floor(rng() * (H - 4 - bh));
      let ok = true;
      for (let dy = 0; dy < bh && ok; dy++) {
        for (let dx = 0; dx < bw && ok; dx++) {
          const cx = x + dx, cy = y + dy;
          // 出生走廊：中间三行、左右两端各留 9 格
          if (cy >= mid - 1 && cy <= mid + 1 && (cx < 9 || cx >= W - 9)) ok = false;
        }
      }
      if (!ok) continue;
      for (let dy = 0; dy < bh; dy++) for (let dx = 0; dx < bw; dx++) set.add(key(x + dx, y + dy));
    }
    if (connectivity(set) < 0.7) continue;
    g.walls = set;
    g.wallList = [];
    for (const k of set) {
      const x = k % W;
      g.wallList.push({ x, y: (k - x) / W });
    }
    g.wallList.sort((a, b) => a.y - b.y || a.x - b.x);
    return;
  }
  g.walls = new Set();
  g.wallList = [];
}

function occupied(g) {
  const set = new Set();
  for (const s of g.snakes) for (const c of s.body) set.add(key(c.x, c.y));
  for (const f of g.food) set.add(key(f.x, f.y));
  for (const k of g.walls) set.add(k);
  return set;
}

function spawnFood(g) {
  const used = occupied(g);
  const free = [];
  for (let y = 0; y < rules.height; y++) {
    for (let x = 0; x < rules.width; x++) if (!used.has(key(x, y))) free.push({ x, y });
  }
  if (!free.length) return null;
  const cell = free[Math.floor(g.rng() * free.length) % free.length];
  const f = { x: cell.x, y: cell.y };
  g.food.push(f);
  return f;
}

function foodAt(g, x, y) {
  const i = g.food.findIndex(f => f.x === x && f.y === y);
  return i;
}

function bodySet(snake, skipTail = false) {
  const set = new Set();
  const n = snake.body.length - (skipTail ? 1 : 0);
  for (let i = 0; i < n; i++) set.add(key(snake.body[i].x, snake.body[i].y));
  return set;
}

/* ============================ 主循环 ============================ */

function step(g) {
  if (g.status !== 'playing') return;
  g.frame++;

  if (g.phase === 'freeze') {
    g.freezeLeft = Math.max(0, g.freezeLeft - DT);
    if (g.freezeLeft <= 0) { g.phase = 'round'; emit(g, 'go', { round: g.round }); }
    return;
  }
  if (g.phase !== 'round') return;

  if (g.frame % rules.tickFrames === 0) moveTick(g);
  if (g.phase !== 'round') return;

  g.roundLeft = Math.max(0, g.roundLeft - DT);
  if (g.roundLeft <= 0) {
    const a = g.snakes[0].body.length, b = g.snakes[1].body.length;
    endRound(g, a === b ? null : (a > b ? 0 : 1), '时间到');
  }
  if (g.status === 'playing' && g.frame >= rules.matchSeconds * rules.hz) {
    const [a, b] = g.wins;
    finish(g, a === b ? null : (a > b ? 0 : 1), `总时间到，${a}:${b}`);
  }
}

function moveTick(g) {
  g.tick++;
  const snakes = g.snakes;

  // 1) 应用方向（禁止 180° 回头）
  for (const s of snakes) {
    if (!s.alive) continue;
    if (s.wantDir && s.wantDir !== OPPOSITE[s.dir]) s.dir = s.wantDir;
    s.wantDir = null;
  }

  // 2) 计算新头与被吃食物
  const heads = snakes.map(s => s.alive ? { x: s.body[0].x + DIRS[s.dir].x, y: s.body[0].y + DIRS[s.dir].y } : null);
  const eats = heads.map((h, i) => h ? foodAt(g, h.x, h.y) : -1);
  const growing = eats.map(i => i >= 0);

  // 3) 判定死亡（墙体、身体；尾巴本帧会移开的格子除外）
  const sets = snakes.map((s, i) => bodySet(s, !growing[i]));
  const dead = [false, false];
  const reasons = ['', ''];
  for (let i = 0; i < 2; i++) {
    const s = snakes[i], h = heads[i];
    if (!s.alive || !h) continue;
    if (!inBounds(h.x, h.y)) { dead[i] = true; reasons[i] = '撞墙'; continue; }
    if (g.walls.has(key(h.x, h.y))) { dead[i] = true; reasons[i] = '撞障碍'; continue; }
    if (sets[0].has(key(h.x, h.y)) || sets[1].has(key(h.x, h.y))) { dead[i] = true; reasons[i] = '撞身体'; }
  }
  if (heads[0] && heads[1] && heads[0].x === heads[1].x && heads[0].y === heads[1].y) {
    for (let i = 0; i < 2; i++) if (snakes[i].alive) { dead[i] = true; reasons[i] = '撞头'; }
  }
  // 两条蛇互换位置也算撞头
  if (heads[0] && heads[1]
    && heads[0].x === snakes[1].body[0].x && heads[0].y === snakes[1].body[0].y
    && heads[1].x === snakes[0].body[0].x && heads[1].y === snakes[0].body[0].y) {
    for (let i = 0; i < 2; i++) if (snakes[i].alive) { dead[i] = true; reasons[i] = '对穿'; }
  }

  // 4) 移动存活的蛇
  for (let i = 0; i < 2; i++) {
    const s = snakes[i];
    if (!s.alive) continue;
    if (dead[i]) {
      s.alive = false; s.deaths++;
      emit(g, 'death', { team: i, reason: reasons[i], x: heads[i].x, y: heads[i].y });
      continue;
    }
    s.body.unshift({ x: heads[i].x, y: heads[i].y });
    if (eats[i] >= 0) {
      g.food.splice(eats[i], 1);
      s.food++;
      for (let k = 1; k < rules.foodGrowth; k++) {
        const last = s.body[s.body.length - 1];
        s.body.push({ x: last.x, y: last.y });
      }
      spawnFood(g);
      emit(g, 'eat', { team: i, length: s.body.length, x: heads[i].x, y: heads[i].y });
    } else {
      s.body.pop();
    }
  }

  // 5) 结算回合
  const alive = snakes.filter(s => s.alive);
  if (alive.length === 2) return;
  if (alive.length === 1) endRound(g, alive[0].team, dead.filter(Boolean).length ? '对手死亡' : '');
  else endRound(g, null, '同归于尽');
}

function endRound(g, winner, reason) {
  if (g.phase !== 'round' && g.phase !== 'freeze') return;
  if (winner != null) { g.wins[winner]++; g.players[winner].wins = g.wins[winner]; }
  emit(g, 'round', { round: g.round, team: winner, reason, wins: [...g.wins], lengths: g.snakes.map(s => s.body.length) });
  if ((winner != null && g.wins[winner] >= rules.roundsToWin) || g.round >= rules.maxRounds) {
    const [a, b] = g.wins;
    finish(g, a === b ? null : (a > b ? 0 : 1), `比分 ${a}:${b}`);
    return;
  }
  g.round++;
  setupRound(g);
}

function setupRound(g) {
  for (let team = 0; team < 2; team++) {
    const s = g.snakes[team];
    const fresh = makeSnake(team, s.name);
    s.body = fresh.body; s.dir = fresh.dir; s.wantDir = null; s.alive = true;
    s.inputHistory = [];
  }
  buildWalls(g);
  g.food = [];
  for (let i = 0; i < rules.foodCount; i++) spawnFood(g);
  g.roundLeft = rules.roundSeconds;
  g.freezeLeft = rules.roundFreeze;
  g.phase = 'freeze';
}

function finish(g, winner, reason) {
  if (g.status === 'finished') return;
  g.status = 'finished'; g.phase = 'finished';
  g.winner = winner; g.reason = reason;
  emit(g, 'finish', { team: winner, reason, wins: [...g.wins] });
}

/* ============================ 输入与观察 ============================ */

const DIR_ALIASES = {
  U: 'U', UP: 'U', D: 'D', DOWN: 'D', L: 'L', LEFT: 'L', R: 'R', RIGHT: 'R',
};
const DIR_KEYS = ['U', 'D', 'L', 'R'];

function normalizeUnitInput(input) {
  const out = { dir: null };
  if (input == null) return out;
  if (typeof input === 'string') {
    const d = DIR_ALIASES[input.toUpperCase()];
    if (!d) throw Error('dir 必须是 U/D/L/R 或 null');
    return { dir: d };
  }
  if (typeof input !== 'object' || Array.isArray(input)) throw Error('玩家输入必须是对象');
  if (input.dir == null || input.dir === '') return out;
  const d = DIR_ALIASES[String(input.dir).toUpperCase()];
  if (!d) throw Error('dir 必须是 U/D/L/R 或 null');
  return { dir: d };
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
    for (const s of g.snakes) {
      const frame = windows[s.team] && windows[s.team][i];
      const input = (frame && frame[0]) || { dir: null };
      if (input.dir) s.wantDir = input.dir;
      s.inputHistory.push(input);
      if (s.inputHistory.length > 8) s.inputHistory.shift();
    }
    step(g);
    steps++;
  }
  return steps;
}

function publicSnake(s) {
  return {
    id: s.id, team: s.team, index: s.index, name: s.name,
    body: s.body.map(c => ({ x: c.x, y: c.y })),
    head: s.body[0] ? { x: s.body[0].x, y: s.body[0].y } : null,
    dir: s.dir, alive: s.alive, length: s.body.length, food: s.food, deaths: s.deaths,
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
    snakes: g.snakes.map(publicSnake),
    food: g.food.map(f => ({ x: f.x, y: f.y })),
    board: { width: rules.width, height: rules.height, walls: g.wallList.map(w => ({ x: w.x, y: w.y })) },
    rules: { ...rules },
    events: g.events.slice(-60),
  };
}

const snapshot = g => commonState(g, null);
const view = (g, team) => commonState(g, team);
const leanState = g => {
  const s = commonState(g, null);
  delete s.board; delete s.rules; delete s.events;
  return s;
};

/* ============================ 练习用电脑 ============================ */

function freeGrid(g) {
  // 0 = 可走，-1 = 被蛇身占据
  const grid = new Int8Array(rules.width * rules.height);
  for (const s of g.snakes) for (const c of s.body) grid[key(c.x, c.y)] = -1;
  for (const k of g.walls) grid[k] = -1;
  return grid;
}

function floodSize(grid, sx, sy) {
  const seen = new Uint8Array(grid.length);
  const stack = [key(sx, sy)];
  seen[stack[0]] = 1;
  let n = 0;
  while (stack.length) {
    const k = stack.pop(); n++;
    const x = k % rules.width, y = (k - x) / rules.width;
    for (const d of DIR_KEYS) {
      const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (seen[nk] || grid[nk] < 0) continue;
      seen[nk] = 1; stack.push(nk);
    }
  }
  return n;
}

function bfsDistance(grid, sx, sy, tx, ty) {
  if (sx === tx && sy === ty) return 0;
  const dist = new Int16Array(grid.length).fill(-1);
  const queue = [key(sx, sy)];
  dist[key(sx, sy)] = 0;
  let head = 0;
  while (head < queue.length) {
    const k = queue[head++];
    const x = k % rules.width, y = (k - x) / rules.width;
    for (const d of DIR_KEYS) {
      const nx = x + DIRS[d].x, ny = y + DIRS[d].y;
      if (!inBounds(nx, ny)) continue;
      const nk = key(nx, ny);
      if (dist[nk] >= 0 || grid[nk] < 0) continue;
      dist[nk] = dist[k] + 1;
      if (nx === tx && ny === ty) return dist[nk];
      queue.push(nk);
    }
  }
  return -1;
}

function botInput(g, s) {
  if (!s.alive || g.phase !== 'round') return { dir: null };
  const head = s.body[0];
  const grid = freeGrid(g);
  // 自己的尾巴下一步会移开（除非吃到食物），这里保守地当障碍物处理。
  let best = null;
  const order = [s.dir, 'U', 'D', 'L', 'R'].filter((d, i, a) => a.indexOf(d) === i);
  for (const d of order) {
    if (d === OPPOSITE[s.dir]) continue;
    const nx = head.x + DIRS[d].x, ny = head.y + DIRS[d].y;
    if (!inBounds(nx, ny) || grid[key(nx, ny)] < 0) continue;
    const space = floodSize(grid, nx, ny);
    let dist = 999;
    for (const f of g.food) {
      const dd = bfsDistance(grid, nx, ny, f.x, f.y);
      if (dd >= 0 && dd < dist) dist = dd;
    }
    // 空间越大越安全；离食物越近越好；维持当前方向有微小加成，减少抖动。
    const score = space * 2.0 - dist * 3.0 + (d === s.dir ? 0.6 : 0);
    if (!best || score > best.score) best = { d, score, space, dist };
  }
  return { dir: best ? best.d : null };
}

module.exports = {
  createMatch, step, advanceWindow, submitWindow,
  normalizeUnitInput, normalizeFrame, snapshot, view, leanState, botInput, emit,
  DT, rules, DIRS, key,
};
