/* ============================================================
   绯刃 · 月下斩 — utility math, colors, tiny helpers
   ============================================================ */
const TAU = Math.PI * 2;
const PI = Math.PI;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a), 0, 1));
const sgn = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInCubic = (t) => t * t * t;
const easeOutQuint = (t) => 1 - Math.pow(1 - t, 5);
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOutBack = (t) => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2);
const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
const randInt = (min, max) => Math.floor(min + Math.random() * (max - min + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const chance = (p) => Math.random() < p;
const hypot = (x, y) => Math.sqrt(x * x + y * y);
const angleTo = (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1);
const angLerp = (a, b, t) => {
  let d = ((b - a + PI) % TAU + TAU) % TAU - PI;
  return a + d * t;
};
const smoothstep = (a, b, t) => {
  const x = clamp((t - a) / (b - a), 0, 1);
  return x * x * (3 - 2 * x);
};
const roundRect = (ctx, x, y, w, h, r) => {
  const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
};

/* deterministic RNG for scenery */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* color helpers */
function hexToRgb(hex) {
  if (typeof hex !== "string") return [255, 255, 255];
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rgba(hex, a) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}
function rgbStr(hex) {
  const [r, g, b] = hexToRgb(hex);
  return `rgb(${r},${g},${b})`;
}
function mixHex(a, b, t) {
  const A = hexToRgb(a);
  const B = hexToRgb(b);
  return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
}
function shade(hex, t) {
  return mixHex(hex, t < 0 ? "#000000" : "#ffffff", Math.abs(t));
}

/* canvas drawing helpers */
function lineRod(ctx, a, b, w, color, cap = "round") {
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = cap;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
}
function taperedRod(ctx, a, b, w0, w1, fill) {
  const ang = Math.atan2(b.y - a.y, b.x - a.x) + PI / 2;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  ctx.beginPath();
  ctx.moveTo(a.x + (ca * w0) / 2, a.y + (sa * w0) / 2);
  ctx.lineTo(b.x + (ca * w1) / 2, b.y + (sa * w1) / 2);
  ctx.lineTo(b.x - (ca * w1) / 2, b.y - (sa * w1) / 2);
  ctx.lineTo(a.x - (ca * w0) / 2, a.y - (sa * w0) / 2);
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
}
function circle(ctx, x, y, r, fill) {
  ctx.beginPath();
  ctx.arc(x, y, Math.max(0.1, r), 0, TAU);
  ctx.fillStyle = fill;
  ctx.fill();
}
function glowCircle(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(color, alpha));
  g.addColorStop(0.35, rgba(color, alpha * 0.55));
  g.addColorStop(1, rgba(color, 0));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
}
function poly(ctx, pts, fill, stroke = null, lw = 1) {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.stroke();
  }
}
function twoBone(a, target, l1, l2, bend) {
  let dx = target.x - a.x;
  let dy = target.y - a.y;
  let d = Math.sqrt(dx * dx + dy * dy);
  const maxD = l1 + l2 - 0.5;
  const minD = Math.abs(l1 - l2) + 0.5;
  if (d < 0.001) d = 0.001;
  const base = Math.atan2(dy, dx);
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const off = Math.acos(cosA) * bend;
  return { x: a.x + Math.cos(base + off) * l1, y: a.y + Math.sin(base + off) * l1 };
}
function pointAlong(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}
function rotatePoint(p, ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
}
function distPointSeg(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
  const dx = px - (ax + vx * t);
  const dy = py - (ay + vy * t);
  return Math.sqrt(dx * dx + dy * dy);
}
function seededRange(rng, a, b) {
  return a + rng() * (b - a);
}
function fmtNum(n) {
  return String(n);
}
const ROMAN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十"];
function cnNum(n) {
  if (n <= 10) return ROMAN[n];
  if (n < 20) return "十" + ROMAN[n - 10];
  if (n < 100) {
    const a = Math.floor(n / 10);
    const b = n % 10;
    return ROMAN[a] + "十" + (b ? ROMAN[b] : "");
  }
  return String(n);
}
