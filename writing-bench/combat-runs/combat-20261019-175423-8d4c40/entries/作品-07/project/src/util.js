// ============================================================================
// util.js — 数学与几何小工具
// ============================================================================

function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
function lerp(a, b, t) { return a + (b - a) * t; }
function rand(a, b) { return a + Math.random() * (b - a); }
function randi(a, b) { return Math.floor(a + Math.random() * (b - a + 1)); }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
function sign(x) { return x < 0 ? -1 : (x > 0 ? 1 : 0); }
function dist2(x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1; return dx * dx + dy * dy; }
// 向目标值按最大步长逼近
function approach(v, target, maxStep) {
  if (v < target) return Math.min(v + maxStep, target);
  if (v > target) return Math.max(v - maxStep, target);
  return v;
}

function easeOutCubic(t) { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); }
function easeOutBack(t) { t = clamp(t, 0, 1); const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
function easeInCubic(t) { t = clamp(t, 0, 1); return t * t * t; }

// 最短角度插值（弧度）
function angleLerp(a, b, t) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// 轴对齐矩形相交
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

// 圆与轴对齐矩形相交
function circleRect(cx, cy, r, rx, ry, rw, rh) {
  const nx = clamp(cx, rx, rx + rw);
  const ny = clamp(cy, ry, ry + rh);
  const dx = cx - nx, dy = cy - ny;
  return dx * dx + dy * dy <= r * r;
}

// 世界命中盒（中心 + 半宽高）转成左上角矩形
function hbRect(hb, x, y) {
  return { x: x - hb.w / 2, y: y - hb.h / 2, w: hb.w, h: hb.h };
}

// 带索引的简单伪随机（用于稳定的视觉噪声，不做关键逻辑）
function hash01(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}
