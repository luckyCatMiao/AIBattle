'use strict';
/* 泡泡堂 / BLAST BUDDIES — 帧精确裁判。
 * 纯规则引擎：没有内置控制器（练习电脑在文件末尾单独隔离），随机数用固定种子的 LCG，
 * 所以同样的输入与种子必然得到同样的结果，逐帧回放可复现。
 *
 * 时间单位：一物理帧 = 1/20 秒。一次决策窗口 = 20 帧 = 1 秒。
 *
 * 反拖延（本引擎的核心设计）：开局 rules.floodStart 秒后战场从四边向内收缩，
 * 每 rules.floodInterval 秒淹没一圈。一回合的硬上限因此存在——躲着不动会被水淹死。
 */
const catalog = require('./catalog');
const { rules, powerups, powerupTypes, moveFrames, floodRingAt, auditMap, EMPTY, HARD, SOFT, SPAWN_CLEAR } = catalog;

const DT = 1 / rules.hz;
const FRAMES_PER_DECISION = rules.decisionFrames;
const W = rules.width, H = rules.height;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const sign = v => (v < 0 ? -1 : 1);
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const tileIndex = (x, y) => y * W + x;

// 固定种子 LCG。与 hero-rts 的做法一致：一切「随机」都可复现。
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ============================ 地图生成 ============================ */

// 硬墙：偶数行偶数列（经典泡泡堂骨架）。软墙：镜像成对放置，保证双方完全对等。
// 出生点周围留空，避免开局被自己的墙困死。
function buildMap(g, rng) {
  const tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    tiles[tileIndex(x, y)] = (x % 2 === 0 && y % 2 === 0) ? HARD : EMPTY;
  }
  // 出生区保护
  const protectedTiles = new Set();
  for (const [sx, sy] of rules.spawns) {
    for (let dy = -SPAWN_CLEAR; dy <= SPAWN_CLEAR; dy++) for (let dx = -SPAWN_CLEAR; dx <= SPAWN_CLEAR; dx++) {
      const x = sx + dx, y = sy + dy;
      if (inBounds(x, y)) protectedTiles.add(tileIndex(x, y));
    }
  }
  // 只在上半区决定，下半区由 180° 镜像生成 —— 这是「地图完全公平」的实现方式。
  const half = Math.floor((W * H) / 2);
  for (let i = 0; i < half; i++) {
    const x = i % W, y = Math.floor(i / W);
    const mx = W - 1 - x, my = H - 1 - y;
    const a = tileIndex(x, y), b = tileIndex(mx, my);
    if (tiles[a] !== EMPTY || tiles[b] !== EMPTY) continue;
    if (protectedTiles.has(a) || protectedTiles.has(b)) continue;
    if (rng() < rules.softDensity) { tiles[a] = SOFT; tiles[b] = SOFT; }
  }
  g.tiles = tiles;
  g.mapAudit = auditMap(tiles, g);
  return tiles;
}

/* ============================ 世界构造 ============================ */

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('泡泡堂对战必须是两名选手');
  const g = {
    id, seed, now: 0, tick: 0, status: 'playing',
    winner: null, reason: '', nextId: 1, eventId: 0,
    players: players.map((v, i) => {
      if (!v || typeof v.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(v.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return { id: i, name: String(v.name).slice(0, 32), kind: v.kind, wins: 0, alive: true };
    }),
    round: 1, roundFrames: 0,
    tiles: null, bombs: [], blasts: [], drops: [], fighters: [],
    roundLog: [], events: [], floodRing: 0, mapAudit: null, rngCalls: 0,
  };
  startRound(g);
  return g;
}

function startRound(g) {
  const rng = makeRng((g.seed * 7919) + g.round * 104729);
  buildMap(g, rng);
  g.bombs.length = 0; g.blasts.length = 0; g.drops.length = 0;
  g.roundFrames = 0; g.floodRing = 0;
  g.fighters = rules.spawns.map(([x, y], i) => makeFighter(g, i, x, y));
  emit(g, 'round', { text: `第 ${g.round} 局开始` });
}

function makeFighter(g, owner, tx, ty) {
  return {
    id: 'p' + g.nextId++,
    owner,
    x: tx, y: ty,              // 当前格（整数）——移动在格之间插值
    fromX: tx, fromY: ty,      // 本次移动的起点格
    moveProgress: 1,           // 0..1，1 表示静止在 (x,y)
    movingTo: null,            // {x,y} 目标格
    facing: owner === 0 ? 1 : -1,
    bombs: rules.baseBombs,    // 上限
    blast: rules.baseBlast,    // 火力
    speed: 0,                  // 速度等级
    activeBombs: 0,            // 场上属于本人的炸弹数
    hp: 1,                     // 一碰即死；无敌帧期间免疫
    invulnUntil: 0,
    alive: true,
    held: { dir: 'N', btn: null },
    inputHistory: [],
  };
}

function emit(g, type, data = {}) {
  g.events.push({ id: ++g.eventId, t: Math.round(g.now * 1000) / 1000, frame: g.roundFrames, type, ...data });
}

/* ============================ 格子查询 ============================ */

const tileAt = (g, x, y) => inBounds(x, y) ? g.tiles[tileIndex(x, y)] : HARD;
function setTile(g, x, y, v) { if (inBounds(x, y)) g.tiles[tileIndex(x, y)] = v; }

// 这一格是否被水淹没（涨水后不可站立）
const isFlooded = (g, x, y) => floodRingAt(g.floodRing, x, y);

// 炸弹占位（刚放下的那颗允许自己暂时踩在上面）
function bombAt(g, x, y) { return g.bombs.find(b => b.x === x && b.y === y); }

// 能否走进这一格：须是空地、未被水淹、没有炸弹
function walkable(g, x, y, ignoreBombId) {
  if (!inBounds(x, y)) return false;
  if (tileAt(g, x, y) !== EMPTY) return false;
  if (isFlooded(g, x, y)) return false;
  const b = bombAt(g, x, y);
  if (b && b.id !== ignoreBombId) return false;
  return true;
}

// 火焰是否会蔓延到这一格：硬墙阻挡，软墙吃掉火焰并停止
function blastStopsAt(g, x, y) {
  const t = tileAt(g, x, y);
  return t === HARD || t === SOFT;
}

/* ============================ 炸弹与爆炸 ============================ */

function placeBomb(g, f) {
  if (!f.alive) throw Error('该选手已出局');
  if (f.activeBombs >= f.bombs) throw Error('炸弹数量已达上限');
  if (bombAt(g, f.x, f.y)) throw Error('此处已有炸弹');
  const b = { id: 'b' + g.nextId++, owner: f.owner, x: f.x, y: f.y, fuse: rules.fuseFrames, blast: f.blast };
  g.bombs.push(b);
  f.activeBombs++;
  emit(g, 'bomb', { owner: f.owner, x: f.x, y: f.y, text: g.players[f.owner].name + ' 放置炸弹' });
  return b;
}

// 引爆：十字蔓延，遇到硬墙停止、软墙摧毁并停止、引爆其他炸弹形成连锁
function explode(g, bomb) {
  if (bomb.exploded) return;
  bomb.exploded = true;
  const cells = [{ x: bomb.x, y: bomb.y }];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    for (let step = 1; step <= bomb.blast; step++) {
      const x = bomb.x + dx * step, y = bomb.y + dy * step;
      if (!inBounds(x, y)) break;
      const t = tileAt(g, x, y);
      if (t === HARD) break;
      cells.push({ x, y });
      if (t === SOFT) { // 软墙吃掉火焰，并按概率掉落道具
        setTile(g, x, y, EMPTY);
        rollDrop(g, x, y);
        break;
      }
      // 连锁：被火焰扫到的炸弹立即引爆
      const other = g.bombs.find(b => !b.exploded && b.x === x && b.y === y);
      if (other) explode(g, other);
    }
  }
  for (const cell of cells) {
    g.blasts.push({ x: cell.x, y: cell.y, frames: rules.blastFrames, owner: bomb.owner });
  }
  // 火焰覆盖的道具被烧毁
  g.drops = g.drops.filter(d => !cells.some(c => c.x === d.x && c.y === d.y));
  emit(g, 'explode', { owner: bomb.owner, x: bomb.x, y: bomb.y, cells: cells.length, text: g.players[bomb.owner].name + ' 引爆' });
}

function rollDrop(g, x, y) {
  const rng = makeRng(g.seed * 31 + g.round * 977 + x * 131 + y * 17);
  const roll = rng();
  if (roll >= rules.powerupChance) return null;
  const pick = rng();
  let acc = 0, chosen = powerupTypes[0];
  for (const t of powerupTypes) { acc += powerups[t].weight; if (pick <= acc) { chosen = t; break; } }
  const drop = { id: 'd' + g.nextId++, x, y, type: chosen };
  g.drops.push(drop);
  return drop;
}

/* ============================ 移动 ============================ */

// 方向 -> 格偏移。'N' 表示不动。
const DIR_DELTA = { N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0] };

function stepFighter(g, f) {
  if (!f.alive) return;
  const input = f.held;
  if (!f.inputHistory.length) return;

  // 还在两格之间移动：继续走完
  if (f.moveProgress < 1) {
    f.moveProgress = Math.min(1, f.moveProgress + 1 / moveFrames(f.speed));
    if (f.moveProgress >= 1) {
      f.fromX = f.x; f.fromY = f.y; f.movingTo = null;
    }
    return;
  }

  // 拾取脚下的道具
  const drop = g.drops.find(d => d.x === f.x && d.y === f.y);
  if (drop) {
    g.drops = g.drops.filter(d => d !== drop);
    if (drop.type === 'bomb') f.bombs = Math.min(rules.bombsMax, f.bombs + 1);
    else if (drop.type === 'blast') f.blast = Math.min(rules.blastMax, f.blast + 1);
    else if (drop.type === 'speed') f.speed = Math.min(rules.framesPerTile - rules.framesPerTileMin, f.speed + 1);
    emit(g, 'pickup', { owner: f.owner, x: f.x, y: f.y, type: drop.type, text: g.players[f.owner].name + ' 拾取 ' + powerups[drop.type].name });
  }

  // 先处理放弹（上升沿，避免按住不放连放）
  if (input.btn === 'BOMB' && pressedEdge(f, 'BOMB')) {
    if (f.activeBombs < f.bombs && !bombAt(g, f.x, f.y)) { try { placeBomb(g, f); } catch { /* 条件不满足则忽略 */ } }
  }

  const delta = DIR_DELTA[input.dir];
  if (!delta || (delta[0] === 0 && delta[1] === 0)) return;
  const [dx, dy] = delta;
  if (dx !== 0) f.facing = dx;
  const nx = f.x + dx, ny = f.y + dy;
  // 刚放下的那颗炸弹允许自己踩着走出去（经典规则）
  const ownJustPlaced = g.bombs.find(b => b.owner === f.owner && b.x === f.x && b.y === f.y);
  if (walkable(g, nx, ny, ownJustPlaced && ownJustPlaced.id)) {
    f.fromX = f.x; f.fromY = f.y;
    f.movingTo = { x: nx, y: ny };
    f.moveProgress = 1 / moveFrames(f.speed);
    f.x = nx; f.y = ny;
  }
}

function pressedEdge(f, btn) {
  const h = f.inputHistory;
  if (!h.length || h[h.length - 1].btn !== btn) return false;
  return h.length < 2 || h[h.length - 2].btn !== btn;
}

/* ============================ 每帧推进 ============================ */

function step(g, dt = DT) {
  if (g.status !== 'playing') return g;
  if (!Number.isFinite(dt) || dt <= 0 || dt > 0.25) throw Error('dt 必须在 (0, 0.25] 之间');

  g.roundFrames++;
  g.tick++;
  g.now = g.tick * DT;

  // 涨水：从四边向内淹没，逼出接触。
  // 必须按「本局已进行的秒数」计算，不能用 g.now —— g.now 跨局累加，
  // 否则第 2 局开局就会被判成「早已淹到深处」，双方在出生点瞬间同归于尽。
  const roundSeconds = g.roundFrames / rules.hz;
  const floodElapsed = roundSeconds - rules.floodStart;
  const ring = floodElapsed <= 0 ? 0 : Math.min(rules.floodMaxRing, 1 + Math.floor(floodElapsed / rules.floodInterval));
  if (ring !== g.floodRing) {
    g.floodRing = ring;
    emit(g, 'flood', { ring, text: ring === 1 ? '战场开始收缩！' : `战场收缩第 ${ring - 1} 圈` });
  }

  // 炸弹引信
  for (const b of g.bombs) {
    if (b.exploded) continue;
    b.fuse--;
    if (b.fuse <= 0) {
      explode(g, b);
      const owner = g.fighters[b.owner];
      if (owner) owner.activeBombs = Math.max(0, owner.activeBombs - 1);
    }
  }
  g.bombs = g.bombs.filter(b => !b.exploded);

  // 火焰计时
  for (const c of g.blasts) c.frames--;
  g.blasts = g.blasts.filter(c => c.frames > 0);

  // 角色移动
  for (const f of g.fighters) stepFighter(g, f);

  // 伤害判定：踩到火焰，或被水淹
  for (const f of g.fighters) {
    if (!f.alive || g.roundFrames <= f.invulnUntil) continue;
    const inBlast = g.blasts.some(c => c.x === f.x && c.y === f.y);
    const drowned = isFlooded(g, f.x, f.y);
    if (inBlast || drowned) kill(g, f, inBlast ? '被炸死' : '被水淹没');
  }

  // 结算
  if (g.status === 'playing') {
    const alive = g.fighters.filter(f => f.alive);
    if (alive.length <= 1) {
      if (alive.length === 1) endRound(g, alive[0].owner, '击倒对手');
      else endRound(g, null, '同时阵亡，平局');
    } else if (g.roundFrames >= (rules.floodStart + rules.floodInterval * (rules.floodMaxRing + 2)) * rules.hz) {
      endRound(g, null, '战场完全淹没');
    }
  }
  return g;
}

function kill(g, f, reason) {
  f.alive = false;
  f.deathCause = reason;
  emit(g, 'death', { owner: f.owner, x: f.x, y: f.y, reason, text: g.players[f.owner].name + ' ' + reason });
}

/* ============================ 局与赛制 ============================ */

function endRound(g, winnerOwner, reason) {
  const chars = g.fighters.map(f => ({ owner: f.owner, alive: f.alive, bombs: f.bombs, blast: f.blast, speed: f.speed }));
  // 记下真实死因。一律写「击倒对手」会把「被水淹死」掩盖成「被打死」，回放和报告都会读错。
  // 平局（双方同归于尽）也要记录——否则「双方都不动一起淹死」这类对局在战报里看不出原因。
  let cause = null;
  if (winnerOwner === null) {
    const causes = [...new Set(g.fighters.map(f => f.deathCause).filter(Boolean))];
    cause = causes.length ? causes.join(' / ') : null;
  } else {
    const loser = g.fighters[1 - winnerOwner];
    cause = (loser && loser.deathCause) || null;
  }
  g.roundLog.push({
    round: g.round, frames: g.roundFrames,
    winner: winnerOwner === null ? null : g.players[winnerOwner].name,
    reason, cause, fighters: chars, floodRing: g.floodRing,
  });
  const detail = cause ? `（${cause}）` : '';
  emit(g, 'roundEnd', { owner: winnerOwner, text: winnerOwner === null ? `第 ${g.round} 局平局 · ${reason}${detail}` : `第 ${g.round} 局：${g.players[winnerOwner].name} 胜 · ${reason}${detail}` });
  if (winnerOwner !== null) g.players[winnerOwner].wins++;

  // 五局三胜：有人先到 3 胜，或打满 5 局
  const decided = g.players.some(p => p.wins >= rules.roundWinsToTakeMatch) || g.round >= rules.maxRounds;
  if (decided) {
    g.status = 'finished';
    const [a, b] = g.players;
    g.winner = a.wins === b.wins ? null : (a.wins > b.wins ? 0 : 1);
    g.reason = g.winner === null ? '五局战平' : '先胜三局';
    emit(g, 'matchEnd', { owner: g.winner, text: g.winner === null ? '系列赛平局' : g.players[g.winner].name + ' 获胜（' + g.players[g.winner].wins + ':' + g.players[1 - g.winner].wins + '）' });
    return;
  }
  g.round++;
  startRound(g);
}

/* ============================ 决策窗口 ============================ */

function normalizeInput(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('每一帧的输入必须是对象');
  const dir = raw.dir === null || raw.dir === undefined ? 'N' : String(raw.dir).toUpperCase();
  const btn = raw.btn === null || raw.btn === undefined ? null : String(raw.btn).toUpperCase();
  if (!['N', 'U', 'D', 'L', 'R'].includes(dir)) throw Error('非法方向：' + raw.dir);
  if (btn !== null && btn !== 'BOMB') throw Error('非法按钮：' + raw.btn);
  return { dir, btn };
}

function pushInput(f, input) {
  f.inputHistory.push(input);
  if (f.inputHistory.length > 8) f.inputHistory.shift();
  f.held = input;
}

function submitWindow(g, owner, inputs) {
  if (g.status !== 'playing') throw Error('对局已结束');
  if (!Array.isArray(inputs)) throw Error('inputs 必须是数组');
  if (inputs.length > FRAMES_PER_DECISION) throw Error(`一个决策窗口最多 ${FRAMES_PER_DECISION} 帧输入`);
  const norm = [];
  for (let i = 0; i < FRAMES_PER_DECISION; i++) norm.push(inputs[i] === undefined ? { dir: 'N', btn: null } : normalizeInput(inputs[i]));
  return norm;
}

// 双方到齐后由裁判调用：逐帧灌入输入并推进一整个窗口。
function advanceWindow(g, windowInputs) {
  if (g.status !== 'playing') return g;
  for (let i = 0; i < FRAMES_PER_DECISION && g.status === 'playing'; i++) {
    for (let owner = 0; owner < 2; owner++) {
      const f = g.fighters[owner];
      if (!f || !f.alive) continue;
      const w = windowInputs[owner];
      pushInput(f, w && w[i] ? w[i] : { dir: 'N', btn: null });
    }
    step(g);
  }
  return g;
}

/* ============================ 观察快照 ============================ */

function publicFighter(f) {
  return {
    id: f.id, owner: f.owner, alive: f.alive,
    x: f.x, y: f.y,
    px: Math.round((f.fromX + (f.x - f.fromX) * f.moveProgress) * 100) / 100,
    py: Math.round((f.fromY + (f.y - f.fromY) * f.moveProgress) * 100) / 100,
    facing: f.facing,
    bombs: f.bombs, blast: f.blast, speed: f.speed, activeBombs: f.activeBombs,
    invulnerable: f.invulnUntil >= g_frameNow,
  };
}
// publicFighter 需要当前帧号；用模块级变量避免层层传参。
let g_frameNow = 0;

function snapshot(g, owner = null) {
  g_frameNow = g.roundFrames;
  return {
    id: g.id, seed: g.seed,
    now: Math.round(g.now * 1000) / 1000, tick: g.tick, frame: g.roundFrames,
    status: g.status, winner: g.winner, reason: g.reason, yourPlayer: owner,
    round: g.round, roundLog: g.roundLog,
    map: { width: W, height: H, tiles: Array.from(g.tiles), audit: g.mapAudit },
    flood: { ring: g.floodRing, startsAt: rules.floodStart, interval: rules.floodInterval,
             nextInSeconds: Math.max(0, Math.round((rules.floodStart + g.floodRing * rules.floodInterval - g.now) * 10) / 10) },
    players: g.players.map(p => ({ ...p })),
    fighters: g.fighters.map(f => {
      const pub = { id: f.id, owner: f.owner, alive: f.alive, x: f.x, y: f.y,
        px: Math.round((f.fromX + (f.x - f.fromX) * f.moveProgress) * 100) / 100,
        py: Math.round((f.fromY + (f.y - f.fromY) * f.moveProgress) * 100) / 100,
        facing: f.facing, bombs: f.bombs, blast: f.blast, speed: f.speed,
        activeBombs: f.activeBombs, invulnerable: f.invulnUntil >= g.roundFrames };
      return pub;
    }),
    bombs: g.bombs.map(b => ({ id: b.id, owner: b.owner, x: b.x, y: b.y, fuse: b.fuse, blast: b.blast })),
    blasts: g.blasts.map(c => ({ x: c.x, y: c.y, frames: c.frames, owner: c.owner })),
    drops: g.drops.map(d => ({ id: d.id, x: d.x, y: d.y, type: d.type })),
    events: g.events.slice(-150),
    rules: {
      hz: rules.hz, decisionFrames: rules.decisionFrames, decisionSeconds: FRAMES_PER_DECISION / rules.hz,
      fuseFrames: rules.fuseFrames, blastFrames: rules.blastFrames,
      floodStart: rules.floodStart, floodInterval: rules.floodInterval,
      bombsMax: rules.bombsMax, blastMax: rules.blastMax,
      roundsToWin: rules.roundWinsToTakeMatch, maxRounds: rules.maxRounds,
      framesPerTile: rules.framesPerTile, framesPerTileMin: rules.framesPerTileMin,
    },
    powerups,
  };
}

/* ============================ 统计 ============================ */

function score(g, p) {
  const rounds = g.roundLog.filter(r => r.winner === p.name).length;
  return Math.round(p.wins * 1000 + rounds * 200);
}

module.exports = {
  createMatch, step, advanceWindow, submitWindow, snapshot, score, emit, normalizeInput, bot,
  dangerMap, blastDanger, floodDanger, escapeAfterBomb, bestMove, walkable, placeBomb, explode,
  DT, FRAMES_PER_DECISION, rules, powerups, TILE: catalog.TILE, W, H, tileIndex, inBounds,
};
