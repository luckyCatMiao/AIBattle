/* 泡泡堂 / BLAST BUDDIES — 规则与道具目录。
 *
 * 设计目标（决定了这款游戏在比什么）：
 *  1. 双方操控完全相同的角色，没有选角、没有角色差异。胜负 100% 来自操作与决策，
 *     这是「只看控制策略」最纯粹的形式。
 *  2. 地图 180° 旋转对称：双方的软墙布局完全镜像，不存在先手几何优势。
 *  3. 【核心】反拖延机制内建在规则里，而不是事后打补丁：
 *     开局 60 秒后战场从四边向内收缩（涨水），每 2.5 秒淹没一圈，75 秒时全图淹没。
 *     所以一回合的时间上限是硬性的 75 秒——「躲着不动」不可能拖出胜利，
 *     因为水会先把你淹死。上一款格斗游戏就是因为没有这个，退化成了「谁更会缩」。
 *  4. 炸弹必须能封路：炸弹是实体障碍，放下去就走不回来（除非刚放下的那一格）。
 *     这让「堵路」成为真实战术，也让每一次放弹都是承诺。
 */

'use strict';

// 地图格编码
const EMPTY = 0, HARD = 1, SOFT = 2;

const rules = {
  hz: 20,
  decisionFrames: 20,        // 一次决策窗口 = 1 秒
  // 19×17。为什么不用更小的图：涨水从四边收缩，图太小的话中间几圈就只剩巴掌大一块，
  // 双方站着不动必然一起淹死（同归于尽），既不好看也测不出决策差异。
  // 19×17 的中心区有 9 圈可退，收缩过程能容纳真正的走位博弈。
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

  softDensity: 0.68,         // 软墙填充密度（镜像成对放置）
  powerupChance: 0.38,       // 软墙被炸毁时掉落道具的概率

  // 涨水（反拖延核心）
  // 节奏：40 秒后开始收缩，每 2.5 秒一圈。
  // 出生点距边 1 格 → 第 2 圈被淹（42.5 秒）；中心距边 8 格 → 第 9 圈被淹（60 秒）。
  // 单局硬上限约 65 秒：给 40 秒自由博弈，剩下 20 秒把所有人逼到中央接触。
  floodStart: 40,
  floodInterval: 2.5,
  floodMaxRing: 10,

  // 赛制
  roundWinsToTakeMatch: 3,   // 五局三胜
  maxRounds: 5,

  // 出生点必须是 180° 镜像对：(1,1) 的镜像是 (width-2, height-2)。
  // 改地图尺寸时这两个值必须同步改——auditMap 的 spawnMirrored 会把它变成硬失败。
  spawns: [[1, 1], [17, 15]],
};

// 出生点区域保持空旷，避免开局就被自己的软墙困死
const SPAWN_CLEAR = 1;

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

// 涨水圈数 -> 该格是否被淹没。以四边为起点取最小距离。
function floodRingAt(ring, x, y) {
  const d = Math.min(x, y, rules.width - 1 - x, rules.height - 1 - y);
  return d < ring;
}

/* ---------- 地图公平性自检 ----------
 * 这是「双方起点完全相同」这句话的可验证依据，裁判每局开局都会跑一次：
 *   1. 软墙必须严格 180° 镜像（asymmetric === 0）
 *   2. 出生点必须是镜像对（spawnMirrored）
 *   3. 两个出生区都不能有软墙（spawnBlocked === 0）
 * 第 2 条是后加的：改地图尺寸时忘了同步出生点，(1,1) 的镜像对只剩一边，
 * 结果是双方距中心距离不同——公平性当场就没了，而且不报错看不出来。 */
function auditMap(tiles, g) {
  const W = rules.width, H = rules.height;
  let asymmetric = 0, soft = 0, hard = 0, spawnBlocked = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const a = tiles[y * W + x];
    const b = tiles[(H - 1 - y) * W + (W - 1 - x)];
    if (a !== b) asymmetric++;
    if (a === SOFT) soft++;
    if (a === HARD) hard++;
  }
  for (const [sx, sy] of rules.spawns) {
    for (let dy = -SPAWN_CLEAR; dy <= SPAWN_CLEAR; dy++) {
      for (let dx = -SPAWN_CLEAR; dx <= SPAWN_CLEAR; dx++) {
        const x = sx + dx, y = sy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        if (tiles[y * W + x] === SOFT) spawnBlocked++;
      }
    }
  }
  const [[ax, ay], [bx, by]] = rules.spawns;
  const spawnMirrored = ax + bx === W - 1 && ay + by === H - 1;
  const cx = (W - 1) / 2, cy = (H - 1) / 2;
  const equidistant = Math.abs(ax - cx) === Math.abs(bx - cx) && Math.abs(ay - cy) === Math.abs(by - cy);
  const fair = asymmetric === 0 && spawnBlocked === 0 && spawnMirrored && equidistant;
  return { asymmetric, soft, hard, spawnBlocked, spawnMirrored, equidistant, fair };
}

module.exports = {
  rules, powerups, powerupTypes, moveFrames, floodRingAt, auditMap,
  TILE: { EMPTY, HARD, SOFT }, EMPTY, HARD, SOFT, SPAWN_CLEAR,
};
