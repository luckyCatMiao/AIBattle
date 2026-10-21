'use strict';
// ---------------------------------------------------------------------------
// PLAYER — the "Echo Blade" swordsman
// Procedural skeleton, keyframed attack poses, generous cancels.
// ---------------------------------------------------------------------------

const PLAYER_CFG = {
  gravity: 2450,
  jumpVel: -790,
  doubleJumpVel: -690,
  maxFall: 1500,
  runSpeed: 400,
  accel: 4200,
  friction: 5200,
  airAccel: 2600,
  airFriction: 900,
  coyote: 0.09,
  jumpBuffer: 0.12,
  maxHp: 100,
  dashSpeed: 1180,
  dashTime: 0.135,
  dashRecover: 0.085,
  dashCooldown: 0.16,
  dashIFrames: 0.10,
  airDashSpeed: 980,
};

// Pose is in local space: x = forward, y = up from feet.
const POSES = {
  idle: { hx: 0, hy: 84, lean: 5, head: 0, hfx: 14, hfy: 112, hbx: -16, hby: 104, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 0 },
  idle2: { hx: 0, hy: 81, lean: 6, head: -1, hfx: 13, hfy: 108, hbx: -17, hby: 101, ffx: 18, ffy: 3, bfx: -17, bfy: 0, sw: -38, sf: 1, flap: 1 },
  run: { hx: 4, hy: 80, lean: 16, head: -6, hfx: 26, hfy: 98, hbx: -24, hby: 106, ffx: 26, ffy: 8, bfx: -30, bfy: 0, sw: -26, sf: 1, flap: 2 },
  run2: { hx: 4, hy: 82, lean: 17, head: -6, hfx: 20, hfy: 112, hbx: -30, hby: 96, ffx: -26, ffy: 6, bfx: 26, bfy: 0, sw: -20, sf: 1, flap: 3 },
  jump: { hx: 0, hy: 88, lean: 4, head: -8, hfx: 22, hfy: 122, hbx: -22, hby: 116, ffx: 16, ffy: 32, bfx: -34, bfy: 20, sw: -70, sf: 1, flap: 4 },
  fall: { hx: 0, hy: 88, lean: -2, head: -4, hfx: 26, hfy: 118, hbx: -26, hby: 118, ffx: 12, ffy: 16, bfx: -30, bfy: 26, sw: -55, sf: 1, flap: 5 },
  dash: { hx: 8, hy: 66, lean: 34, head: 8, hfx: 40, hfy: 78, hbx: -34, hby: 70, ffx: 34, ffy: 12, bfx: -42, bfy: 4, sw: -150, sf: 1, flap: 6 },
  land: { hx: 0, hy: 58, lean: 20, head: 4, hfx: 18, hfy: 82, hbx: -20, hby: 74, ffx: 24, ffy: 0, bfx: -24, bfy: 0, sw: -46, sf: 1, flap: 7 },
  charge: { hx: -4, hy: 70, lean: -8, head: 6, hfx: -4, hfy: 120, hbx: -10, hby: 112, ffx: 22, ffy: 0, bfx: -26, bfy: 0, sw: -168, sf: 1, flap: 8 },
  parry: { hx: 0, hy: 76, lean: 10, head: 0, hfx: 30, hfy: 112, hbx: 8, hby: 96, ffx: 22, ffy: 0, bfx: -22, bfy: 0, sw: -82, sf: 1, flap: 9 },
  hurt: { hx: -6, hy: 80, lean: -22, head: -18, hfx: 20, hfy: 104, hbx: -26, hby: 92, ffx: 20, ffy: 0, bfx: -20, bfy: 6, sw: 40, sf: 1, flap: 10 },
};

function poseCopy(p) { return Object.assign({}, p); }
function poseBlend(a, b, t) {
  const o = {};
  for (const k in a) o[k] = typeof a[k] === 'number' ? lerp(a[k], b[k], t) : b[k];
  return o;
}

const PLAYER_RIG = {
  torso: 50, headR: 12.5,
  upperArm: 29, foreArm: 28,
  thigh: 38, shin: 38,
};

// ---------------------------------------------------------------------------
// Attack definitions. Poses are keyframes relative to root (feet, x forward, y up)
// ---------------------------------------------------------------------------
function atk(o) {
  o.dur = o.dur ?? 0.32;
  o.startup = o.startup ?? 0.06;
  o.active = o.active ?? [o.startup, o.startup + 0.07];
  o.dmg = o.dmg ?? 10;
  o.limbMul = o.limbMul ?? 1;
  o.knock = o.knock ?? 220;
  o.lift = o.lift ?? 0;
  o.stop = o.stop ?? 0.055;
  o.shake = o.shake ?? 0.10;
  o.reachFront = o.reachFront ?? 82;
  o.reachBack = o.reachBack ?? -22;
  o.yTop = o.yTop ?? 44;
  o.yBot = o.yBot ?? 150;
  o.sfx = o.sfx ?? 'slash';
  o.power = o.power ?? 1;
  o.moveX = o.moveX ?? 0;
  o.trail = o.trail ?? '#d9fbff';
  o.trail2 = o.trail2 ?? '#ff3f63';
  o.cancel = o.cancel ?? 0.20; // time after active start when dash cancel opens
  return o;
}

const P_L1 = atk({
  name: 'l1', dur: 0.31, startup: 0.052, active: [0.052, 0.105], dmg: 9, knock: 150, stop: 0.045, shake: 0.08,
  reachFront: 92, yTop: 48, yBot: 138, moveX: 160, power: 0.9, lift: -30,
  cancel: 0.075,
  keys: [
    [0.00, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 10, hfy: 118, hbx: -14, hby: 100, ffx: 16, ffy: 2, bfx: -18, bfy: 0, sw: -128, sf: 1, flap: 1 }],
    [0.052, { hx: -6, hy: 80, lean: -14, head: 6, hfx: -8, hfy: 132, hbx: -22, hby: 98, ffx: 16, ffy: 2, bfx: -24, bfy: 0, sw: -158, sf: 1, flap: 2 }, 'outCubic'],
    [0.105, { hx: 12, hy: 76, lean: 30, head: -8, hfx: 42, hfy: 100, hbx: -22, hby: 94, ffx: 36, ffy: 0, bfx: -28, bfy: 2, sw: 34, sf: 1, flap: 3 }, 'outQuart'],
    [0.19, { hx: 5, hy: 81, lean: 14, head: -2, hfx: 28, hfy: 100, hbx: -18, hby: 98, ffx: 24, ffy: 0, bfx: -20, bfy: 0, sw: 52, sf: 1, flap: 4 }, 'outCubic'],
    [0.31, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 12, hfy: 112, hbx: -16, hby: 102, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 1 }, 'smooth'],
  ],
});
const P_L2 = atk({
  name: 'l2', dur: 0.33, startup: 0.055, active: [0.055, 0.118], dmg: 11, knock: 200, stop: 0.052, shake: 0.10,
  reachFront: 98, yTop: 40, yBot: 142, moveX: 190, power: 1, lift: -50,
  cancel: 0.08,
  keys: [
    [0.00, { hx: 2, hy: 82, lean: 12, head: -2, hfx: 26, hfy: 100, hbx: -16, hby: 98, ffx: 22, ffy: 0, bfx: -20, bfy: 0, sw: 56, sf: 1, flap: 3 }],
    [0.055, { hx: 2, hy: 78, lean: 26, head: 4, hfx: 16, hfy: 88, hbx: -24, hby: 94, ffx: 28, ffy: 0, bfx: -24, bfy: 0, sw: 104, sf: 1, flap: 4 }, 'outCubic'],
    [0.118, { hx: 14, hy: 88, lean: -16, head: -12, hfx: 44, hfy: 138, hbx: -26, hby: 102, ffx: 34, ffy: 0, bfx: -30, bfy: 2, sw: -84, sf: 1, flap: 5 }, 'outQuart'],
    [0.21, { hx: 6, hy: 82, lean: 2, head: -4, hfx: 30, hfy: 122, hbx: -20, hby: 100, ffx: 26, ffy: 0, bfx: -22, bfy: 0, sw: -96, sf: 1, flap: 6 }, 'outCubic'],
    [0.33, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 12, hfy: 112, hbx: -16, hby: 102, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 1 }, 'smooth'],
  ],
});
const P_L3 = atk({
  name: 'l3', dur: 0.37, startup: 0.065, active: [0.065, 0.145], dmg: 13, knock: 260, stop: 0.06, shake: 0.13,
  reachFront: 118, yTop: 38, yBot: 140, moveX: 300, power: 1.1, limbMul: 1.15, lift: -70,
  cancel: 0.09,
  keys: [
    [0.00, { hx: 4, hy: 84, lean: -6, head: -4, hfx: 34, hfy: 124, hbx: -24, hby: 100, ffx: 28, ffy: 0, bfx: -24, bfy: 0, sw: -104, sf: 1, flap: 5 }],
    [0.065, { hx: -6, hy: 86, lean: -18, head: 6, hfx: 6, hfy: 128, hbx: -18, hby: 104, ffx: 18, ffy: 0, bfx: -28, bfy: 0, sw: -150, sf: 1, flap: 6 }, 'outCubic'],
    [0.145, { hx: 18, hy: 72, lean: 36, head: -10, hfx: 58, hfy: 96, hbx: -28, hby: 88, ffx: 44, ffy: 0, bfx: -36, bfy: 4, sw: 12, sf: 1, flap: 7 }, 'outQuart'],
    [0.23, { hx: 12, hy: 78, lean: 24, head: -6, hfx: 44, hfy: 94, hbx: -24, hby: 92, ffx: 34, ffy: 0, bfx: -28, bfy: 0, sw: 42, sf: 1, flap: 8 }, 'outCubic'],
    [0.37, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 12, hfy: 112, hbx: -16, hby: 102, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 1 }, 'smooth'],
  ],
});
const P_LOW = atk({
  name: 'lowsweep', dur: 0.36, startup: 0.07, active: [0.07, 0.15], dmg: 10, knock: 190, stop: 0.06, shake: 0.12,
  reachFront: 112, yTop: 0, yBot: 78, moveX: 220, power: 1.05, limbMul: 2.2, lowSweep: true,
  cancel: 0.09, trail: '#ffd9a8', trail2: '#ff5c7a',
  keys: [
    [0.00, { hx: 0, hy: 70, lean: 22, head: 6, hfx: 20, hfy: 64, hbx: -14, hby: 74, ffx: 24, ffy: 0, bfx: -22, bfy: 0, sw: 96, sf: 1, flap: 3 }],
    [0.07, { hx: -8, hy: 64, lean: 30, head: 10, hfx: 4, hfy: 52, hbx: -20, hby: 66, ffx: 28, ffy: 0, bfx: -26, bfy: 0, sw: 128, sf: 1, flap: 4 }, 'outCubic'],
    [0.15, { hx: 14, hy: 56, lean: 46, head: -6, hfx: 54, hfy: 30, hbx: -26, hby: 60, ffx: 38, ffy: 0, bfx: -34, bfy: 0, sw: -26, sf: 1, flap: 5 }, 'outQuart'],
    [0.24, { hx: 10, hy: 62, lean: 34, head: -4, hfx: 42, hfy: 34, hbx: -22, hby: 64, ffx: 30, ffy: 0, bfx: -30, bfy: 0, sw: -8, sf: 1, flap: 6 }, 'outCubic'],
    [0.36, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 12, hfy: 112, hbx: -16, hby: 102, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 1 }, 'smooth'],
  ],
});

const P_L4 = atk({
  name: 'l4', dur: 0.52, startup: 0.10, active: [0.10, 0.19], dmg: 20, knock: 420, lift: -560, stop: 0.085, shake: 0.24,
  reachFront: 104, yTop: 20, yBot: 168, moveX: 240, power: 1.5, limbMul: 1.35, launch: true,
  cancel: 0.13, heavyKill: true,
  keys: [
    [0.00, { hx: 2, hy: 82, lean: 10, head: -2, hfx: 30, hfy: 108, hbx: -18, hby: 98, ffx: 24, ffy: 0, bfx: -22, bfy: 0, sw: 44, sf: 1, flap: 6 }],
    [0.10, { hx: -14, hy: 96, lean: -36, head: 14, hfx: -12, hfy: 156, hbx: -16, hby: 120, ffx: 4, ffy: 20, bfx: -34, bfy: 0, sw: -188, sf: 1, flap: 0 }, 'outCubic'],
    [0.19, { hx: 18, hy: 56, lean: 52, head: -16, hfx: 56, hfy: 64, hbx: -34, hby: 80, ffx: 46, ffy: 0, bfx: -44, bfy: 0, sw: 88, sf: 1, flap: 2 }, 'inCubic'],
    [0.30, { hx: 8, hy: 76, lean: 26, head: -6, hfx: 34, hfy: 86, hbx: -22, hby: 92, ffx: 30, ffy: 0, bfx: -28, bfy: 0, sw: 92, sf: 1, flap: 3 }, 'outCubic'],
    [0.52, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 12, hfy: 112, hbx: -16, hby: 102, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 1 }, 'smooth'],
  ],
});

const P_AIR1 = atk({
  name: 'a1', dur: 0.30, startup: 0.05, active: [0.05, 0.11], dmg: 9, knock: 130, stop: 0.045, shake: 0.07,
  reachFront: 90, yTop: 26, yBot: 122, moveX: 90, air: true, power: 0.9, cancel: 0.07,
  keys: [
    [0.00, { hx: 0, hy: 88, lean: 6, head: -4, hfx: 16, hfy: 118, hbx: -22, hby: 112, ffx: 14, ffy: 30, bfx: -30, bfy: 20, sw: -120, sf: 1, flap: 4 }],
    [0.05, { hx: 0, hy: 90, lean: -10, head: 2, hfx: 4, hfy: 138, hbx: -26, hby: 116, ffx: 16, ffy: 26, bfx: -32, bfy: 18, sw: -152, sf: 1, flap: 5 }, 'outCubic'],
    [0.11, { hx: 6, hy: 84, lean: 26, head: -8, hfx: 38, hfy: 100, hbx: -28, hby: 108, ffx: 22, ffy: 30, bfx: -34, bfy: 14, sw: 50, sf: 1, flap: 6 }, 'outQuart'],
    [0.20, { hx: 4, hy: 86, lean: 16, head: -4, hfx: 30, hfy: 102, hbx: -24, hby: 110, ffx: 18, ffy: 30, bfx: -32, bfy: 20, sw: 66, sf: 1, flap: 5 }, 'outCubic'],
    [0.30, { hx: 0, hy: 88, lean: 4, head: -4, hfx: 24, hfy: 116, hbx: -24, hby: 114, ffx: 14, ffy: 26, bfx: -30, bfy: 22, sw: -60, sf: 1, flap: 4 }, 'smooth'],
  ],
});
const P_AIR2 = atk({
  name: 'a2', dur: 0.32, startup: 0.055, active: [0.055, 0.125], dmg: 11, knock: 180, lift: -140, stop: 0.055, shake: 0.10,
  reachFront: 98, yTop: 16, yBot: 120, moveX: 80, air: true, power: 1, cancel: 0.08,
  keys: [
    [0.00, { hx: 2, hy: 86, lean: 14, head: -4, hfx: 30, hfy: 104, hbx: -22, hby: 110, ffx: 16, ffy: 28, bfx: -30, bfy: 20, sw: 52, sf: 1, flap: 5 }],
    [0.055, { hx: 0, hy: 84, lean: 22, head: 2, hfx: 22, hfy: 96, hbx: -26, hby: 108, ffx: 18, ffy: 26, bfx: -30, bfy: 18, sw: 96, sf: 1, flap: 6 }, 'outCubic'],
    [0.125, { hx: 8, hy: 92, lean: -14, head: -10, hfx: 40, hfy: 136, hbx: -28, hby: 112, ffx: 24, ffy: 30, bfx: -34, bfy: 22, sw: -78, sf: 1, flap: 7 }, 'outQuart'],
    [0.21, { hx: 4, hy: 88, lean: -2, head: -4, hfx: 32, hfy: 122, hbx: -24, hby: 112, ffx: 18, ffy: 28, bfx: -30, bfy: 20, sw: -96, sf: 1, flap: 6 }, 'outCubic'],
    [0.32, { hx: 0, hy: 88, lean: 4, head: -4, hfx: 24, hfy: 116, hbx: -24, hby: 114, ffx: 14, ffy: 26, bfx: -30, bfy: 22, sw: -60, sf: 1, flap: 4 }, 'smooth'],
  ],
});
const P_AIR3 = atk({
  name: 'a3', dur: 0.42, startup: 0.07, active: [0.07, 0.17], dmg: 17, knock: 260, lift: 520, stop: 0.08, shake: 0.2,
  reachFront: 96, yTop: -10, yBot: 128, moveX: 60, air: true, power: 1.4, limbMul: 1.4, cancel: 0.12,
  keys: [
    [0.00, { hx: 4, hy: 88, lean: -2, head: -6, hfx: 34, hfy: 122, hbx: -26, hby: 112, ffx: 18, ffy: 28, bfx: -32, bfy: 20, sw: -104, sf: 1, flap: 6 }],
    [0.07, { hx: -2, hy: 94, lean: -26, head: 10, hfx: -2, hfy: 146, hbx: -20, hby: 118, ffx: 12, ffy: 34, bfx: -32, bfy: 24, sw: -176, sf: 1, flap: 7 }, 'outCubic'],
    [0.17, { hx: 10, hy: 66, lean: 46, head: -12, hfx: 44, hfy: 66, hbx: -30, hby: 84, ffx: 30, ffy: 26, bfx: -36, bfy: 16, sw: 88, sf: 1, flap: 8 }, 'inCubic'],
    [0.27, { hx: 6, hy: 78, lean: 28, head: -6, hfx: 34, hfy: 80, hbx: -24, hby: 94, ffx: 24, ffy: 28, bfx: -32, bfy: 20, sw: 100, sf: 1, flap: 7 }, 'outCubic'],
    [0.42, { hx: 0, hy: 88, lean: 4, head: -4, hfx: 24, hfy: 116, hbx: -24, hby: 114, ffx: 14, ffy: 26, bfx: -30, bfy: 22, sw: -60, sf: 1, flap: 4 }, 'smooth'],
  ],
});

const P_HEAVY = atk({
  name: 'heavy', dur: 0.62, startup: 0.20, active: [0.20, 0.30], dmg: 27, knock: 480, lift: -140, stop: 0.11, shake: 0.38,
  reachFront: 124, yTop: 18, yBot: 172, moveX: 330, power: 1.7, limbMul: 2.0, launch: true,
  cancel: 0.33, heavyKill: true, guardBreak: true,
  sfx: 'heavy',
  keys: [
    [0.00, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 12, hfy: 112, hbx: -16, hby: 102, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 1 }],
    [0.20, { hx: -14, hy: 96, lean: -34, head: 14, hfx: -10, hfy: 158, hbx: -22, hby: 120, ffx: 4, ffy: 20, bfx: -34, bfy: 0, sw: -196, sf: 1, flap: 0 }, 'outCubic'],
    [0.30, { hx: 18, hy: 56, lean: 50, head: -14, hfx: 50, hfy: 66, hbx: -32, hby: 80, ffx: 46, ffy: 0, bfx: -42, bfy: 0, sw: 84, sf: 1, flap: 2 }, 'inCubic'],
    [0.42, { hx: 12, hy: 70, lean: 30, head: -8, hfx: 38, hfy: 78, hbx: -26, hby: 88, ffx: 34, ffy: 0, bfx: -32, bfy: 0, sw: 96, sf: 1, flap: 3 }, 'outCubic'],
    [0.62, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 12, hfy: 112, hbx: -16, hby: 102, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 1 }, 'smooth'],
  ],
});

const P_CHARGE = atk({
  name: 'charged', dur: 0.86, startup: 0.26, active: [0.26, 0.38], dmg: 48, knock: 700, lift: -300, stop: 0.17, shake: 0.62,
  reachFront: 150, yTop: 0, yBot: 190, moveX: 480, power: 2.6, limbMul: 3.2, launch: true,
  cancel: 0.40, heavyKill: true, guardBreak: true, shockwave: true,
  sfx: 'heavy',
  keys: [
    [0.00, { hx: -6, hy: 70, lean: -12, head: 8, hfx: -2, hfy: 124, hbx: -12, hby: 112, ffx: 20, ffy: 0, bfx: -26, bfy: 0, sw: -170, sf: 1, flap: 2 }],
    [0.26, { hx: -16, hy: 98, lean: -40, head: 16, hfx: -12, hfy: 162, hbx: -24, hby: 122, ffx: 2, ffy: 22, bfx: -36, bfy: 0, sw: -208, sf: 1, flap: 0 }, 'outCubic'],
    [0.38, { hx: 22, hy: 50, lean: 56, head: -16, hfx: 56, hfy: 56, hbx: -34, hby: 76, ffx: 52, ffy: 0, bfx: -48, bfy: 0, sw: 96, sf: 1, flap: 2 }, 'inCubic'],
    [0.54, { hx: 14, hy: 68, lean: 32, head: -8, hfx: 40, hfy: 74, hbx: -28, hby: 86, ffx: 36, ffy: 0, bfx: -34, bfy: 0, sw: 104, sf: 1, flap: 3 }, 'outCubic'],
    [0.86, { hx: 0, hy: 84, lean: 6, head: 0, hfx: 12, hfy: 112, hbx: -16, hby: 102, ffx: 17, ffy: 2, bfx: -18, bfy: 0, sw: -42, sf: 1, flap: 1 }, 'smooth'],
  ],
});

const P_DIVE = atk({
  name: 'dive', dur: 0.50, startup: 0.09, active: [0.09, 0.42], dmg: 24, knock: 380, lift: 0, stop: 0.10, shake: 0.34,
  reachFront: 84, yTop: -30, yBot: 120, moveX: 0, power: 1.5, limbMul: 1.8, dive: true,
  cancel: 0.30, heavyKill: true,
  keys: [
    [0.00, { hx: 2, hy: 88, lean: 8, head: -4, hfx: 30, hfy: 120, hbx: -26, hby: 112, ffx: 16, ffy: 26, bfx: -32, bfy: 20, sw: -96, sf: 1, flap: 4 }],
    [0.09, { hx: 0, hy: 92, lean: -10, head: 4, hfx: 10, hfy: 150, hbx: -12, hby: 128, ffx: -6, ffy: 40, bfx: -20, bfy: 34, sw: -166, sf: 1, flap: 5 }, 'outCubic'],
    [0.20, { hx: 6, hy: 84, lean: 34, head: -8, hfx: 34, hfy: 60, hbx: -26, hby: 90, ffx: 8, ffy: 28, bfx: -18, bfy: 22, sw: 110, sf: 1, flap: 6 }, 'inCubic'],
    [0.42, { hx: 4, hy: 66, lean: 40, head: -8, hfx: 30, hfy: 46, hbx: -24, hby: 76, ffx: 22, ffy: 4, bfx: -22, bfy: 0, sw: 120, sf: 1, flap: 7 }, 'outCubic'],
    [0.50, { hx: 0, hy: 58, lean: 22, head: 2, hfx: 18, hfy: 80, hbx: -20, hby: 74, ffx: 24, ffy: 0, bfx: -24, bfy: 0, sw: -46, sf: 1, flap: 8 }, 'smooth'],
  ],
});

function sampleKeys(keys, t) {
  let a = keys[0], b = keys[keys.length - 1];
  for (let i = 0; i < keys.length - 1; i++) {
    if (t >= keys[i][0] && t <= keys[i + 1][0]) { a = keys[i]; b = keys[i + 1]; break; }
  }
  const span = Math.max(0.0001, b[0] - a[0]);
  let f = clamp((t - a[0]) / span, 0, 1);
  const e = b[2] || 'smooth';
  f = (ease[e] || ease.smooth)(f);
  const pa = a[1], pb = b[1];
  const o = {};
  for (const k in pa) o[k] = typeof pa[k] === 'number' ? lerp(pa[k], pb[k] ?? pa[k], f) : pa[k];
  return o;
}

class Player {
  constructor(game) {
    this.game = game;
    this.reset();
  }
  reset() {
    this.x = 0; this.y = 0;            // feet position, y is ground offset (negative = airborne)
    this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.hp = PLAYER_CFG.maxHp;
    this.maxHp = PLAYER_CFG.maxHp;
    this.alive = true;
    this.state = 'idle';
    this.stateT = 0;
    this.grounded = true;
    this.coyote = 0;
    this.jumps = 0;
    this.jumpHeld = false;
    this.attack = null;
    this.comboIndex = 0;
    this.comboWindow = 0;
    this.chainQueued = false;
    this.charge = 0;
    this.charging = false;
    this.dashCD = 0;
    this.airDashUsed = false;
    this.iFrames = 0;
    this.hurtT = 0;
    this.invulnFlash = 0;
    this.pose = poseCopy(POSES.idle);
    this.poseT = 0;
    this.breathe = 0;
    this.scarf = [];
    for (let i = 0; i < 7; i++) this.scarf.push({ x: 0, y: 0, px: 0, py: 0 });
    this.scarfInit = false;
    this.trailT = 0;
    this.diveImpact = false;
    this.sx = 0; this.sy = 0;
    this.landT = 0;
    this.parryT = 0;
    this.parryAnim = 0;
    this.hitFlash = 0;
    this.bladeGlow = 0;
    this.deadT = 0;
    this.lastGroundY = 0;
    this.slashSfx = false;
    this.stepT = 0;
    this.trailAcc = 0;
    this.hurtDir = 1;
    this.wallBounce = 0;
    // ---- skills ----
    this.energy = 0;                 // 断势 gauge, 0..100
    this.maxEnergy = 100;
    this.energyIdle = 0;
    this.skillCD = [0, 0, 0, 0];
    this.blinkCharge = 0;            // hold-R time
    this.blinkReady = 0;             // visual charge ping
    this.stormT = 0;
    this.stormTick = 0;
    this.stormSeed = 0;
    this.onslaughtT = 0;
    this.onslaughtIdx = 0;
    this.onslaughtTarget = null;
    this.finalT = 0;
    this.finalStage = 0;
    this.finalTrailT = 0;
    this.skillFlashLabel = null;
  }

  get h() { return 168; }

  get chest() { return { x: this.x, y: this.y - 118 }; }

  addTrauma(v) { this.game.addTrauma(v); }

  update(dt) {
    this.stateT += dt;
    this.comboWindow = Math.max(0, this.comboWindow - dt);
    this.dashCD = Math.max(0, this.dashCD - dt);
    this.iFrames = Math.max(0, this.iFrames - dt);
    this.invulnFlash = Math.max(0, this.invulnFlash - dt);
    this.parryAnim = Math.max(0, this.parryAnim - dt);
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.bladeGlow = Math.max(0, this.bladeGlow - dt * 3);
    this.landT = Math.max(0, this.landT - dt);
    this.breathe += dt;

    if (!this.alive) { this.deadT += dt; this.updateDead(dt); return; }

    // ---------------- skills ----------------
    for (let i = 0; i < 4; i++) this.skillCD[i] = Math.max(0, this.skillCD[i] - dt);
    this.energyIdle = this.stormT > 0 ? 0 : this.energyIdle + dt;
    // passive regen (slow, but steady — skills should feel available)
    if (this.energy < this.maxEnergy && this.alive) {
      this.energy = Math.min(this.maxEnergy, this.energy + dt * (this.state === 'idle' ? 7.5 : 3.2));
    }
    this.blinkReady = Math.max(0, this.blinkReady - dt);

    // SKILL 1 — 裂空斩 (R): tap = blink 220px through enemies, cut them; hold = charged blink
    if (Input.consume('skill3') && !Input.heldAction('skill3')) {
      // consume on keyup path is handled via blinkHold; pressing starts charging
    }
    if (Input.heldAction('skill3')) {
      this.blinkCharge = Math.min(1, this.blinkCharge + dt / 0.5);
      if (this.blinkCharge >= 1 && !this.blinkFired) {
        this.blinkFired = true;
        this.game.onSkillChargeFull(this);
      }
    } else {
      if (this.blinkCharge > 0 && !this.blinkFired) {
        // released → cast
        this.castBlink(this.blinkCharge);
      }
      this.blinkCharge = 0;
      this.blinkFired = false;
    }
    // SKILL 2 — 千刃风暴 (F)
    if (Input.consume('skill1')) this.castStorm();
    // SKILL 3 — 断界一闪 (Q)
    if (Input.consume('skill2')) this.castRift();
    // SKILL 4 — 终式·万刃归一 (U)
    if (Input.consume('skill4')) this.castFinal();

    // Parry buffer input
    if (Input.consume('manual')) {
      if (this.grounded) this.startParry();
      else if (!this.attack || this.attack.t > 0.12) this.startDive();
    }

    // Dash
    if (Input.consume('dash')) {
      this.tryDash();
    }

    // Heavy / charge
    if (Input.consume('heavy')) {
      this.startCharge();
    }

    // Light
    if (Input.consume('light')) {
      this.tryLight();
    }

    // Jump
    if (Input.consume('jump')) {
      this.jumpBufferT = PLAYER_CFG.jumpBuffer;
    } else {
      this.jumpBufferT = Math.max(0, (this.jumpBufferT || 0) - dt);
    }

    switch (this.state) {
      case 'idle':
      case 'run':
        this.updateGround(dt);
        break;
      case 'jump':
      case 'fall':
        this.updateAir(dt);
        break;
      case 'dash':
        this.updateDash(dt);
        break;
      case 'attack':
        this.updateAttack(dt);
        break;
      case 'dive':
        this.updateDive(dt);
        break;
      case 'parry':
        this.updateParry(dt);
        break;
      case 'charge':
        this.updateCharge(dt);
        break;
      case 'hurt':
        this.updateHurt(dt);
        break;
      case 'land':
        this.updateLand(dt);
        break;
      case 'blink':
        this.updateBlink(dt);
        break;
      case 'storm':
        this.updateStorm(dt);
        break;
      case 'onslaught':
        this.updateOnslaught(dt);
        break;
      case 'finale':
        this.updateFinale(dt);
        break;
      default:
        this.updateGround(dt);
    }

    // Physics integration for states not manually moving
    if (!['attack', 'dash', 'dive', 'parry', 'charge', 'hurt'].includes(this.state) || this.state === 'attack') {
      // handled within states mostly; gravity always applies except dash/dive/parry/charge handled there
    }

    this.applyPhysics(dt);

    // animation pose selection
    this.animate(dt);

    // scarf physics
    this.updateScarf(dt);

    // dust from motion
    if (this.grounded && Math.abs(this.vx) > 300 && this.state === 'run' && Math.random() < dt * 22) {
      this.game.particles.add({
        type: 'dust', x: this.x - this.facing * 8 + rand(-6, 6), y: this.y + rand(-2, 0),
        vx: -this.facing * rand(40, 130), vy: rand(-40, -8), size: rand(3, 7), life: rand(0.3, 0.55),
        col: 'rgba(190,205,225,0.20)', drag: 2.2, add: false,
      });
    }
  }

  // ---------------- ground / air movement ----------------
  resolveGround() {
    const g = this.game;
    const ground = g.groundY;
    if (this.y >= ground - 0.001) {
      this.y = ground;
      if (!this.grounded) this.onLand();
      this.grounded = true;
      return true;
    }
    this.grounded = false;
    return false;
  }

  onLand() {
    const impact = clamp(Math.abs(this.vyAtLand ?? 0) / 900, 0.1, 1);
    this.vy = 0;
    this.grounded = true;
    this.coyote = PLAYER_CFG.coyote;
    this.jumps = 0;
    this.airDashUsed = false;
    this.landT = 0.12;
    Sound.SFX.land(impact, this.pan());
    this.game.particles.add({ type: 'ring', x: this.x, y: this.y - 2, vx: 0, vy: 0, size: 20 + impact * 26, life: 0.24, col: 'rgba(200,225,255,0.5)', add: true });
    for (let i = 0; i < 6 + impact * 6; i++) {
      this.game.particles.add({
        type: 'dust', x: this.x + rand(-16, 16), y: this.y, vx: rand(-140, 140) * impact, vy: rand(-120, -20),
        size: rand(3, 6), life: rand(0.2, 0.45), col: 'rgba(175,195,220,0.30)', drag: 3, grav: 200,
      });
    }
    if (impact > 0.55) this.addTrauma(0.16 * impact);
    if (this.state === 'jump' || this.state === 'fall') {
      this.setState(Math.abs(this.vx) > 20 ? 'run' : 'idle');
    }
    if (this.attack && this.attack.def.air) this.endAttack();
    if (this.state === 'dive') this.finishDive();
  }
  pan() { return clamp((this.x - this.game.camera.x) / 620, -1, 1) * 0.7; }

  updateGround(dt) {
    const ax = Input.axisX();
    const cfg = PLAYER_CFG;
    if (ax !== 0) {
      this.facing = ax;
      this.vx += ax * cfg.accel * dt;
      this.vx = clamp(this.vx, -cfg.runSpeed, cfg.runSpeed);
      if (this.state === 'idle') this.setState('run');
    } else {
      const f = cfg.friction * dt;
      if (Math.abs(this.vx) <= f) this.vx = 0; else this.vx -= sign(this.vx) * f;
      if (this.state === 'run' && Math.abs(this.vx) < 40) this.setState('idle');
    }
    this.coyote = cfg.coyote;
    // jump
    if (this.jumpBufferT > 0) {
      this.jumpBufferT = 0;
      this.doJump();
    }
    if (!this.resolveGround()) {
      if (this.coyote > 0) { this.coyote -= dt; }
      this.setState('fall');
    }
    this.coyote = Math.max(0, this.coyote - dt * 0.2);
  }

  doJump() {
    if (this.grounded || this.coyote > 0) {
      this.vy = PLAYER_CFG.jumpVel;
      this.grounded = false;
      this.coyote = 0;
      this.jumps = 1;
      this.jumpHeld = true;
      this.y -= 2;
      this.setState('jump');
      Sound.SFX.jump(this.pan());
      this.game.particles.add({ type: 'ring', x: this.x, y: this.y - 2, size: 18, life: 0.22, col: 'rgba(190,225,255,0.45)', add: true });
      for (let i = 0; i < 5; i++) this.game.particles.add({
        type: 'dust', x: this.x + rand(-10, 10), y: this.y, vx: rand(-70, 70), vy: rand(-40, 20),
        size: rand(3, 6), life: rand(0.2, 0.4), col: 'rgba(170,195,225,0.3)', drag: 3,
      });
    } else if (this.jumps < 2) {
      this.vy = PLAYER_CFG.doubleJumpVel;
      this.jumps = 2;
      this.jumpHeld = true;
      this.setState('jump');
      Sound.SFX.jump(this.pan());
      this.game.particles.add({ type: 'ring', x: this.x, y: this.y - 60, size: 24, life: 0.24, col: 'rgba(150,235,255,0.55)', add: true });
      for (let i = 0; i < 9; i++) {
        const a = rand(0, TAU);
        this.game.particles.add({
          type: 'spark', x: this.x + Math.cos(a) * 14, y: this.y - 60 + Math.sin(a) * 14,
          vx: Math.cos(a) * rand(60, 200), vy: Math.sin(a) * rand(60, 200) - 60,
          size: rand(1.5, 3), life: rand(0.15, 0.3), col: '#9fe9ff', drag: 4, add: true,
        });
      }
      // spin flourish
      this.spinT = 0.3;
    }
  }

  updateAir(dt) {
    const ax = Input.axisX();
    const cfg = PLAYER_CFG;
    if (ax !== 0) {
      this.facing = ax;
      this.vx += ax * cfg.airAccel * dt;
      this.vx = clamp(this.vx, -cfg.runSpeed, cfg.runSpeed);
    } else {
      const f = cfg.airFriction * dt;
      if (Math.abs(this.vx) <= f) this.vx = 0; else this.vx -= sign(this.vx) * f;
    }
    if (this.jumpBufferT > 0 && this.jumps < 2) {
      this.jumpBufferT = 0;
      this.doJump();
    }
    this.resolveGround();
  }

  applyPhysics(dt) {
    const g = this.game;
    if (!this.grounded || this.state === 'jump' || this.state === 'fall') {
      this.vy += PLAYER_CFG.gravity * dt;
      this.vy = Math.min(this.vy, PLAYER_CFG.maxFall);
      this.vyAtLand = this.vy;
    }
    if (this.state === 'dive') this.vy = Math.min(this.vy + 5200 * dt, 2200);
    if (this.state === 'storm') {
      // hover at a fixed height: ease toward target altitude, ignore gravity
      this.vy = 0;
      this.y = damp(this.y, g.groundY - 150, 10, dt);
      this.grounded = false;
      this.vyAtLand = 0;
    }
    if (this.state === 'onslaught' || this.state === 'finale' || this.state === 'blink') {
      // these move themselves along authored curves
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    // ground collision
    if (this.y >= g.groundY) {
      if (this.state === 'dive') { this.y = g.groundY; this.finishDive(); }
      else if (this.state !== 'attack' || this.grounded) {
        this.y = g.groundY;
        if (!this.grounded) { this.vyAtLand = this.vy; this.onLand(); }
        this.grounded = true;
        this.vy = 0;
      } else {
        this.y = g.groundY;
        this.vy = 0;
        this.grounded = true;
      }
    }
    // world bounds
    const minX = g.arenaMinX + 30, maxX = g.arenaMaxX - 30;
    if (this.x < minX) { this.x = minX; if (this.vx < 0) this.vx = 0; }
    if (this.x > maxX) { this.x = maxX; if (this.vx > 0) this.vx = 0; }
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
  }

  // ---------------- dash ----------------
  tryDash() {
    if (this.dashCD > 0) return;
    if (this.state === 'hurt' || this.state === 'parry') return;
    const ax = Input.axisX();
    const dir = ax !== 0 ? ax : this.facing;
    this.facing = dir;
    // dash cancel from attack recovery / active
    let wasAttacking = false;
    if (this.state === 'attack') {
      if (this.attack.t < this.attack.def.startup * 0.8) return; // can't cancel before swing
      wasAttacking = true;
      this.endAttack(true);
    }
    if (this.state === 'charge') { this.charging = false; }
    this.setState('dash');
    this.dashT = PLAYER_CFG.dashTime;
    this.dashCD = PLAYER_CFG.dashTime + PLAYER_CFG.dashRecover + PLAYER_CFG.dashCooldown;
    this.vx = dir * (this.grounded ? PLAYER_CFG.dashSpeed : PLAYER_CFG.airDashSpeed);
    this.vy = 0;
    this.iFrames = PLAYER_CFG.dashIFrames;
    if (!this.grounded) this.airDashUsed = true;
    this.dashDir = dir;
    Sound.SFX.dash(this.pan());
    this.addTrauma(0.05);
    this.game.slashes.add({
      life: 0.22, width: 30, col: '#bff4ff', col2: '#ff5c7a',
      follow: () => ({ x: this.x - dir * rand(30, 80), y: this.y - rand(50, 110), bx: this.x - dir * rand(0, 20), by: this.y - rand(30, 70) }),
    });
    for (let i = 0; i < 12; i++) {
      this.game.particles.add({
        type: 'streak', x: this.x - dir * rand(0, 28), y: this.y - rand(6, 130),
        vx: -dir * rand(200, 700), vy: rand(-30, 30),
        size: rand(3, 9), rot: dir > 0 ? 0 : Math.PI, life: rand(0.12, 0.30),
        col: i % 3 === 0 ? '#ffb3c4' : 'rgba(185,238,255,0.85)', add: true, drag: 2.5,
      });
    }
  }

  updateDash(dt) {
    this.dashT -= dt;
    this.grounded = this.y >= this.game.groundY - 0.5;
    if (this.dashT <= 0) {
      this.vx *= 0.35;
      this.setState(this.grounded ? (Math.abs(this.vx) > 30 ? 'run' : 'idle') : 'fall');
      this.dashCD = Math.max(this.dashCD, PLAYER_CFG.dashCooldown);
      this.charging = false;
      return;
    }
    // slight vertical control in air dash
    const ay = (Input.heldAction('up') ? -1 : 0) + (Input.heldAction('down') ? 1 : 0);
    if (ay !== 0) this.vy = ay * 260;
    else this.vy = 0;
    if (this.dashT < 0.06) this.vx = damp(this.vx, this.dashDir * 420, 8, dt);
    // trail
    this.trailAcc += dt;
    while (this.trailAcc > 0.016) {
      this.trailAcc -= 0.016;
      this.game.particles.add({
        type: 'dot', x: this.x - this.dashDir * rand(-6, 12), y: this.y - rand(20, 140),
        vx: -this.dashDir * rand(20, 90), vy: rand(-20, 20), size: rand(1.5, 4),
        life: rand(0.15, 0.35), col: 'rgba(190,240,255,0.5)', add: true, drag: 2,
      });
    }
    if (Math.random() < dt * 40) {
      this.game.particles.add({
        type: 'shard', x: this.x - this.dashDir * 20, y: this.y - rand(30, 120),
        vx: -this.dashDir * rand(150, 400), vy: rand(-40, 40), size: rand(2, 5), rot: rand(0, TAU), vr: rand(-14, 14),
        life: rand(0.12, 0.28), col: '#e7fbff', add: true,
      });
    }
  }

  // ---------------- light attacks ----------------
  tryLight() {
    if (this.state === 'hurt' || this.state === 'parry' || this.state === 'dash') return;
    if (this.state === 'charge') { this.charging = false; this.startHeavy(0); return; }
    if (this.state === 'attack') {
      const d = this.attack.def;
      // queue chain during the swing or recovery window
      if (this.attack.t >= d.startup * 0.6) {
        this.chainQueued = true;
        this.game.inputFlash = 0.08;
      }
      return;
    }
    if (this.state === 'dive') return;
    this.startLight();
  }

  startLight() {
    const air = !this.grounded;
    let def;
    if (air) {
      const c = ((this.comboIndex % 3) + 3) % 3;
      def = c === 0 ? P_AIR1 : c === 1 ? P_AIR2 : P_AIR3;
    } else {
      const idx = this.comboIndex;
      if (Input.heldAction('down') || this.lowChain) {
        def = P_LOW;
        this.lowChain = true;
      } else {
        const c = ((idx % 4) + 4) % 4;
        def = c === 0 ? P_L1 : c === 1 ? P_L2 : c === 2 ? P_L3 : P_L4;
      }
    }
    this.beginAttack(def);
    this.comboIndex = Math.min(this.comboIndex + 1, 8);
    this.comboWindow = 0.85;
  }

  beginAttack(def) {
    this.setState('attack');
    this.attack = {
      def, t: 0, hitSet: new Set(), firedActive: false, lastTrail: 0,
      chainUsed: false, air: !!def.air,
    };
    this.chainQueued = false;
    this.charging = false;
    this.swingHit = false;
    // small forward step
    const ax = Input.axisX();
    if (ax !== 0 && !def.air) this.facing = ax;
    this.vx = this.facing * (def.moveX * 0.25);
    this.bladeGlow = 0.4;
    // anticipation sound is the attack's own whoosh at active frames
    if (def.sfx === 'heavy') Sound.SFX.heavyWind(this.pan());
  }

  updateAttack(dt) {
    const a = this.attack;
    if (!a) { this.setState('idle'); return; }
    const d = a.def;
    a.t += dt;
    const prevT = a.t - dt;

    // movement during attacks: friction + lunge impulse near active
    if (!d.air) {
      if (a.t < d.startup) this.vx = damp(this.vx, 0, 9, dt);
      else if (a.t < d.active[1] + 0.05) {
        this.vx = damp(this.vx, this.facing * d.moveX, 14, dt);
      } else {
        this.vx = damp(this.vx, 0, 10, dt);
      }
    } else {
      if (a.t < d.startup) this.vx = damp(this.vx, this.facing * d.moveX * 0.4, 6, dt);
      else this.vx = damp(this.vx, 0, 3.5, dt);
      // air attacks stall gravity slightly for juggle control
      if (a.t < d.active[1] + 0.08) this.vy = damp(this.vy, -40, 5, dt);
      // gentle air-steer toward a juggled enemy so combos connect without fighting the camera
      const jt = this.game.juggleTarget;
      if (jt && !jt.dead && this.game.juggleT > 0 && jt.y < this.game.groundY - 30) {
        const dx = jt.x - this.x;
        if (Math.abs(dx) > 26 && Math.abs(dx) < 190) {
          this.x += clamp(dx, -1, 1) * Math.min(Math.abs(dx), 190) * 2.4 * dt;
          this.facing = sign(dx);
        }
      }
    }

    // active frame: sound + slash trail + hit test
    if (a.t >= d.startup && !a.firedActive) {
      a.firedActive = true;
      if (d.sfx === 'heavy') Sound.SFX.heavyWind(this.pan());
      else Sound.SFX.slash(d.power, this.pan());
      this.addTrauma(d.shake * 0.32);
    }

    // trail ribbons during active window
    if (a.t >= d.startup * 0.85 && a.t <= d.active[1] + 0.07) {
      this.trailAcc += dt;
      if (this.trailAcc > 0.012) {
        this.trailAcc = 0;
        const { tip, base } = this.getBladeWorld();
        if (!a.trail) {
          a.trail = { tip0: tip, base0: base };
          this.game.slashes.add({
            life: 0.19, width: 17, col: d.trail, col2: d.trail2,
            follow: () => {
              const b = this.getBladeWorld();
              return { x: b.tip.x, y: b.tip.y, bx: b.base.x, by: b.base.y };
            },
          });
        }
      }
    }

    // hit detection during active
    if (a.t >= d.active[0] && a.t <= d.active[1] + 0.02) {
      this.game.checkPlayerHit(this, d, a.hitSet);
    }

    // air attack landing ends quickly
    if (d.air && this.grounded && a.t > d.startup) {
      this.endAttack();
      return;
    }

    // chain / cancel windows
    if (this.chainQueued) {
      const canChain = a.t >= d.active[0];
      if (canChain) {
        this.chainQueued = false;
        const wasAir = !!d.air;
        const nextIdx = this.comboIndex;
        let def;
        if (wasAir) {
          const c = ((nextIdx % 3) + 3) % 3;
          def = c === 0 ? P_AIR1 : c === 1 ? P_AIR2 : P_AIR3;
        } else if (this.lowChain) {
          def = P_LOW;
        } else {
          const c = ((nextIdx % 4) + 4) % 4;
          def = c === 0 ? P_L1 : c === 1 ? P_L2 : c === 2 ? P_L3 : P_L4;
        }
        this.beginAttack(def);
        this.comboIndex = Math.min(this.comboIndex + 1, 8);
        return;
      }
    }

    if (a.t >= d.dur) {
      const wantedHeavy = this.pendingHeavy;
      this.endAttack();
      if (wantedHeavy) {
        this.pendingHeavy = false;
        this.doHeavy(0);
      }
    }
  }

  endAttack(cancelled = false) {
    if (cancelled) this.pendingHeavy = false;
    this.attack = null;
    this.lowChain = false;
    this.comboIndex = this.comboWindow > 0 ? this.comboIndex : 0;
    if (this.chainQueued) this.chainQueued = false;
    if (cancelled) {
      this.setState('idle');
      return;
    }
    if (!this.grounded) this.setState('fall');
    else if (Math.abs(this.vx) > 80) this.setState('run');
    else this.setState('idle');
  }

  // ---------------- heavy / charge ----------------
  startCharge() {
    if (this.state === 'hurt' || this.state === 'parry' || this.state === 'dash') return;
    if (this.state === 'attack') {
      const d = this.attack.def;
      if (this.attack.t >= d.startup * 0.7) {
        // buffer heavy after attack — just execute a quick heavy immediately if recovery
        if (this.attack.t > d.active[1]) {
          this.endAttack(true);
          this.doHeavy(0);
        } else {
          this.pendingHeavy = true;
        }
      }
      return;
    }
    if (this.state === 'dive') return;
    if (!this.grounded) { this.doHeavy(0); return; }
    this.setState('charge');
    this.charging = true;
    this.charge = 0;
    this.vx = damp(this.vx, 0, 10, 0.016);
  }

  updateCharge(dt) {
    const held = Input.heldAction('heavy');
    this.charge = Math.min(1, this.charge + dt / 0.62);
    // drift slowly
    const ax = Input.axisX();
    if (ax) this.facing = ax;
    this.vx = damp(this.vx, ax * 90, 8, dt);
    if (this.charge > 0.2 && Math.random() < dt * 50) {
      const a = rand(0, TAU);
      this.game.particles.add({
        type: 'spark', x: this.x + Math.cos(a) * rand(40, 90), y: this.y - 90 + Math.sin(a) * rand(40, 90),
        vx: -Math.cos(a) * rand(40, 140), vy: -Math.sin(a) * rand(40, 140),
        size: rand(1, 2.6), life: rand(0.15, 0.3), col: this.charge > 0.7 ? '#ffd166' : '#9fe9ff', add: true, drag: 2,
      });
    }
    if (this.charge >= 0.7 && !this.chargeFullSound && this.charge < 1) { Sound.SFX.bell(2); this.chargeFullSound = true; }
    if (this.charge >= 1) {
      this.chargeFullSound = false;
      this.doHeavy(1);
      return;
    }
    if (!held) {
      const lvl = this.charge >= 0.62 ? 1 : 0;
      this.doHeavy(lvl);
    }
  }

  doHeavy(level) {
    this.charging = false;
    this.pendingHeavy = false;
    const def = level > 0 ? P_CHARGE : P_HEAVY;
    this.beginAttack(def);
    if (level > 0) {
      Sound.SFX.overdrive(this.pan());
      this.addTrauma(0.2);
      this.game.chargeFlash = 0.22;
      for (let i = 0; i < 22; i++) {
        const a = rand(0, TAU);
        this.game.particles.add({
          type: 'spark', x: this.x + Math.cos(a) * 26, y: this.y - 80 + Math.sin(a) * 26,
          vx: Math.cos(a) * rand(120, 420), vy: Math.sin(a) * rand(120, 300),
          size: rand(1.5, 3.6), life: rand(0.2, 0.45), col: '#ffd166', add: true, drag: 3,
        });
      }
    } else {
      this.addTrauma(0.08);
    }
  }

  // ---------------- parry ----------------
  startParry() {
    if (this.state === 'hurt' || this.state === 'parry' || this.state === 'dash') return;
    if (this.state === 'attack' && this.attack.t < this.attack.def.active[1]) return;
    if (this.state === 'attack') this.endAttack(true);
    this.setState('parry');
    this.parryT = 0;
    this.parryActive = true;
    this.vx *= 0.3;
    Sound.SFX.deflected(this.pan());
    this.addTrauma(0.02);
  }

  updateParry(dt) {
    this.parryT += dt;
    this.vx = damp(this.vx, 0, 12, dt);
    // active window 0..0.19
    this.parryActive = this.parryT < 0.19;
    if (this.parryT > 0.19 && this.parryT < 0.46) {
      // recovery — vulnerable
    }
    if (this.parryT >= 0.46) {
      this.setState(this.grounded ? 'idle' : 'fall');
      this.parryActive = false;
    }
  }

  onParrySuccess(enemy) {
    this.parryAnim = 0.34;
    this.parryActive = false;
    this.setState('parry');
    this.parryT = 0.30;
    this.game.onParry(this, enemy);
  }

  // ---------------- dive ----------------
  startDive() {
    if (this.state === 'dive' || this.state === 'hurt') return;
    if (this.state === 'attack' && this.attack.t < this.attack.def.active[1]) return;
    this.endAttack(true);
    this.setState('dive');
    this.diveT = 0;
    this.diveHitSet = new Set();
    this.vy = 700;
    this.vx = this.facing * 120;
    this.diveLanded = false;
    Sound.SFX.dash(this.pan());
    this.addTrauma(0.06);
    this.game.particles.add({ type: 'ring', x: this.x, y: this.y - 60, size: 32, life: 0.28, col: 'rgba(255,210,140,0.7)', add: true });
    // downward trail
    this.game.slashes.add({
      life: 0.25, width: 34, col: '#ffe9c9', col2: '#ff4d6d',
      follow: () => ({ x: this.x + this.facing * 12, y: this.y - 10, bx: this.x - this.facing * 30, by: this.y - 130 }),
    });
  }

  updateDive(dt) {
    this.diveT += dt;
    this.vx = damp(this.vx, this.facing * 140, 4, dt);
    // hit everything on the way down
    const hb = { x: this.x - 40, y: this.y - 130, w: 80, h: 140 };
    this.game.checkPlayerHit(this, P_DIVE, this.diveHitSet);
    if (this.y >= this.game.groundY - 1) this.finishDive();
    if (this.diveT > 0.75) this.finishDive();
  }

  finishDive() {
    if (this.diveLanded) return;
    this.diveLanded = true;
    this.y = this.game.groundY;
    this.vy = 0;
    this.grounded = true;
    this.setState('land');
    this.landT = 0.18;
    this.vx = 0;
    this.addTrauma(0.42);
    Sound.SFX.hitHeavy(this.pan());
    Sound.SFX.land(1.2, this.pan());
    // shockwave ground AoE
    this.game.shockwave(this.x, this.y, 190, 14, 'player');
    this.game.screenFlash = 0.07;
    for (let i = 0; i < 26; i++) {
      this.game.particles.add({
        type: 'shard', x: this.x + rand(-20, 20), y: this.y - rand(0, 8),
        vx: rand(-360, 360), vy: rand(-520, -100), size: rand(2, 7), rot: rand(0, TAU), vr: rand(-16, 16),
        life: rand(0.3, 0.7), col: pick(['#9ab0c8', '#c7d8e6', '#6d7f92']), grav: 1700, floor: this.y, bounce: 0.35,
      });
    }
    this.game.particles.add({ type: 'ring', x: this.x, y: this.y, size: 50, life: 0.32, col: 'rgba(255,220,160,0.8)', add: true });
  }

  // ======================================================================
  // SKILLS (four real, combat-usable abilities)
  // ======================================================================

  canActSkill() {
    return this.alive && !['hurt', 'dash', 'parry', 'blink', 'storm', 'onslaught', 'finale'].includes(this.state);
  }

  // ---- shared: apply a skill hit to every enemy inside a region ----
  skillHit(box, def, opts = {}) {
    let hits = 0;
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      if (box.hitSet && box.hitSet.has(e.id)) continue;
      const sx = e.x, sy = e.y, s = e.scale;
      if (e.x + 28 * s < box.x0 || e.x - 28 * s > box.x1) continue;
      if (e.y < box.y0 || e.y - e.cfg.bodyH * s > box.y1) continue;
      if (box.hitSet) box.hitSet.add(e.id);
      const ix = clamp(e.x, box.x0, box.x1);
      const iy = clamp(e.y - e.cfg.bodyH * s * 0.55, box.y0, box.y1);
      this.game.resolvePlayerHit(e, def, ix, iy, this, opts.part);
      hits++;
    }
    return hits;
  }

  // ===================== SKILL 1 — 裂空斩 (R) =====================
  // Tap or hold R: disappear and cut a lane ahead. Hold to charge a longer,
  // fully-invulnerable cut. Enemies crossed are slashed from behind.
  castBlink(charge) {
    if (!this.canActSkill() || this.skillCD[0] > 0) return;
    if (charge < 0.12) charge = 0.12;
    this.skillCD[0] = 1.15;
    this.endAttack(true);
    this.setState('blink');
    this.blinkDur = 0.16 + charge * 0.10;
    this.blinkT = 0;
    this.blinkChargeLvl = charge;
    this.blinkFrom = { x: this.x, y: this.y };
    const dist = 210 + charge * 210;
    const dir = this.facing;
    this.blinkDir = dir;
    this.blinkTo = {
      x: clamp(this.x + dir * dist, this.game.arenaMinX + 40, this.game.arenaMaxX - 40),
      y: this.grounded ? this.game.groundY : this.y,
    };
    this.blinkCut = new Set();
    this.iFrames = 0.34;
    this.vx = 0; this.vy = 0;
    // VFX: afterimage burst at origin
    this.game.onBlinkStart(this, charge);
    Sound.SFX.slash(1.6 + charge, this.pan());
    Sound.SFX.dash(this.pan());
    if (charge >= 0.85) Sound.SFX.overdrive(this.pan());
  }

  updateBlink(dt) {
    this.blinkT += dt;
    const k = clamp(this.blinkT / this.blinkDur, 0, 1);
    const e = ease.inCubic(Math.min(1, k / 0.62));
    const prevX = this.x;
    this.x = lerp(this.blinkFrom.x, this.blinkTo.x, e);
    this.y = this.blinkFrom.y + (this.blinkTo.y - this.blinkFrom.y) * e;
    this.grounded = this.y >= this.game.groundY - 0.5;
    // cut everything we pass through
    const lo = Math.min(prevX, this.x) - 46, hi = Math.max(prevX, this.x) + 46;
    const box = { x0: lo, x1: hi, y0: this.y - 190, y1: this.y + 10, hitSet: this.blinkCut };
    this.skillHit(box, {
      name: 'blink', dmg: 16 + this.blinkChargeLvl * 20, limbMul: 1.7, knock: 260, lift: -140,
      stop: 0.07, shake: 0.28, power: 1.4 + this.blinkChargeLvl, poiseDmg: 2.2,
      heavyKill: true, guardBreak: true,
    });
    // ghost + petals along the path
    this.game.onBlinkTrail(this, prevX);
    if (k >= 1) {
      this.x = this.blinkTo.x;
      this.y = this.blinkTo.y;
      this.vx = this.blinkDir * 240;
      this.setState(this.grounded ? 'idle' : 'fall');
      this.iFrames = Math.max(this.iFrames, 0.16);
      this.game.onBlinkEnd(this);
    }
  }

  // ===================== SKILL 2 — 千刃风暴 (F) =====================
  // Rise and spin, shredding everything around you for ~1.3s.
  // Each tick hits limbs; the final tick slams enemies down.
  castStorm() {
    if (!this.canActSkill() || this.skillCD[1] > 0) return;
    this.skillCD[1] = 6.0;
    this.endAttack(true);
    this.setState('storm');
    this.stormT = 0;
    this.stormDur = 1.30;
    this.stormTick = 0;
    this.stormSeed = rand(0, 10);
    this.stormHitT = 0;
    this.vx = 0; this.vy = 0;
    this.iFrames = 1.30 + 0.16;
    this.grounded = false;
    Sound.SFX.overdrive(this.pan());
    Sound.SFX.dash(this.pan());
    this.game.onStormStart(this);
  }

  updateStorm(dt) {
    this.stormT += dt;
    const t = this.stormT / this.stormDur;
    // horizontal drift toward the nearest cluster
    let tx = this.x;
    let best = null, bd = 1e9;
    for (const e of this.game.enemies) {
      if (e.dead) continue;
      const d = Math.abs(e.x - this.x);
      if (d < bd) { bd = d; best = e; }
    }
    if (best && bd < 260 && bd > 26) {
      this.x = damp(this.x, best.x - sign(best.x - this.x) * 30, 3.0, dt);
      this.facing = sign(best.x - this.x) || this.facing;
    }
    this.stormHitT += dt;
    // damage ticks
    const TICK = 0.085;
    while (this.stormTick < Math.min(t, 0.92)) {
      this.stormTick += TICK / this.stormDur;
      const r = 132 + Math.sin(this.stormT * 26) * 16;
      const box = { x0: this.x - r, x1: this.x + r, y0: this.y - 230, y1: this.y + 20 };
      const isLast = this.stormTick > 0.83;
      this.skillHit(box, {
        name: 'storm', dmg: isLast ? 14 : 5.4, limbMul: isLast ? 2.2 : 1.35,
        knock: isLast ? 380 : 90, lift: isLast ? 300 : -40,
        stop: isLast ? 0.10 : 0.018, shake: isLast ? 0.30 : 0.05,
        power: isLast ? 1.8 : 0.8, poiseDmg: isLast ? 2.0 : 0.5,
        heavyKill: isLast, guardBreak: isLast,
      });
      this.game.onStormTick(this, isLast);
      if (!isLast) Sound.SFX.slash(0.9, this.pan());
    }
    if (this.stormT >= this.stormDur) {
      this.game.onStormEnd(this);
      this.setState(this.grounded ? 'idle' : 'fall');
      this.vy = -120;
      this.vx = 0;
    }
  }

  // ===================== SKILL 3 — 断界一闪 (Q) =====================
  // Parry-skill: hold a guard stance for 0.55s. Any attack that lands during
  // it is negated and countered with a screen-wide slash that staggers all foes.
  castRift() {
    if (!this.canActSkill() || this.skillCD[2] > 0) return;
    this.skillCD[2] = 4.4;
    this.endAttack(true);
    this.setState('onslaught');   // reused guard-state visuals
    this.onslaughtT = 0;
    this.onslaughtIdx = 0;
    this.riftGuard = 0.55;
    this.riftCountered = false;
    this.vx = 0; this.vy = 0;
    this.iFrames = 0;
    Sound.SFX.parry(this.pan());
    this.game.onRiftStart(this);
  }

  updateOnslaught(dt) {
    this.onslaughtT += dt;
    this.vx = damp(this.vx, 0, 10, dt);
    this.riftGuard -= dt;
    if (this.onslaughtT >= 0.62) {
      // nothing came — short recovery
      this.game.onRiftMiss(this);
      this.setState(this.grounded ? 'idle' : 'fall');
    }
  }

  // called by game when an enemy attack connects during the guard
  riposteRift() {
    this.riftCountered = true;
    this.onslaughtT = 0;
    this.iFrames = 0.9;
    this.game.onRiftCounter(this);
  }

  // ===================== SKILL 4 — 终式·万刃归一 (U) =====================
  // Full gauge ultimate: time stops, the player crosses the arena leaving
  // slash lattice, then every marked enemy is cut and their limbs come apart.
  castFinal() {
    if (!this.canActSkill() || this.skillCD[3] > 0) return;
    if (this.energy < this.maxEnergy) return;      // requires a full gauge
    this.energy = 0;
    this.skillCD[3] = 0.1;
    this.endAttack(true);
    this.setState('finale');
    this.finalT = 0;
    this.finalStage = 0;
    this.finalTrailT = 0;
    this.finalHits = new Set();
    this.finalMarks = this.game.enemies.filter(e => !e.dead);
    this.vx = 0; this.vy = 0;
    this.iFrames = 9;
    this.grounded = false;
    this.game.onFinaleStart(this);
  }

  updateFinale(dt) {
    this.finalT += dt;
    const T = this.finalT;
    const D = 1.05;                                  // blade-dance duration
    const mid = 0.34;
    if (T < D) {
      const k = T / D;
      // weave across the arena, passing through each marked enemy
      const marks = this.finalMarks.filter(e => !e.dead);
      const target = marks[this.finalHits.size % Math.max(1, marks.length)];
      if (target) {
        const goalX = target.x + (this.facing > 0 ? -46 : 46);
        this.x = damp(this.x, goalX, 12, dt);
        this.y = damp(this.y, this.game.groundY - 96, 12, dt);
        this.facing = sign(target.x - this.x) || this.facing;
        // cut when close
        const distX = Math.abs(target.x - this.x);
        if (distX < 74 && !this.finalHits.has(target.id)) {
          this.finalHits.add(target.id);
          const s = target.scale;
          this.game.resolvePlayerHit(target, {
            name: 'finale', dmg: 30, limbMul: 3.0, knock: 140, lift: -260,
            stop: 0.05, shake: 0.22, power: 2.4, poiseDmg: 4,
            heavyKill: true, guardBreak: true,
          }, target.x - this.facing * 20, target.y - target.cfg.bodyH * s * 0.5, this);
          this.game.onFinaleCut(this, target);
          Sound.SFX.hitCrit(this.pan());
        }
      } else {
        // no enemies: just a flourish
        this.x = damp(this.x, this.x + this.facing * 40, 4, dt);
        this.y = damp(this.y, this.game.groundY - 96, 8, dt);
      }
      // trailing lattice
      this.finalTrailT += dt;
      if (this.finalTrailT > 0.035) {
        this.finalTrailT = 0;
        this.game.onFinaleTrail(this);
      }
    } else if (!this.finalDone) {
      this.finalDone = true;
      this.game.onFinaleFinish(this);
      Sound.SFX.hitHeavy(0);
    } else if (T > D + 0.42) {
      this.y = this.game.groundY;
      this.vy = 0;
      this.grounded = true;
      this.setState('idle');
      this.game.onFinaleLand(this);
    }
  }

  updateLand(dt) {
    this.vx = damp(this.vx, 0, 14, dt);
    if (this.stateT > 0.14) this.setState('idle');
  }

  // ---------------- damage ----------------
  takeDamage(amount, dir, opts = {}) {
    if (!this.alive || this.iFrames > 0) return false;
    if (this.state === 'parry' && this.parryActive && opts.parryable !== false) {
      return 'parried';
    }
    if (this.state === 'dash' && this.iFrames > 0) return false;
    this.hp = Math.max(0, this.hp - amount);
    this.iFrames = 0.9;
    this.invulnFlash = 0.65;
    this.hitFlash = 0.12;
    this.hurtDir = dir;
    this.hurtT = 0.30;
    this.setState('hurt');
    this.attack = null;
    this.charging = false;
    this.vx = dir * 260;
    this.vy = -190;
    this.grounded = false;
    Sound.SFX.hurt(this.pan());
    this.addTrauma(0.5);
    this.game.screenFlash = 0.13;
    this.game.hitstop = Math.max(this.game.hitstop, 0.06);
    this.game.comboCount = 0;
    this.game.comboTimer = 0;
    for (let i = 0; i < 12; i++) {
      this.game.particles.add({
        type: 'spark', x: this.x + rand(-20, 20), y: this.y - rand(50, 140),
        vx: rand(-260, 260), vy: rand(-260, 60), size: rand(1.5, 3.5), life: rand(0.12, 0.3),
        col: '#ff5a6e', add: true, drag: 3,
      });
    }
    this.game.popups.add('-' + Math.round(amount), this.x, this.y - 150, { col: '#ff5a6e', size: 22, life: 0.7 });
    if (this.hp <= 0) this.die();
    return true;
  }

  die() {
    this.alive = false;
    this.deadT = 0;
    this.setState('dead');
    this.game.onPlayerDeath();
  }

  updateHurt(dt) {
    this.hurtT -= dt;
    this.vx = damp(this.vx, 0, 6, dt);
    if (this.hurtT <= 0) {
      if (this.hp <= 0) return;
      this.setState(this.grounded ? 'idle' : 'fall');
    }
  }

  updateDead(dt) {
    this.vx = damp(this.vx, 0, 3, dt);
    this.vy += 2000 * dt;
    this.x += this.vx * dt;
    this.y = Math.min(this.game.groundY, this.y + this.vy * dt);
    if (this.y >= this.game.groundY) { this.y = this.game.groundY; this.vy = 0; this.vx *= 0.8; }
    this.updateScarf(dt);
    // fade pose to crumpled
  }

  // ---------------- animation ----------------
  animate(dt) {
    let target;
    const st = this.state;
    if (st === 'attack' && this.attack) {
      const p = sampleKeys(this.attack.def.keys, this.attack.t);
      this.pose = p;
      this.poseT = 1;
      this.lastPose = p;
      return;
    }
    if (st === 'dive') {
      const p = sampleKeys(P_DIVE.keys, clamp(this.diveT / P_DIVE.dur, 0, 1) * 0.75);
      this.pose = p;
      return;
    }
    if (st === 'charge') {
      const base = POSES.charge;
      const t = this.charge;
      target = poseCopy(base);
      // tremble as charge builds
      const sh = t * 2.4;
      target.hx += Math.sin(performance.now() * 0.05) * sh;
      target.hy += Math.cos(performance.now() * 0.043) * sh * 0.6;
      target.sw += Math.sin(performance.now() * 0.06) * t * 5;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-20 * dt));
      return;
    }
    if (st === 'parry') {
      target = poseCopy(POSES.parry);
      if (this.parryAnim > 0) {
        target.hfx -= 18; target.sw = -100; target.lean -= 8;
      }
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-34 * dt));
      return;
    }
    if (st === 'hurt') {
      target = poseCopy(POSES.hurt);
      target.hx = -this.hurtDir * 10;
      target.lean = -26;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-16 * dt));
      return;
    }
    if (st === 'dash') {
      this.pose = poseBlend(this.pose, POSES.dash, 1 - Math.exp(-30 * dt));
      return;
    }
    if (st === 'blink') {
      // compressed, weightless cut posture
      target = poseCopy(POSES.dash);
      target.lean = 46; target.sw = 96; target.hfx = 52; target.hfy = 88; target.head = -6;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-38 * dt));
      return;
    }
    if (st === 'storm') {
      const sp = this.stormT * 30;
      target = poseCopy(POSES.dash);
      target.hy = 84; target.lean = 0;
      target.hfx = Math.cos(sp) * 46; target.hfy = 108 + Math.sin(sp) * 22;
      target.hbx = -Math.cos(sp) * 44; target.hby = 106 - Math.sin(sp) * 20;
      target.ffx = Math.cos(sp + 1) * 12; target.ffy = 26 + Math.sin(sp + 1) * 10;
      target.bfx = -Math.cos(sp + 1) * 12; target.bfy = 26 - Math.sin(sp + 1) * 10;
      target.sw = -30 + Math.sin(sp) * 150;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-24 * dt));
      return;
    }
    if (st === 'onslaught') {
      // 断界 guard: blade held flat across the body, weight low
      target = poseCopy(POSES.parry);
      target.hx = 2; target.hy = 72; target.lean = 4; target.head = 0;
      target.hfx = 34; target.hfy = 96; target.hbx = 12; target.hby = 84;
      target.sw = -22; target.ffx = 22; target.bfx = -24;
      const trem = 1.2 + Math.sin(performance.now() * 0.05) * 0.7;
      target.hfx += trem;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-30 * dt));
      return;
    }
    if (st === 'finale') {
      const sp = this.finalT * 44;
      target = poseCopy(POSES.dash);
      target.lean = 24 + Math.sin(sp * 0.5) * 8;
      target.hfx = 40 + Math.cos(sp) * 18; target.hfy = 112 + Math.sin(sp) * 26;
      target.hbx = -34 - Math.cos(sp) * 16; target.hby = 100 - Math.sin(sp) * 22;
      target.ffx = 20; target.ffy = 26; target.bfx = -26; target.bfy = 18;
      target.sw = -40 + Math.sin(sp) * 170;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-34 * dt));
      return;
    }
    if (st === 'land') {
      this.pose = poseBlend(this.pose, POSES.land, 1 - Math.exp(-26 * dt));
      return;
    }
    if (!this.grounded) {
      target = poseCopy(this.vy < 0 ? POSES.jump : POSES.fall);
      // arms drift with vertical velocity
      const k = clamp(this.vy / 900, -1, 1);
      target.hfy += k * -6;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-14 * dt));
      return;
    }
    if (st === 'run') {
      const t = this.breathe * 15;
      const bob = Math.sin(t) * 3.2;
      const side = Math.sin(t);
      target = poseCopy(side > 0 ? POSES.run : POSES.run2);
      target.hy += bob;
      target.ffy = Math.max(0, Math.sin(t) * 26 + 4);
      target.bfy = Math.max(0, -Math.sin(t) * 26 + 4);
      target.ffx = Math.cos(t) * 26;
      target.bfx = -Math.cos(t) * 26;
      target.lean += 3;
      target.flap = 2 + Math.floor(Math.random() * 2);
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-26 * dt));
      return;
    }
    // idle breathing
    const t = this.breathe * 2.2;
    target = poseCopy(POSES.idle);
    target.hy += Math.sin(t) * 1.6;
    target.hfy += Math.sin(t) * 1.2;
    target.hfy += Math.sin(t * 0.7) * 1.4;
    target.sw += Math.sin(t * 0.8) * 3;
    target.head = Math.sin(t * 0.5) * 3;
    this.pose = poseBlend(this.pose, target, 1 - Math.exp(-12 * dt));
  }

  // ---------------- skeleton solve + drawing ----------------
  skeleton() {
    const p = this.pose;
    const f = this.facing;
    const root = { x: this.x, y: this.y };
    const L = (lx, ly) => ({ x: root.x + f * lx, y: root.y - ly });
    const hip = L(p.hx, p.hy);
    const leanRad = p.lean * Math.PI / 180;
    // torso direction: lean forward from vertical
    const tdx = Math.sin(leanRad), tdy = -Math.cos(leanRad);
    const neck = { x: hip.x + tdx * PLAYER_RIG.torso * f, y: hip.y + tdy * PLAYER_RIG.torso };
    // shoulder line perpendicular
    const perp = { x: Math.cos(leanRad) * f, y: Math.sin(leanRad) };
    const shF = { x: neck.x + perp.x * 3 - tdx * 5 * f, y: neck.y + perp.y * 3 - tdy * 5 };
    const shB = { x: neck.x - perp.x * 7 - tdx * 5 * f, y: neck.y - perp.y * 7 - tdy * 5 };
    const hipF = { x: hip.x + perp.x * 4, y: hip.y + perp.y * 4 };
    const hipB = { x: hip.x - perp.x * 6, y: hip.y - perp.y * 6 };
    const handF = L(p.hfx, p.hfy);
    const handB = L(p.hbx, p.hby);
    const footF = L(p.ffx, p.ffy);
    const footB = L(p.bfx, p.bfy);
    const armF = ik(shF.x, shF.y, handF.x, handF.y, PLAYER_RIG.upperArm, PLAYER_RIG.foreArm, -f);
    const armB = ik(shB.x, shB.y, handB.x, handB.y, PLAYER_RIG.upperArm, PLAYER_RIG.foreArm, -f);
    const legF = ik(hipF.x, hipF.y, footF.x, footF.y, PLAYER_RIG.thigh, PLAYER_RIG.shin, f);
    const legB = ik(hipB.x, hipB.y, footB.x, footB.y, PLAYER_RIG.thigh, PLAYER_RIG.shin, f);
    const headAng = leanRad + p.head * Math.PI / 180;
    const head = { x: neck.x + Math.sin(headAng) * 15 * f, y: neck.y - Math.cos(headAng) * 15 };
    return { hip, neck, shF, shB, hipF, hipB, handF, handB, footF, footB, armF, armB, legF, legB, head, headAng, leanRad, f, root };
  }

  getBladeWorld() {
    const sk = this.skeleton();
    const p = this.pose;
    const ang = (p.sw + this.pose.lean * 0.15) * Math.PI / 180;
    const dirX = Math.cos(ang) * this.facing;
    const dirY = Math.sin(ang);
    const hand = sk.handF;
    const bladeLen = 92;
    const base = { x: hand.x + dirX * 9, y: hand.y + dirY * 9 };
    const tip = { x: hand.x + dirX * (9 + bladeLen), y: hand.y + dirY * (9 + bladeLen) };
    return { base, tip, ang: Math.atan2(dirY, dirX), hand };
  }

  updateScarf(dt) {
    const sk = this.skeleton();
    const neck = sk.neck;
    if (!this.scarfInit) {
      for (let i = 0; i < this.scarf.length; i++) {
        this.scarf[i].x = this.scarf[i].px = neck.x - this.facing * i * 7;
        this.scarf[i].y = this.scarf[i].py = neck.y + i * 4;
      }
      this.scarfInit = true;
    }
    const pts = this.scarf;
    pts[0].x = neck.x - this.facing * 2; pts[0].y = neck.y + 2;
    const wind = this.game.wind || 0;
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i];
      const vx = (p.x - p.px) * 0.86;
      const vy = (p.y - p.py) * 0.86;
      p.px = p.x; p.py = p.y;
      p.x += vx - this.facing * 40 * dt + wind * dt;
      p.y += vy + 190 * dt + Math.sin(performance.now() * 0.006 + i) * 12 * dt;
    }
    // constrain
    const segLen = 10;
    for (let iter = 0; iter < 6; iter++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - segLen) / d;
        if (i === 1) { b.x -= dx * diff; b.y -= dy * diff; }
        else {
          a.x += dx * diff * 0.5; a.y += dy * diff * 0.5;
          b.x -= dx * diff * 0.5; b.y -= dy * diff * 0.5;
        }
      }
    }
  }

  draw(ctx) {
    const sk = this.skeleton();
    const f = this.facing;
    const flash = this.hitFlash > 0 || (this.invulnFlash > 0 && Math.floor(performance.now() / 55) % 2 === 0);
    const flashCol = this.hitFlash > 0 ? '#ffe9ee' : '#ffffff';

    // shadow
    const groundY = this.game.groundY;
    const hgt = clamp((groundY - this.y) / 300, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.34 * (1 - hgt * 0.6);
    ctx.fillStyle = '#050912';
    ctx.beginPath();
    ctx.ellipse(this.x, groundY + 2, 34 * (1 - hgt * 0.25), 8 * (1 - hgt * 0.25), 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    if (!this.alive) {
      this.drawDead(ctx);
      return;
    }

    // ---- silhouette / outline pass (cel-shade mass) ----
    this.drawOutline(ctx, sk);

    // ---- back arm ----
    this.drawArm(ctx, sk.shB, sk.armB, sk.handB, f, true);
    // ---- back leg ----
    this.drawLeg(ctx, sk.hipB, sk.legB, sk.footB, f, true);
    // ---- scarf (behind body, flowing back) ----
    this.drawScarf(ctx, sk);
    // ---- torso / coat ----
    this.drawTorso(ctx, sk, flash);
    // ---- front leg ----
    this.drawLeg(ctx, sk.hipF, sk.legF, sk.footF, f, false);
    // ---- head ----
    this.drawHead(ctx, sk, flash);
    // ---- front arm + sword ----
    this.drawArm(ctx, sk.shF, sk.armF, sk.handF, f, false);
    this.drawSword(ctx, sk, flash);
    this.drawRim(ctx, sk);

    // charge aura
    if (this.charging && this.charge > 0.15) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const a = this.charge;
      const r = 60 + a * 60;
      const g = ctx.createRadialGradient(this.x, this.y - 90, 4, this.x, this.y - 90, r);
      const c = a > 0.72 ? '255,208,102' : '150,230,255';
      g.addColorStop(0, `rgba(${c},${0.20 + a * 0.18})`);
      g.addColorStop(0.6, `rgba(${c},${0.06 + a * 0.06})`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, this.y - 90, r, 0, TAU); ctx.fill();
      ctx.restore();
      // ground charge ring
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${a > 0.72 ? '255,208,102' : '150,230,255'},${0.25 + a * 0.35})`;
      ctx.lineWidth = 1.5 + a * 2;
      for (let i = 0; i < 2; i++) {
        const rr = 30 + ((performance.now() * 0.12 + i * 50) % 90);
        ctx.globalAlpha = 1 - rr / 140;
        ctx.beginPath();
        ctx.ellipse(this.x, groundY, rr, rr * 0.28, 0, 0, TAU);
        ctx.stroke();
      }
      ctx.restore();
    }

    // parry guard glint + active-window ring
    if (this.state === 'parry') {
      const total = 0.46;
      const t = clamp(1 - this.parryT / total, 0, 1);
      const active = this.parryActive;
      const b = this.getBladeWorld();
      const mx = (b.base.x + b.tip.x) / 2, my = (b.base.y + b.tip.y) / 2;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(mx, my, 1, mx, my, 42 + t * 20);
      g.addColorStop(0, active ? `rgba(230,255,255,${0.62 + t * 0.2})` : `rgba(255,150,120,${0.14 + t * 0.1})`);
      g.addColorStop(1, active ? 'rgba(120,240,255,0)' : 'rgba(255,120,90,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(mx, my, (active ? 52 : 36) + t * 18, 0, TAU); ctx.fill();
      // timing ring: shrinks into the blade as the window closes
      if (active) {
        const p = clamp(this.parryT / 0.19, 0, 1);
        ctx.strokeStyle = `rgba(200,250,255,${0.85 * (1 - p)})`;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(mx, my, 30 - p * 22, 0, TAU);
        ctx.stroke();
      } else {
        // recovery: brief red arc to read "you're open"
        ctx.strokeStyle = `rgba(255,110,90,${0.5 * (1 - t)})`;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.y - 88, 34, -0.5, 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Dark silhouette underlay that gives the figure visual mass.
  drawOutline(ctx, sk) {
    const f = this.facing;
    ctx.save();
    ctx.strokeStyle = '#0a0c14';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const stroke = (a, b, w) => {
      ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    // legs
    stroke(sk.hipB, sk.legB, 23);
    stroke(sk.legB, sk.footB, 19);
    stroke(sk.hipF, sk.legF, 24);
    stroke(sk.legF, sk.footF, 20);
    // coat skirt
    const sway = Math.sin(this.breathe * 5.5) * 3 + clamp(-this.vx * 0.02, -9, 9);
    ctx.beginPath();
    ctx.moveTo(sk.hip.x + 12, sk.hip.y - 2);
    ctx.quadraticCurveTo(sk.hip.x - f * 18, sk.hip.y + 20, sk.hip.x - f * 40 + sway, sk.hip.y + 34);
    ctx.lineTo(sk.hip.x - f * 22 + sway * 1.4, sk.hip.y + 10);
    ctx.closePath();
    ctx.fill();
    // torso
    const tpx = { x: Math.cos(sk.leanRad) * f, y: Math.sin(sk.leanRad) };
    ctx.beginPath();
    ctx.moveTo(sk.hip.x + tpx.x * 12, sk.hip.y + tpx.y * 12);
    ctx.quadraticCurveTo(sk.hip.x + tpx.x * 17, lerp(sk.hip.y, sk.neck.y, 0.55) + tpx.y * 17, sk.neck.x + tpx.x * 15, sk.neck.y + tpx.y * 15);
    ctx.lineTo(sk.neck.x - tpx.x * 19, sk.neck.y - tpx.y * 19);
    ctx.quadraticCurveTo(sk.hip.x - tpx.x * 19, lerp(sk.hip.y, sk.neck.y, 0.55) + tpx.y * 19, sk.hip.x - tpx.x * 12, sk.hip.y - tpx.y * 12);
    ctx.closePath();
    ctx.fill();
    // arms
    stroke(sk.shB, sk.armB, 19);
    stroke(sk.armB, sk.handB, 16);
    stroke(sk.shF, sk.armF, 21);
    stroke(sk.armF, sk.handF, 18);
    // head
    ctx.beginPath();
    ctx.ellipse(sk.head.x, sk.head.y, 15.5, 16.5, sk.headAng, 0, TAU);
    ctx.fill();
    // ponytail silhouette
    ctx.beginPath();
    ctx.moveTo(sk.head.x - f * 6, sk.head.y - 8);
    ctx.quadraticCurveTo(sk.head.x - f * 34, sk.head.y - 4, sk.head.x - f * 46, sk.head.y + 8);
    ctx.quadraticCurveTo(sk.head.x - f * 30, sk.head.y + 2, sk.head.x - f * 12, sk.head.y + 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawRim(ctx, sk) {
    if (!this.alive) return;
    const { hip, neck, head } = sk;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(160,200,255,0.22)';
    ctx.lineWidth = 2.2;
    ctx.beginPath(); ctx.moveTo(hip.x + 10, hip.y - 8); ctx.lineTo(neck.x + 9, neck.y + 4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,180,130,0.16)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(neck.x - 10, neck.y + 4); ctx.lineTo(hip.x - 9, hip.y - 4); ctx.stroke();
    ctx.restore();
  }

  drawDead(ctx) {
    const t = clamp(this.deadT / 0.6, 0, 1);
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(-this.hurtDir * t * 1.35);
    ctx.scale(this.facing, 1);
    ctx.globalAlpha = 1 - clamp((this.deadT - 1.2) / 0.8, 0, 0.55);
    // simple crumpled body
    ctx.strokeStyle = '#cfd8e6';
    ctx.lineWidth = 11; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-6, -12); ctx.lineTo(26, -58); ctx.stroke();
    ctx.fillStyle = '#e8eef8';
    ctx.beginPath(); ctx.arc(30, -66, 12, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#2e3142'; ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(26, -4); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(20, -52); ctx.lineTo(40, -20); ctx.stroke();
    ctx.restore();
  }

  // ---- layered body drawing helpers ----
  bodyGradient(ctx, ax, ay, bx, by, stops) {
    const g = ctx.createLinearGradient(ax, ay, bx, by);
    for (const [t, c] of stops) g.addColorStop(t, c);
    return g;
  }

  drawTorso(ctx, sk, flash) {
    const flashCol = this.hitFlash > 0 ? '#ffe9ee' : '#ffffff';
    const { hip, neck, leanRad, f } = sk;
    const perp = { x: Math.cos(leanRad) * f, y: Math.sin(leanRad) };
    const fwd = { x: Math.sin(leanRad) * f, y: -Math.cos(leanRad) };
    const P = (t, o) => ({
      x: lerp(hip.x, neck.x, t) + perp.x * o,
      y: lerp(hip.y, neck.y, t) + perp.y * o,
    });
    // tapering jacket outline: narrow waist, broad shoulders
    const waistB = P(0.02, -11), waistF = P(0.02, 11);
    const chestF = P(0.55, 16), chestB = P(0.55, -17);
    const shF = P(0.98, 14), shB = P(0.98, -18);
    const neckF = P(1.0, 8), neckB = P(1.0, -9);

    // ---- coat tails (behind) ----
    const tail = Math.sin(this.breathe * 5.2) * 3 + clamp(-this.vx * 0.022, -11, 11);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(waistB.x, waistB.y);
    ctx.quadraticCurveTo(hip.x - f * 18 + tail, hip.y + 18, hip.x - f * 40 + tail * 1.7, hip.y + 22);
    ctx.quadraticCurveTo(hip.x - f * 30 + tail, hip.y + 34, hip.x - f * 26 + tail * 1.4, hip.y + 46);
    ctx.quadraticCurveTo(hip.x - f * 8, hip.y + 30, hip.x + f * 4, hip.y + 12);
    ctx.closePath();
    const cg = ctx.createLinearGradient(waistB.x, waistB.y, hip.x - f * 34, hip.y + 40);
    cg.addColorStop(0, '#313a50');
    cg.addColorStop(0.6, '#232a3a');
    cg.addColorStop(1, '#141926');
    ctx.fillStyle = cg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(190,210,235,0.20)';
    ctx.lineWidth = 1;
    ctx.stroke();
    // second tail, lighter
    ctx.beginPath();
    ctx.moveTo(waistF.x - fwd.x * 2, waistF.y - fwd.y * 2);
    ctx.quadraticCurveTo(hip.x + f * 2 - f * 12 + tail * 0.6, hip.y + 26, hip.x - f * 16 + tail, hip.y + 40);
    ctx.quadraticCurveTo(hip.x + f * 2, hip.y + 24, hip.x + f * 10, hip.y + 6);
    ctx.closePath();
    ctx.fillStyle = '#2b3245';
    ctx.fill();
    ctx.restore();

    // ---- jacket body ----
    ctx.beginPath();
    ctx.moveTo(waistB.x, waistB.y);
    ctx.quadraticCurveTo(chestB.x - fwd.x * 3, chestB.y - fwd.y * 3, shB.x, shB.y);
    ctx.quadraticCurveTo(neckB.x, neckB.y, neckF.x, neckF.y);
    ctx.quadraticCurveTo(shF.x + fwd.x * 2, shF.y + fwd.y * 2, chestF.x, chestF.y);
    ctx.quadraticCurveTo(chestF.x - fwd.x * 26, chestF.y - fwd.y * 26, waistF.x, waistF.y);
    ctx.closePath();
    const g = ctx.createLinearGradient(waistB.x - fwd.x * 4, waistB.y - fwd.y * 4, chestF.x + fwd.x * 6, chestF.y + fwd.y * 6);
    if (flash) { g.addColorStop(0, flashCol); g.addColorStop(1, flashCol); }
    else {
      g.addColorStop(0, '#8e9bb2');
      g.addColorStop(0.30, '#c8d3e2');
      g.addColorStop(0.58, '#f4f7fb');
      g.addColorStop(1, '#d2dbe8');
    }
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(24,30,44,0.35)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ---- dark undergarment (V collar to waist) ----
    ctx.beginPath();
    ctx.moveTo(neckF.x - perp.x * 2, neckF.y - perp.y * 2);
    ctx.lineTo(neckB.x + perp.x * 6, neckB.y + perp.y * 6);
    ctx.quadraticCurveTo(chestB.x + perp.x * 2, chestB.y + perp.y * 2, waistB.x + perp.x * 5, waistB.y + perp.y * 5);
    ctx.lineTo(waistF.x - perp.x * 1, waistF.y - perp.y * 1);
    ctx.quadraticCurveTo(chestF.x - perp.x * 7, chestF.y - perp.y * 7, neckF.x - perp.x * 2, neckF.y - perp.y * 2);
    ctx.closePath();
    ctx.fillStyle = flash ? flashCol : '#232a3a';
    ctx.fill();

    // lapel highlight
    ctx.strokeStyle = flash ? flashCol : 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(neckF.x - perp.x * 1, neckF.y - perp.y * 1);
    ctx.lineTo(chestF.x - perp.x * 8, chestF.y - perp.y * 8);
    ctx.stroke();
    ctx.strokeStyle = flash ? flashCol : 'rgba(120,140,170,0.6)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(neckB.x + perp.x * 5, neckB.y + perp.y * 5);
    ctx.lineTo(chestB.x + perp.x * 3, chestB.y + perp.y * 3);
    ctx.stroke();

    // ---- crimson obi sash ----
    const s0 = P(0.06, -12), s1 = P(0.06, 12);
    ctx.strokeStyle = flash ? flashCol : '#b52c40';
    ctx.lineWidth = 8;
    ctx.lineCap = 'butt';
    ctx.beginPath();
    ctx.moveTo(s0.x - fwd.x * 1, s0.y - fwd.y * 1);
    ctx.lineTo(s1.x - fwd.x * 1, s1.y - fwd.y * 1);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,190,175,0.42)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s0.x - fwd.x * 3.5, s0.y - fwd.y * 3.5);
    ctx.lineTo(s1.x - fwd.x * 3.5, s1.y - fwd.y * 3.5);
    ctx.stroke();
    // sash knot + tail
    const kx = P(0.06, 6);
    ctx.fillStyle = flash ? flashCol : '#93273a';
    ctx.beginPath(); ctx.ellipse(kx.x + fwd.x * 4, kx.y + fwd.y * 4, 4.5, 3.4, leanRad, 0, TAU); ctx.fill();
    const tw = Math.sin(this.breathe * 6 + 1) * 4 - this.vx * 0.03;
    ctx.strokeStyle = '#a02a3c';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(kx.x, kx.y);
    ctx.quadraticCurveTo(kx.x - f * 8 + tw, kx.y + 14, kx.x - f * 16 + tw * 1.7, kx.y + 28);
    ctx.stroke();

    // ---- shoulder pauldron (lighter, layered plates) ----
    const pnx = shF.x + fwd.x * 1, pny = shF.y + fwd.y * 1;
    ctx.beginPath();
    ctx.ellipse(pnx, pny + 2, 15, 9.5, leanRad + 0.12, 0, TAU);
    const pg = ctx.createLinearGradient(pnx - 11, pny - 9, pnx + 9, pny + 9);
    pg.addColorStop(0, flash ? flashCol : '#dbe4f0');
    pg.addColorStop(0.55, flash ? flashCol : '#9fadc3');
    pg.addColorStop(1, flash ? flashCol : '#59667e');
    ctx.fillStyle = pg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(18,24,36,0.65)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // plate seam
    ctx.strokeStyle = 'rgba(30,38,54,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(pnx, pny + 2, 9, 5.2, leanRad + 0.12, 0.2, Math.PI - 0.2);
    ctx.stroke();
    // crimson cord
    ctx.strokeStyle = '#c0394f';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(pnx, pny + 2, 9.6, Math.PI * 0.95, Math.PI * 2.05);
    ctx.stroke();

    // ---- collar ----
    const nx = neck.x, ny = neck.y;
    ctx.beginPath();
    ctx.moveTo(nx + perp.x * 10 + fwd.x * 1, ny + perp.y * 10 + fwd.y * 1 - 4);
    ctx.lineTo(nx + perp.x * 4, ny + perp.y * 4 - 15);
    ctx.lineTo(nx - perp.x * 11, ny - perp.y * 11 - 3);
    ctx.lineTo(nx - perp.x * 7, ny - perp.y * 7 + 5);
    ctx.closePath();
    ctx.fillStyle = flash ? flashCol : '#2b3346';
    ctx.fill();
    ctx.strokeStyle = 'rgba(200,220,245,0.28)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawHead(ctx, sk, flash) {
    const { head, headAng, f } = sk;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(headAng);
    ctx.scale(f, 1);

    // ponytail (drawn behind head)
    const wag = Math.sin(performance.now() * 0.005) * 4.5 - this.vx * 0.02 + (this.grounded ? 0 : Math.sin(performance.now() * 0.011) * 3);
    const ptx = -9, pty = -8;
    const segs = 5;
    ctx.strokeStyle = '#161a26';
    ctx.lineCap = 'round';
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs, t1 = (i + 1) / segs;
      const ax = ptx - 28 * t0, ay = pty + 14 * t0 + Math.sin(wag * 0.1 + t0 * 3) * 6 * t0;
      const bx = ptx - 28 * t1, by = pty + 18 * t1 + Math.sin(wag * 0.1 + t1 * 3 + 1) * 7 * t1 + wag * t1 * 0.5;
      ctx.lineWidth = 8 * (1 - t0 * 0.55);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    }
    // tail tip flare
    ctx.strokeStyle = '#242a3a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(ptx - 24, pty + 14 + wag * 0.5);
    ctx.quadraticCurveTo(ptx - 40, pty + 22 + wag, ptx - 48, pty + 12 + wag * 1.3);
    ctx.stroke();

    // neck
    ctx.fillStyle = '#d9c4ad';
    ctx.fillRect(-3.5, 2, 7, 9);

    // head base (skin)
    const g = ctx.createLinearGradient(0, -14, 0, 14);
    g.addColorStop(0, flash ? '#fff' : '#f6efe6');
    g.addColorStop(1, flash ? '#fff' : '#d8c3ac');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.ellipse(1, -2, 12.5, 13.5, 0, 0, TAU);
    ctx.fill();

    // hair cap (swept, layered)
    ctx.fillStyle = flash ? '#fff' : '#1b2030';
    ctx.beginPath();
    ctx.moveTo(-12.5, -5);
    ctx.quadraticCurveTo(-10, -18, 2, -16.5);
    ctx.quadraticCurveTo(14, -15, 14, -2);
    ctx.quadraticCurveTo(11, -7, 5, -10);
    ctx.quadraticCurveTo(1, -7, -2, -4.5);
    ctx.quadraticCurveTo(-5, -7, -6, -10);
    ctx.quadraticCurveTo(-9, -8, -12.5, -5);
    ctx.fill();
    // fringe strands
    ctx.strokeStyle = '#252c40';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3, -13); ctx.quadraticCurveTo(9, -9, 10, -3);
    ctx.moveTo(-2, -12); ctx.quadraticCurveTo(-5, -8, -5, -4);
    ctx.stroke();

    // face markings
    ctx.fillStyle = '#c53a52';
    ctx.fillRect(6.5, 0.5, 5.2, 1.8);
    ctx.fillRect(7.5, 3.4, 3, 1.3);
    // eye
    ctx.fillStyle = '#14202e';
    ctx.beginPath();
    ctx.ellipse(7.2, -5.4, 2.3, 1.15, 0.16, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(140,235,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(7.6, -5.4, 1.2, 0.6, 0.16, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // headband ribbon
    ctx.strokeStyle = '#c5384e';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(-12, -7.5);
    ctx.quadraticCurveTo(0, -12.5, 12.5, -6);
    ctx.stroke();
    // ribbon tails
    ctx.strokeStyle = '#a82b44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-11, -8);
    ctx.quadraticCurveTo(-20, -4 + wag * 0.4, -27, -8 + wag * 0.7);
    ctx.stroke();
    ctx.restore();
  }

  drawArm(ctx, sh, ikRes, hand, f, back) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const baseCol = back ? '#39415a' : '#e2e9f4';
    const foreCol = back ? '#454f68' : '#f1f6fc';
    // upper arm
    ctx.strokeStyle = baseCol;
    ctx.lineWidth = back ? 10 : 11;
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(ikRes.x, ikRes.y); ctx.stroke();
    // elbow joint shadow
    ctx.strokeStyle = 'rgba(20,24,36,0.35)';
    ctx.lineWidth = back ? 9.5 : 10.5;
    ctx.beginPath();
    ctx.moveTo(lerp(sh.x, ikRes.x, 0.85), lerp(sh.y, ikRes.y, 0.85));
    ctx.lineTo(lerp(sh.x, ikRes.x, 0.97), lerp(sh.y, ikRes.y, 0.97));
    ctx.stroke();
    // forearm
    ctx.strokeStyle = foreCol;
    ctx.lineWidth = back ? 8.8 : 9.8;
    ctx.beginPath(); ctx.moveTo(ikRes.x, ikRes.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();
    // bracer (crimson wrap)
    ctx.strokeStyle = back ? '#6d2433' : '#a32f45';
    ctx.lineWidth = back ? 9.8 : 10.8;
    const bx = lerp(ikRes.x, hand.x, 0.58), by = lerp(ikRes.y, hand.y, 0.58);
    const bx2 = lerp(ikRes.x, hand.x, 0.96), by2 = lerp(ikRes.y, hand.y, 0.96);
    ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx2, by2); ctx.stroke();
    // wrap bands
    ctx.strokeStyle = 'rgba(255,190,170,0.35)';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 2; i++) {
      const t = 0.66 + i * 0.15;
      const px = lerp(ikRes.x, hand.x, t), py = lerp(ikRes.y, hand.y, t);
      const nx = -(hand.y - ikRes.y), ny = (hand.x - ikRes.x);
      const nl = Math.hypot(nx, ny) || 1;
      ctx.beginPath();
      ctx.moveTo(px - nx / nl * 4, py - ny / nl * 4);
      ctx.lineTo(px + nx / nl * 4, py + ny / nl * 4);
      ctx.stroke();
    }
    // shoulder cap
    ctx.fillStyle = back ? '#2f3648' : '#aebccd';
    ctx.beginPath(); ctx.arc(sh.x, sh.y, back ? 5 : 6, 0, TAU); ctx.fill();
    // hand / glove
    ctx.fillStyle = back ? '#2f3648' : '#31384a';
    ctx.beginPath(); ctx.arc(hand.x, hand.y, back ? 4.6 : 5.4, 0, TAU); ctx.fill();
    ctx.fillStyle = back ? '#4a5468' : '#5a2434';
    ctx.beginPath(); ctx.arc(hand.x - f * 1.5, hand.y + 1, back ? 2 : 2.6, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawLeg(ctx, hip, ikRes, foot, f, back) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    // thigh (hakama-style, wider)
    ctx.strokeStyle = back ? '#1e2536' : '#2c3448';
    ctx.lineWidth = back ? 15 : 17;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(ikRes.x, ikRes.y); ctx.stroke();
    // thigh highlight
    ctx.strokeStyle = back ? 'rgba(90,110,150,0.25)' : 'rgba(120,145,190,0.28)';
    ctx.lineWidth = back ? 3 : 4;
    const thx = lerp(hip.x, ikRes.x, 0.45), thy = lerp(hip.y, ikRes.y, 0.45);
    ctx.beginPath(); ctx.moveTo(hip.x + f * 3, hip.y); ctx.lineTo(thx + f * 3, thy); ctx.stroke();
    // knee wrap
    ctx.strokeStyle = back ? '#151b28' : '#1c2331';
    ctx.lineWidth = back ? 13 : 15;
    ctx.beginPath();
    ctx.moveTo(lerp(hip.x, ikRes.x, 0.82), lerp(hip.y, ikRes.y, 0.82));
    ctx.lineTo(lerp(hip.x, ikRes.x, 1.0), lerp(hip.y, ikRes.y, 1.0));
    ctx.stroke();
    // shin
    ctx.strokeStyle = back ? '#232b3d' : '#313b50';
    ctx.lineWidth = back ? 10 : 11.5;
    ctx.beginPath(); ctx.moveTo(ikRes.x, ikRes.y); ctx.lineTo(foot.x, foot.y - 6); ctx.stroke();
    // boot cuff
    ctx.strokeStyle = back ? '#8c94a6' : '#e2e9f4';
    ctx.lineWidth = back ? 9.5 : 11;
    ctx.beginPath(); ctx.moveTo(foot.x - f * 1, foot.y - 12); ctx.lineTo(foot.x + f * 1, foot.y - 2); ctx.stroke();
    // boot
    ctx.fillStyle = back ? '#11161f' : '#171d29';
    ctx.beginPath();
    ctx.ellipse(foot.x + f * 6, foot.y - 1, 12, 5.4, 0, 0, TAU);
    ctx.fill();
    // sole highlight
    ctx.strokeStyle = 'rgba(160,180,210,0.35)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(foot.x - f * 3, foot.y + 3);
    ctx.lineTo(foot.x + f * 15, foot.y + 3);
    ctx.stroke();
    ctx.restore();
  }

  drawSword(ctx, sk, flash) {
    const b = this.getBladeWorld();
    const dx = b.tip.x - b.base.x, dy = b.tip.y - b.base.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    ctx.save();
    // blade glow
    ctx.globalCompositeOperation = 'lighter';
    const glow = 0.16 + this.bladeGlow * 0.5;
    ctx.strokeStyle = `rgba(150,235,255,${glow})`;
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(b.base.x, b.base.y); ctx.lineTo(b.tip.x, b.tip.y); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${glow * 0.8})`;
    ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(b.base.x + ux * 8, b.base.y + uy * 8); ctx.lineTo(b.tip.x, b.tip.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    // blade body (tapered, slightly curved)
    ctx.beginPath();
    ctx.moveTo(b.base.x + px * 3.6, b.base.y + py * 3.6);
    ctx.quadraticCurveTo(
      lerp(b.base.x, b.tip.x, 0.5) + px * 3.0, lerp(b.base.y, b.tip.y, 0.5) + py * 3.0,
      b.tip.x, b.tip.y);
    ctx.quadraticCurveTo(
      lerp(b.base.x, b.tip.x, 0.5) - px * 2.0, lerp(b.base.y, b.tip.y, 0.5) - py * 2.0,
      b.base.x - px * 2.8, b.base.y - py * 2.8);
    ctx.closePath();
    const g = ctx.createLinearGradient(b.base.x, b.base.y, b.tip.x, b.tip.y);
    g.addColorStop(0, flash ? '#ffffff' : '#cfe6f7');
    g.addColorStop(0.55, flash ? '#ffffff' : '#a9c9e2');
    g.addColorStop(1, '#fbffff');
    ctx.fillStyle = g;
    ctx.fill();
    // hamon (temper line)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(b.base.x + ux * len * 0.08 + px * 1.6, b.base.y + uy * len * 0.08 + py * 1.6);
    ctx.lineTo(b.tip.x - ux * 3, b.tip.y - uy * 3);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(90,130,165,0.5)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(b.base.x + ux * len * 0.12 - px * 1.2, b.base.y + uy * len * 0.12 - py * 1.2);
    ctx.lineTo(lerp(b.base.x, b.tip.x, 0.88) - px * 1.0, lerp(b.base.y, b.tip.y, 0.88) - py * 1.0);
    ctx.stroke();
    // guard (tsuba) — dark iron with crimson accent
    const gx = b.base.x - ux * 2, gy = b.base.y - uy * 2;
    ctx.strokeStyle = '#231720';
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(gx + px * 8.5, gy + py * 8.5);
    ctx.lineTo(gx - px * 8.5, gy - py * 8.5);
    ctx.stroke();
    ctx.strokeStyle = '#a99470';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(gx + px * 7, gy + py * 7);
    ctx.lineTo(gx - px * 7, gy - py * 7);
    ctx.stroke();
    // hilt (tsuka) with wrapping
    ctx.strokeStyle = '#5e1b2a';
    ctx.lineWidth = 4.6;
    ctx.beginPath();
    ctx.moveTo(gx - ux, gy - uy);
    ctx.lineTo(gx - ux * 16, gy - uy * 16);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(230,200,150,0.75)';
    ctx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const hx = gx - ux * (3 + i * 4), hy = gy - uy * (3 + i * 4);
      ctx.beginPath();
      ctx.moveTo(hx + px * 2.6, hy + py * 2.6);
      ctx.lineTo(hx - px * 2.6, hy - py * 2.6);
      ctx.stroke();
    }
    // pommel
    ctx.fillStyle = '#c9b07e';
    ctx.beginPath(); ctx.arc(gx - ux * 17, gy - uy * 17, 2.8, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawScarf(ctx, sk) {
    const pts = this.scarf;
    ctx.save();
    ctx.lineCap = 'round';
    for (let i = pts.length - 1; i >= 1; i--) {
      const a = pts[i], b = pts[i - 1];
      const t = 1 - i / pts.length;
      ctx.strokeStyle = i % 2 === 0 ? '#c9384f' : '#e04a60';
      ctx.lineWidth = 2 + (1 - t) * 7.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    // neck knot
    const p0 = pts[0];
    ctx.fillStyle = '#b5304a';
    ctx.beginPath(); ctx.arc(p0.x, p0.y, 5, 0, TAU); ctx.fill();
    ctx.restore();
  }
}
