'use strict';
/* A strong reference opponent ("pro"), used only as a sparring partner.
 * Built on the measured fact that a corner shot fired on frame 0 of a committed
 * window is nearly unstoppable from <= ~13 units out, while the defender cannot
 * react until the window ends. So: shoot early from the attacking third, keep a
 * body in the shot lane, and stand in front of the dribbler to steal.
 * Options let me vary keeper depth / aggression for A/B. */

const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};
const W = 44, H = 26;
const BOX = { 0: { x1: 1, y1: 6, x2: 10, y2: 20 }, 1: { x1: 34, y1: 6, x2: 43, y2: 20 } };

function dirName(dx, dy) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 'N';
  const a = Math.atan2(dy, dx);
  const names = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'];
  let i = Math.round(a / (Math.PI / 4));
  return names[((i % 8) + 8) % 8];
}
function segDist(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1e-9;
  let t = ((px - ax) * vx + (py - ay) * vy) / L;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function safeSpot(team, x, y, margin = 0.9) {
  // never step into the opponent's box
  const b = BOX[1 - team];
  const m = margin;
  if (x > b.x1 - m && x < b.x2 + m && y > b.y1 - m && y < b.y2 + m) {
    // push out along the cheaper axis
    const dl = Math.abs(x - (b.x1 - m)), dr = Math.abs(x - (b.x2 + m));
    const du = Math.abs(y - (b.y1 - m)), dd = Math.abs(y - (b.y2 + m));
    const mn = Math.min(dl, dr, du, dd);
    if (mn === dl) x = b.x1 - m; else if (mn === dr) x = b.x2 + m;
    else if (mn === du) y = b.y1 - m; else y = b.y2 + m;
  }
  return [clamp(x, 0.6, W - 0.6), clamp(y, 0.6, H - 0.6)];
}

const DEFAULTS = {
  shootRange: 13.5,     // distance (ball->goal line) at which we will fire
  laneClear: 0.95,      // required distance from every opponent to the shot line
  keeperDepth: 1.6,     // keeper stands this far off its line on the ball line
  pressN: 1,            // field players sent to the ball when the opponent has it
  chaseN: 1,            // field players sent to a loose ball
  passClear: 1.0,
  passRange: 22,
};

function shotTargets(view, t, bx, by) {
  const gx = t === 0 ? 43 : 0;
  const out = [];
  for (let i = 0; i <= 24; i++) {
    const ty = 10.55 + i * (15.45 - 10.55) / 24;
    out.push([gx, ty]);
  }
  return out;
}

function evaluateShot(view, t, bx, by, cfg) {
  const foes = view.units.filter(u => u.team !== t);
  const gx = t === 0 ? 43 : 0;
  const dGoal = Math.hypot(gx - bx, 13 - by);
  if (dGoal > cfg.shootRange) return null;
  let best = null, bestScore = -1e9;
  for (const [tx, ty] of shotTargets(view, t, bx, by)) {
    let clear = 1e9;
    for (const f of foes) {
      const d = segDist(bx, by, tx, ty, f.x, f.y);
      if (d < clear) clear = d;
    }
    // prefer the corner farthest from the keeper, but require an open lane
    const kp = foes.find(f => f.index === 0);
    const kdist = kp ? segDist(bx, by, tx, ty, kp.x, kp.y) : 9;
    let score = Math.min(clear, 2.2) * 2 + Math.min(kdist, 3.5) * 0.5;
    if (Math.abs(ty - 13) > 1.8) score += 0.25;
    if (score > bestScore) { bestScore = score; best = { tx, ty, clear, kdist }; }
  }
  if (!best || best.clear < cfg.laneClear) return null;
  return best;
}

function proInputs(view, cfgIn = {}) {
  const cfg = { ...DEFAULTS, ...cfgIn };
  const t = view.yourTeam, n = view.teamSize;
  const mine = view.units.filter(u => u.team === t);
  const foes = view.units.filter(u => u.team !== t);
  const b = view.ball;
  const att = t === 0 ? 1 : -1;
  const gx = t === 0 ? 43 : 0;
  const ogx = t === 0 ? 0 : 43;
  const frames = [];
  const keeper = n >= 2 ? mine.find(u => u.index === 0) : null;
  const field = mine.filter(u => u !== keeper);
  const owner = b.owner;
  const carrier = owner ? mine.find(u => u.id === owner) : null;
  const oppCarrier = owner ? foes.find(u => u.id === owner) : null;

  // ---- role assignment computed once per window
  const actions = new Map();
  if (carrier) {
    const shot = evaluateShot(view, t, b.x, b.y, cfg);
    if (shot) {
      actions.set(carrier.id, { shoot: shot });
      // others: crash the far post / hold shape
    } else {
      // dribble toward the shooting zone, then shoot next window
      let ty = 13;
      const kp = foes.find(f => f.index === 0);
      // approach from the side away from the keeper
      const lane = kp ? (kp.y < 13 ? 15.2 : 10.8) : 13;
      ty = lane;
      let tx = gx - att * 9.5; // ~33.5 for team 0
      [tx, ty] = safeSpot(t, tx, ty, 0.75);
      actions.set(carrier.id, { dribble: [tx, ty] });
      // a pass option: nearest mate ahead with an open lane
      let bestPass = null;
      for (const m of field) {
        if (m.id === carrier.id) continue;
        const gain = (m.x - b.x) * att;
        if (gain < 2) continue;
        const dist = Math.hypot(m.x - b.x, m.y - b.y);
        if (dist > cfg.passRange) continue;
        let clear = 1e9;
        for (const f of foes) clear = Math.min(clear, segDist(b.x, b.y, m.x, m.y, f.x, f.y));
        if (clear < cfg.passClear) continue;
        const sc = gain * 0.4 + Math.min(clear, 3) - dist * 0.08;
        if (!bestPass || sc > bestPass.sc) bestPass = { m, sc };
      }
      const pressure = Math.min(...foes.map(f => Math.hypot(f.x - b.x, f.y - b.y)), 99);
      if (bestPass && (pressure < 2.2 || (foes.some(f => segDist(b.x, b.y, gx, 13, f.x, f.y) < 0.9)))) {
        actions.set(carrier.id, { pass: bestPass.m });
      }
    }
  }
  // defenders / chasers
  const rest = field.filter(u => !carrier || u.id !== carrier.id);
  if (!carrier) {
    if (oppCarrier) {
      const sorted = [...rest].sort((a, b2) => Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot(b2.x - b.x, b2.y - b.y));
      const pressers = sorted.slice(0, cfg.pressN);
      for (const p of pressers) {
        // stand in front of the dribbler: on the ball, goal-side of the carrier
        const vx = ogx - b.x, vy = 13 - b.y;
        const L = Math.hypot(vx, vy) || 1;
        const [px, py] = safeSpot(t, b.x + vx / L * 0.55, b.y + vy / L * 0.55, 0.7);
        actions.set(p.id, { move: [px, py] });
      }
      for (const p of sorted.slice(cfg.pressN)) {
        // cover: stand in the shot lane midway
        const [px, py] = safeSpot(t, b.x + (ogx - b.x) * 0.30, b.y + (13 - b.y) * 0.30, 0.8);
        actions.set(p.id, { move: [px, py] });
      }
    } else {
      // loose ball: predict a short intercept and chase
      const lead = 0.0;
      const bx = b.x + b.vx * lead, by = b.y + b.vy * lead;
      const sorted = [...rest].sort((a, b2) => Math.hypot(a.x - bx, a.y - by) - Math.hypot(b2.x - bx, b2.y - by));
      const chasers = sorted.slice(0, cfg.chaseN);
      for (const c of chasers) {
        const [px, py] = safeSpot(t, bx, by, 0.6);
        actions.set(c.id, { move: [px, py] });
      }
      for (const c of sorted.slice(cfg.chaseN)) {
        const [px, py] = safeSpot(t, b.x + (ogx - b.x) * 0.30, b.y + (13 - b.y) * 0.30, 0.8);
        actions.set(c.id, { move: [px, py] });
      }
    }
  } else {
    // supporting runs for the attacking side
    for (const m of rest) {
      const targetX = clamp(b.x + att * 6, 5, 38);
      const targetY = clamp(13 + (m.y - 13) * 0.6, 4, 22);
      const [px, py] = safeSpot(t, targetX, targetY, 0.8);
      actions.set(m.id, { move: [px, py] });
    }
  }
  if (keeper) {
    if (keeper.id === owner) {
      // clear it upfield / pass
      let best = null, bestS = -1e9;
      for (const m of field) {
        const dist = Math.hypot(m.x - b.x, m.y - b.y);
        if (dist > 26) continue;
        let clear = 1e9;
        for (const f of foes) clear = Math.min(clear, segDist(b.x, b.y, m.x, m.y, f.x, f.y));
        const s = clear + (m.x - b.x) * att * 0.15;
        if (s > bestS) { bestS = s; best = m; }
      }
      if (best) actions.set(keeper.id, { pass: best });
      else actions.set(keeper.id, { kick: [gx, 13 + (Math.random() - 0.5) * 6] });
    } else {
      const kx0 = ogx + att * cfg.keeperDepth;
      const D = Math.hypot(b.x - ogx, b.y - 13) || 1e-6;
      const ux = (ogx - b.x) / D, uy = (13 - b.y) / D;
      const kx = ogx + ux * Math.min(cfg.keeperDepth, D * 0.85);
      const ky = 13 + uy * Math.min(cfg.keeperDepth, D * 0.85);
      const [px, py] = safeSpot(t, kx, ky, 0.9);
      actions.set(keeper.id, { move: [px, py] });
    }
  }

  for (let f = 0; f < 20; f++) {
    const row = [];
    for (const u of mine) {
      const a = actions.get(u.id) || { move: [u.x, u.y] };
      let dir = 'N', aim = null, kick = false;
      if (a.shoot) {
        aim = Math.atan2(a.shoot.ty - b.y, a.shoot.tx - b.x) * 180 / Math.PI;
        if (f === 0 && u.hasBall) kick = true;
        else if (f === 0 && !u.hasBall) { /* lost it */ }
      } else if (a.pass) {
        aim = Math.atan2(a.pass.y - b.y, a.pass.x - b.x) * 180 / Math.PI;
        if (f === 0) kick = true;
      } else if (a.kick) {
        aim = Math.atan2(a.kick[1] - b.y, a.kick[0] - b.x) * 180 / Math.PI;
        if (f === 0) kick = true;
      } else if (a.dribble) {
        const [tx, ty] = a.dribble;
        dir = dirName(tx - u.x, ty - u.y);
      } else if (a.move) {
        const [tx, ty] = a.move;
        const d = Math.hypot(tx - u.x, ty - u.y);
        dir = d < 0.15 ? 'N' : dirName(tx - u.x, ty - u.y);
      }
      row.push({ dir, aim, kick });
    }
    frames.push(row);
  }
  return frames;
}

module.exports = { proInputs, DEFAULTS };
