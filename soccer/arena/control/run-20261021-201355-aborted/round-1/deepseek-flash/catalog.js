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
  teamSize: 3,

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

// 开球站位：每队 3 人，左队在中圈左侧，右队在中圈右侧。
const SPAWNS = {
  0: [[7, 7], [7, 13], [7, 19]],
  1: [[W - 8, 7], [W - 8, 13], [W - 8, 19]],
};

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
  buildField, auditField, inGoalMouth, FIELD: buildField(),
};
