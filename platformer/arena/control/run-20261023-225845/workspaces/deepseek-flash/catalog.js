'use strict';
/* 横版闯关竞速 · 规则。
 * 两名玩家在同一张随机生成的横版关卡里从起点出发，先摸到终点旗帜者赢一局。
 * 后面的人可以推前面的人（前面的人挡路时推得动，反之推不动）；
 * 掉进坑里或被怪物碰到会回到起点重跑。三局两胜。 */

const rules = {
  hz: 20,
  decisionFrames: 5,

  minWidth: 150,
  maxWidth: 200,
  height: 16,
  groundY: 13,            // 地面顶行（0 在最上面）

  playerW: 0.72,
  playerH: 1.35,
  gravity: 42.0,
  moveSpeed: 6.8,
  accel: 70.0,
  airAccel: 40.0,
  friction: 48.0,
  jumpSpeed: 14.0,
  maxFall: 26.0,

  pushSpeed: 4.2,         // 推人时的最大推进速度

  monsterSpeed: 1.7,
  monsterW: 0.72,
  monsterH: 0.62,
  monsterSpawnMin: 4.0,   // 秒
  monsterSpawnMax: 6.5,
  monsterMax: 3,

  roundSeconds: 90,
  respawnFreeze: 0.8,
  goalPad: 4,             // 终点旗离右端几格
  roundsToWin: 2,
  maxRounds: 3,
  matchSeconds: 420,
};

const TILE_EMPTY = 0, TILE_GROUND = 1, TILE_BRICK = 2;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeRng(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

module.exports = { rules, TILE_EMPTY, TILE_GROUND, TILE_BRICK, clamp, makeRng };
