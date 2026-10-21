'use strict';
/* ============================================================
   PLAYER — "绯" the Crimson Blade
   Skeleton posed via two-bone IK; attacks are keyframed poses.
   ============================================================ */
const SK = {
  hipH: 52, torso: 34, neck: 8, headR: 10,
  upperArm: 19, foreArm: 19, thigh: 25, shin: 26,
  swordLen: 70
};

function ik2(rx, ry, tx, ty, l1, l2, bend) {
  let dx = tx - rx, dy = ty - ry;
  let d = Math.hypot(dx, dy);
  const maxD = l1 + l2 - 0.5;
  if (d > maxD) { const s = maxD / d; dx *= s; dy *= s; d = maxD; }
  d = Math.max(d, Math.abs(l1 - l2) + 0.5);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const ux = dx / d, uy = dy / d;
  const mx = rx + ux * a, my = ry + uy * a;
  return { x: mx - uy * h * bend, y: my + ux * h * bend };
}

function basePose() {
  return {
    hipY: -50, lean: 0.04, head: 0.02,
    fh: [15, -45], bh: [-7, -49],
    ff: [17, 0], bf: [-19, 0],
    sword: 1.02, elbowF: 1, elbowB: -1, kneeF: 1, kneeB: -1,
    chestTwist: 0, squash: 1, scarfWind: 1
  };
}
function clonePose(p) { return JSON.parse(JSON.stringify(p)); }
function lerpPose(a, b, t) {
  const o = {};
  for (const k in b) {
    const av = a[k] !== undefined ? a[k] : b[k];
    const bv = b[k];
    if (Array.isArray(bv)) o[k] = [lerp(av[0], bv[0], t), lerp(av[1], bv[1], t)];
    else o[k] = lerp(av, bv, t);
  }
  return o;
}
function keyPose(keys, t) {
  if (t <= keys[0].t) return clonePose(keys[0].p);
  for (let i = 1; i < keys.length; i++) {
    if (t <= keys[i].t) {
      const a = keys[i - 1], b = keys[i];
      const u = (t - a.t) / Math.max(0.0001, b.t - a.t);
      const e = b.ease ? b.ease(u) : u;
      return lerpPose(a.p, b.p, e);
    }
  }
  return clonePose(keys[keys.length - 1].p);
}

/* ---------- poses ---------- */
const POSE = {
  idle: basePose(),
  idleBreath: (() => { const p = basePose(); p.hipY = -48; p.fh = [15.5, -43.5]; p.sword = 0.96; return p; })(),
  runA: (() => { const p = basePose(); p.lean = 0.22; p.ff = [27, -2]; p.bf = [-29, -8]; p.fh = [16, -30]; p.bh = [-20, -26]; p.sword = 2.62; p.hipY = -47; return p; })(),
  runB: (() => { const p = basePose(); p.lean = 0.26; p.ff = [-16, -10]; p.bf = [14, -16]; p.fh = [24, -36]; p.bh = [4, -28]; p.sword = 2.85; p.hipY = -49; return p; })(),
  jumpUp: (() => { const p = basePose(); p.hipY = -52; p.lean = 0.1; p.ff = [16, -22]; p.bf = [-22, -8]; p.fh = [14, -42]; p.bh = [-16, -38]; p.sword = 2.7; return p; })(),
  fall: (() => { const p = basePose(); p.hipY = -52; p.lean = -0.12; p.ff = [20, -8]; p.bf = [-24, -18]; p.fh = [20, -40]; p.bh = [-12, -38]; p.sword = 2.55; return p; })(),
  land: (() => { const p = basePose(); p.hipY = -30; p.lean = 0.36; p.ff = [24, 0]; p.bf = [-24, 0]; p.fh = [26, -26]; p.bh = [-14, -22]; p.sword = 1.8; return p; })(),
  hurt: (() => { const p = basePose(); p.hipY = -46; p.lean = -0.5; p.head = -0.35; p.ff = [10, 0]; p.bf = [-24, 0]; p.fh = [26, -50]; p.bh = [-18, -46]; p.sword = 2.9; return p; })(),
  crouch: (() => { const p = basePose(); p.hipY = -30; p.lean = 0.32; p.ff = [22, 0]; p.bf = [-20, 0]; p.fh = [18, -46]; p.bh = [2, -40]; p.sword = 1.6; return p; })(),
  dead: (() => { const p = basePose(); p.hipY = -20; p.lean = -1.3; p.head = -0.5; p.ff = [16, 0]; p.bf = [-22, 0]; p.fh = [30, -16]; p.bh = [-20, -10]; p.sword = 0.4; return p; })(),
  dash: (() => { const p = basePose(); p.hipY = -40; p.lean = 0.55; p.ff = [26, -8]; p.bf = [-30, -12]; p.fh = [28, -30]; p.bh = [-24, -24]; p.sword = 2.7; return p; })()
};
