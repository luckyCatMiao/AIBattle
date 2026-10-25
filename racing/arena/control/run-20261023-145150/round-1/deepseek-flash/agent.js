'use strict';
/* Racing agent: MPC path tracking on a smoothed racing line + curvature speed profile.
 * Self-contained (physics model transcribed from the public rules, verified bit-exact). */

const W = 128, H = 88, DT = 0.05;
const TAU = Math.PI * 2;

const ACCEL = 17, BRAKE = 26, REVERSE_ACCEL = 8;
const MAX_SPEED = 14, BOOST_MAX = 23, BOOST_ACCEL = 30;
const DRAG = 0.6, GRIP_NORMAL = 0.8, GRIP_DRIFT = 0.985;
const TURN_RATE = 3.2, DRIFT_TURN = 1.6, DRIFT_MIN_SPEED = 4;
const DRIFT_CHARGE_RATE = 0.55, BOOST_DRAIN = 0.6;
const OFF_MAX = 7, OFF_ACCEL = 0.35, OFF_DRAG = 0.94;
const WALL_REST = 0.45, R = 0.55;

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function angleDiff(a, b) {
  let d = (a - b + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
}

/* --------------------------- physics --------------------------- */
function tileAt(tiles, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (tx < 0 || ty < 0 || tx >= W || ty >= H) return 2;
  return tiles[ty * W + tx];
}
function circleHitsWall(tiles, x, y, r) {
  const k = r * Math.SQRT1_2;
  const pts = [[x - r, y], [x + r, y], [x, y - r], [x, y + r],
    [x - k, y - k], [x + k, y - k], [x - k, y + k], [x + k, y + k]];
  for (let i = 0; i < 8; i++) if (tileAt(tiles, pts[i][0], pts[i][1]) === 2) return true;
  return false;
}

function stepCar(car, inp, tiles) {
  const throttle = clamp(Number(inp.throttle) || 0, -1, 1);
  const steer = clamp(Number(inp.steer) || 0, -1, 1);
  const fx = Math.cos(car.angle), fy = Math.sin(car.angle);
  const rx = -fy, ry = fx;
  let vF = car.vx * fx + car.vy * fy;
  let vL = car.vx * rx + car.vy * ry;
  const off = tileAt(tiles, car.x, car.y) === 1;
  car.offRoad = off;

  const wasDrifting = car.drifting, wasBoosting = car.boosting;
  car.drifting = !!inp.drift && Math.abs(vF) > DRIFT_MIN_SPEED && Math.abs(steer) > 0.15 && !off;

  if (throttle > 0) vF += ACCEL * throttle * (off ? OFF_ACCEL : 1) * DT;
  else if (throttle < 0) {
    if (vF > 0.5) vF -= BRAKE * DT;
    else vF = Math.max(-5, vF - REVERSE_ACCEL * DT);
  }
  vF *= Math.exp(-DRAG * DT);
  if (off) vF *= OFF_DRAG;

  const speedAbs = Math.abs(vF);
  if (speedAbs > 0.25) {
    const dir = vF > 0 ? 1 : -1;
    const gain = clamp(speedAbs / 8, 0, 1);
    car.angle += steer * TURN_RATE * gain * (car.drifting ? DRIFT_TURN : 1) * dir * DT;
  }

  vL *= car.drifting ? GRIP_DRIFT : GRIP_NORMAL;

  if (car.drifting) {
    car.driftCharge = clamp(car.driftCharge + (Math.abs(vL) * 0.12 + speedAbs * 0.02) * DRIFT_CHARGE_RATE * DT, 0, 1);
  } else if (wasDrifting) {
    if (car.driftCharge > 0.02) car.boostEnergy = clamp(car.boostEnergy + car.driftCharge, 0, 1);
    car.driftCharge = 0;
  }

  const wantBoost = !!inp.boost && car.boostEnergy > 0.02;
  car.boosting = wantBoost;
  if (wantBoost) {
    vF += BOOST_ACCEL * DT;
    car.boostEnergy = Math.max(0, car.boostEnergy - BOOST_DRAIN * DT);
  }
  let cap = off ? OFF_MAX : (car.boosting ? BOOST_MAX : MAX_SPEED);
  if (vF > cap) vF = Math.max(cap, vF - 18 * DT);
  if (vF < -5) vF = -5;

  car.vx = fx * vF + rx * vL;
  car.vy = fy * vF + ry * vL;

  const nx = car.x + car.vx * DT;
  if (!circleHitsWall(tiles, nx, car.y, R)) car.x = nx;
  else { car.vx = -car.vx * WALL_REST; car.vy *= 0.9; }
  const ny = car.y + car.vy * DT;
  if (!circleHitsWall(tiles, car.x, ny, R)) car.y = ny;
  else { car.vy = -car.vy * WALL_REST; car.vx *= 0.9; }
  car.x = clamp(car.x, R, W - R);
  car.y = clamp(car.y, R, H - R);
}

/* --------------------------- track model --------------------------- */
function buildModel(track, cfg) {
  const pts = track.points, hw = track.halfWidth;
  const n = pts.length;
  const cum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[(i + 1) % n];
    cum[i + 1] = cum[i] + Math.hypot(b.x - a.x, b.y - a.y);
  }
  const total = cum[n];

  const ds = cfg.ds;
  const M = Math.max(16, Math.round(total / ds));
  const step = total / M;
  const cx = new Float64Array(M), cy = new Float64Array(M);
  {
    let seg = 0;
    for (let k = 0; k < M; k++) {
      const s = k * step;
      while (seg < n - 1 && cum[seg + 1] < s) seg++;
      while (seg > 0 && cum[seg] > s) seg--;
      const a = pts[seg], b = pts[(seg + 1) % n];
      const L = cum[seg + 1] - cum[seg] || 1;
      const t = clamp((s - cum[seg]) / L, 0, 1);
      cx[k] = a.x + (b.x - a.x) * t;
      cy[k] = a.y + (b.y - a.y) * t;
    }
  }
  const nx = new Float64Array(M), ny = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    const a = (k - 1 + M) % M, b = (k + 1) % M;
    let tx = cx[b] - cx[a], ty = cy[b] - cy[a];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l; ty /= l;
    nx[k] = -ty; ny[k] = tx;   // car-right side
  }

  // centerline curvature (smoothed, robust)
  const ct = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    const a = (k - 1 + M) % M, b = (k + 1) % M;
    ct[k] = Math.atan2(cy[b] - cy[a], cx[b] - cx[a]);
  }
  const ck = new Float64Array(M);
  const kra = Math.max(1, Math.round(cfg.kappaSmooth / step));
  for (let k = 0; k < M; k++) {
    const a = (k - kra + M) % M, b = (k + kra) % M;
    ck[k] = angleDiff(ct[b], ct[a]) / (2 * kra * step);
  }

  // racing line: offset toward the inside of corners, clamped to the corridor
  const Dmax = Math.max(0.2, hw - cfg.edgeMargin);
  let off = new Float64Array(M);
  if (cfg.lineMode === 'radius') {
    // offset so the line radius stays >= rMin: cut inside when the corner is gentle,
    // move outside when the centerline is tighter than the car can follow.
    for (let k = 0; k < M; k++) {
      const a = Math.abs(ck[k]);
      if (a < 1e-5) { off[k] = 0; continue; }
      const R = 1 / a;
      const d = R - cfg.lineR;
      off[k] = Math.sign(ck[k]) * clamp(d, -Dmax, Dmax) * cfg.lineScale;
    }
    off = boxSmooth(off, Math.max(1, Math.round(cfg.lineSmooth / step)));
  } else if (cfg.lineMode !== 'center') {
    for (let k = 0; k < M; k++) {
      const a = Math.abs(ck[k]);
      let d = a < 1e-4 ? 0 : Math.sign(ck[k]) * Dmax * Math.tanh(a / cfg.lineKappa);
      if (a > 1e-4) d = Math.sign(d) * Math.min(Math.abs(d), cfg.lineMaxR * (1 / a));
      off[k] = d * cfg.lineScale;
    }
    off = boxSmooth(off, Math.max(1, Math.round(cfg.lineSmooth / step)));
  }

  // optional "drift weave" on straights: wiggle the reference line so the car can
  // charge boost energy while barely losing forward speed
  if (cfg.weaveAmp > 0) {
    const w = new Float64Array(M);
    for (let k = 0; k < M; k++) {
      const a = Math.abs(ck[k]);
      const f = clamp(1 - a / cfg.weaveKappa, 0, 1);
      w[k] = f * Math.sin((k * step) * 2 * Math.PI / cfg.weaveLen);
    }
    const ws = boxSmooth(w, Math.max(1, Math.round(cfg.weaveFade / step)));
    for (let k = 0; k < M; k++) off[k] = clamp(off[k] + cfg.weaveAmp * ws[k], -Dmax, Dmax);
  }

  // Guarantee checkpoint capture: make the reference line pass through every
  // checkpoint centre (radius is only halfWidth+0.6, corner cutting can miss it).
  if (cfg.cpClear > 0 && Array.isArray(track.checkpoints)) {
    const w = Math.max(1, Math.round(cfg.cpClear / step));
    for (const cp of track.checkpoints) {
      let bi = 0, bd = Infinity;
      for (let k = 0; k < M; k++) {
        const dx = cx[k] - cp.x, dy = cy[k] - cp.y, d = dx * dx + dy * dy;
        if (d < bd) { bd = d; bi = k; }
      }
      for (let j = -w; j <= w; j++) {
        const k = ((bi + j) % M + M) % M;
        const t = Math.min(1, Math.abs(j) / (w + 1));
        const shape = 0.5 + 0.5 * Math.cos(Math.PI * t); // 1 at checkpoint, 0 at window edge
        off[k] *= 1 - (1 - cfg.cpClearFrac) * shape;
      }
    }
  }

  const lx = new Float64Array(M), ly = new Float64Array(M), lt = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    lx[k] = cx[k] + nx[k] * off[k];
    ly[k] = cy[k] + ny[k] * off[k];
  }
  for (let k = 0; k < M; k++) {
    const a = (k - 1 + M) % M, b = (k + 1) % M;
    lt[k] = Math.atan2(ly[b] - ly[a], lx[b] - lx[a]);
  }
  const kap0 = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    const a = (k - 1 + M) % M, b = (k + 1) % M;
    kap0[k] = Math.abs(angleDiff(lt[b], lt[a]) / (2 * step));
  }
  const kap = boxSmooth(kap0, Math.max(1, Math.round(cfg.kappaSmooth / step)));

  // speed profile
  const vlim = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    const kk = kap[k];
    let v;
    if (kk < 1e-4) v = MAX_SPEED;
    else {
      v = Math.min(MAX_SPEED, cfg.cornerA / Math.sqrt(kk));
      if (cfg.speedMode !== 'sqrt') v = Math.min(v, cfg.yawSafety * TURN_RATE * DRIFT_TURN / kk);
    }
    vlim[k] = Math.max(cfg.vMin, Math.min(v, cfg.vTop));
  }
  for (let pass = 0; pass < 3; pass++) {
    for (let k = M - 1; k >= 0; k--) {
      const nxk = vlim[(k + 1) % M];
      const cand = Math.sqrt(nxk * nxk + 2 * cfg.aBrake * step);
      if (cand < vlim[k]) vlim[k] = cand;
    }
    for (let k = 0; k < M; k++) {
      const pk = vlim[(k - 1 + M) % M];
      const cand = Math.sqrt(pk * pk + 2 * cfg.aAccel * step);
      if (cand < vlim[k]) vlim[k] = cand;
    }
  }

  return { M, step, total, x: lx, y: ly, tang: lt, kap, vlim, cx, cy, nx, ny, off, hw };
}

function boxSmooth(a, rad) {
  const M = a.length, out = new Float64Array(M);
  for (let k = 0; k < M; k++) {
    let s = 0;
    for (let j = -rad; j <= rad; j++) s += a[(k + j + M * 4) % M];
    out[k] = s / (2 * rad + 1);
  }
  return out;
}

/* projection of (x,y) onto the model line; returns {s, d, i}
 * d = signed lateral distance (positive to the car's right of the line) */
function projectFull(m, x, y, hint) {
  const M = m.M;
  let best = 0, bd = Infinity;
  if (hint != null) {
    for (let j = -40; j <= 40; j++) {
      const k = ((hint + j) % M + M) % M;
      const dx = m.x[k] - x, dy = m.y[k] - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = k; }
    }
  }
  // always double-check globally (cheap) so we never latch onto a stale branch
  let gbest = 0, gbd = Infinity;
  for (let k = 0; k < M; k += 3) {
    const dx = m.x[k] - x, dy = m.y[k] - y, d = dx * dx + dy * dy;
    if (d < gbd) { gbd = d; gbest = k; }
  }
  if (hint == null || gbd * 0.9 < bd) best = gbest;
  let bi = best, bt = 0, bdist = Infinity;
  for (let j = -3; j <= 3; j++) {
    const i = ((best + j) % M + M) % M, i2 = (i + 1) % M;
    const ax = m.x[i], ay = m.y[i], bx = m.x[i2], by = m.y[i2];
    const vx = bx - ax, vy = by - ay;
    const l2 = vx * vx + vy * vy || 1;
    const t = clamp(((x - ax) * vx + (y - ay) * vy) / l2, 0, 1);
    const px = ax + vx * t, py = ay + vy * t;
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < bdist) { bdist = d; bi = i; bt = t; }
  }
  const s = ((bi + bt) * m.step) % m.total;
  // signed distance
  const i0 = bi, i1 = (bi + 1) % M;
  const tx = m.x[i1] - m.x[i0], ty = m.y[i1] - m.y[i0];
  const l = Math.hypot(tx, ty) || 1;
  const px = m.x[i0] + tx * bt, py = m.y[i0] + ty * bt;
  const d = ((x - px) * (-ty / l) + (y - py) * (tx / l));
  return { s, d: -d, i: bi, dist: Math.sqrt(bdist) };
}

function pointAtS(m, s) {
  s = ((s % m.total) + m.total) % m.total;
  const f = s / m.step;
  const i = Math.floor(f), t = f - i;
  const i0 = ((i % m.M) + m.M) % m.M, i1 = (i0 + 1) % m.M;
  return { x: m.x[i0] + (m.x[i1] - m.x[i0]) * t, y: m.y[i0] + (m.y[i1] - m.y[i0]) * t };
}
function minVlimAhead(m, s, dist) {
  const n = Math.max(1, Math.round(dist / m.step));
  const i0 = Math.round((((s % m.total) + m.total) % m.total) / m.step);
  let mv = Infinity;
  for (let j = 0; j < n; j++) {
    const i = (i0 + j) % m.M;
    if (m.vlim[i] < mv) mv = m.vlim[i];
  }
  return mv;
}
function maxKappaAhead(m, s, dist) {
  const n = Math.max(1, Math.round(dist / m.step));
  const i0 = Math.round((((s % m.total) + m.total) % m.total) / m.step);
  let mx = 0;
  for (let j = 0; j < n; j++) {
    const i = (i0 + j) % m.M;
    if (m.kap[i] > mx) mx = m.kap[i];
  }
  return mx;
}

/* --------------------------- defaults --------------------------- */
const DEFAULTS = {
  ds: 0.5,
  edgeMargin: 1.4,
  lineMode: 'apex',
  lineR: 3.5,
  weaveAmp: 0,
  weaveLen: 18,
  weaveKappa: 0.06,
  weaveFade: 4,
  lineKappa: 0.07,
  lineMaxR: 0.45,
  lineScale: 1.0,
  lineSmooth: 2.0,
  kappaSmooth: 1.6,
  cornerA: 20,
  speedMode: 'sqrt',
  yawSafety: 0.85,
  cpClear: 6,
  cpClearFrac: 0.5,
  vMin: 4.5,
  vTop: MAX_SPEED,
  aBrake: 12,
  aAccel: 7,
  speedLook: 0.35,
  speedLookBase: 2.5,
  speedMargin: 1.0,
  throttleKv: 0.035,
  throttleKp: 0.55,
  // MPC
  mpcH: 16,
  mpcAdaptive: true,
  mpcHPerSpeed: 0.95,
  mpcHMin: 14,
  mpcHMax: 26,
  mpcCands: 11,
  mpcDevW: 1.0,
  mpcRamp: 1.6,
  mpcOffPen: 800,
  mpcHeadW: 0.6,
  mpcSteerW: 1.0,
  mpcCpW: 0,
  cpMargin: 0.6,
  cpMissDist: 9,
  mpcHeadStepW: 0.25,
  mpcBackW: 400,
  // drift
  driftOn: true,
  driftAlways: true,
  driftKappa: 0.10,
  driftOffKappa: 0.06,
  driftMinV: 6.0,
  driftPulsePeriod: 0,
  driftPulseOn: 3,
  // boost
  boostOn: true,
  boostMinEnergy: 0.05,
  boostKappa: 0.05,
  boostLook: 16,
  boostMinSpeed: 8,
  boostTarget: 23,
  boostYaw: 0,
  boostCornerLook: 6,
  boostMode: 'always',
  debug: false,
};

class Agent {
  constructor(cfg) {
    this.cfg = Object.assign({}, DEFAULTS, cfg || {});
    this.model = null;
    this.key = null;
    this.driftHold = false;
    this.hint = 0;
    this.tick = 0;
    this.stuckTimer = 0;
    this.recLeft = 0;
    this.recSteer = 1;
    this.recFlip = 1;
    this.prevSteer = 0;
  }

  ensureModel(obs) {
    const t = obs.track;
    const key = obs.seed + ':' + t.length.toFixed(2) + ':' + t.halfWidth.toFixed(2) + ':' + t.points.length;
    if (this.key !== key) {
      this.model = buildModel(t, this.cfg);
      this.key = key;
      this.hint = 0;
    }
    return this.model;
  }

  /* steer choice by short-horizon rollout */
  chooseSteer(st, m, tiles, drift, vt, boost) {
    const cp = this.cp;
    const cfg = this.cfg;
    const nc = Math.max(3, cfg.mpcCands | 0);
    let bestSteer = 0, bestCost = Infinity;
    const v = Math.hypot(st.vx, st.vy);
    const H = cfg.mpcAdaptive ? Math.round(clamp(v * cfg.mpcHPerSpeed, cfg.mpcHMin, cfg.mpcHMax)) : (cfg.mpcH | 0);
    const base = projectFull(m, st.x, st.y, this.hint);
    this.hint = base.i;

    for (let ci = 0; ci < nc; ci++) {
      const u = -1 + 2 * ci / (nc - 1);
      const sim = {
        x: st.x, y: st.y, angle: st.angle, vx: st.vx, vy: st.vy,
        driftCharge: st.driftCharge, boostEnergy: st.boostEnergy,
        drifting: st.drifting, boosting: st.boosting, offRoad: st.offRoad,
      };
      let hint = base.i;
      let cost = 0, offCount = 0;
      let lastDev = 0, lastHead = 0;
      let prevS = base.s;
      let cpMin = Infinity;
      for (let i = 1; i <= H; i++) {
        const vv = Math.hypot(sim.vx, sim.vy);
        const vGeo = minVlimAhead(m, prevS, cfg.speedLookBase + cfg.speedLook * vv);
        const vT = (boost && sim.boostEnergy > 0.02) ? cfg.boostTarget : vt;
        let throttle = clamp(cfg.throttleKv * vT + cfg.throttleKp * (vT - vv), -1, 1);
        const dr = drift && Math.abs(u) > 0.15;
        stepCar(sim, { throttle, steer: u, drift: dr, boost: !!boost }, tiles);
        const p = projectFull(m, sim.x, sim.y, hint);
        hint = p.i;
        if (sim.offRoad) offCount++;
        const w = 1 + cfg.mpcRamp * (i / H);
        cost += w * p.d * p.d + (sim.offRoad ? cfg.mpcOffPen : 0);
        const sp = Math.hypot(sim.vx, sim.vy);
        const psi = sp > 0.8 ? Math.atan2(sim.vy, sim.vx) : sim.angle;
        const ti = Math.round(p.s / m.step) % m.M;
        const headErr = angleDiff(psi, m.tang[(ti + m.M) % m.M]);
        cost += cfg.mpcHeadStepW * headErr * headErr;
        let ds = p.s - prevS;
        if (ds > m.total / 2) ds -= m.total;
        if (ds < -m.total / 2) ds += m.total;
        if (ds < 0) cost += cfg.mpcBackW * ds * ds;
        prevS = p.s;
        if (cp) {
          let dc = p.s - cp.s; if (dc > m.total / 2) dc -= m.total; if (dc < -m.total / 2) dc += m.total;
          if (Math.abs(dc) < 12) {
            const dd = Math.hypot(sim.x - cp.x, sim.y - cp.y);
            if (dd < cpMin) cpMin = dd;
          }
        }
        if (i === H) { lastDev = p.d; lastHead = headErr; }
      }
      cost += lastDev * lastDev * 2 + cfg.mpcHeadW * lastHead * lastHead * (0.3 + 0.7 * Math.min(1, v / 8));
      if (cp && cpMin < Infinity) {
        const miss = cp.radius - cfg.cpMargin - cpMin;
        if (miss > 0) cost += cfg.mpcCpW * miss * miss;
      }
      if (this.prevSteer != null) cost += cfg.mpcSteerW * (u - this.prevSteer) * (u - this.prevSteer);
      if (cost < bestCost) { bestCost = cost; bestSteer = u; }
    }
    return bestSteer;
  }

  control(st, m, tiles) {
    const cfg = this.cfg;
    const v = Math.hypot(st.vx, st.vy);
    // ---- stuck recovery ----
    if (this.recLeft > 0) {
      this.recLeft--;
      const inp = { throttle: -1, steer: this.recSteer, drift: false, boost: false };
      if (this.recLeft === 0) this.stuckTimer = 0;
      return inp;
    }
    if (v < 1.2) this.stuckTimer = (this.stuckTimer || 0) + 1; else this.stuckTimer = 0;
    if (this.stuckTimer > 14) {
      this.stuckTimer = 0;
      this.recLeft = 26;
      this.recFlip = -(this.recFlip || 1);
      this.recSteer = this.recFlip;
      return { throttle: -1, steer: this.recSteer, drift: false, boost: false };
    }
    // ---- checkpoint miss recovery: drive back to the checkpoint ----
    if (this.cpRec) {
      const cp = this.cp;
      const psi = v > 0.8 ? Math.atan2(st.vy, st.vx) : st.angle;
      const alpha = angleDiff(Math.atan2(cp.y - st.y, cp.x - st.x), psi);
      const dist = Math.hypot(cp.x - st.x, cp.y - st.y);
      const steer = clamp(alpha * 2.5, -1, 1);
      const vT = dist > 3 ? 8 : 5;
      const throttle = clamp(cfg.throttleKv * vT + cfg.throttleKp * (vT - v), -1, 1);
      return { throttle, steer, drift: Math.abs(steer) > 0.3, boost: false };
    }
    const s = projectFull(m, st.x, st.y, this.hint).s;
    this.lastS = s;

    // target speed: min profile within the reaction distance
    const look = cfg.speedLookBase + cfg.speedLook * v;
    const vGeoNow = minVlimAhead(m, s, look);
    let vt = Math.min(MAX_SPEED, vGeoNow * cfg.speedMargin);
    vt = Math.max(vt, cfg.vMin);

    // drift policy
    let drift = false;
    if (cfg.driftAlways) drift = true;
    else if (cfg.driftOn && v > cfg.driftMinV) {
      const kAhead = maxKappaAhead(m, s, 2 + v * 0.6);
      if (this.driftHold) { if (kAhead < cfg.driftOffKappa) this.driftHold = false; }
      else if (kAhead > cfg.driftKappa) this.driftHold = true;
      drift = this.driftHold;
    } else this.driftHold = false;
    if (drift && cfg.driftPulsePeriod > 0) {
      drift = (this.tick % cfg.driftPulsePeriod) < cfg.driftPulseOn;
    }
    this.tick++;

    // boost policy (decided before steering so the rollout models it)
    let boost = false;
    if (cfg.boostOn && st.boostEnergy > cfg.boostMinEnergy && v > cfg.boostMinSpeed) {
      if (cfg.boostMode === 'always') boost = true;
      else {
        const kFar = maxKappaAhead(m, s, cfg.boostLook + v * 0.6);
        if (kFar < cfg.boostKappa) boost = true;
      }
    }

    const steer = this.recovering ? this.recSteer : this.chooseSteer(st, m, tiles, drift, vt, boost);
    this.prevSteer = steer;

    let vT = boost ? cfg.boostTarget : minVlimAhead(m, s, look) * cfg.speedMargin;
    vT = Math.max(vT, 6);
    const throttle = clamp(cfg.throttleKv * vT + cfg.throttleKp * (vT - v), -1, 1);
    return { throttle, steer, drift, boost };
  }

  plan(obs) {
    const frames = [];
    const neutral = { throttle: 0, steer: 0, drift: false, boost: false };
    if (!obs || obs.status !== 'playing' || !obs.track || !obs.cars) {
      for (let i = 0; i < 20; i++) frames.push([neutral]);
      return { inputs: frames };
    }
    const me = obs.cars[obs.yourPlayer];
    const m = this.ensureModel(obs);
    const tiles = obs.track.tiles;

    const trk = obs.track;
    if (me && trk && Array.isArray(trk.checkpoints)) {
      const raw = trk.checkpoints[me.nextCp];
      if (raw) {
        // arc length of that checkpoint on our line
        const p = projectFull(m, raw.x, raw.y, null);
        this.cp = { x: raw.x, y: raw.y, radius: raw.radius || 4, s: p.s };
      } else this.cp = null;
    // detect a missed checkpoint: we are well past its arc length but nextCp did not advance
    if (this.cp) {
      const sc = projectFull(m, me.x, me.y, this.hint).s;
      let dcp = sc - this.cp.s;
      if (dcp > m.total / 2) dcp -= m.total;
      if (dcp < -m.total / 2) dcp += m.total;
      this.cpRec = !me.finished && dcp > this.cfg.cpMissDist;
    } else this.cpRec = false;
    } else this.cp = null;
    // detect a missed checkpoint: we are well past its arc length but nextCp did not advance
    if (this.cp) {
      const sc = projectFull(m, me.x, me.y, this.hint).s;
      let dcp = sc - this.cp.s;
      if (dcp > m.total / 2) dcp -= m.total;
      if (dcp < -m.total / 2) dcp += m.total;
      this.cpRec = !me.finished && dcp > this.cfg.cpMissDist;
    } else this.cpRec = false;
    let cd = Math.max(0, Math.round((obs.rules ? obs.rules.countdownSeconds : 1.5) * 20) - (obs.frame || 0));
    const st = {
      x: me.x, y: me.y, angle: me.angle, vx: me.vx, vy: me.vy,
      driftCharge: me.driftCharge, boostEnergy: me.boostEnergy,
      drifting: !!me.drifting, boosting: !!me.boosting, offRoad: !!me.offRoad,
    };
    if (me.finished) cd = 0;
    const log = [];
    this.lastLog = log;
    for (let i = 0; i < 20; i++) {
      let inp;
      if (me.finished) inp = neutral;
      else if (cd > 0) { cd--; inp = neutral; }
      else {
        const c = this.control(st, m, tiles);
        inp = { throttle: round3(c.throttle), steer: round3(c.steer), drift: c.drift, boost: c.boost };
        stepCar(st, inp, tiles);
        if (cfgDebug(this)) log.push({ s: this.lastS, v: Math.hypot(st.vx, st.vy), steer: inp.steer, drift: inp.drift, boost: inp.boost, x: st.x, y: st.y, off: st.offRoad, be: st.boostEnergy, dc: st.driftCharge });
      }
      frames.push([inp]);
    }
    return { inputs: frames };
  }
}
const cfgDebug = a => a.cfg.debug;
const round3 = v => Math.round(v * 1000) / 1000;

module.exports = { Agent, buildModel, stepCar, DEFAULTS, projectFull, pointAtS, minVlimAhead, maxKappaAhead };

/* --------------------------- stdin loop --------------------------- */
if (require.main === module) {
  const readline = require('readline');
  const fs = require('fs');
  const agent = new Agent(process.env.AGENT_CFG ? JSON.parse(process.env.AGENT_CFG) : undefined);
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', line => {
    line = line.trim();
    if (!line) return;
    let out;
    try {
      out = agent.plan(JSON.parse(line));
    } catch (e) {
      process.stderr.write('ERR ' + (e && e.stack || e) + '\n');
      out = { inputs: Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]) };
    }
    fs.writeSync(1, JSON.stringify(out) + '\n');
  });
}
