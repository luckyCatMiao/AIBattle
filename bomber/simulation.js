'use strict';
/* 泡泡堂 / BLAST BUDDIES — 帧精确裁判。
 * 纯规则引擎：没有内置控制器（练习电脑在文件末尾单独隔离），随机数用固定种子的 LCG，
 * 所以同样的输入与种子必然得到同样的结果，逐帧回放可复现。
 *
 * 时间单位：一物理帧 = 1/20 秒。一次决策窗口 = 20 帧 = 1 秒。
 *
 * 对局节奏：没有涨水。炸毁软墙会掉落道具，装备优势推动进攻；
 * 单局 150 秒硬上限，时间到仍有多人在场则判平局。
 */
const catalog = require('./catalog');
const { rules, powerups, powerupTypes, moveFrames, spawnsFor, auditMap, EMPTY, HARD, SOFT, SPAWN_CLEAR } = catalog;

const DT = 1 / rules.hz;
const FRAMES_PER_DECISION = rules.decisionFrames;
const W = rules.width, H = rules.height;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
const tileIndex = (x, y) => y * W + x;

// 固定种子 LCG。与 hero-rts 的做法一致：一切「随机」都可复现。
function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

/* ============================ 地图生成 ============================ */

// 硬墙：偶数行偶数列（经典泡泡堂骨架）。
// 软墙：只在上左四分之一区决策，再向上下左右四向镜像 ——
// 四个出生角因此完全等价，2–4 人都没有几何优势。
function buildMap(g, rng) {
  const tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    tiles[tileIndex(x, y)] = (x % 2 === 0 && y % 2 === 0) ? HARD : EMPTY;
  }
  // 出生区保护
  const protectedTiles = new Set();
  for (const [sx, sy] of catalog.SPAWN_CORNERS) {
    for (let dy = -SPAWN_CLEAR; dy <= SPAWN_CLEAR; dy++) for (let dx = -SPAWN_CLEAR; dx <= SPAWN_CLEAR; dx++) {
      const x = sx + dx, y = sy + dy;
      if (inBounds(x, y)) protectedTiles.add(tileIndex(x, y));
    }
  }
  // 只处理每个四点镜像组的代表格，再一次性写入整组。
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const rx = Math.min(x, W - 1 - x), ry = Math.min(y, H - 1 - y);
    if (x !== rx || y !== ry) continue;
    const orbit = new Set([
      tileIndex(rx, ry), tileIndex(W - 1 - rx, ry),
      tileIndex(rx, H - 1 - ry), tileIndex(W - 1 - rx, H - 1 - ry),
    ]);
    const cells = [...orbit];
    if (cells.some(i => tiles[i] !== EMPTY || protectedTiles.has(i))) continue;
    if (rng() < rules.softDensity) for (const i of cells) tiles[i] = SOFT;
  }
  g.tiles = tiles;
  g.spawns = spawnsFor(g.players.length, g.round);
  g.mapAudit = auditMap(tiles, g.spawns);
  return tiles;
}

/* ============================ 世界构造 ============================ */

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length < rules.minPlayers || players.length > rules.maxPlayers) {
    throw Error(`泡泡堂对战需要 ${rules.minPlayers}–${rules.maxPlayers} 名选手`);
  }
  const g = {
    id, seed, now: 0, tick: 0, status: 'playing',
    winner: null, reason: '', nextId: 1, eventId: 0,
    players: players.map((v, i) => {
      if (!v || typeof v.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(v.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return { id: i, name: String(v.name).slice(0, 32), kind: v.kind, wins: 0, alive: true };
    }),
    round: 1, roundFrames: 0,
    tiles: null, bombs: [], blasts: [], drops: [], fighters: [], spawns: [],
    roundLog: [], events: [], mapAudit: null, rngCalls: 0,
  };
  startRound(g);
  return g;
}

function startRound(g) {
  const rng = makeRng((g.seed * 7919) + g.round * 104729);
  g.bombs.length = 0; g.blasts.length = 0; g.drops.length = 0;
  g.roundFrames = 0;
  // 先按本轮局数算出生角，再建图（建图要用出生区做保护）。
  g.spawns = spawnsFor(g.players.length, g.round);
  buildMap(g, rng);
  g.fighters = g.spawns.map(([x, y], i) => makeFighter(g, i, x, y));
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
    facing: owner % 2 === 0 ? 1 : -1,
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

// 炸弹占位（刚放下的那颗允许自己暂时踩在上面）
function bombAt(g, x, y) { return g.bombs.find(b => b.x === x && b.y === y); }

// 能否走进这一格：须是空地、没有炸弹
function walkable(g, x, y, ignoreBombId) {
  if (!inBounds(x, y)) return false;
  if (tileAt(g, x, y) !== EMPTY) return false;
  const b = bombAt(g, x, y);
  if (b && b.id !== ignoreBombId) return false;
  return true;
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
  const brokenWalls = [];
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of dirs) {
    for (let step = 1; step <= bomb.blast; step++) {
      const x = bomb.x + dx * step, y = bomb.y + dy * step;
      if (!inBounds(x, y)) break;
      const t = tileAt(g, x, y);
      if (t === HARD) break;
      cells.push({ x, y });
      if (t === SOFT) { // 软墙吃掉火焰，倒在这里
        setTile(g, x, y, EMPTY);
        brokenWalls.push({ x, y });
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
  // 火焰先烧毁爆炸范围内「之前就躺在地上」的道具，
  // 再结算本次炸墙的掉落 —— 顺序反了会把刚掉出来的道具立刻烧掉，
  // 结果就是「炸了整张图也什么都捡不到」。
  g.drops = g.drops.filter(d => !cells.some(c => c.x === d.x && c.y === d.y));
  for (const cell of brokenWalls) rollDrop(g, cell.x, cell.y);
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
  emit(g, 'drop', { owner: null, x, y, type: chosen, text: powerups[chosen].name + ' 掉落' });
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

  // 伤害判定：踩到火焰即死
  for (const f of g.fighters) {
    if (!f.alive || g.roundFrames <= f.invulnUntil) continue;
    if (g.blasts.some(c => c.x === f.x && c.y === f.y)) kill(g, f, '被炸死');
  }

  // 结算
  if (g.status === 'playing') {
    const alive = g.fighters.filter(f => f.alive);
    if (alive.length <= 1) {
      if (alive.length === 1) endRound(g, alive[0].owner, '最后存活');
      else endRound(g, null, '同时阵亡');
    } else if (g.roundFrames >= rules.roundTimeLimit * rules.hz) {
      endRound(g, null, '时间到');
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
  // 记下真实死因，平局（同归于尽 / 时间到）也写清楚，回放和报告才读得懂。
  const causes = [...new Set(g.fighters.map(f => f.deathCause).filter(Boolean))];
  const cause = winnerOwner === null
    ? (causes.length ? causes.join(' / ') : null)
    : (g.fighters[winnerOwner] ? causes[0] || null : null);
  g.roundLog.push({
    round: g.round, frames: g.roundFrames,
    winner: winnerOwner === null ? null : g.players[winnerOwner].name,
    reason, cause, fighters: chars,
  });
  const detail = cause ? `（${cause}）` : '';
  emit(g, 'roundEnd', { owner: winnerOwner, text: winnerOwner === null ? `第 ${g.round} 局平局 · ${reason}${detail}` : `第 ${g.round} 局：${g.players[winnerOwner].name} 胜 · ${reason}${detail}` });
  if (winnerOwner !== null) g.players[winnerOwner].wins++;

  // 五局三胜：有人先到 3 胜，或打满 5 局
  const decided = g.players.some(p => p.wins >= rules.roundWinsToTakeMatch) || g.round >= rules.maxRounds;
  if (decided) {
    const best = Math.max(...g.players.map(p => p.wins));
    const leaders = g.players.filter(p => p.wins === best);
    g.status = 'finished';
    g.winner = leaders.length === 1 ? leaders[0].id : null;
    g.reason = g.winner === null ? '五局战平' : (best >= rules.roundWinsToTakeMatch ? '先胜三局' : '胜局最多');
    const score = g.players.map(p => `${p.name} ${p.wins}`).join(' · ');
    emit(g, 'matchEnd', { owner: g.winner, text: g.winner === null ? '系列赛平局（' + score + '）' : g.players[g.winner].name + ' 获胜（' + score + '）' });
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

// 所有席位到齐后由裁判调用：逐帧灌入输入并推进一整个窗口。
function advanceWindow(g, windowInputs) {
  if (g.status !== 'playing') return g;
  for (let i = 0; i < FRAMES_PER_DECISION && g.status === 'playing'; i++) {
    for (let owner = 0; owner < g.players.length; owner++) {
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

function snapshot(g, owner = null) {
  return {
    id: g.id, seed: g.seed,
    now: Math.round(g.now * 1000) / 1000, tick: g.tick, frame: g.roundFrames,
    status: g.status, winner: g.winner, reason: g.reason, yourPlayer: owner,
    round: g.round, roundLog: g.roundLog,
    map: { width: W, height: H, tiles: Array.from(g.tiles), audit: g.mapAudit },
    spawns: g.spawns.map(([x, y]) => [x, y]),
    timeLeft: Math.max(0, Math.round((rules.roundTimeLimit - g.roundFrames / rules.hz) * 10) / 10),
    players: g.players.map(p => ({ ...p })),
    fighters: g.fighters.map(f => ({
      id: f.id, owner: f.owner, alive: f.alive, x: f.x, y: f.y,
      px: Math.round((f.fromX + (f.x - f.fromX) * f.moveProgress) * 100) / 100,
      py: Math.round((f.fromY + (f.y - f.fromY) * f.moveProgress) * 100) / 100,
      facing: f.facing, bombs: f.bombs, blast: f.blast, speed: f.speed,
      activeBombs: f.activeBombs, invulnerable: f.invulnUntil >= g.roundFrames,
    })),
    bombs: g.bombs.map(b => ({ id: b.id, owner: b.owner, x: b.x, y: b.y, fuse: b.fuse, blast: b.blast })),
    blasts: g.blasts.map(c => ({ x: c.x, y: c.y, frames: c.frames, owner: c.owner })),
    drops: g.drops.map(d => ({ id: d.id, x: d.x, y: d.y, type: d.type })),
    events: g.events.slice(-150),
    rules: {
      hz: rules.hz, decisionFrames: rules.decisionFrames, decisionSeconds: FRAMES_PER_DECISION / rules.hz,
      fuseFrames: rules.fuseFrames, blastFrames: rules.blastFrames,
      roundTimeLimit: rules.roundTimeLimit,
      bombsMax: rules.bombsMax, blastMax: rules.blastMax,
      roundsToWin: rules.roundWinsToTakeMatch, maxRounds: rules.maxRounds,
      minPlayers: rules.minPlayers, maxPlayers: rules.maxPlayers,
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

/* ============================ 练习电脑 ============================ */
/* 仅供真人练习。外部 API 席位与比赛框架都不运行它。
 *
 * 没有涨水之后，电脑不能只学「逃跑」：它需要主动炸墙、捡道具、
 * 逼近最近的对手并封路。安全判断只看火焰，另外用单局时间上限兜底。 */

// 每格被火焰覆盖还有多少帧；Infinity 表示当前没有炸弹威胁它。
function blastDanger(g) {
  const map = new Array(W * H).fill(Infinity);
  for (const c of g.blasts) map[tileIndex(c.x, c.y)] = 0;
  for (const b of g.bombs) {
    const hits = [{ x: b.x, y: b.y }];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      for (let s = 1; s <= b.blast; s++) {
        const x = b.x + dx * s, y = b.y + dy * s;
        if (!inBounds(x, y)) break;
        const t = tileAt(g, x, y);
        if (t === HARD) break;
        hits.push({ x, y });
        if (t === SOFT) break;
      }
    }
    for (const c of hits) {
      const i = tileIndex(c.x, c.y);
      map[i] = Math.min(map[i], b.fuse);
    }
  }
  return map;
}

// 兼容旧接口：现在危险只剩火焰。
const dangerMap = blastDanger;

// 在 `arrivalFrames` 帧后到达这一格，还能安全待多久。
function blastMargin(blast, x, y, arrivalFrames) {
  const v = blast[tileIndex(x, y)];
  return v === Infinity ? Infinity : v - arrivalFrames - rules.blastFrames;
}

// 从当前位置出发，找一个安全余量最大的可达格，返回朝那个方向的第一步。
function bestMove(g, f, blast, opts = {}) {
  const travel = moveFrames(f.speed);
  const minMargin = opts.minMargin === undefined ? -Infinity : opts.minMargin;
  const seen = new Set([tileIndex(f.x, f.y)]);
  const queue = [{ x: f.x, y: f.y, first: null, dist: 0 }];
  let best = null;
  while (queue.length) {
    const node = queue.shift();
    const arrival = node.dist * travel;
    if (node.dist > 0) {
      const margin = blastMargin(blast, node.x, node.y, arrival);
      if (margin > minMargin && (!best || margin > best.margin)) {
        best = { dir: node.first, margin, x: node.x, y: node.y, dist: node.dist };
      }
    }
    if (node.dist >= 10) continue;
    for (const [dx, dy, dir] of [[1, 0, 'R'], [-1, 0, 'L'], [0, 1, 'D'], [0, -1, 'U']]) {
      const nx = node.x + dx, ny = node.y + dy, key = tileIndex(nx, ny);
      if (!inBounds(nx, ny) || seen.has(key)) continue;
      if (!walkable(g, nx, ny)) continue;
      if (blastMargin(blast, nx, ny, (node.dist + 1) * travel) <= 0) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny, first: node.first || dir, dist: node.dist + 1 });
    }
  }
  return best;
}

// 放弹之后往哪撤：走出自己火焰范围，并且撤到的地方要撑得过引信。
function escapeAfterBomb(g, f) {
  const blast = f.blast;
  const idx = tileIndex(f.x, f.y);
  const deadly = new Set([idx]);
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let s = 1; s <= blast; s++) {
      const x = f.x + dx * s, y = f.y + dy * s;
      if (!inBounds(x, y)) break;
      const t = tileAt(g, x, y);
      if (t === HARD) break;
      deadly.add(tileIndex(x, y));
      if (t === SOFT) break;
    }
  }
  const canStand = (x, y) => {
    if (!inBounds(x, y) || g.tiles[tileIndex(x, y)] !== EMPTY) return false;
    const b = bombAt(g, x, y);
    return !b || (b.x === f.x && b.y === f.y);
  };
  const travel = moveFrames(f.speed);
  const blastMap = blastDanger(g);
  const seen = new Set([idx]);
  const queue = [{ x: f.x, y: f.y, first: null, dist: 0 }];
  while (queue.length) {
    const node = queue.shift();
    if (node.dist > 0 && !deadly.has(tileIndex(node.x, node.y))) {
      if (blastMargin(blastMap, node.x, node.y, node.dist * travel + rules.fuseFrames) > 0) {
        return node.first;
      }
    }
    if (node.dist >= 10) continue;
    for (const [dx, dy, dir] of [[1, 0, 'R'], [-1, 0, 'L'], [0, 1, 'D'], [0, -1, 'U']]) {
      const nx = node.x + dx, ny = node.y + dy, key = tileIndex(nx, ny);
      if (seen.has(key) || !canStand(nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny, first: node.first || dir, dist: node.dist + 1 });
    }
  }
  return null;
}

// 从当前位置出发、不炸墙能到达的空格数（限深）。
function reachableArea(g, f, limit = 40) {
  const seen = new Set([tileIndex(f.x, f.y)]);
  const queue = [[f.x, f.y]];
  while (queue.length && seen.size < limit) {
    const [x, y] = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy, key = tileIndex(nx, ny);
      if (!inBounds(nx, ny) || seen.has(key) || !walkable(g, nx, ny)) continue;
      seen.add(key); queue.push([nx, ny]);
    }
  }
  return seen.size;
}

function nearestAlive(g, f) {
  let best = null;
  for (const other of g.fighters) {
    if (!other.alive || other.owner === f.owner) continue;
    const dist = Math.abs(other.x - f.x) + Math.abs(other.y - f.y);
    if (!best || dist < best.dist) best = { fighter: other, dist };
  }
  return best;
}

function nearestDrop(g, f) {
  let best = null;
  for (const d of g.drops) {
    const dist = Math.abs(d.x - f.x) + Math.abs(d.y - f.y);
    if (!best || dist < best.dist) best = { drop: d, dist };
  }
  return best;
}

function bot(g, p) {
  const f = g.fighters[p.id];
  const out = [];
  const idle = () => out.push({ dir: 'N', btn: null });
  if (!f || !f.alive) return Array.from({ length: FRAMES_PER_DECISION }, idle);

  const blast = blastDanger(g);
  const foe = nearestAlive(g, f);
  const plan = { dir: null, btn: null };
  const canBomb = f.activeBombs < f.bombs && !bombAt(g, f.x, f.y);
  const travel = moveFrames(f.speed);
  const here = blastMargin(blast, f.x, f.y, 0);
  const retreat = escapeAfterBomb(g, f);
  const bombThreshold = rules.fuseFrames + rules.blastFrames;

  // 1) 脚下正在倒计时：活命优先于一切
  const mustFlee = here <= travel * 2 + rules.blastFrames;
  if (mustFlee) {
    const escape = bestMove(g, f, blast, { minMargin: 0 });
    if (escape) plan.dir = escape.dir;
  } else {
    // 2) 炸墙开路：出生点周围常常只有几个空格，不炸墙就捡不到道具也过不去
    const nearSoft = [[1, 0], [-1, 0], [0, 1], [0, -1]]
      .some(([dx, dy]) => tileAt(g, f.x + dx, f.y + dy) === SOFT);
    const needBreakout = nearSoft && reachableArea(g, f) < 25;
    const safeToBomb = canBomb && retreat && here > bombThreshold;
    if (safeToBomb && needBreakout) {
      plan.btn = 'BOMB'; plan.dir = retreat;
    } else {
      // 3) 先捡近处道具，否则逼近最近的对手
      const drop = nearestDrop(g, f);
      const target = drop && drop.dist <= 6
        ? { x: drop.drop.x, y: drop.drop.y }
        : (foe ? { x: foe.fighter.x, y: foe.fighter.y } : null);
      if (target) {
        const dx = target.x - f.x, dy = target.y - f.y;
        const horiz = dx > 0 ? 'R' : 'L';
        const vert = dy > 0 ? 'D' : 'U';
        const pref = Math.abs(dx) >= Math.abs(dy) ? [horiz, vert] : [vert, horiz];
        // 方向偏好按 owner 错开：同一套确定性策略 + 完全对称的地图与顺序
        // 会让两边永远镜像同步。这只打破平局，不改变能力上限。
        const order = f.owner % 2 === 0 ? pref : [...pref].reverse();
        for (const dir of order) {
          const [ox, oy] = DIR_DELTA[dir];
          const nx = f.x + ox, ny = f.y + oy;
          if (!inBounds(nx, ny) || !walkable(g, nx, ny)) continue;
          if (blastMargin(blast, nx, ny, travel) > 0) { plan.dir = dir; break; }
        }
      }
      if (!plan.dir) {
        const fallback = bestMove(g, f, blast, { minMargin: 0 });
        if (fallback) plan.dir = fallback.dir;
      }
      // 4) 贴脸且有退路时下弹封路——这是取胜手段，不是逃命
      if (!plan.btn && canBomb && retreat && foe && here > bombThreshold + 20) {
        if (foe.dist <= f.blast + 1) { plan.btn = 'BOMB'; plan.dir = retreat; }
      }
    }
  }

  // 把整个窗口填满同样的意图；每 5 帧重发一次 BOMB 以形成上升沿
  for (let i = 0; i < FRAMES_PER_DECISION; i++) {
    out.push({ dir: plan.dir || 'N', btn: (plan.btn === 'BOMB' && i % 5 === 0) ? 'BOMB' : null });
  }
  return out;
}

module.exports = {
  createMatch, step, advanceWindow, submitWindow, snapshot, score, emit, normalizeInput, bot,
  dangerMap, blastDanger, escapeAfterBomb, bestMove, walkable, placeBomb, explode,
  DT, FRAMES_PER_DECISION, rules, powerups, TILE: catalog.TILE, W, H, tileIndex, inBounds,
};
