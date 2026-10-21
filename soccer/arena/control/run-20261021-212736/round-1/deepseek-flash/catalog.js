'use strict';
/* 3V3 足球 · 规则与静态数据。
 * 竞技场是封闭的室内球场：四周有墙，左右各一个球门。
 * 所有数值只在这里定义，simulation.js 与前端都从这里引用。 */

const TILE = 24;
const W = 44, H = 26;

const rules = {
  hz: 20,
  decisionFrames: 20,
  width: W,
  height: H,
  tileSize: TILE,

  // 每局双方人数相同，在 1–6 之间按 seed 随机；实际人数见观察里的 teamSize。
  teamSize: 6,        // 兼容字段：允许的最大人数
  minTeamSize: 1,
  maxTeamSize: 6,

  unitRadius: 0.34,
  moveSpeed: 3.15,
  ballRadius: 0.22,

  // 控球与踢球
  controlRadius: 0.82,    // 进入这个距离即可拿球/抢断
  tackleMargin: 0.12,     // 比当前持球者近这么多才能抢走
  dribbleDistance: 0.62,  // 球被控时位于球员朝向前方多远
  kickPower: 14.0,        // 格/秒
  kickCooldown: 0.35,     // 秒
  controlLock: 0.30,      // 踢球后自身不能立刻重新控球
  stealLock: 0.18,        // 刚被抢断的一方短暂不能反抢

  // 球
  ballFriction: 0.97,     // 每物理帧速度乘数（20 Hz）
  wallRestitution: 0.72,

  // 比赛
  matchSeconds: 120,
  halfSeconds: 60,
  goldenGoalSeconds: 20,
  kickoffFreeze: 0.6,     // 进球后重新开球的冻结时间

  // 球门：y 从 10 到 16（6 格宽），x=0 / x=43 的边墙在这段留空
  goalTop: 10,
  goalBottom: 16,
  goalDepth: 0.55,        // 球心越过球门线这么多就算进球
};

const GOALS = {
  0: { x: 0, dir: 1, y1: rules.goalTop, y2: rules.goalBottom },          // 队伍 0 守左门，向右进攻
  1: { x: W - 1, dir: -1, y1: rules.goalTop, y2: rules.goalBottom },     // 队伍 1 守右门
};

// 每局按 seed 决定人数：1–6，双方相同。
function teamSizeForSeed(seed) {
  let x = ((Number(seed) || 0) ^ 0x9e3779b9) >>> 0;
  x ^= x << 13; x >>>= 0;
  x ^= x >>> 17;
  x ^= x << 5; x >>>= 0;
  return 1 + (x % 6);
}

// 1–6 人各自的开球纵向站位；左右两队镜像。
const SPAWN_Y = {
  1: [13],
  2: [9, 17],
  3: [7, 13, 19],
  4: [6, 10, 16, 20],
  5: [5, 9, 13, 17, 21],
  6: [3, 7, 11, 15, 19, 23],
};
function spawnsFor(n) {
  if (!Number.isInteger(n) || n < rules.minTeamSize || n > rules.maxTeamSize) throw Error('人数必须是 1–6');
  return {
    0: SPAWN_Y[n].map(y => [7, y]),
    1: SPAWN_Y[n].map(y => [W - 8, y]),
  };
}
const SPAWNS = spawnsFor(3); // 兼容旧引用；实际对局使用 spawnsFor(teamSize)

const BALL_SPAWN = { x: W / 2, y: H / 2 };

const EMPTY = 0, WALL = 1;

function buildField() {
  const tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const border = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      if (!border) continue;
      // 左右边墙在球门高度留空
      const goalMouth = (x === 0 || x === W - 1) && y >= rules.goalTop && y < rules.goalBottom;
      if (!goalMouth) tiles[y * W + x] = WALL;
    }
  }
  return tiles;
}

// 球门区域（用于渲染与判定）。球心越过球门线即得分。
function inGoalMouth(x, y) {
  return y >= rules.goalTop + 0.5 && y <= rules.goalBottom - 0.5;
}

function auditField(tiles) {
  let walls = 0, mouthTiles = 0;
  for (let i = 0; i < tiles.length; i++) if (tiles[i] === WALL) walls++;
  for (const g of Object.values(GOALS)) {
    for (let y = g.y1; y < g.y2; y++) if (tiles[y * W + g.x] === EMPTY) mouthTiles++;
  }
  return {
    walls,
    mouthTiles,
    goalMouthsOpen: mouthTiles === (rules.goalBottom - rules.goalTop) * 2,
    symmetric: W % 2 === 0,
  };
}

module.exports = {
  rules, GOALS, SPAWNS, BALL_SPAWN, TILE, W, H, EMPTY, WALL,
  teamSizeForSeed, spawnsFor, SPAWN_Y,
  buildField, auditField, inGoalMouth, FIELD: buildField(),
};
