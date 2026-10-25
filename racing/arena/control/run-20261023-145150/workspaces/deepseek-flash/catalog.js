'use strict';
/* 俯视角赛车 · 随机赛道与规则。
 * 每条赛道按 seed 生成一条闭合的蛇形环道：多条横向直道 + 发夹弯 + 外环回归，
 * 再沿中心线铺出带边界的沥青路面。
 * 车是俯视 2D 刚体：油门、转向、漂移、漂移蓄能、喷火加速、车车碰撞。 */

const TILE = 16;
const W = 128, H = 88;
const TAU = Math.PI * 2;

const rules = {
  hz: 20,
  decisionFrames: 20,
  width: W,
  height: H,
  tileSize: TILE,
  laps: 3,
  matchSeconds: 300,
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
  checkpointCount: 16,
  checkpointRadiusPad: 0.6,
  trackMinHalfWidth: 3.2,
  trackMaxHalfWidth: 4.4,
  minTrackLength: 420,     // 低于这个长度视为生成失败（约为旧赛道的 5 倍）
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
  // 向心 Catmull-Rom（alpha=0.5）：段长差异很大时也不会自交或打结。
  const n = pts.length, out = [];
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const knot = (a, b) => Math.max(1e-3, Math.sqrt(Math.hypot(b.x - a.x, b.y - a.y)));
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const t0 = 0, t1 = knot(p0, p1), t2 = t1 + knot(p1, p2), t3 = t2 + knot(p2, p3);
    for (let k = 0; k < per; k++) {
      const t = t1 + (t2 - t1) * (k / per);
      const a1 = lerp(p0, p1, (t - t0) / (t1 - t0));
      const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
      const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
      const b1 = lerp(a1, a2, (t - t0) / (t2 - t0));
      const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
      out.push(lerp(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  return out;
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

function distanceToSegment(x, y, a, b) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((x - a.x) * vx + (y - a.y) * vy) / len2, 0, 1);
  return Math.hypot(x - (a.x + vx * t), y - (a.y + vy * t));
}

function distanceToPolyline(points, x, y) {
  let best = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = distanceToSegment(x, y, points[i], points[(i + 1) % points.length]);
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

/* 把每个拐点替换成两个倒角点：Catmull-Rom 在直角/发夹弯上会向外甩，
 * 倒角之后曲率平缓，不会自己缠到一起。 */
function chamfer(pts, r = 5) {
  const n = pts.length, out = [];
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) || 1;
  for (let i = 0; i < n; i++) {
    const prev = pts[(i - 1 + n) % n], cur = pts[i], next = pts[(i + 1) % n];
    const d1 = dist(cur, prev), d2 = dist(cur, next);
    const r1 = Math.min(r, d1 / 2), r2 = Math.min(r, d2 / 2);
    out.push({ x: cur.x + (prev.x - cur.x) / d1 * r1, y: cur.y + (prev.y - cur.y) / d1 * r1 });
    out.push({ x: cur.x + (next.x - cur.x) / d2 * r2, y: cur.y + (next.y - cur.y) / d2 * r2 });
  }
  return out;
}

/* 蛇形布局：多条横向直道由发夹弯相连，最后沿外环回到起点。
 * 全部坐标以格为单位；attempt 0 使用保守参数作为兜底，保证有一条必定可用的赛道。 */
function serpentine(seed, attempt) {
  const rng = makeRng((Number(seed) || 1) * 7919 + attempt * 104729 + 17);
  const simple = attempt === 0;
  const K = simple ? 3 : (rng() < 0.5 ? 3 : 5);
  const outerL = simple ? 8 : 7 + Math.round(rng() * 4);
  const outerR = simple ? 120 : W - 7 - Math.round(rng() * 4);
  const topLane = simple ? 10 : 9 + Math.round(rng() * 4);
  const leftX = simple ? 24 : outerL + 15 + Math.round(rng() * 7);
  const rightX = simple ? 104 : outerR - 15 - Math.round(rng() * 7);
  const topY = simple ? 26 : topLane + 9 + Math.round(rng() * 5);
  const bottomY = simple ? 70 : H - 12 - Math.round(rng() * 6);
  const pts = [];
  const rows = [];
  for (let i = 0; i < K; i++) {
    const base = K === 1 ? (topY + bottomY) / 2 : topY + (bottomY - topY) * i / (K - 1);
    rows.push({ y: simple ? base : base + (rng() - 0.5) * 3, dir: i % 2 === 0 ? 1 : -1 });
  }
  for (let i = 0; i < K; i++) {
    const { y, dir } = rows[i];
    const xa = dir > 0 ? leftX : rightX;
    const xb = dir > 0 ? rightX : leftX;
    pts.push({ x: xa, y });
    if (!simple) {
      // 直道中段轻微偏移，避免每局都是完美直线
      pts.push({ x: (xa + xb) / 2, y: y + (rng() - 0.5) * 5 });
    }
    pts.push({ x: xb, y });
  }
  const lastY = rows[K - 1].y;
  pts.push({ x: outerR, y: lastY });
  pts.push({ x: outerR, y: topLane });
  pts.push({ x: outerL, y: topLane });
  pts.push({ x: outerL, y: rows[0].y });
  // 回到第一行起点（points 首尾相接）
  const points = catmullClosed(chamfer(pts, 5), 14);
  // 把起跑线放到第一行直道的中前段
  const target = { x: leftX + (rightX - leftX) * 0.45, y: rows[0].y };
  let best = 0, bd = Infinity;
  for (let i = 0; i < points.length; i++) {
    const d = (points[i].x - target.x) ** 2 + (points[i].y - target.y) ** 2;
    if (d < bd) { bd = d; best = i; }
  }
  return { points: points.slice(best).concat(points.slice(0, best)), K };
}

function buildFromPoints(points, halfWidth, seed, auditExtra = {}) {
  const cum = cumulative(points);
  const length = cum[cum.length - 1];
  const tiles = new Uint8Array(W * H);
  tiles.fill(GRASS);
  for (let x = 0; x < W; x++) { tiles[x] = WALL; tiles[(H - 1) * W + x] = WALL; }
  for (let y = 0; y < H; y++) { tiles[y * W] = WALL; tiles[y * W + W - 1] = WALL; }
  // 逐段在包围盒内铺路；比「每个格子对整条折线求距离」快一个数量级。
  const pad = halfWidth + 1.5;
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length];
    const x1 = Math.max(1, Math.floor(Math.min(a.x, b.x) - pad));
    const x2 = Math.min(W - 2, Math.ceil(Math.max(a.x, b.x) + pad));
    const y1 = Math.max(1, Math.floor(Math.min(a.y, b.y) - pad));
    const y2 = Math.min(H - 2, Math.ceil(Math.max(a.y, b.y) + pad));
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (tiles[y * W + x] === ROAD) continue;
        if (distanceToSegment(x + 0.5, y + 0.5, a, b) <= halfWidth) tiles[y * W + x] = ROAD;
      }
    }
  }
  const start = pointAtLength(points, cum, 0);
  const grid = [];
  for (let i = 0; i < 2; i++) {
    const p = pointAtLength(points, cum, length - (5 + i * 4));
    const nx = -Math.sin(p.angle), ny = Math.cos(p.angle);
    const side = i === 0 ? -1.7 : 1.7;
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
    valid: roadTiles > 0 && startOnRoad && gridOnRoad
      && minSelf > track.halfWidth * 2 + 0.8 && track.length >= rules.minTrackLength,
    ...extra,
  };
}

function buildTrack(seed) {
  const baseSeed = (Number(seed) || 1) >>> 0;
  for (let attempt = 1; attempt <= 40; attempt++) {
    const { points } = serpentine(baseSeed, attempt);
    if (points.some(p => p.x < 2 || p.x > W - 2 || p.y < 2 || p.y > H - 2)) continue;
    const rng = makeRng(baseSeed * 31 + attempt * 977 + 7);
    const halfWidth = attempt === 0 ? 3.8
      : rules.trackMinHalfWidth + rng() * (rules.trackMaxHalfWidth - rules.trackMinHalfWidth);
    if (minSelfDistance(points, halfWidth * 2 + 3) < halfWidth * 2 + 1.2) continue;
    const track = buildFromPoints(points, halfWidth, baseSeed, { attempt });
    if (track.audit.valid) return track;
  }
  // 稳定回退：保守三直道布局（长度仍然远超旧赛道）
  const { points } = serpentine(baseSeed, 0);
  return buildFromPoints(points, 3.6, baseSeed, { fallback: true });
}

module.exports = {
  rules, W, H, TILE, TAU, ROAD, GRASS, WALL,
  buildTrack, auditTrack, pointAtLength, nearestOnTrack, distanceToPolyline,
  makeRng, clamp, catmullClosed, minSelfDistance,
};
