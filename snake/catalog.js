'use strict';
/* 贪吃蛇对战 · 规则。
 * 34×24 网格，两条蛇同时移动；每 4 个物理帧走一格（5 格/秒）。
 * 场上始终保持 3 颗食物：吃掉一颗立刻在随机空格刷新一颗（无限供应）。
 * 吃一颗长 2 节；撞墙/撞自己/撞对方身体即死。
 * 一局 = 五局三胜，双方同帧死亡或超时同长度记平局。 */

const rules = {
  hz: 20,
  tickFrames: 4,          // 每 4 帧走一格 = 5 格/秒
  decisionFrames: 10,

  width: 34,
  height: 24,
  startLength: 4,
  foodCount: 3,
  foodGrowth: 2,
  wallBlocksMin: 3,
  wallBlocksMax: 7,
  wallBlockSize: 3,       // 障碍块最大边长

  roundSeconds: 45,
  roundFreeze: 1.0,       // 秒
  roundsToWin: 3,
  maxRounds: 5,
  matchSeconds: 360,
};

const DIRS = {
  U: { x: 0, y: -1 }, D: { x: 0, y: 1 }, L: { x: -1, y: 0 }, R: { x: 1, y: 0 },
};
const OPPOSITE = { U: 'D', D: 'U', L: 'R', R: 'L' };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function makeRng(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

module.exports = { rules, DIRS, OPPOSITE, clamp, makeRng };
