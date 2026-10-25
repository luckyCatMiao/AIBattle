'use strict';
/* 俯视角赛车 · 确定性模拟。
 * 20 Hz；每个决策窗口 20 帧。两名选手各控制一辆车。
 * 漂移会保留侧向速度并积蓄喷火能量；喷火提供短暂高速；车辆之间会碰撞。 */

const catalog = require('./catalog');
const {
  rules, W, H, TAU, ROAD, GRASS, WALL,
  buildTrack, pointAtLength, nearestOnTrack, clamp,
} = catalog;

const DT = 1 / rules.hz;
const round3 = v => Math.round(v * 1000) / 1000;
const norm = (x, y) => { const l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; };
const angleDiff = (a, b) => {
  let d = (a - b + Math.PI) % TAU;
  if (d < 0) d += TAU;
  return d - Math.PI;
};

function emit(g, type, data = {}) {
  g.events.push({ id: ++g.eventId, t: Math.round(g.frame / rules.hz * 1000) / 1000, frame: g.frame, type, ...data });
}

const tileIndex = (x, y) => y * W + x;
const inBounds = (x, y) => x >= 0 && y >= 0 && x < W && y < H;
function tileAt(g, x, y) {
  const tx = Math.floor(x), ty = Math.floor(y);
  if (!inBounds(tx, ty)) return WALL;
  return g.track.tiles[tileIndex(tx, ty)];
}
function circleHitsWall(g, x, y, r) {
  const k = r * Math.SQRT1_2;
  const pts = [
    [x - r, y], [x + r, y], [x, y - r], [x, y + r],
    [x - k, y - k], [x + k, y - k], [x - k, y + k], [x + k, y + k],
  ];
  return pts.some(([px, py]) => tileAt(g, px, py) === WALL);
}

/* ============================ 世界构造 ============================ */

function makeCar(g, team, name) {
  const grid = g.track.grid[team] || g.track.grid[0];
  return {
    id: 'p' + team, team, index: team, name,
    x: grid.x, y: grid.y, angle: grid.angle,
    vx: 0, vy: 0,
    held: { throttle: 0, steer: 0, drift: false, boost: false },
    inputHistory: [],
    lap: 0, nextCp: 1, progress: 0,
    driftCharge: 0, boostEnergy: 0, drifting: false, boosting: false, offRoad: false,
    lapStart: 0, bestLap: null, finished: false, finishTime: null,
    boosts: 0, driftTime: 0, collisions: 0,
    lastNearest: 0, stuck: 0,
  };
}

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('赛车必须是两名选手');
  const g = {
    id, seed: Number(seed) || 1,
    status: 'playing', phase: 'countdown', winner: null, reason: '', eventId: 0,
    players: players.map((p, i) => {
      if (!p || typeof p.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(p.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return { id: i, name: String(p.name).slice(0, 32), kind: p.kind, wins: 0 };
    }),
    frame: 0, tick: 0, countdown: Math.round(rules.countdownSeconds * rules.hz),
    track: null, cars: [], events: [], humanInput: null,
  };
  g.track = buildTrack(g.seed);
  for (let team = 0; team < 2; team++) g.cars.push(makeCar(g, team, g.players[team].name));
  emit(g, 'countdown', { text: '准备发车' });
  return g;
}

/* ============================ 车辆物理 ============================ */

function surface(g, car) { return tileAt(g, car.x, car.y); }

function moveCar(g, car, dx, dy) {
  const r = rules.carRadius;
  const nx = car.x + dx;
  if (!circleHitsWall(g, nx, car.y, r)) car.x = nx;
  else { car.vx = -car.vx * rules.wallRestitution; car.vy *= 0.9; }
  const ny = car.y + dy;
  if (!circleHitsWall(g, car.x, ny, r)) car.y = ny;
  else { car.vy = -car.vy * rules.wallRestitution; car.vx *= 0.9; }
  car.x = clamp(car.x, r, W - r);
  car.y = clamp(car.y, r, H - r);
  const speed = Math.hypot(car.vx, car.vy);
  car.stuck = speed < 0.6 ? car.stuck + 1 : 0;
}

function updateCar(g, car) {
  const inp = car.held || {};
  const throttle = clamp(Number(inp.throttle) || 0, -1, 1);
  const steer = clamp(Number(inp.steer) || 0, -1, 1);
  const f = { x: Math.cos(car.angle), y: Math.sin(car.angle) };
  const right = { x: -f.y, y: f.x };
  let vF = car.vx * f.x + car.vy * f.y;
  let vL = car.vx * right.x + car.vy * right.y;
  const off = surface(g, car) === GRASS;
  car.offRoad = off;

  const wasDrifting = car.drifting, wasBoosting = car.boosting;
  car.drifting = !!inp.drift && Math.abs(vF) > rules.driftMinSpeed && Math.abs(steer) > 0.15 && !off;
  if (car.drifting) car.driftTime += DT;

  // 油门 / 刹车 / 倒车
  if (throttle > 0) vF += rules.accel * throttle * (off ? rules.offRoadAccel : 1) * DT;
  else if (throttle < 0) {
    if (vF > 0.5) vF -= rules.brake * DT;
    else vF = Math.max(-5, vF - rules.reverseAccel * DT);
  }

  // 阻力与路面
  vF *= Math.exp(-rules.drag * DT);
  if (off) vF *= rules.offRoadDrag;

  // 转向（速度越高越接近满舵；倒车时反向）
  const speedAbs = Math.abs(vF);
  if (speedAbs > 0.25) {
    const dir = Math.sign(vF);
    const gain = clamp(speedAbs / 8.0, 0, 1);
    car.angle += steer * rules.turnRate * gain * (car.drifting ? rules.driftTurnBoost : 1) * dir * DT;
  }

  // 抓地：普通时侧向速度很快消失，漂移时保留
  vL *= car.drifting ? rules.gripDrift : rules.gripNormal;

  // 漂移蓄能：漂移时积累，松开漂移（或漂移被打断）时把这一段冲进喷火能量。
  if (car.drifting) {
    car.driftCharge = clamp(car.driftCharge + (Math.abs(vL) * 0.12 + speedAbs * 0.02) * rules.driftChargeRate * DT, 0, 1);
    if (!wasDrifting) emit(g, 'drift', { unit: car.id, team: car.team });
  } else if (wasDrifting) {
    if (car.driftCharge > 0.02) {
      car.boostEnergy = clamp(car.boostEnergy + car.driftCharge, 0, 1);
      emit(g, 'charge', { unit: car.id, team: car.team, amount: round3(car.driftCharge) });
    }
    car.driftCharge = 0;
  }

  // 喷火加速
  const wantBoost = !!inp.boost && car.boostEnergy > 0.02;
  car.boosting = wantBoost;
  if (wantBoost && !wasBoosting) car.boosts++;
  if (wantBoost) {
    if (car.boostEnergy >= 0.02) {
      vF += rules.boostAccel * DT;
      car.boostEnergy = Math.max(0, car.boostEnergy - rules.boostDrain * DT);
    }
  }
  const cap = off ? rules.offRoadMax : (car.boosting ? rules.boostMaxSpeed : rules.maxSpeed);
  if (vF > cap) vF = Math.max(cap, vF - 18 * DT);
  if (vF < -5) vF = -5;

  car.vx = f.x * vF + right.x * vL;
  car.vy = f.y * vF + right.y * vL;
  moveCar(g, car, car.vx * DT, car.vy * DT);
  if (car.x <= rules.carRadius + 0.01 || car.x >= W - rules.carRadius - 0.01) car.vx *= -rules.wallRestitution;
  if (car.y <= rules.carRadius + 0.01 || car.y >= H - rules.carRadius - 0.01) car.vy *= -rules.wallRestitution;
}
function resolveCarCollision(g, a, b) {
  const r2 = rules.carRadius * 2;
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy);
  if (d >= r2 || d < 1e-6) return;
  const nx = dx / d, ny = dy / d;
  const overlap = r2 - d;
  a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
  b.x += nx * overlap / 2; b.y += ny * overlap / 2;
  const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
  if (rel < 0) {
    const j = -(1 + rules.collisionRestitution) * rel / 2;
    a.vx -= j * nx; a.vy -= j * ny;
    b.vx += j * nx; b.vy += j * ny;
    if (-rel > 2) {
      a.collisions++; b.collisions++;
      emit(g, 'collision', { a: a.id, b: b.id, speed: round3(-rel) });
    }
  }
}

function updateProgress(g, car) {
  const near = nearestOnTrack(g.track, car.x, car.y);
  car.progress = car.lap * g.track.length + near.s;
  car.lastNearest = near.index;
  if (car.finished) return;
  const cp = g.track.checkpoints[car.nextCp];
  if (Math.hypot(car.x - cp.x, car.y - cp.y) <= cp.radius) {
    if (car.nextCp === 0) {
      const now = g.frame / rules.hz;
      const lapTime = now - car.lapStart;
      if (car.bestLap === null || lapTime < car.bestLap) car.bestLap = lapTime;
      car.lapStart = now;
      car.lap++;
      car.nextCp = 1;
      emit(g, 'lap', { team: car.team, unit: car.id, lap: car.lap, time: round3(lapTime), text: `${car.name} 第 ${car.lap} 圈 ${lapTime.toFixed(1)}s` });
      if (car.lap >= rules.laps && !car.finished) {
        car.finished = true;
        car.finishTime = now;
        if (g.winner === null) finish(g, car.team, '冲线');
      }
    } else {
      car.nextCp = (car.nextCp + 1) % rules.checkpointCount;
    }
  }
}

function finish(g, winner, reason) {
  if (g.status === 'finished') return;
  g.status = 'finished'; g.phase = 'finished';
  g.winner = winner; g.reason = reason;
  emit(g, 'finish', { text: reason });
}

function step(g) {
  if (g.status !== 'playing') return;
  g.frame++; g.tick++;

  if (g.countdown > 0) {
    g.countdown--;
    if (g.countdown === 0) {
      g.phase = 'live';
      for (const c of g.cars) c.lapStart = g.frame / rules.hz;
      emit(g, 'go', { text: '出发！' });
    }
    return;
  }

  for (const car of g.cars) updateCar(g, car);
  resolveCarCollision(g, g.cars[0], g.cars[1]);
  for (const car of g.cars) updateProgress(g, car);
  if (g.status === 'playing' && g.frame >= rules.matchSeconds * rules.hz) {
    const a = g.cars[0], b = g.cars[1];
    if (Math.abs(a.progress - b.progress) < 0.5) finish(g, null, '时间到，平局');
    else finish(g, a.progress > b.progress ? 0 : 1, '时间到');
  }
}

/* ============================ 输入与观察 ============================ */

function normalizeUnitInput(input) {
  const out = { throttle: 0, steer: 0, drift: false, boost: false };
  if (input == null) return out;
  if (typeof input !== 'object' || Array.isArray(input)) throw Error('车辆输入必须是对象');
  if (input.throttle != null) {
    const v = Number(input.throttle);
    if (!Number.isFinite(v)) throw Error('throttle 必须是数字');
    out.throttle = clamp(v, -1, 1);
  }
  if (input.steer != null) {
    const v = Number(input.steer);
    if (!Number.isFinite(v)) throw Error('steer 必须是数字');
    out.steer = clamp(v, -1, 1);
  }
  out.drift = !!input.drift;
  out.boost = !!input.boost;
  return out;
}

function normalizeFrame(frame) {
  if (Array.isArray(frame)) {
    if (frame.length !== 1) throw Error('每一帧必须是 1 辆车的输入');
    return [normalizeUnitInput(frame[0])];
  }
  return [normalizeUnitInput(frame)];
}

function submitWindow(g, team, frames) {
  if (team !== 0 && team !== 1) throw Error('team 必须是 0 或 1');
  if (!Array.isArray(frames) || frames.length !== rules.decisionFrames) {
    throw Error(`窗口必须包含 ${rules.decisionFrames} 帧`);
  }
  return frames.map(normalizeFrame);
}

function advanceWindow(g, windows) {
  let steps = 0;
  for (let i = 0; i < rules.decisionFrames && g.status === 'playing'; i++) {
    for (const car of g.cars) {
      const frame = windows[car.team] && windows[car.team][i];
      car.held = (frame && frame[0]) || { throttle: 0, steer: 0, drift: false, boost: false };
      car.inputHistory.push(car.held);
      if (car.inputHistory.length > 8) car.inputHistory.shift();
    }
    step(g);
    steps++;
  }
  return steps;
}

function publicCar(car) {
  const speed = Math.hypot(car.vx, car.vy);
  return {
    id: car.id, team: car.team, index: car.index, name: car.name,
    x: round3(car.x), y: round3(car.y), angle: round3(car.angle),
    vx: round3(car.vx), vy: round3(car.vy), speed: round3(speed),
    lap: car.lap, nextCp: car.nextCp, progress: round3(car.progress),
    driftCharge: round3(car.driftCharge), boostEnergy: round3(car.boostEnergy),
    drifting: car.drifting, boosting: car.boosting, offRoad: car.offRoad,
    finished: car.finished, finishTime: car.finishTime == null ? null : round3(car.finishTime),
    bestLap: car.bestLap == null ? null : round3(car.bestLap),
    boosts: car.boosts, driftTime: round3(car.driftTime), collisions: car.collisions,
  };
}

function timeLeft(g) { return Math.max(0, rules.matchSeconds - g.frame / rules.hz); }

function commonState(g, viewer = null) {
  return {
    id: g.id, seed: g.seed, tick: g.tick, frame: g.frame,
    status: g.status, phase: g.phase, winner: g.winner, reason: g.reason,
    yourPlayer: viewer,
    players: g.players.map(p => ({ ...p })),
    timeLeft: Math.round(timeLeft(g) * 10) / 10,
    countdownLeft: Math.round((g.countdown / rules.hz) * 10) / 10,
    laps: rules.laps,
    cars: g.cars.map(publicCar),
    track: {
      width: W, height: H, tiles: Array.from(g.track.tiles),
      points: g.track.points.map(p => ({ x: round3(p.x), y: round3(p.y) })),
      halfWidth: round3(g.track.halfWidth), length: round3(g.track.length),
      checkpoints: g.track.checkpoints.map(c => ({ x: round3(c.x), y: round3(c.y), radius: round3(c.radius) })),
      start: { x: round3(g.track.start.x), y: round3(g.track.start.y), angle: round3(g.track.start.angle) },
      grid: g.track.grid.map(p => ({ x: round3(p.x), y: round3(p.y), angle: round3(p.angle) })),
      audit: g.track.audit,
    },
    rules: { ...rules },
    events: g.events.slice(-120),
  };
}

const snapshot = g => commonState(g, null);
const view = (g, team) => commonState(g, team);
// 逐帧存档用的轻量快照：赛道与规则每帧都一样，回放端只存顶层一份。
const leanState = g => {
  const s = commonState(g, null);
  delete s.track; delete s.rules; delete s.events;
  return s;
};

module.exports = {
  createMatch, step, advanceWindow, submitWindow,
  normalizeUnitInput, normalizeFrame, snapshot, view, leanState, emit,
  circleHitsWall, tileAt, DT, rules, W, H, TILE: catalog.TILE,
};
