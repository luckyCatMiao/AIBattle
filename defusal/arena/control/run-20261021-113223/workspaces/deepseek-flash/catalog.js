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
  width: 40,
  height: 24,
  tileSize: 28,

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
  pistol: { name: '手枪', cost: 0, damage: 24, interval: 0.15, mag: 12, reserve: 60, reload: 1.8, spread: 1.5, range: 16, pellets: 1, color: '#8f9bb0' },
  pdw: { name: '微型冲锋枪', cost: 700, damage: 18, interval: 0.09, mag: 20, reserve: 80, reload: 1.6, spread: 4.5, range: 13, pellets: 1, color: '#a9f0dd' },
  smg: { name: '冲锋枪', cost: 1250, damage: 20, interval: 0.08, mag: 30, reserve: 90, reload: 2.0, spread: 4.0, range: 15, pellets: 1, color: '#7ee787' },
  rifle: { name: '步枪', cost: 2700, damage: 30, interval: 0.10, mag: 30, reserve: 90, reload: 2.2, spread: 2.0, range: 22, pellets: 1, color: '#76bcce' },
  shotgun: { name: '霰弹枪', cost: 1000, damage: 11, interval: 0.75, mag: 8, reserve: 32, reload: 2.8, spread: 8.0, range: 9, pellets: 7, color: '#ffd166' },
  sniper: { name: '狙击枪', cost: 4750, damage: 110, interval: 1.5, mag: 5, reserve: 20, reload: 3.2, spread: 0.3, range: 30, pellets: 1, color: '#c792ea' },
  lmg: { name: '机枪', cost: 4000, damage: 26, interval: 0.086, mag: 100, reserve: 200, reload: 4.5, spread: 5.0, range: 20, pellets: 1, color: '#e38978' },
};
const buyable = ['pdw', 'smg', 'rifle', 'shotgun', 'sniper', 'lmg'];

// 两个包点（左右镜像）。A 在左上，B 在右上。
const SITES = {
  A: { x1: 5, y1: 4, x2: 10, y2: 7, label: 'A' },
  B: { x1: 29, y1: 4, x2: 34, y2: 7, label: 'B' },
};

// 5 个出生点。进攻方在下，防守方在上；左右镜像地图。
const SPAWNS = {
  attack: [[17, 21], [18, 21], [19, 21], [20, 21], [21, 21]],
  defend: [[17, 2], [18, 2], [19, 2], [20, 2], [21, 2]],
};

function buildMap() {
  const W = rules.width, H = rules.height;
  const tiles = new Uint8Array(W * H);
  const set = (x, y, v = WALL) => { if (x >= 0 && y >= 0 && x < W && y < H) tiles[y * W + x] = v; };
  const rect = (x1, y1, x2, y2, v = WALL) => { for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) set(x, y, v); };

  for (let x = 0; x < W; x++) { set(x, 0); set(x, H - 1); }
  for (let y = 0; y < H; y++) { set(0, y); set(W - 1, y); }

  // 中央厚墙，留三个通道（左/中/右）
  rect(1, 11, 38, 12);
  for (const [a, b] of [[8, 11], [18, 21], [28, 31]]) rect(a, 11, b, 12, EMPTY);

  // 上下半区的纵向掩体（左右镜像）
  rect(14, 3, 14, 8); rect(25, 3, 25, 8);
  rect(13, 15, 13, 20); rect(26, 15, 26, 20);

  // 包点附近与中路的掩体
  rect(7, 5, 8, 6); rect(31, 5, 32, 6);
  rect(19, 5, 20, 5);
  rect(19, 18, 20, 18);
  rect(6, 17, 8, 17); rect(31, 17, 33, 17);
  rect(11, 14, 12, 15); rect(27, 14, 28, 15);

  // 出生点必须是空地；包点保留设计好的掩体（不整体清空）。
  for (const side of ['attack', 'defend']) for (const [x, y] of SPAWNS[side]) {
    rect(x - 1, y - 1, x + 1, y + 1, EMPTY);
  }
  return tiles;
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
  const sitesReachable = Object.values(SITES).every(s => reachable(s.x1, s.y2));
  const defendReachable = SPAWNS.defend.every(([x, y]) => reachable(x, y));
  return { asymmetric, walls, spawnBlocked, siteBlocked, siteOpen, sitesReachable, defendReachable, fair: asymmetric === 0 && spawnBlocked === 0 && siteOpen && sitesReachable && defendReachable };
}

module.exports = {
  rules, weapons, buyable, SITES, SPAWNS, buildMap, auditMap, inSite, siteAt,
  TILE: { EMPTY, WALL }, EMPTY, WALL,
};
