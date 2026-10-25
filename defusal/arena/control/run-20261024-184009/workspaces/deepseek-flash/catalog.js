/* 爆破模式 / BOMB DEFUSAL — 规则与购买目录。
 *
 * 2 支队伍、每队 5 个单位，各由一名 AI（或本机玩家 + 4 个僚机）操控。
 * 视野按单位独立（视锥 + 近身，墙体遮挡），不做队伍共享真视。
 * 武器不在场上刷新：每回合开始进入购买阶段，按 CS 式经济自行起枪。
 * 6 回合：3 回合进攻 + 3 回合防守，先到 4 胜；3:3 平局。
 */

'use strict';

const EMPTY = 0, WALL = 1;

const rules = {
  hz: 20,
  decisionFrames: 20,
  width: 56,
  height: 34,
  tileSize: 24,

  teamSize: 5,
  unitRadius: 0.30,
  moveSpeed: 3.0,            // 格/秒；比弹幕版快，但仍是战术移动

  // 视野：朝向前方 100° 视锥，8 格；近身 2 格 360°；墙体遮挡。
  visionRange: 8,
  visionHalfAngle: 50 * Math.PI / 180,
  proximity: 2,

  maxHp: 100,
  roundTimeLimit: 100,       // 未下包时
  bombTimer: 40,             // 下包后
  plantTime: 3,
  defuseTime: 5,
  defuseKitTime: 2.5,
  bombPickupRadius: 0.65,
  plantRadius: 0.0,         // 必须在包点矩形内

  roundsTotal: 6,
  roundsToWin: 4,
  halftimeRound: 3,

  startingMoney: 800,
  maxMoney: 16000,
  winReward: 3250,
  lossReward: 1900,
  killReward: 300,
  plantReward: 300,
  defuseReward: 300,

  armorPrice: 650,
  kitPrice: 400,
};

// 购买菜单：默认手枪免费；其余按 CS 风格定价。所有枪械自动开火。
const weapons = {
  pistol: { name: '手枪', cost: 0, damage: 24, interval: 0.22, mag: 12, reserve: 60, reload: 1.8, spread: 1.5, range: 18, speed: 7.5, pellets: 1, color: '#8f9bb0' },
  pdw: { name: '微型冲锋枪', cost: 700, damage: 18, interval: 0.11, mag: 20, reserve: 80, reload: 1.6, spread: 4.0, range: 15, speed: 8.0, pellets: 1, color: '#a9f0dd' },
  smg: { name: '冲锋枪', cost: 1250, damage: 20, interval: 0.10, mag: 30, reserve: 90, reload: 2.0, spread: 3.5, range: 17, speed: 9.0, pellets: 1, color: '#7ee787' },
  rifle: { name: '步枪', cost: 2700, damage: 30, interval: 0.13, mag: 30, reserve: 90, reload: 2.2, spread: 1.8, range: 24, speed: 10.5, pellets: 1, color: '#76bcce' },
  shotgun: { name: '霰弹枪', cost: 1000, damage: 11, interval: 0.8, mag: 8, reserve: 32, reload: 2.8, spread: 7.0, range: 10, speed: 6.5, pellets: 7, color: '#ffd166' },
  sniper: { name: '狙击枪', cost: 4750, damage: 110, interval: 1.6, mag: 5, reserve: 20, reload: 3.2, spread: 0.3, range: 32, speed: 13.0, pellets: 1, color: '#c792ea' },
  lmg: { name: '机枪', cost: 4000, damage: 26, interval: 0.11, mag: 100, reserve: 200, reload: 4.5, spread: 4.5, range: 22, speed: 9.5, pellets: 1, color: '#e38978' },
};
const buyable = ['pdw', 'smg', 'rifle', 'shotgun', 'sniper', 'lmg'];

// 两个包点（左右镜像）。地图 56×34；所有位置按新尺寸放大。
const SITES = {
  A: { x1: 7, y1: 5, x2: 14, y2: 10, label: 'A' },
  B: { x1: 41, y1: 5, x2: 48, y2: 10, label: 'B' },
};

// 5 个出生点。进攻方在下，防守方在上；左右镜像地图。
const SPAWNS = {
  attack: [[26, 30], [27, 30], [28, 30], [29, 30], [30, 30]],
  defend: [[26, 3], [27, 3], [28, 3], [29, 3], [30, 3]],
};

function makeRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}

function fallbackMap() {
  const W = rules.width, H = rules.height;
  const tiles = new Uint8Array(W * H);
  const set = (x, y, v = WALL) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = v; };
  const rect = (x1, y1, x2, y2, v = WALL) => { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) set(x, y, v); };
  for (let x = 0; x < W; x++) { set(x, 0); set(x, H - 1); }
  for (let y = 0; y < H; y++) { set(0, y); set(W - 1, y); }
  rect(1, 16, W - 2, 17);
  for (const [a, b] of [[8, 13], [24, 31], [42, 47]]) rect(a, 16, b, 17, EMPTY);
  const mirrorRect = (x1, y1, x2, y2, v = WALL) => { rect(x1, y1, x2, y2, v); rect(W - 1 - x2, y1, W - 1 - x1, y2, v); };
  for (const [x, y] of [[17, 8], [17, 24], [26, 12], [25, 21]]) mirrorRect(x, y, x + 1, y + 1);
  {
    const a = SITES.A;
    const cx = Math.floor((a.x1 + a.x2) / 2), cy = Math.floor((a.y1 + a.y2) / 2);
    mirrorRect(cx - 1, cy - 1, cx + 1, cy + 1, EMPTY);
  }
  for (const side of ['attack', 'defend']) for (const [x, y] of SPAWNS[side]) rect(x - 1, y - 1, x + 1, y + 1, EMPTY);
  rect(24, 2, 31, 4, EMPTY); rect(24, 29, 31, 31, EMPTY);
  rect(27, 4, 28, 30, EMPTY); rect(10, 7, 45, 8, EMPTY);
  return tiles;
}

// 以 seed 生成左右镜像的随机地图；反复自检直到出生点/包点连通。
function buildMap(seed = 1) {
  const W = rules.width, H = rules.height;
  for (let attempt = 0; attempt < 50; attempt++) {
    const rng = makeRng((seed * 2654435761 + attempt * 1013904223) >>> 0);
    const tiles = new Uint8Array(W * H);
    const set = (x, y, v = WALL) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = v; };
    const rect = (x1, y1, x2, y2, v = WALL) => { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) set(x, y, v); };
    const mirrorRect = (x1, y1, x2, y2, v = WALL) => { rect(x1, y1, x2, y2, v); rect(W - 1 - x2, y1, W - 1 - x1, y2, v); };

    for (let x = 0; x < W; x++) { set(x, 0); set(x, H - 1); }
    for (let y = 0; y < H; y++) { set(0, y); set(W - 1, y); }

    // 中央厚墙 + 三道随机通道（左右镜像）
    rect(1, 16, W - 2, 17);
    const gapWidth = 4 + Math.floor(rng() * 3);
    const centerGap = 25 + Math.floor(rng() * 6);
    mirrorRect(centerGap - Math.floor(gapWidth / 2), 16, centerGap + Math.floor(gapWidth / 2), 17, EMPTY);
    for (let i = 0; i < 2; i++) {
      const x = 6 + Math.floor(rng() * (W / 2 - 14));
      mirrorRect(x, 16, x + gapWidth, 17, EMPTY);
    }

    // 随机掩体：只决定左半区，再镜像到右半区。
    const blocks = 26 + Math.floor(rng() * 14);
    for (let i = 0; i < blocks; i++) {
      const w = 2 + Math.floor(rng() * 3);
      const h = 2 + Math.floor(rng() * 3);
      const x = 3 + Math.floor(rng() * Math.max(1, W / 2 - 7 - w));
      const y = 3 + Math.floor(rng() * Math.max(1, H - 8 - h));
      mirrorRect(x, y, x + w - 1, y + h - 1);
    }

    // 出生区与包点中心保持可通行（对称清理）。
    rect(24, 2, 31, 4, EMPTY);
    rect(24, 29, 31, 31, EMPTY);
    // 包点中心只按 A 点清理，再严格镜像，避免偶数宽度下的不对称。
    {
      const a = SITES.A;
      const cx = Math.floor((a.x1 + a.x2) / 2), cy = Math.floor((a.y1 + a.y2) / 2);
      mirrorRect(cx - 2, cy - 2, cx + 2, cy + 2, EMPTY);
    }
    // 保证一条对称的主干道，避免随机掩体把包点/出生点封死。
    rect(27, 4, 28, 30, EMPTY);
    rect(10, 7, 45, 8, EMPTY);
    const audit = auditMap(tiles);
    if (audit.fair) return tiles;
  }
  return fallbackMap();
}

function inSite(site, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  return tx >= site.x1 && tx <= site.x2 && ty >= site.y1 && ty <= site.y2;
}

function siteAt(x, y) {
  for (const [label, site] of Object.entries(SITES)) if (inSite(site, x, y)) return label;
  return null;
}

function auditMap(tiles) {
  const W = rules.width, H = rules.height;
  let asymmetric = 0, walls = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = tiles[y * W + x], b = tiles[y * W + (W - 1 - x)];
    if (a !== b) asymmetric++;
    if (a === WALL) walls++;
  }
  let spawnBlocked = 0;
  for (const side of ['attack', 'defend']) for (const [sx, sy] of SPAWNS[side]) {
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = sx + dx, y = sy + dy;
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      if (tiles[y * W + x] === WALL) spawnBlocked++;
    }
  }
  let siteBlocked = 0;
  let siteOpen = true;
  for (const site of Object.values(SITES)) {
    let open = 0;
    for (let y = site.y1; y <= site.y2; y++) for (let x = site.x1; x <= site.x2; x++) {
      if (tiles[y * W + x] === WALL) siteBlocked++; else open++;
    }
    if (open === 0) siteOpen = false;
  }
  // 连通性：从进攻出生点到两个包点都能走通
  const start = SPAWNS.attack[2];
  const seen = new Uint8Array(W * H);
  const q = [start];
  seen[start[1] * W + start[0]] = 1;
  while (q.length) {
    const [x, y] = q.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (seen[ny * W + nx] || tiles[ny * W + nx] === WALL) continue;
      seen[ny * W + nx] = 1; q.push([nx, ny]);
    }
  }
  const reachable = (x, y) => !!seen[y * W + x];
  const sitesReachable = Object.values(SITES).every(s => reachable(Math.floor((s.x1 + s.x2) / 2), Math.floor((s.y1 + s.y2) / 2)));
  const defendReachable = SPAWNS.defend.every(([x, y]) => reachable(x, y));
  return { asymmetric, walls, spawnBlocked, siteBlocked, siteOpen, sitesReachable, defendReachable, fair: asymmetric === 0 && spawnBlocked === 0 && siteOpen && sitesReachable && defendReachable };
}

module.exports = {
  rules, weapons, buyable, SITES, SPAWNS, buildMap, auditMap, inSite, siteAt,
  TILE: { EMPTY, WALL }, EMPTY, WALL,
};
