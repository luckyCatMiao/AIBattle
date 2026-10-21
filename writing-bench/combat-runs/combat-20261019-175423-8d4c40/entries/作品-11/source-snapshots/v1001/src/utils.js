// ============================================================
// utils.js — 数学工具 / 常量 / 随机数
// ============================================================
const TAU = Math.PI * 2;
const PI = Math.PI;

const VIEW_W = 1280, VIEW_H = 720;
const WORLD_W = 2240;          // 竞技场世界宽度
const GROUND_Y = 596;          // 地面（舞台地板上表面）
const GRAV = 1900;             // 重力 px/s^2
const FOOT = 38;               // 站立时盆骨离地高度（scale=1）

const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a = 1, b) => b === undefined ? Math.random() * a : a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(a + Math.random() * (b - a + 1));
const chance = p => Math.random() < p;
const choose = arr => arr[(Math.random() * arr.length) | 0];
const sign = v => v < 0 ? -1 : 1;

const smooth = t => t <= 0 ? 0 : (t >= 1 ? 1 : t * t * (3 - 2 * t));
const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
const easeIn = t => { t = clamp(t, 0, 1); return t * t * t; };
const easeOutBack = t => { const c = 1.9; t = clamp(t, 0, 1); return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };

// 确定性随机（背景装饰用）
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 点到线段最近点
function closestOnSeg(ax, ay, bx, by, px, py) {
  const dx = bx - ax, dy = by - ay;
  const l2 = dx * dx + dy * dy || 1e-6;
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / l2, 0, 1);
  return [ax + dx * t, ay + dy * t];
}

// 线段与圆相交检测
function segHit(ax, ay, bx, by, cx, cy, r) {
  const p = closestOnSeg(ax, ay, bx, by, cx, cy);
  const dx = p[0] - cx, dy = p[1] - cy;
  return dx * dx + dy * dy <= r * r;
}

function dist2(ax, ay, bx, by) { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; }

function approach(cur, tgt, amt) {
  return cur < tgt ? Math.min(cur + amt, tgt) : Math.max(cur - amt, tgt);
}
