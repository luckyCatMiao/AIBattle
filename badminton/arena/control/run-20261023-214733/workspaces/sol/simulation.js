'use strict';
/* 横版羽毛球 · 确定性模拟。
 * 20 Hz；每个物理帧对球做 4 次子步。两名选手各控制一个火柴人：
 * 左右移动、起跳、挥拍。击球点的高度（相对肩部）决定杀球 / 平抽 / 挑高球。 */

const { rules, clamp, makeRng } = require('./catalog');

const DT = 1 / rules.hz;
const SUB = DT / rules.substeps;
const round2 = v => Math.round(v * 100) / 100;
const round3 = v => Math.round(v * 1000) / 1000;

function emit(g, type, data = {}) {
  g.events.push({ id: ++g.eventId, t: round2(g.frame / rules.hz), frame: g.frame, type, ...data });
}

function homeX(team) { return team === 0 ? rules.courtLength * 0.25 : rules.courtLength * 0.75; }

function makePlayer(team, name) {
  return {
    id: 'p' + team, team, index: team, name,
    x: homeX(team), y: 0, vx: 0, vy: 0, onGround: true,
    facing: team === 0 ? 1 : -1,
    swing: 0, swingElapsed: 0, swingType: 1, swingCd: 0, lastHitFrame: -999,
    held: { move: 0, jump: false, swing: 0, charge: false, sprint: false },
    inputHistory: [],
    hits: 0, smashes: 0, errors: 0, points: 0, stamina: 100, charge: 0,
  };
}

function createMatch({ id = 'test', players, seed = 1 } = {}) {
  if (!Array.isArray(players) || players.length !== 2) throw Error('羽毛球必须是两名选手');
  const seedNum = Number(seed) || 1;
  const netRng = makeRng(seedNum * 2654435761 + 97);
  const g = {
    id, seed: Number(seed) || 1,
    status: 'playing', phase: 'serve', winner: null, reason: '', eventId: 0,
    players: players.map((p, i) => {
      if (!p || typeof p.name !== 'string') throw Error('选手需要名字');
      if (!['human', 'api', 'bot'].includes(p.kind)) throw Error('选手 kind 必须为 human、api 或 bot');
      return { id: i, name: String(p.name).slice(0, 32), kind: p.kind, wins: 0 };
    }),
    frame: 0, tick: 0, score: [0, 0], server: 0, serveTimer: 0, pointTimer: 0,
    netHeight: Math.round((rules.netMin + netRng() * (rules.netMax - rules.netMin)) * 100) / 100,
    rally: 0, longestRally: 0, lastPoint: null,
    batsmen: [], shuttle: null, events: [], pendingLanding: null,
  };
  for (let team = 0; team < 2; team++) g.batsmen.push(makePlayer(team, g.players[team].name));
  beginServe(g);
  emit(g, 'ready', { text: '准备发球' });
  return g;
}

/* 用同一套物理推演落点（忽略球拍与网），用于把球打到指定位置。 */
function flightLanding(x, y, vx, vy) {
  const dt = SUB;
  for (let t = 0; t < 5; t += dt) {
    const sp = Math.hypot(vx, vy);
    vx -= vx * rules.shuttleDrag * sp * dt;
    vy -= vy * rules.shuttleDrag * sp * dt;
    vy -= rules.gravity * dt;
    x += vx * dt; y += vy * dt;
    if (y > rules.ceiling) { y = rules.ceiling; vy = -Math.abs(vy) * 0.25; }
    if (y <= rules.shuttleRadius) return x;
    if (x < -0.5 || x > rules.courtLength + 0.5) return x;
  }
  return x;
}

/* 给定出球角度，二分出能把球送到 targetX 的速度。 */
function solveSpeed(x0, y0, angle, dir, targetX) {
  let lo = 5, hi = 34;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const land = flightLanding(x0, y0, dir * mid * Math.cos(angle), mid * Math.sin(angle));
    if ((land - targetX) * dir < 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* 完整弹道（含网与边界），用来确认这一拍是合法球。 */
function shotTrace(x0, y0, angle, speed, dir, netH = rules.netHeight) {
  let x = x0, y = y0;
  let vx = dir * speed * Math.cos(angle), vy = speed * Math.sin(angle);
  const dt = SUB;
  let netY = null;
  for (let t = 0; t < 5; t += dt) {
    const sp = Math.hypot(vx, vy);
    vx -= vx * rules.shuttleDrag * sp * dt;
    vy -= vy * rules.shuttleDrag * sp * dt;
    vy -= rules.gravity * dt;
    const px = x, py = y;
    x += vx * dt; y += vy * dt;
    if (netY === null && (px - rules.netX) * (x - rules.netX) <= 0 && Math.abs(x - px) > 1e-9) {
      const f = (rules.netX - px) / (x - px);
      netY = py + (y - py) * f;
    }
    if (y > rules.ceiling) { y = rules.ceiling; vy = -Math.abs(vy) * 0.25; }
    const netHit = netY !== null && netY < netH + rules.shuttleRadius + 0.03;
    if (y <= rules.shuttleRadius) return { netY, landX: x, netHit };
    if (x < -0.2 || x > rules.courtLength + 0.2) return { netY, landX: x, netHit };
  }
  return { netY, landX: x, netHit: netY !== null && netY < netH + rules.shuttleRadius + 0.03 };
}

/* 在若干候选角度里挑第一拍“过网且落在场内”的球。 */
function chooseShot(x, y, dir, kind, target, netH = rules.netHeight) {
  const ranges = {
    smash: [-0.42, -0.30, -0.18, -0.06, 0.06, 0.16, 0.26, 0.34],
    clear: [0.60, 0.72, 0.85],
    drop: [0.42, 0.55, 0.68],
    lift: [1.05, 1.20],
  };
  for (const angle of ranges[kind]) {
    const speed = solveSpeed(x, y, angle, dir, target);
    const tr = shotTrace(x, y, angle, speed, dir, netH);
    if (!tr.netHit && tr.landX > -0.05 && tr.landX < rules.courtLength + 0.05) return { angle, speed };
  }
  const angle = kind === 'smash' ? 0.30 : kind === 'clear' ? 0.75 : kind === 'drop' ? 0.60 : 1.15;
  return { angle, speed: solveSpeed(x, y, angle, dir, target) };
}

function makeShuttle(x, y) {
  return { x, y, vx: 0, vy: 0, lastTeam: null, owner: null, lastHitFrame: -999, alive: true, trail: [] };
}

function beginServe(g) {
  const p = g.batsmen[g.server];
  for (const b of g.batsmen) {
    b.x = homeX(b.team); b.y = 0; b.vx = 0; b.vy = 0; b.onGround = true;
    b.swing = 0; b.swingElapsed = 0; b.swingCd = 0; b.lastHitFrame = -999;
  }
  g.shuttle = makeShuttle(p.x + p.facing * rules.serve.offset, rules.serve.height);
  g.shuttle.lastTeam = g.server;
  g.phase = 'serve';
  g.serveTimer = Math.round(rules.serveFreeze * rules.hz);
  g.rally = 0;
  g.pendingLanding = null;
}

/* ============================ 球员 ============================ */

function updatePlayer(g, p) {
  const inp = p.held || {};
  const move = clamp(Number(inp.move) || 0, -1, 1);
  const accel = p.onGround ? rules.playerAccel : rules.playerAccel * 0.35;
  const tired = 0.62 + 0.38 * p.stamina / 100;
  // 蓄力：移动变慢、持续耗体力，但下一拍出球更快。
  const chargeHeld = !!inp.charge && p.onGround && p.stamina > 1;
  // 冲刺：额外加速，体力消耗更大；和蓄力互斥。
  const sprintHeld = !!inp.sprint && !chargeHeld && p.onGround && move !== 0
    && p.stamina > rules.sprintMinStamina;
  if (chargeHeld) p.charge = clamp(p.charge + rules.chargeRate * DT, 0, 1);
  else p.charge = Math.max(0, p.charge - rules.chargeDecay * DT);
  const charged = 1 - (1 - rules.chargeMoveFactor) * p.charge;
  const maxSpeed = rules.playerSpeed * tired * charged * (sprintHeld ? rules.sprintMultiplier : 1);
  p.sprinting = sprintHeld;

  if (move !== 0) p.vx += clamp(move * maxSpeed - p.vx, -accel * DT, accel * DT);
  else if (p.onGround) p.vx *= Math.exp(-rules.playerFriction * DT);
  else p.vx *= Math.exp(-1.5 * DT);

  // 体力：冲刺 > 蓄力 > 跑动 > 站定恢复。
  const running = Math.abs(p.vx) > 3.2;
  let drain = 0;
  if (chargeHeld) drain += rules.staminaChargeDrain;
  if (sprintHeld) drain += rules.staminaSprintDrain;
  else if (running) drain += rules.staminaRunDrain;
  if (drain > 0) p.stamina = Math.max(0, p.stamina - drain * DT);
  else if (Math.abs(p.vx) < 0.8 && p.onGround) p.stamina = Math.min(100, p.stamina + rules.staminaRegen * DT);

  if (inp.jump && p.onGround && p.stamina > 15) { p.vy = rules.jumpSpeed; p.onGround = false; p.stamina = Math.max(0, p.stamina - 10); }
  if (!p.onGround) p.vy -= rules.playerGravity * DT;

  p.x += p.vx * DT;
  p.y += p.vy * DT;
  if (p.y <= 0) { p.y = 0; p.vy = 0; p.onGround = true; }

  const lo = p.team === 0 ? 0.35 : rules.netX + 0.35;
  const hi = p.team === 0 ? rules.netX - 0.35 : rules.courtLength - 0.35;
  p.x = clamp(p.x, lo, hi);

  if (p.swingCd > 0) p.swingCd -= DT;
  if (p.swing > 0) { p.swing--; p.swingElapsed++; }
  const swingDir = Number(inp.swing) || 0;
  if (swingDir !== 0 && p.swing === 0 && p.swingCd <= 0) {
    p.stamina = Math.max(0, p.stamina - rules.staminaSwingCost);
    p.swing = rules.swingFrames;
    p.swingElapsed = 0;
    p.swingType = swingDir > 0 ? 1 : -1;   // 1 = 上手（从上往下），-1 = 下手（从下往上）
    p.swingCd = rules.swingCooldown + rules.swingFrames * DT;
  }
}

function inSwingWindow(p) {
  return p.swing > 0 && p.swingElapsed >= rules.swingWindup
    && p.swingElapsed < rules.swingWindup + rules.swingActive;
}

function racketAt(p, elapsed, type = p.swingType) {
  // 拍面在挥拍第 elapsed 帧的位置：上手从头顶向下扫，下手从低位向上挑。
  const frac = clamp(elapsed / rules.swingFrames, 0, 1);
  const arc = type > 0 ? rules.overhead : rules.underarm;
  const up = arc.fromUp + (arc.toUp - arc.fromUp) * frac;
  const fwd = arc.fromFwd + (arc.toFwd - arc.fromFwd) * frac;
  return { x: p.x + p.facing * fwd, y: p.y + up };
}
function racketPoint(p, frac = 0.5) {
  return racketAt(p, frac * rules.swingFrames, p.swingType);
}

function tryHit(g, p, sx, sy) {
  if (!inSwingWindow(p)) return false;
  if (g.frame - p.lastHitFrame < rules.hitLock * rules.hz) return false;
  const s = g.shuttle;
  if (!s.alive) return false;
  if (p.team === 0 ? s.x > rules.netX + 0.3 : s.x < rules.netX - 0.3) return false;
  const r = racketAt(p, p.swingElapsed, p.swingType);
  if (Math.hypot(sx - r.x, sy - r.y) > rules.reachRadius * (0.82 + 0.18 * p.stamina / 100)) return false;
  strike(g, p, sx, sy);
  return true;
}

function strike(g, p, sx, sy) {
  const s = g.shuttle;
  const forward = clamp((p.held.move || 0) * p.facing, 0, 1);
  const shot = rules.shot;
  let kind, speed, angle;
  let target;
  const dir = p.facing;
  if (p.swingType > 0) {
    // 上手：又高又靠网才能下压；在后场自动改打高远球。
    const t = clamp((sy - shot.clearHeight) / (shot.smashHeight - shot.clearHeight), 0, 1);
    const distNet = Math.abs(sx - rules.netX);
    const near = clamp(1 - (distNet - 3.2) / 2.5, 0, 1);
    const smash = t * near;
    const opp = g.batsmen[1 - p.team];
    const oppDeep = Math.abs(opp.x - rules.netX) > 3.0;
    if (smash > 0.55) {
      kind = 'smash';
      // 往离对手最远的落点杀：近网 1.4 格或后场 0.8 格。
      const shortX = dir > 0 ? rules.netX + 1.6 : rules.netX - 1.6;
      const deepX = dir > 0 ? rules.courtLength - 1.0 : 1.0;
      target = Math.abs(shortX - opp.x) >= Math.abs(deepX - opp.x) ? shortX : deepX;
      p.smashes++;
    } else if (t > 0.5 && oppDeep && distNet > 2.6) {
      // 对手在后场：吊一个网前小球，把他拉上来
      kind = 'drop';
      target = rules.netX + dir * 2.7;
    } else {
      kind = 'clear';
      target = dir > 0 ? 11.9 : rules.courtLength - 11.9;
    }
  } else {
    kind = 'lift';
    target = dir > 0 ? 11.4 : rules.courtLength - 11.4;
  }
  target += dir * forward * 0.6;
  ({ angle, speed } = chooseShot(sx, sy, dir, kind, target, g.netHeight));
  // 蓄力加成：出球速度提高（落点也会更深，打过头的风险自负）。
  speed *= 1 + rules.chargeBoost * p.charge;
  p.charge = 0;
  s.vx = p.facing * speed * Math.cos(angle);
  s.vy = speed * Math.sin(angle);
  s.x = sx; s.y = sy;
  s.lastTeam = p.team;
  s.owner = p.id;
  s.lastHitFrame = g.frame;
  s.trail = [];
  p.lastHitFrame = g.frame;
  p.hits++;
  g.rally++;
  g.longestRally = Math.max(g.longestRally, g.rally);
  emit(g, 'hit', { team: p.team, kind, x: round2(sx), y: round2(sy), speed: round2(speed) });
}

/* ============================ 球 ============================ */

function stepShuttle(g, dt) {
  const s = g.shuttle;
  if (!s.alive) return;
  const sp = Math.hypot(s.vx, s.vy);
  const drag = rules.shuttleDrag * sp;
  s.vx -= s.vx * drag * dt;
  s.vy -= s.vy * drag * dt;
  s.vy -= rules.gravity * dt;

  const prevX = s.x, prevY = s.y;
  let nx = s.x + s.vx * dt;
  let ny = s.y + s.vy * dt;

  if (ny > rules.ceiling) { ny = rules.ceiling; s.vy = -Math.abs(s.vy) * 0.25; }

  // 球网：从下沿穿过时被网带挡住
  const crossed = (prevX - rules.netX) * (nx - rules.netX) < 0;
  if (crossed) {
    const yAtNet = Math.min(prevY, ny);
    if (yAtNet < g.netHeight + rules.shuttleRadius) {
      s.x = rules.netX - Math.sign(s.vx) * (rules.netThickness + rules.shuttleRadius);
      s.vx *= -0.08;
      s.vy *= 0.2;
      emit(g, 'net', { team: s.lastTeam, x: round2(s.x), y: round2(s.y) });
      return;
    }
  }

  s.x = nx; s.y = ny;

  // 空中越过端线即出界（不等落地）
  if (s.x < -0.15 || s.x > rules.courtLength + 0.15) {
    s.alive = false;
    s.vx = 0; s.vy = 0;
    g.pendingLanding = { x: s.x, y: s.y, out: true };
    return;
  }
  if (s.y <= rules.shuttleRadius) {
    s.y = rules.shuttleRadius;
    s.alive = false;
    s.vx = 0; s.vy = 0;
    g.pendingLanding = { x: s.x, y: 0 };
  }
}

function resolvePoint(g) {
  const land = g.pendingLanding;
  if (!land) return;
  g.pendingLanding = null;
  const s = g.shuttle;
  const last = s.lastTeam == null ? 0 : s.lastTeam;
  let winner;
  let reason;
  if (land.out) {
    winner = 1 - last;
    reason = '出界';
  } else {
    const side = land.x < rules.netX ? 0 : 1;
    winner = side === last ? 1 - last : last;
    reason = side === last ? '落在自己半场' : '落在对方半场';
  }
  g.score[winner]++;
  g.batsmen[winner].points++;
  g.server = winner;
  g.lastPoint = { winner, reason, rally: g.rally, x: round2(land.x), out: !!land.out };
  emit(g, 'point', { team: winner, score: [...g.score], reason, rally: g.rally, x: round2(land.x) });

  const [a, b] = g.score;
  const hi = Math.max(a, b), lo = Math.min(a, b);
  if ((hi >= rules.matchPoints && hi - lo >= rules.winBy) || hi >= rules.maxPoints) {
    finish(g, a > b ? 0 : 1, `比分 ${a}:${b}`);
    return;
  }
  g.phase = 'point';
  g.pointTimer = Math.round(rules.pointFreeze * rules.hz);
}

function finish(g, winner, reason) {
  if (g.status === 'finished') return;
  g.status = 'finished'; g.phase = 'finished';
  g.winner = winner; g.reason = reason;
  emit(g, 'finish', { team: winner, reason, score: [...g.score] });
}

function step(g) {
  if (g.status !== 'playing') return;
  g.frame++; g.tick++;

  if (g.phase === 'serve') {
    g.serveTimer--;
    if (g.serveTimer <= 0) {
      const p = g.batsmen[g.server];
      const target = rules.netX + p.facing * (rules.serve.targetFromNet || 3.2);
      // 网越高，发球弧线越高；逐档抬角直到确认过网。
      let angle = 0.72, speed = 0;
      for (const a of [0.72, 0.85, 1.0, 1.15, 1.3]) {
        angle = a;
        speed = solveSpeed(g.shuttle.x, g.shuttle.y, a, p.facing, target);
        const tr = shotTrace(g.shuttle.x, g.shuttle.y, a, speed, p.facing, g.netHeight);
        if (!tr.netHit) break;
      }
      g.shuttle.vx = p.facing * speed * Math.cos(angle);
      g.shuttle.vy = speed * Math.sin(angle);
      g.shuttle.lastTeam = g.server;
      g.shuttle.lastHitFrame = g.frame;
      g.phase = 'rally';
      emit(g, 'serve', { team: g.server });
    }
  }

  for (const p of g.batsmen) updatePlayer(g, p);

  if (g.phase === 'rally') {
    const s = g.shuttle;
    for (let i = 0; i < rules.substeps; i++) {
      stepShuttle(g, SUB);
      for (const p of g.batsmen) {
        if (tryHit(g, p, s.x, s.y)) break;
      }
      if (!s.alive || g.pendingLanding) break;
    }
    if (s.alive) {
      s.trail.push({ x: round2(s.x), y: round2(s.y) });
      if (s.trail.length > 14) s.trail.shift();
    }
    if (g.pendingLanding) resolvePoint(g);
  } else if (g.phase === 'point') {
    g.pointTimer--;
    if (g.pointTimer <= 0) beginServe(g);
  }

  if (g.status === 'playing' && g.frame >= rules.matchSeconds * rules.hz) {
    const [a, b] = g.score;
    if (a === b) finish(g, null, `时间到，${a}:${b} 平局`);
    else finish(g, a > b ? 0 : 1, `时间到，${Math.max(a, b)}:${Math.min(a, b)}`);
  }
}

/* ============================ 输入与观察 ============================ */

function normalizeUnitInput(input) {
  const out = { move: 0, jump: false, swing: 0, charge: false, sprint: false };
  if (input == null) return out;
  if (typeof input !== 'object' || Array.isArray(input)) throw Error('球员输入必须是对象');
  if (input.move != null) {
    const v = Number(input.move);
    if (!Number.isFinite(v)) throw Error('move 必须是数字');
    out.move = clamp(v, -1, 1);
  }
  out.jump = !!input.jump;
  out.charge = !!input.charge;
  out.sprint = !!input.sprint;
  // swing: 1=上手（从上往下），-1=下手（从下往上），0=不挥拍；也接受布尔值。
  if (input.swing != null) {
    if (typeof input.swing === 'boolean') out.swing = input.swing ? 1 : 0;
    else {
      const v = Number(input.swing);
      if (!Number.isFinite(v)) throw Error('swing 必须是 -1、0、1 或布尔值');
      out.swing = v > 0.1 ? 1 : v < -0.1 ? -1 : 0;
    }
  }
  return out;
}

function normalizeFrame(frame) {
  if (Array.isArray(frame)) {
    if (frame.length !== 1) throw Error('每一帧必须是 1 名球员的输入');
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
    for (const b of g.batsmen) {
      const frame = windows[b.team] && windows[b.team][i];
      b.held = (frame && frame[0]) || { move: 0, jump: false, swing: 0, charge: false, sprint: false };
      b.inputHistory.push(b.held);
      if (b.inputHistory.length > 8) b.inputHistory.shift();
    }
    step(g);
    steps++;
  }
  return steps;
}

function publicPlayer(p) {
  return {
    id: p.id, team: p.team, index: p.index, name: p.name,
    x: round2(p.x), y: round2(p.y), vx: round2(p.vx), vy: round2(p.vy),
    onGround: p.onGround, facing: p.facing, sprinting: !!p.sprinting,
    swing: p.swing, swingElapsed: p.swingElapsed, swingType: p.swingType, swinging: inSwingWindow(p),
    swingCd: round2(Math.max(0, p.swingCd)),
    stamina: round2(p.stamina),
    charge: round2(p.charge),
    sprinting: !!p.sprinting,
    hits: p.hits, smashes: p.smashes, points: p.points,
  };
}

function commonState(g, viewer = null) {
  return {
    id: g.id, seed: g.seed, tick: g.tick, frame: g.frame,
    status: g.status, phase: g.phase, winner: g.winner, reason: g.reason,
    yourPlayer: viewer,
    players: g.players.map(p => ({ ...p })),
    score: [...g.score], server: g.server,
    serveLeft: round2(Math.max(0, g.serveTimer / rules.hz)),
    pointLeft: round2(Math.max(0, g.pointTimer / rules.hz)),
    rally: g.rally, longestRally: g.longestRally, lastPoint: g.lastPoint,
    timeLeft: round2(Math.max(0, rules.matchSeconds - g.frame / rules.hz)),
    batsmen: g.batsmen.map(publicPlayer),
    shuttle: g.shuttle ? {
      x: round2(g.shuttle.x), y: round2(g.shuttle.y),
      vx: round2(g.shuttle.vx), vy: round2(g.shuttle.vy),
      alive: g.shuttle.alive, lastTeam: g.shuttle.lastTeam, owner: g.shuttle.owner,
      trail: g.shuttle.trail.slice(-14),
    } : null,
    court: {
      length: rules.courtLength, netX: rules.netX, netHeight: g.netHeight,
      ceiling: rules.ceiling,
    },
    rules: { ...rules },
    events: g.events.slice(-60),
  };
}

const snapshot = g => commonState(g, null);
const view = (g, team) => commonState(g, team);
const leanState = g => {
  const s = commonState(g, null);
  delete s.court; delete s.rules; delete s.events;
  return s;
};

module.exports = {
  createMatch, step, advanceWindow, submitWindow,
  normalizeUnitInput, normalizeFrame, snapshot, view, leanState, emit, canSwingNow, predictContact,
  DT, rules,
};
