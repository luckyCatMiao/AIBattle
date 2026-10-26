'use strict';
/* 无尽弹墙对决 · 规则目录
 *
 * 设计要点：
 * - 双方移动很快（13 格/秒），子弹只有 8.5 格/秒，所以单发子弹可以靠走位躲开。
 * - 子弹永不消失、永不减速，撞墙只反射；自己的子弹不会命中自己。
 * - 场上子弹会越来越多，最终必然有人被流弹击中。
 * - 谁先被对方子弹击中谁就输（一枪致命，没有血量）。
 * - 地图按 seed 用迷宫算法随机生成，且严格 180° 旋转对称、保证连通。
 */

const W = 40;
const H = 30;
const TILE = { EMPTY: 0, WALL: 1 };
const EMPTY = TILE.EMPTY, WALL = TILE.WALL;

const rules = {
  hz: 20,
  decisionFrames: 3,          // 150 ms 一个决策窗口：要能对子弹做出反应
  playerRadius: 0.45,
  playerSpeed: 13,            // 格/秒
  bulletRadius: 0.22,
  bulletSpeed: 8.5,           // 明显慢于球员，单发可躲
  fireCooldown: 0.8,          // 秒：一发一发地打
  fireCooldownLate: 0.4,      // 60 秒后进入火力全开，冷却减半
  lateAt: 60,
  matchSeconds: 120,
  wallRestitution: 1,         // 完全弹性，永远不衰减
  spawnClearRadius: 2.5,
};

// 出生点：左右中线，互相面对。旋转对称（(x,y) -> (W-1-x, H-1-y)）。
const SPAWNS = [
  { x: 5, y: (H - 1) / 2, dir: 'R' },
  { x: W - 6, y: (H - 1) / 2, dir: 'L' },
];

const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};

/* ============================ 随机迷宫地图 ============================
 * 内场切成 9×7 个「房间格」（每格 4×4，含 1 格墙），随机 DFS 生成完美迷宫，
 * 再随机多开一些门形成回路；随后把上半部分按 180° 旋转镜像到下半部分，
 * 最后做连通性修补。同一个 seed 完全可复现，且两边地图严格对称。
 */
const CELL = 4;
const GRID_W = 9, GRID_H = 7;
const ORIGIN_X = 2, ORIGIN_Y = 1;

function mulberry32(seed) {
  let a = (Number(seed) >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function carveCell(tiles, cx, cy) {
  const x0 = ORIGIN_X + cx * CELL, y0 = ORIGIN_Y + cy * CELL;
  for (let y = y0; y < y0 + CELL - 1; y++) {
    for (let x = x0; x < x0 + CELL - 1; x++) {
      if (x > 0 && y > 0 && x < W - 1 && y < H - 1) tiles[y * W + x] = EMPTY;
    }
  }
}

function carvePassage(tiles, cx, cy, dir) {
  const x0 = ORIGIN_X + cx * CELL, y0 = ORIGIN_Y + cy * CELL;
  if (dir === 'R') {
    const wx = x0 + CELL - 1;
    for (let y = y0; y < y0 + CELL - 1; y++) tiles[y * W + wx] = EMPTY;
  } else {
    const wy = y0 + CELL - 1;
    for (let x = x0; x < x0 + CELL - 1; x++) tiles[wy * W + x] = EMPTY;
  }
}

function buildMaze(seed) {
  const rnd = mulberry32(seed);
  const tiles = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) tiles[i] = WALL;
  for (let cy = 0; cy < GRID_H; cy++) for (let cx = 0; cx < GRID_W; cx++) carveCell(tiles, cx, cy);

  // 完美迷宫：随机 DFS 生成树
  const seen = new Uint8Array(GRID_W * GRID_H);
  const stack = [[Math.floor(rnd() * GRID_W), Math.floor(rnd() * GRID_H)]];
  seen[stack[0][1] * GRID_W + stack[0][0]] = 1;
  const DIRS4 = [['R', 1, 0], ['L', -1, 0], ['D', 0, 1], ['U', 0, -1]];
  while (stack.length) {
    const [cx, cy] = stack[stack.length - 1];
    const options = [];
    for (const [d, dx, dy] of DIRS4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= GRID_W || ny >= GRID_H) continue;
      if (seen[ny * GRID_W + nx]) continue;
      options.push([d, nx, ny]);
    }
    if (!options.length) { stack.pop(); continue; }
    const [d, nx, ny] = options[Math.floor(rnd() * options.length)];
    const carveDir = (d === 'R' || d === 'L') ? 'R' : 'D';
    carvePassage(tiles, Math.min(cx, nx), Math.min(cy, ny), carveDir);
    seen[ny * GRID_W + nx] = 1;
    stack.push([nx, ny]);
  }

  // 多开一些门：避免死胡同太多，让子弹和走位有回路
  const extra = Math.floor(GRID_W * GRID_H * 1.5);
  for (let i = 0; i < extra; i++) {
    if (rnd() < 0.5) carvePassage(tiles, Math.floor(rnd() * (GRID_W - 1)), Math.floor(rnd() * GRID_H), 'R');
    else carvePassage(tiles, Math.floor(rnd() * GRID_W), Math.floor(rnd() * (GRID_H - 1)), 'D');
  }

  // 180° 对称：上半部分镜像到下半部分
  for (let y = 0; y <= Math.floor((H - 1) / 2); y++) {
    for (let x = 0; x < W; x++) {
      const mx = W - 1 - x, my = H - 1 - y;
      if (my * W + mx === y * W + x) continue;
      tiles[my * W + mx] = tiles[y * W + x];
    }
  }

  // 连通性修补：从出生点洪水填充，找出走不到的空地，
  // 再从所有可达格子出发做一次 BFS（允许穿墙），把最短通道上的墙凿开（并对称凿开镜像）。
  for (let round = 0; round < 30; round++) {
    const reach = new Uint8Array(W * H);
    const q = [];
    for (const s of SPAWNS) {
      const sx = Math.round(s.x), sy = Math.round(s.y);
      if (tiles[sy * W + sx] === WALL) tiles[sy * W + sx] = EMPTY;
      q.push([sx, sy]); reach[sy * W + sx] = 1;
    }
    for (let head = 0; head < q.length; head++) {
      const [x, y] = q[head];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx <= 0 || ny <= 0 || nx >= W - 1 || ny >= H - 1) continue;
        if (reach[ny * W + nx] || tiles[ny * W + nx] === WALL) continue;
        reach[ny * W + nx] = 1; q.push([nx, ny]);
      }
    }
    let target = null;
    for (let y = 1; y < H - 1 && !target; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (tiles[y * W + x] === EMPTY && !reach[y * W + x]) { target = [x, y]; break; }
      }
    }
    if (!target) break;
    const prev = new Int32Array(W * H).fill(-1);
    const seen = new Uint8Array(W * H);
    const bfs = [];
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) if (reach[y * W + x]) { seen[y * W + x] = 1; bfs.push([x, y]); }
    let found = -1;
    for (let head = 0; head < bfs.length && found < 0; head++) {
      const [x, y] = bfs[head];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy;
        if (nx <= 0 || ny <= 0 || nx >= W - 1 || ny >= H - 1) continue;
        const i = ny * W + nx;
        if (seen[i]) continue;
        seen[i] = 1; prev[i] = y * W + x;
        if (nx === target[0] && ny === target[1]) { found = i; break; }
        bfs.push([nx, ny]);
      }
    }
    if (found < 0) break;
    let i = found;
    while (i >= 0) {
      if (tiles[i] === WALL) {
        tiles[i] = EMPTY;
        const x = i % W, y = (i - x) / W;
        tiles[(H - 1 - y) * W + (W - 1 - x)] = EMPTY;
      }
      i = prev[i];
    }
  }

  // 出生点周围清空：只清一侧，同时清它的镜像，保证对称不被破坏
  {
    const s = SPAWNS[0];
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        const x = Math.round(s.x) + dx, y = Math.round(s.y) + dy;
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) {
          tiles[y * W + x] = EMPTY;
          const mx = W - 1 - x, my = H - 1 - y;
          if (mx > 0 && my > 0 && mx < W - 1 && my < H - 1) tiles[my * W + mx] = EMPTY;
        }
      }
    }
  }
  return tiles;
}

const FIELD = buildMaze(1);
const PILLARS = [];   // 兼容旧引用：现在没有固定柱子
const tileAt = (x, y, tiles = FIELD) => (x < 0 || y < 0 || x >= W || y >= H) ? WALL : tiles[Math.floor(y) * W + Math.floor(x)];

function circleHitsWall(x, y, r, tiles = FIELD) {
  if (tileAt(x, y, tiles) === WALL) return true;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (tileAt(x + Math.cos(a) * r, y + Math.sin(a) * r, tiles) === WALL) return true;
  }
  return false;
}

function auditField(tiles = FIELD) {
  const problems = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = tiles[y * W + x], b = tiles[(H - 1 - y) * W + (W - 1 - x)];
      if (a !== b) problems.push('不对称 (' + x + ',' + y + ')');
    }
  }
  // 连通性：所有空地必须能从出生点走到
  const reach = new Uint8Array(W * H);
  const q = [];
  for (const s of SPAWNS) {
    const sx = Math.round(s.x), sy = Math.round(s.y);
    if (tiles[sy * W + sx] !== WALL && !reach[sy * W + sx]) { reach[sy * W + sx] = 1; q.push([sx, sy]); }
  }
  for (let head = 0; head < q.length; head++) {
    const [x, y] = q[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (reach[ny * W + nx] || tiles[ny * W + nx] === WALL) continue;
      reach[ny * W + nx] = 1; q.push([nx, ny]);
    }
  }
  let isolated = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    if (tiles[y * W + x] === EMPTY && !reach[y * W + x]) isolated++;
  }
  if (isolated) problems.push('有 ' + isolated + ' 格走不到');
  for (const s of SPAWNS) {
    for (let dy = -rules.spawnClearRadius; dy <= rules.spawnClearRadius; dy++) {
      for (let dx = -rules.spawnClearRadius; dx <= rules.spawnClearRadius; dx++) {
        if (dx * dx + dy * dy > rules.spawnClearRadius ** 2) continue;
        if (tileAt(s.x + dx, s.y + dy, tiles) === WALL) problems.push('出生点被挡 (' + s.x + ',' + s.y + ')');
      }
    }
  }
  return { ok: problems.length === 0, problems: problems.slice(0, 8) };
}

module.exports = {
  W, H, TILE, EMPTY, WALL, FIELD, rules, SPAWNS, PILLARS, DIRS, CELL, GRID_W, GRID_H,
  tileAt, circleHitsWall, auditField, buildMaze,
};
