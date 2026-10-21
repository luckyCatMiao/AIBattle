/* ============================================================
 * 00-util.js — 数学工具 / 全局常量 / 简易随机
 * ============================================================ */
'use strict';

const TAU = Math.PI * 2;

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const sign = (v) => v < 0 ? -1 : 1;
const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// 帧率无关的指数平滑
const damp = (a, b, k, dt) => lerp(a, b, 1 - Math.exp(-k * dt));

// 缓动
const easeOutCubic = t => 1 - Math.pow(1 - t, 3);
const easeInCubic = t => t * t * t;
const easeOutQuart = t => 1 - Math.pow(1 - t, 4);
const easeOutBack = t => { const c = 1.70158; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

// 矩形相交
const rectsHit = (ax, ay, aw, ah, bx, by, bw, bh) =>
  ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;

// 点到矩形最近点
const nearestOnRect = (px, py, rx, ry, rw, rh) => ({
  x: clamp(px, rx, rx + rw),
  y: clamp(py, ry, ry + rh),
});

/* ---------- 全局配置 ---------- */
const VIEW_W = 1280;
const VIEW_H = 720;
const GROUND_Y = 600;           // 地面线（逻辑坐标）
const ARENA_W = 2304;           // 战斗场地宽（相机跟随）
const GRAVITY = 2600;

const CFG = {
  player: {
    hp: 120,
    runSpeed: 380,
    accel: 4600,
    airAccel: 2600,
    friction: 5200,
    jumpVel: 920,
    airJumps: 1,
    coyote: 0.09,
    jumpBuf: 0.12,
    dashSpeed: 900,
    dashTime: 0.16,
    dashIFrames: 0.24,
    dashMax: 2,
    dashRegen: 1.05,
    hurtIFrames: 1.0,
  },
  hitstop: {
    light: 0.045,
    medium: 0.07,
    heavy: 0.105,
    charged: 0.15,
    kill: 0.16,
  },
};
