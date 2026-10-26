'use strict';
/* 无尽弹墙对决 · 规则目录
 *
 * 设计要点：
 * - 双方移动很快（13 格/秒），子弹只有 8.5 格/秒，所以单发子弹可以靠走位躲开。
 * - 子弹永不消失、永不减速，撞墙只反射；自己的子弹不会命中自己。
 * - 场上子弹会越来越多，最终必然有人被流弹击中。
 * - 谁先被对方子弹击中谁就输（一枪致命，没有血量）。
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
  fireCooldown: 1.2,          // 秒：一发一发地打
  matchSeconds: 120,
  wallRestitution: 1,         // 完全弹性，永远不衰减
  spawnClearRadius: 2.5,
};

// 出生点：左右中线，互相面对。镜像对称（x -> W-1-x）。
const SPAWNS = [
  { x: 5, y: (H - 1) / 2, dir: 'R' },
  { x: W - 6, y: (H - 1) / 2, dir: 'L' },
];

// 场内掩护柱：全部做 180° 旋转对称（x -> W-x-w, y -> H-y-h），保证两边完全对等。
const PILLARS = [
  // 每对都是 180° 旋转对称（(x,y) -> (W-1-x, H-1-y)），保证两边完全对等。
  { x: 8, y: 6, w: 4, h: 2 }, { x: 28, y: 22, w: 4, h: 2 },
  { x: 8, y: 22, w: 4, h: 2 }, { x: 28, y: 6, w: 4, h: 2 },
  { x: 19, y: 4, w: 2, h: 3 }, { x: 19, y: 23, w: 2, h: 3 },
  { x: 19, y: 13, w: 2, h: 4 }, // 正中，自身对称
];

const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};

function buildField() {
  const tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) tiles[y * W + x] = WALL;
    }
  }
  for (const p of PILLARS) {
    for (let y = p.y; y < p.y + p.h; y++) {
      for (let x = p.x; x < p.x + p.w; x++) {
        if (x > 0 && y > 0 && x < W - 1 && y < H - 1) tiles[y * W + x] = WALL;
      }
    }
  }
  return tiles;
}

const FIELD = buildField();
const tileAt = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? WALL : FIELD[Math.floor(y) * W + Math.floor(x)];

function auditField() {
  const problems = [];
  // 旋转对称：任何格子 (x,y) 与 (W-1-x,H-1-y) 类型必须相同。
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const a = FIELD[y * W + x], b = FIELD[(H - 1 - y) * W + (W - 1 - x)];
      if (a !== b) problems.push(`不对称 (${x},${y})`);
    }
  }
  for (const s of SPAWNS) {
    for (let dy = -rules.spawnClearRadius; dy <= rules.spawnClearRadius; dy++) {
      for (let dx = -rules.spawnClearRadius; dx <= rules.spawnClearRadius; dx++) {
        if (dx * dx + dy * dy > rules.spawnClearRadius ** 2) continue;
        if (tileAt(s.x + dx, s.y + dy) === WALL) problems.push(`出生点被挡 (${s.x},${s.y})`);
      }
    }
  }
  return { ok: problems.length === 0, problems: problems.slice(0, 8) };
}

// 圆与墙的碰撞采样：在圆周取 8 个点，任一落在墙里就算碰撞。
function circleHitsWall(x, y, r) {
  if (tileAt(x, y) === WALL) return true;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    if (tileAt(x + Math.cos(a) * r, y + Math.sin(a) * r) === WALL) return true;
  }
  return false;
}

module.exports = {
  W, H, TILE, EMPTY, WALL, FIELD, rules, SPAWNS, PILLARS, DIRS,
  tileAt, circleHitsWall, buildField, auditField,
};
