'use strict';
/* 俯视角赛车 · 随机赛道与规则。
 * 每条赛道按 seed 生成闭合的中心线，再沿中心线铺出带边界的沥青路面。
 * 车是俯视 2D 刚体：油门、转向、漂移、漂移蓄能、喷火加速、车车碰撞。 */

const TILE = 16;
const W = 64, H = 44;
const TAU = Math.PI * 2;

const rules = {
  hz: 20,
  decisionFrames: 20,
  width: W,
  height: H,
  tileSize: TILE,
  laps: 3,
  matchSeconds: 150,
  countdownSeconds: 1.5,

  carRadius: 0.55,
  accel: 17.0,
  brake: 26.0,
  reverseAccel: 8.0,
  maxSpeed: 14.0,
  boostMaxSpeed: 23.0,
  boostAccel: 30.0,
  drag: 0.6,               // 每秒速度衰减（乘数 = exp(-drag*dt)）
  gripNormal: 0.80,        // 普通抓地：每帧侧向速度保留
  gripDrift: 0.985,        // 漂移时侧向速度保留更多
  turnRate: 3.2,           // 弧度/秒（速度足够时）
  driftTurnBoost: 1.6,
  driftMinSpeed: 4.0,
  driftChargeRate: 0.55,   // 每秒蓄能（随侧滑增加）
  boostDrain: 0.6,         // 每秒消耗能量
  collisionRestitution: 0.55,
  wallRestitution: 0.45,
  offRoadMax: 7.0,
  offRoadAccel: 0.35,
  offRoadDrag: 0.94,       // 每帧额外乘数
  checkpointCount: 12,
  checkpointRadiusPad: 0.6,
  trackMinHalfWidth: 3.2,
  trackMaxHalfWidth: 4.4,
};

const ROAD = 0, GRASS = 1, WALL = 2;

function makeRng(seed) {
  let s = (Number(seed) || 1) >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ============================ 赛道生成 ============================ */

function catmullClosed(pts, per = 10) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    for (let k = 0; k < per; k++) {
      const t = k / per, t2 = t * t, t3 = t2 * t;
      out.push({
        x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
        y: 0.5 * ((2 * p1.y) + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
      });
    }
  }
  return out;
}

function fitPoints(points, margin) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y); }
  const bw = maxX - minX || 1, bh = maxY - minY || 1;
  const s = Math.min((W - margin * 2) / bw, (H - margin * 2) / bh);
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  return points.map(p => ({ x: W / 2 + (p.x - cx) * s, y: H / 2 + (p.y - cy) * s }));
}

function cumulative(points) {
  const cum = [0];
  for (let i = 1; i <= points.length; i++) {
    const a = points[i - 1], b = points[i % points.length];
    cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.y - a.y));
  }
  return cum;
}

function pointAtLength(points, cum, s) {
  const total = cum[cum.length - 1];
  s = ((s % total) + total) % total;
  let lo = 0, hi = cum.length - 1;
  while (lo + 1 < hi) { const mid = (lo + hi) >> 1; if (cum[mid] <= s) lo = mid; else hi = mid; }
  const a = points[lo], b = points[(lo + 1) % points.length];
  const seg = cum[lo + 1] - cum[lo] || 1;
  const t = (s - cum[lo]) / seg;
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, angle: Math.atan2(b.y - a.y, b.x - a.x) };
}

function nearestOnTrack(track, x, y) {
  const pts = track.points;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - x, dy = pts[i].y - y, d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = i; }
  }
  return { index: best, distance: Math.sqrt(bestD), s: track.cum[best] };
}

function distanceToPolyline(points, x, y) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const vx = b.x - a.x, vy = b.y - a.y;
    const wx = x - a.x, wy = y - a.y;
    const len2 = vx * vx + vy * vy || 1;
    const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
    const px = a.x + vx * t, py = a.y + vy * t;
    const d = Math.hypot(x - px, y - py);
    if (d < best) best = d;
  }
  return best;
}

function minSelfDistance(points, minArc = 0, cum = null) {
  // 只比较“沿赛道相隔足够远”的两点，避免把同一条直道上的相邻点误判成重叠。
  let best = Infinity;
  const n = points.length;
  const c = cum || cumulative(points);
  const total = c[c.length - 1];
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      let ds = Math.abs(c[j] - c[i]);
      ds = Math.min(ds, total - ds);
      if (ds < minArc) continue;
      const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y;
      const dd = Math.hypot(dx, dy);
      if (dd < best) best = dd;
    }
  }
  return best;
}

function buildFromPoints(points, halfWidth, seed, auditExtra = {}) {
  const cum = cumulative(points);
  const length = cum[cum.length - 1];
  const tiles = new Uint8Array(W * H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (x === 0 || y === 0 || x === W - 1 || y === H - 1) { tiles[y * W + x] = WALL; continue; }
      tiles[y * W + x] = distanceToPolyline(points, x + 0.5, y + 0.5) <= halfWidth ? ROAD : GRASS;
    }
  }
  const start = pointAtLength(points, cum, 0);
  const grid = [];
  for (let i = 0; i < 2; i++) {
    const p = pointAtLength(points, cum, length - (4 + i * 4));
    const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
    const side = i === 0 ? -1.6 : 1.6;
    grid.push({ x: p.x + nx * side, y: p.y + ny * side, angle: p.angle });
  }
  const checkpoints = [];
  for (let i = 0; i < rules.checkpointCount; i++) {
    const p = pointAtLength(points, cum, (i / rules.checkpointCount) * length);
    checkpoints.push({ x: p.x, y: p.y, angle: p.angle, radius: halfWidth + rules.checkpointRadiusPad });
  }
  const track = {
    width: W, height: H, tiles: Array.from(tiles), points, cum, length,
    halfWidth, start, grid, checkpoints,
    seed,
  };
  track.audit = auditTrack(track, auditExtra);
  return track;
}

function auditTrack(track, extra = {}) {
  let roadTiles = 0;
  for (const t of track.tiles) if (t === ROAD) roadTiles++;
  const minSelf = minSelfDistance(track.points, track.halfWidth * 2 + 3, track.cum);
  const startOnRoad = distanceToPolyline(track.points, track.start.x, track.start.y) <= track.halfWidth;
  const gridOnRoad = track.grid.every(g => distanceToPolyline(track.points, g.x, g.y) <= track.halfWidth);
  return {
    roadTiles, length: track.length, halfWidth: track.halfWidth,
    minSelfDistance: minSelf, startOnRoad, gridOnRoad,
    valid: roadTiles > 0 && startOnRoad && gridOnRoad && minSelf > track.halfWidth * 2 + 0.8,
    ...extra,
  };
}

function buildTrack(seed) {
  const baseSeed = (Number(seed) || 1) >>> 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    const rng = makeRng(baseSeed * 7919 + attempt * 104729 + 17);
    const n = 12 + Math.floor(rng() * 5);
    const baseA = TAU * rng();
    const maxR = Math.min(W, H) * 0.37;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const a = baseA + (TAU * i) / n + (rng() - 0.5) * 0.16;
      const r = maxR * (0.52 + 0.38 * rng());
      pts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
    }
    let points = catmullClosed(pts, 12);
    const halfWidth = rules.trackMinHalfWidth + rng() * (rules.trackMaxHalfWidth - rules.trackMinHalfWidth);
    points = fitPoints(points, halfWidth + 3.5);
    if (points.some(p => p.x < 2 || p.x > W - 2 || p.y < 2 || p.y > H - 2)) continue;
    if (minSelfDistance(points, halfWidth * 2 + 3) < halfWidth * 2 + 1.2) continue;
    const track = buildFromPoints(points, halfWidth, baseSeed, { attempt });
    if (track.audit.valid) return track;
  }
  // 稳定回退：椭圆环
  const pts = [];
  const rx = W * 0.32, ry = H * 0.32;
  for (let i = 0; i < 220; i++) {
    const a = (TAU * i) / 220;
    pts.push({ x: W / 2 + Math.cos(a) * rx, y: H / 2 + Math.sin(a) * ry });
  }
  return buildFromPoints(pts, 4.0, baseSeed, { fallback: true });
}

module.exports = {
  rules, W, H, TILE, TAU, ROAD, GRASS, WALL,
  buildTrack, auditTrack, pointAtLength, nearestOnTrack, distanceToPolyline,
  makeRng, clamp, catmullClosed, minSelfDistance,
};
