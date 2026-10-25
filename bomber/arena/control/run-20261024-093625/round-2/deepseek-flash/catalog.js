/* 泡泡堂 / BLAST BUDDIES — 规则与道具目录。
 *
 * 设计目标（决定了这款游戏在比什么）：
 *  1. 所有席位操控完全相同的角色，没有选角、没有角色差异、没有属性克制。
 *  2. 地图四向（上下、左右）镜像：所有出生角落的软墙布局完全一致，
 *     不存在某个席位天然离资源更近的几何优势。
 *  3. 不设涨水或时间收缩。对局由道具与进攻推动：炸毁软墙会掉落
 *     炸弹 +1 / 火力 +1 / 速度 +1，装备优势会滚雪球。
 *     为了不让双方无限躲藏，单局有 150 秒硬上限，时间到判平局。
 *  4. 炸弹必须能封路：炸弹是实体障碍，放下去就走不回来（除非刚放下的那一格）。
 *     这让「堵路」成为真实战术，也让每一次放弹都是承诺。
 */

'use strict';

// 地图格编码
const EMPTY = 0, HARD = 1, SOFT = 2;

const rules = {
  hz: 20,
  decisionFrames: 20,        // 一次决策窗口 = 1 秒
  // 19×17：四角出生，中央有足够空间展开多方向的走位。
  width: 19,
  height: 17,
  tileSize: 48,              // 仅用于渲染

  // 移动以「格」为单位：从一格中心走到相邻格中心耗 framesPerTile 帧。
  framesPerTile: 6,          // 3.33 格/秒
  framesPerTileMin: 3,       // 速度拉满时 6.67 格/秒

  baseBombs: 1, bombsMax: 6,
  baseBlast: 1, blastMax: 6,

  fuseFrames: 40,            // 引信 2 秒
  blastFrames: 12,           // 火焰持续 0.6 秒

  softDensity: 0.68,         // 软墙填充密度（四向镜像成组放置）
  powerupChance: 0.55,       // 软墙被炸毁时掉落道具的概率

  // 单局硬上限。时间到双方仍在场则判平局，避免无涨水后的无限躲藏。
  roundTimeLimit: 150,

  // 赛制
  roundWinsToTakeMatch: 3,   // 五局三胜
  maxRounds: 5,

  // 支持 2–4 人同场。四个出生角本身是四向镜像等价的；
  // 每局按轮次旋转席位与出生角的对应关系，长系列里每人机会均等。
  minPlayers: 2,
  maxPlayers: 4,
};

// 出生点区域保持空旷，避免开局就被自己的软墙困死
const SPAWN_CLEAR = 1;

// 四个出生角（顺时针）。改地图尺寸时由 width/height 自动推导。
const SPAWN_CORNERS = [
  [1, 1],
  [rules.width - 2, 1],
  [rules.width - 2, rules.height - 2],
  [1, rules.height - 2],
];

/* 为 count 名选手选出生角，并按局数旋转。
 * 2 人取对角（最公平、开局距离最远）；3 人取连续三角；4 人全部四角。
 * 旋转让同一席位在多局系列里不会永远站在同一个角。 */
function spawnsFor(count, round = 1) {
  if (count < rules.minPlayers || count > rules.maxPlayers) throw Error('泡泡堂支持 2–4 名选手');
  const base = ((round - 1) % 4 + 4) % 4;
  const order = count === 2
    ? [base, (base + 2) % 4]
    : count === 3
      ? [base, (base + 1) % 4, (base + 2) % 4]
      : [base, (base + 1) % 4, (base + 2) % 4, (base + 3) % 4];
  return order.map(i => SPAWN_CORNERS[i]);
}

// 道具。掉落权重决定三种道具的相对稀有度。
const powerups = {
  bomb: { name: '炸弹 +1', rune: '✦', color: '#8fe6ff', weight: 0.40 },
  blast: { name: '火力 +1', rune: '✸', color: '#ffb36b', weight: 0.35 },
  speed: { name: '速度 +1', rune: '➤', color: '#a9f0dd', weight: 0.25 },
};
const powerupTypes = Object.keys(powerups);

// 移动一格需要多少帧（速度等级越高越快）
function moveFrames(level) {
  return Math.max(rules.framesPerTileMin, rules.framesPerTile - level);
}

/* ---------- 地图公平性自检 ----------
 * 这是「所有席位起点完全相同」这句话的可验证依据，裁判每局开局都会跑一次：
 *   1. 软墙必须严格上下、左右镜像（asymmetric === 0）
 *   2. 每个出生角都必须是镜像等价的角
 *   3. 所有出生区都不能有软墙（spawnBlocked === 0）
 */
function auditMap(tiles, spawns) {
  const W = rules.width, H = rules.height;
  let asymmetric = 0, soft = 0, hard = 0, spawnBlocked = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = tiles[y * W + x];
    if (a !== tiles[y * W + (W - 1 - x)]) asymmetric++;
    else if (a !== tiles[(H - 1 - y) * W + x]) asymmetric++;
    if (a === SOFT) soft++;
    if (a === HARD) hard++;
  }
  const points = spawns && spawns.length ? spawns : SPAWN_CORNERS;
  for (const [sx, sy] of points) {
    for (let dy = -SPAWN_CLEAR; dy <= SPAWN_CLEAR; dy++) {
      for (let dx = -SPAWN_CLEAR; dx <= SPAWN_CLEAR; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (tiles[y * W + x] === SOFT) spawnBlocked++;
      }
    }
  }
  const corners = new Set(SPAWN_CORNERS.map(([x, y]) => x + ',' + y));
  const spawnsCornered = points.every(([x, y]) => corners.has(x + ',' + y));
  const fair = asymmetric === 0 && spawnBlocked === 0 && spawnsCornered;
  return {
    asymmetric, soft, hard, spawnBlocked, spawns: points.map(([x, y]) => [x, y]),
    spawnsCornered, spawnsMirrored: spawnsCornered, fair,
  };
}

module.exports = {
  rules, powerups, powerupTypes, moveFrames, auditMap, spawnsFor,
  TILE: { EMPTY, HARD, SOFT }, EMPTY, HARD, SOFT, SPAWN_CLEAR, SPAWN_CORNERS,
};
