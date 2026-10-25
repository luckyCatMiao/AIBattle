'use strict';
/* Sparring opponent modelled on the observed style of a strong long-ball team:
 *  - every loose ball is hunted at its predicted stopping point (second balls),
 *  - the carrier shoots from a clear lane into the corner away from the keeper,
 *  - under pressure it kicks a long ball to the far corner and chases it,
 *  - the keeper sits on the ball-to-goal-centre line.
 * Not part of the submission; only a benchmark opponent. */

const W = 44, H = 26;
const FR = 0.978, KICK = 11.0, DT = 0.05, WALLR = 0.72;
const MOVE = 3.15, DRIB = MOVE * 0.58, CONTROL = 0.82;
const BOX = { 0: { x1: 1, y1: 6, x2: 10, y2: 20 }, 1: { x1: 34, y1: 6, x2: 43, y2: 20 } };
const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hyp = Math.hypot;

function dirName(dx, dy) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 'N';
  const a = Math.atan2(dy, dx);
  const names = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'];
  return names[((Math.round(a / (Math.PI / 4)) % 8) + 8) % 8];
}
function segDist(ax, ay, bx, by, px, py) {
  const vx = bx - ax, vy = by - ay, L = vx * vx + vy * vy || 1e-9;
  let t = ((px - ax) * vx + (py - ay) * vy) / L;
  t = clamp(t, 0, 1);
  return hyp(px - (ax + vx * t), py - (ay + vy * t));
}
// is (x,y) inside the box we are not allowed to enter (the opponent's box)
function badSpot(t, x, y, m = 0.55) {
  const b = BOX[1 - t];
  return x > b.x1 - m && x < b.x2 + m && y > b.y1 - m && y < b.y2 + m;
}
function safeSpot(t, x, y, m = 0.6) {
  y = clamp(y, 0.5, H - 0.5);
  x = clamp(x, 0.5, W - 0.5);
  if (!badSpot(t, x, y, m)) return [x, y];
  const b = BOX[1 - t];
  const cands = [
    [b.x1 - m - 0.05, y], [b.x2 + m + 0.05, y],
    [x, b.y1 - m - 0.05], [x, b.y2 + m + 0.05],
  ];
  let best = cands[0], bd = 1e9;
  for (const c of cands) {
    if (badSpot(t, c[0], c[1], m)) continue;
    const d = hyp(c[0] - x, c[1] - y);
    if (d < bd) { bd = d; best = c; }
  }
  return [clamp(best[0], 0.5, W - 0.5), clamp(best[1], 0.5, H - 0.5)];
}

// simulate a kicked/loose ball until it stops (or 120 frames)
function predictPath(bx, by, vx, vy, horizon = 120) {
  const out = [];
  for (let i = 0; i < horizon; i++) {
    for (let s = 0; s < 4; s++) {
      bx += vx * DT / 4; by += vy * DT / 4;
      if (bx <= 1 && by >= 10.5 && by <= 15.5) { out.push([bx, by]); return out; }
      if (bx >= W - 1 && by >= 10.5 && by <= 15.5) { out.push([bx, by]); return out; }
      const hitX = bx < 0.5 || bx > W - 0.5;
      const hitY = by < 0.5 || by > H - 0.5;
      if (hitX) { bx -= vx * DT / 4; vx = -vx * WALLR; }
      if (hitY) { by -= vy * DT / 4; vy = -vy * WALLR; }
    }
    vx *= FR; vy *= FR;
    out.push([bx, by]);
    if (hyp(vx, vy) < 0.02) { for (let k = out.length; k < horizon; k++) out.push([bx, by]); break; }
  }
  return out;
}

function firstReach(u, path) {
  for (let i = 0; i < path.length; i++) {
    const t = (i + 1) / 20;
    if (hyp(u.x - path[i][0], u.y - path[i][1]) <= MOVE * t + CONTROL) return path[i];
  }
  return path[path.length - 1];
}

function shotChoice(t, bx, by, foes) {
  const gx = t === 0 ? 43 : 0;
  const dg = hyp(gx - bx, 13 - by);
  if (dg > 24) return null;
  const keeper = foes.find(f => f.index === 0);
  let best = null, bestS = -1e9;
  for (let i = 0; i <= 20; i++) {
    const ty = 10.6 + i * (15.4 - 10.6) / 20;
    let clear = 1e9;
    for (const f of foes) clear = Math.min(clear, segDist(bx, by, gx, ty, f.x, f.y));
    if (clear < 0.55) continue;
    const kd = keeper ? segDist(bx, by, gx, ty, keeper.x, keeper.y) : 9;
    const s = Math.min(clear, 2.5) * 1.5 + Math.min(kd, 4) * 0.35 - Math.abs(ty - 13) * 0.05 + dg * 0.02;
    if (s > bestS) { bestS = s; best = { tx: gx, ty, clear, dg }; }
  }
  return best;
}

function solInputs(view) {
  const t = view.yourTeam, n = view.teamSize;
  const press = String(view.solPress || '').includes('press');
  const mine = view.units.filter(u => u.team === t);
  const foes = view.units.filter(u => u.team !== t);
  const b = view.ball;
  const att = t === 0 ? 1 : -1;
  const gx = t === 0 ? 43 : 0, ogx = t === 0 ? 1 : 43;
  const keeper = n >= 2 ? mine.find(u => u.index === 0) : null;
  const field = mine.filter(u => u !== keeper);
  const owner = b.owner;
  const carrier = owner ? mine.find(u => u.id === owner) : null;
  const oppCarrier = owner ? foes.find(u => u.id === owner) : null;
  const act = new Map();

  const setMove = (u, x, y, m = 0.6) => {
    const [px, py] = safeSpot(t, x, y, m);
    act.set(u.id, { move: [px, py] });
  };

  // ---- keeper
  if (keeper) {
    if (keeper.id === owner) {
      // clear upfield toward the far corner, preferring an open mate
      let best = null, bs = -1e9;
      for (const m of field) {
        const d = hyp(m.x - b.x, m.y - b.y);
        if (d > 24) continue;
        let clear = 1e9;
        for (const f of foes) clear = Math.min(clear, segDist(b.x, b.y, m.x, m.y, f.x, f.y));
        const s = clear + (m.x - b.x) * att * 0.12 - d * 0.03;
        if (s > bs) { bs = s; best = m; }
      }
      if (best && bs > 0.6) act.set(keeper.id, { kick: [best.x, best.y] });
      else act.set(keeper.id, { kick: [gx, 13 + (b.y < 13 ? 2.5 : -2.5)] });
    } else {
      const d = hyp(b.x - ogx, b.y - 13) || 1;
      const ux = (ogx - b.x) / d, uy = (13 - b.y) / d;
      const out = clamp(d * 0.25, 0.7, 2.6);
      setMove(keeper, ogx - att * out + att * 0, 13 + uy * out, 0.35);
    }
  }

  // ---- our carrier
  if (carrier) {
    const shot = shotChoice(t, carrier.x, carrier.y, foes);
    const press = Math.min(...foes.map(f => hyp(f.x - b.x, f.y - b.y)), 99);
    if (shot && press > 0.9) {
      act.set(carrier.id, { kick: [shot.tx, shot.ty] });
    } else if (press < 1.5) {
      // long ball to the far corner away from the presser
      const kp = foes.find(f => f.index === 0);
      const ky = kp ? (kp.y < 13 ? 15.2 : 10.8) : (b.y < 13 ? 15.2 : 10.8);
      act.set(carrier.id, { kick: [gx, ky] });
    } else {
      // dribble to a strike spot just outside the box, on the side away from the keeper
      const kp = foes.find(f => f.index === 0);
      const lane = kp ? (kp.y < 13 ? 15.0 : 11.0) : 13;
      let tx = gx - att * 10.5;
      const [sx, sy] = safeSpot(t, tx, lane, 1.0);
      act.set(carrier.id, { move: [sx, sy] });
    }
    // support: get ahead of the ball in open lanes
    for (const m of field) {
      if (m.id === carrier.id) continue;
      setMove(m, clamp(b.x + att * 8, 5, 38), clamp(13 + (m.y - 13) * 0.7, 3.5, 22.5), 0.9);
    }
  } else if (oppCarrier) {
    // press the ball from the goal side, cover the rest
    const ranked = [...field].sort((a, c) => hyp(a.x - b.x, a.y - b.y) - hyp(c.x - b.x, c.y - b.y));
    ranked.forEach((u, i) => {
      if (press && i > 0) {
        // full-court press: everyone hunts the carrier
        setMove(u, b.x, b.y, 0.6);
      } else if (i === 0) {
        const d = hyp(b.x - ogx, b.y - 13) || 1;
        const ux = (b.x - ogx) / d, uy = (b.y - 13) / d;
        // 1.9 out on the goal side mirrors the style that gave our 1v1 trouble
        setMove(u, b.x - ux * 1.05, b.y - uy * 1.05, 0.6);
      } else {
        setMove(u, ogx + (b.x - ogx) * 0.45, 13 + (b.y - 13) * 0.45, 0.9);
      }
    });
  } else {
    // loose ball: everyone hunts the predicted stop point
    const path = predictPath(b.x, b.y, b.vx, b.vy, 140);
    const end = path[path.length - 1];
    const ranked = [...field].sort((a, c) => hyp(a.x - end[0], a.y - end[1]) - hyp(c.x - end[0], c.y - end[1]));
    ranked.forEach((u, i) => {
      if (press || i < Math.max(1, Math.min(3, ranked.length))) {
        const p = firstReach(u, path);
        setMove(u, p[0], p[1], 0.5);
      } else {
        setMove(u, ogx + (end[0] - ogx) * 0.45, 13 + (end[1] - 13) * 0.45, 0.9);
      }
    });
  }

  const frames = [];
  for (let f = 0; f < 20; f++) {
    const row = [];
    for (const u of mine) {
      const a = act.get(u.id) || { move: [u.x, u.y] };
      let dir = 'N', aim = null, kick = false;
      if (a.kick) {
        aim = Math.atan2(a.kick[1] - b.y, a.kick[0] - b.x) * 180 / Math.PI;
        if (f === 0 && u.hasBall) kick = true;
      } else if (a.move) {
        const [tx, ty] = a.move;
        const dx = tx - u.x, dy = ty - u.y;
        dir = hyp(dx, dy) < 0.12 ? 'N' : dirName(dx, dy);
      }
      row.push({ dir, aim, kick });
    }
    frames.push(row);
  }
  return frames;
}

module.exports = { solInputs };
