'use strict';
// ---------------------------------------------------------------------------
// Small math / helper library
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const chance = (p) => Math.random() < p;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const sign = (v) => v < 0 ? -1 : 1;
const sq = (v) => v * v;
const dist = (ax, ay, bx, by) => Math.hypot(bx - ax, by - ay);

const ease = {
  outCubic: t => 1 - Math.pow(1 - t, 3),
  inCubic: t => t * t * t,
  inOutCubic: t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
  outQuart: t => 1 - Math.pow(1 - t, 4),
  inQuart: t => t * t * t * t,
  outExpo: t => t >= 1 ? 1 : 1 - Math.pow(2, -10 * t),
  inExpo: t => t === 0 ? 0 : Math.pow(2, 10 * t - 10),
  outBack: t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2),
  outElastic: t => t === 0 ? 0 : t === 1 ? 1 : Math.pow(2, -9 * t) * Math.sin((t * 10 - .75) * (TAU / 3)) + 1,
  smooth: t => t * t * (3 - 2 * t),
};

// Range map with clamping
const mapRange = (v, a, b, c, d) => c + (d - c) * clamp((v - a) / (b - a), 0, 1);

// Angle helpers (radians, screen space: +x right, +y down)
const angTo = (ax, ay, bx, by) => Math.atan2(by - ay, bx - ax);
const angNorm = a => { a %= TAU; if (a > Math.PI) a -= TAU; if (a < -Math.PI) a += TAU; return a; };
const angDamp = (a, b, lambda, dt) => a + angNorm(b - a) * (1 - Math.exp(-lambda * dt));

// 2-bone IK: hip/shoulder at (hx,hy), target (tx,ty), lengths l1,l2.
// Returns joint position. bend sign flips the elbow/knee direction.
function ik(hx, hy, tx, ty, l1, l2, bend = 1) {
  let dx = tx - hx, dy = ty - hy;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.001;
  if (d > maxD) { dx *= maxD / d; dy *= maxD / d; d = maxD; }
  if (d < 0.001) return { x: hx, y: hy, ex: tx, ey: ty };
  const a = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const base = Math.atan2(dy, dx);
  const ang = base + a * bend;
  return { x: hx + Math.cos(ang) * l1, y: hy + Math.sin(ang) * l1, ex: hx + Math.cos(base) * d, ey: hy + Math.sin(base) * d };
}

// Simple 2D value noise for organic sway
function hash2(x, y) {
  let h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}
function noise2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return lerp(lerp(a, b, u), lerp(c, d, u), v);
}

// Format numbers nicely
const fmt = n => n >= 10000 ? (n / 1000).toFixed(1) + 'k' : Math.round(n).toString();

// Deterministic value for visual variety
const hash1 = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

// Closest point on segment AB to point P
function closestOnSeg(px, py, ax, ay, bx, by) {
  const abx = bx - ax, aby = by - ay;
  const len2 = abx * abx + aby * aby;
  let t = len2 > 0 ? ((px - ax) * abx + (py - ay) * aby) / len2 : 0;
  t = clamp(t, 0, 1);
  return { x: ax + abx * t, y: ay + aby * t, t };
}

// Minimum distance between two segments (returns {d, px, py}) — px,py on segment 2
function segSegDist(ax, ay, bx, by, cx, cy, dx, dy) {
  // Check endpoint projections both ways + intersection fallback
  let best = { d: Infinity, px: cx, py: cy };
  const c1 = closestOnSeg(ax, ay, cx, cy, dx, dy);
  let d = Math.hypot(ax - c1.x, ay - c1.y);
  if (d < best.d) best = { d, px: c1.x, py: c1.y };
  const c2 = closestOnSeg(bx, by, cx, cy, dx, dy);
  d = Math.hypot(bx - c2.x, by - c2.y);
  if (d < best.d) best = { d, px: c2.x, py: c2.y };
  const c3 = closestOnSeg(cx, cy, ax, ay, bx, by);
  d = Math.hypot(c3.x - cx, c3.y - cy);
  if (d < best.d) best = { d, px: c3.x, py: c3.y };
  const c4 = closestOnSeg(dx, dy, ax, ay, bx, by);
  d = Math.hypot(c4.x - dx, c4.y - dy);
  if (d < best.d) best = { d, px: c4.x, py: c4.y };
  // Proper intersection test
  const den = (bx - ax) * (dy - cy) - (by - ay) * (dx - cx);
  if (Math.abs(den) > 1e-6) {
    const t = ((cx - ax) * (dy - cy) - (cy - ay) * (dx - cx)) / den;
    const u = ((cx - ax) * (by - ay) - (cy - ay) * (bx - ax)) / den;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      const ix = ax + (bx - ax) * t, iy = ay + (by - ay) * t;
      best = { d: 0, px: ix, py: iy };
    }
  }
  return best;
}

function pointSegDist(px, py, ax, ay, bx, by) {
  const c = closestOnSeg(px, py, ax, ay, bx, by);
  return { d: Math.hypot(px - c.x, py - c.y), x: c.x, y: c.y };
}

// Blend two hex colours (#rrggbb) — used for hit flashes / tints
function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ar = (pa >> 16) & 255, ag = (pa >> 8) & 255, ab = pa & 255;
  const br = (pb >> 16) & 255, bg = (pb >> 8) & 255, bb = pb & 255;
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | bl).toString(16).slice(1);
}
