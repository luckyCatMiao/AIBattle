/* ============================================================
   Player: movement, attack kit, animation skeleton, feedback
   ============================================================ */
const GRAV = 2200;
const JUMP_VY = -790;
const AIR_JUMP_VY = -710;
const MAX_RUN = 335;
const MAX_AIR = 315;

const LIGHT_GROUND = [
  {
    kind: "light", index: 0, pose: "diagDown",
    startup: 0.055, active: 0.08, recovery: 0.15,
    dmg: 9, limb: 11, poise: 11,
    hitstop: 0.045, shake: 1.5, kb: 95, launch: 0,
    ox: 45, oy: 47, r: 45, lunge: 150,
    slash: { r: 52, ox: 25, oy: 40, a0: -2.3, a1: 0.56, width: 16, life: 0.15 },
    bias: { arm: 0.8, leg: 1.3, head: 1.05 },
    sound: "light",
  },
  {
    kind: "light", index: 1, pose: "upperReverse",
    startup: 0.05, active: 0.078, recovery: 0.15,
    dmg: 10, limb: 12, poise: 12,
    hitstop: 0.05, shake: 1.8, kb: 110, launch: 0,
    ox: 48, oy: 45, r: 49, lunge: 170,
    slash: { r: 50, ox: 22, oy: 43, a0: 1.22, a1: -2.6, width: 15, life: 0.15 },
    bias: { arm: 0.9, leg: 1.15, head: 1.1 },
    sound: "light",
  },
  {
    kind: "light", index: 2, pose: "moonfall",
    startup: 0.09, active: 0.095, recovery: 0.235,
    dmg: 16, limb: 19, poise: 27,
    hitstop: 0.075, shake: 3.2, kb: 195, launch: 335,
    ox: 55, oy: 51, r: 60, lunge: 240,
    slash: { r: 62, ox: 27, oy: 40, a0: -2.7, a1: 0.92, width: 20, life: 0.17 },
    bias: { arm: 1.0, leg: 1.05, head: 0.9 },
    sound: "heavyish",
  },
];

const LIGHT_AIR = [
  {
    kind: "light", index: 0, air: true, pose: "airDiag",
    startup: 0.05, active: 0.08, recovery: 0.1,
    dmg: 9, limb: 11, poise: 10,
    hitstop: 0.045, shake: 1.4, kb: 85, launch: 145,
    ox: 43, oy: 42, r: 44, lunge: 95,
    slash: { r: 48, ox: 22, oy: 36, a0: -2.2, a1: 0.55, width: 15, life: 0.14 },
    bias: { arm: 0.8, leg: 1.2, head: 1.1 },
    sound: "light",
  },
  {
    kind: "light", index: 1, air: true, pose: "airReverse",
    startup: 0.048, active: 0.078, recovery: 0.1,
    dmg: 10, limb: 12, poise: 12,
    hitstop: 0.05, shake: 1.7, kb: 100, launch: 155,
    ox: 46, oy: 40, r: 49, lunge: 100,
    slash: { r: 48, ox: 20, oy: 38, a0: 1.15, a1: -2.55, width: 15, life: 0.14 },
    bias: { arm: 0.9, leg: 1.1, head: 1.1 },
    sound: "light",
  },
  {
    kind: "light", index: 2, air: true, pose: "airSpike",
    startup: 0.075, active: 0.09, recovery: 0.16,
    dmg: 15, limb: 18, poise: 25,
    hitstop: 0.08, shake: 3.0, kb: 140, launch: -360,
    ox: 46, oy: 34, r: 56, lunge: 120,
    slash: { r: 56, ox: 23, oy: 32, a0: -2.6, a1: 1.0, width: 19, life: 0.16 },
    bias: { arm: 1.0, leg: 1.15, head: 0.95 },
    sound: "heavyish",
  },
];

const HEAVY_DEF = {
  kind: "heavy", pose: "cleave",
  startup: 0.16, active: 0.1, recovery: 0.33,
  dmg: 32, limb: 38, poise: 52,
  hitstop: 0.1, shake: 4.6, kb: 300, launch: 280,
  ox: 51, oy: 45, r: 68, lunge: 260,
  slash: { r: 76, ox: 30, oy: 36, a0: -2.6, a1: 0.9, width: 24, life: 0.2 },
  bias: { arm: 1.0, leg: 1.05, head: 0.95 },
  sound: "heavy",
};

const AIR_HEAVY_DEF = {
  kind: "airHeavy", pose: "airSlam", air: true,
  startup: 0.1, active: 0.2, recovery: 0.24,
  dmg: 34, limb: 42, poise: 56,
  hitstop: 0.1, shake: 5.0, kb: 250, launch: -380,
  ox: 38, oy: 32, r: 60, lunge: 70,
  slash: { r: 62, ox: 24, oy: 30, a0: -2.5, a1: 1.0, width: 22, life: 0.18 },
  bias: { arm: 1.0, leg: 1.1, head: 0.95 },
  sound: "heavy",
};

const DASH_ATK_DEF = {
  kind: "dashAtk", pose: "lunge",
  startup: 0.04, active: 0.1, recovery: 0.18,
  dmg: 22, limb: 27, poise: 34,
  hitstop: 0.075, shake: 3.2, kb: 240, launch: 110,
  ox: 56, oy: 44, r: 49, lunge: 480,
  slash: { r: 68, ox: 28, oy: 37, a0: -1.05, a1: 0.36, width: 20, life: 0.16 },
  bias: { arm: 0.95, leg: 1.0, head: 1.1 },
  sound: "heavyish",
};

const AIR_SLAM_DEF = {
  dmg: 24, limb: 30, poise: 42,
  hitstop: 0.09, shake: 6.0, kb: 300, launch: 200,
  r: 108, bias: { arm: 1.0, leg: 1.0, head: 0.95 },
};

const ATTACK_POSES = {
  diagDown: {
    wind: { handR: { x: 2, y: -37 }, handL: { x: 6, y: -33 }, angle: -2.45, lean: -0.12, crouch: 2, hipShift: -2, footL: { x: -14, y: 0 }, footR: { x: 13, y: 0 }, headTilt: -0.03, twoHand: false },
    strike: { handR: { x: 20, y: -27 }, handL: { x: -8, y: -18 }, angle: 0.78, lean: 0.34, crouch: 5, hipShift: 7, footL: { x: -17, y: 0 }, footR: { x: 17, y: 0 }, headTilt: 0.08, twoHand: false },
    recover: { handR: { x: 14, y: -23 }, handL: { x: -4, y: -20 }, angle: 1.2, lean: 0.1, crouch: 2, hipShift: 2, footL: { x: -13, y: 0 }, footR: { x: 14, y: 0 }, headTilt: 0.02, twoHand: false },
  },
  upperReverse: {
    wind: { handR: { x: 16, y: -20 }, handL: { x: 2, y: -19 }, angle: 1.35, lean: 0.18, crouch: 4, hipShift: 1, footL: { x: -13, y: 0 }, footR: { x: 14, y: 0 }, headTilt: 0.04, twoHand: false },
    strike: { handR: { x: 4, y: -40 }, handL: { x: -4, y: -28 }, angle: -2.72, lean: -0.24, crouch: 1, hipShift: 2, footL: { x: -15, y: 0 }, footR: { x: 14, y: 0 }, headTilt: -0.12, twoHand: false },
    recover: { handR: { x: 8, y: -27 }, handL: { x: -5, y: -22 }, angle: -2.1, lean: -0.04, crouch: 1, hipShift: 0, footL: { x: -11, y: 0 }, footR: { x: 12, y: 0 }, headTilt: -0.03, twoHand: false },
  },
  moonfall: {
    wind: { handR: { x: -2, y: -45 }, handL: { x: 2, y: -39 }, angle: -2.95, lean: -0.2, crouch: 4, hipShift: -4, footL: { x: -16, y: 0 }, footR: { x: 15, y: 0 }, headTilt: -0.08, twoHand: true },
    strike: { handR: { x: 22, y: -27 }, handL: { x: 13, y: -30 }, angle: 1.02, lean: 0.42, crouch: 7, hipShift: 11, footL: { x: -19, y: 0 }, footR: { x: 20, y: 0 }, headTilt: 0.12, twoHand: true },
    recover: { handR: { x: 17, y: -22 }, handL: { x: 7, y: -26 }, angle: 1.24, lean: 0.16, crouch: 3, hipShift: 4, footL: { x: -15, y: 0 }, footR: { x: 16, y: 0 }, headTilt: 0.04, twoHand: true },
  },
  cleave: {
    wind: { handR: { x: -8, y: -24 }, handL: { x: -2, y: -23 }, angle: -2.72, lean: -0.16, crouch: 10, hipShift: -7, footL: { x: -17, y: 0 }, footR: { x: 14, y: 0 }, headTilt: -0.05, twoHand: true },
    strike: { handR: { x: 24, y: -25 }, handL: { x: 15, y: -27 }, angle: 0.98, lean: 0.37, crouch: 8, hipShift: 12, footL: { x: -20, y: 0 }, footR: { x: 20, y: 0 }, headTilt: 0.11, twoHand: true },
    recover: { handR: { x: 18, y: -22 }, handL: { x: 8, y: -24 }, angle: 1.22, lean: 0.12, crouch: 3, hipShift: 4, footL: { x: -15, y: 0 }, footR: { x: 15, y: 0 }, headTilt: 0.03, twoHand: true },
  },
  lunge: {
    wind: { handR: { x: 0, y: -35 }, handL: { x: -4, y: -27 }, angle: -1.35, lean: 0.32, crouch: 5, hipShift: 2, footL: { x: -18, y: 0 }, footR: { x: 15, y: 0 }, headTilt: 0.02, twoHand: false },
    strike: { handR: { x: 26, y: -29 }, handL: { x: 8, y: -22 }, angle: 0.06, lean: 0.56, crouch: 8, hipShift: 16, footL: { x: -24, y: 0 }, footR: { x: 21, y: 0 }, headTilt: 0.1, twoHand: false },
    recover: { handR: { x: 19, y: -25 }, handL: { x: 3, y: -22 }, angle: 0.7, lean: 0.22, crouch: 3, hipShift: 6, footL: { x: -16, y: 0 }, footR: { x: 16, y: 0 }, headTilt: 0.03, twoHand: false },
  },
  airDiag: {
    wind: { handR: { x: 2, y: -35 }, handL: { x: 5, y: -30 }, angle: -2.3, lean: -0.1, crouch: 0, hipShift: -1, footL: { x: -9, y: -12 }, footR: { x: 8, y: -5 }, headTilt: -0.03, twoHand: false },
    strike: { handR: { x: 19, y: -24 }, handL: { x: -7, y: -18 }, angle: 0.72, lean: 0.3, crouch: 1, hipShift: 5, footL: { x: -11, y: -8 }, footR: { x: 11, y: -12 }, headTilt: 0.08, twoHand: false },
    recover: { handR: { x: 14, y: -22 }, handL: { x: -4, y: -19 }, angle: 1.15, lean: 0.08, crouch: 0, hipShift: 2, footL: { x: -9, y: -10 }, footR: { x: 9, y: -7 }, headTilt: 0.02, twoHand: false },
  },
  airReverse: {
    wind: { handR: { x: 16, y: -17 }, handL: { x: 2, y: -16 }, angle: 1.5, lean: 0.2, crouch: 0, hipShift: 1, footL: { x: -8, y: -6 }, footR: { x: 9, y: -11 }, headTilt: 0.03, twoHand: false },
    strike: { handR: { x: 3, y: -38 }, handL: { x: -4, y: -27 }, angle: -2.6, lean: -0.22, crouch: 0, hipShift: 2, footL: { x: -11, y: -12 }, footR: { x: 8, y: -6 }, headTilt: -0.1, twoHand: false },
    recover: { handR: { x: 8, y: -27 }, handL: { x: -5, y: -23 }, angle: -2.0, lean: -0.03, crouch: 0, hipShift: 0, footL: { x: -9, y: -10 }, footR: { x: 9, y: -6 }, headTilt: -0.02, twoHand: false },
  },
  airSpike: {
    wind: { handR: { x: -1, y: -43 }, handL: { x: 2, y: -38 }, angle: -2.85, lean: -0.18, crouch: 0, hipShift: -2, footL: { x: -8, y: -14 }, footR: { x: 7, y: -10 }, headTilt: -0.08, twoHand: true },
    strike: { handR: { x: 17, y: -13 }, handL: { x: 10, y: -20 }, angle: 1.42, lean: 0.45, crouch: 0, hipShift: 7, footL: { x: -13, y: -4 }, footR: { x: 12, y: -8 }, headTilt: 0.14, twoHand: true },
    recover: { handR: { x: 15, y: -20 }, handL: { x: 4, y: -24 }, angle: 1.1, lean: 0.16, crouch: 0, hipShift: 2, footL: { x: -10, y: -7 }, footR: { x: 10, y: -9 }, headTilt: 0.03, twoHand: true },
  },
  airSlam: {
    wind: { handR: { x: 0, y: -44 }, handL: { x: 2, y: -37 }, angle: -2.7, lean: -0.15, crouch: 0, hipShift: -2, footL: { x: -8, y: -16 }, footR: { x: 8, y: -13 }, headTilt: -0.05, twoHand: true },
    strike: { handR: { x: 14, y: -12 }, handL: { x: 8, y: -19 }, angle: 1.5, lean: 0.5, crouch: 0, hipShift: 6, footL: { x: -12, y: -2 }, footR: { x: 11, y: -6 }, headTilt: 0.15, twoHand: true },
    recover: { handR: { x: 16, y: -21 }, handL: { x: 6, y: -25 }, angle: 1.12, lean: 0.14, crouch: 0, hipShift: 2, footL: { x: -9, y: -7 }, footR: { x: 9, y: -8 }, headTilt: 0.02, twoHand: true },
  },
};

function createPlayer(x) {
  const p = {
    x: x != null ? x : WORLD_W / 2,
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing: 1,
    grounded: true,
    coyote: 0,
    jumpCount: 0,
    jumpBuffer: 0,
    jumpCutDone: false,
    hp: 100,
    maxHp: 100,
    displayHp: 100,
    hurtFlash: 0,
    iframes: 0,
    state: "idle",
    animTime: 0,
    runPhase: 0,
    landSquash: 0,

    atk: null,
    lightNext: 0,
    lightWindow: 0,
    lightBuffer: 0,
    heavyQueued: 0,
    dashQueued: 0,
    parryQueued: 0,

    dashT: 0,
    dashCd: 0,
    dashDir: 1,
    airDashUsed: false,
    airDashQueued: false,

    parryT: 0,
    parryCd: 0,

    skill: null,
    skillCd: { 1: 0, 2: 0, 3: 0, 4: 0 },
    skillQueue: [],
    skillDenyT: 0,
    skillDenyId: 0,

    chargeT: 0,
    chargeLevel: 0,
    chargeFullNotified: false,

    hurtT: 0,
    dead: false,
    deadT: 0,

    trailTick: 0,
    scarf: [],
    scarfNeck: { x: 0, y: 0 },
    ghostTick: 0,
    parryFlash: 0,
    lastAngle: 1.1,
  };
  initScarf(p);
  return p;
}

function initScarf(p) {
  p.scarf = [];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const x = p.x - p.facing * i * 4.6;
    const y = p.y - 60 + i * 0.5 + Math.sin(i * 0.7) * 1.5;
    p.scarf.push({ x, y, px: x, py: y });
  }
}

function updateScarf(p, dt) {
  if (!p.scarf.length) initScarf(p);
  const pts = p.scarf;
  const crouch = p.state === "charge" ? 8 : 0;
  const neckX = p.x + p.facing * 1.5;
  const neckY = p.y - 59 + crouch + Math.sin(p.animTime * 2.2) * 0.8;
  pts[0].x = neckX;
  pts[0].y = neckY;
  pts[0].px = neckX;
  pts[0].py = neckY;
  const speed = Math.abs(p.vx);
  const windX = Math.sin(game.time * 1.35) * (14 + speed * 0.05);
  const windY = Math.cos(game.time * 1.1) * 5;
  for (let i = 1; i < pts.length; i++) {
    const q = pts[i];
    let vx = (q.x - q.px) * 0.93;
    let vy = (q.y - q.py) * 0.93;
    const flut = Math.sin(game.time * 3.3 + i * 0.72) * (6 + speed * 0.035 + (p.state === "dash" ? 30 : 0));
    q.px = q.x;
    q.py = q.y;
    q.x += vx + (windX + flut) * dt * dt * 18;
    q.y += vy + (250 + windY) * dt * dt;
    // limit motion
    const maxStep = 9;
    const dx = q.x - pts[i - 1].x;
    const dy = q.y - pts[i - 1].y;
    const d = Math.hypot(dx, dy) || 1;
    const seg = 4.8;
    q.x = pts[i - 1].x + (dx / d) * seg;
    q.y = pts[i - 1].y + (dy / d) * seg;
  }
  for (let k = 0; k < 2; k++) {
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1];
      const b = pts[i];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy) || 1;
      const diff = (d - 4.8) / d;
      if (i === 1) {
        b.x -= dx * diff;
        b.y -= dy * diff;
      } else {
        a.x += dx * diff * 0.35;
        a.y += dy * diff * 0.35;
        b.x -= dx * diff * 0.65;
        b.y -= dy * diff * 0.65;
      }
    }
  }
}

function computePlayerPose(p) {
  let handR = { x: 10, y: -24 };
  let handL = { x: -3, y: -22 };
  let angle = 1.15;
  let lean = 0.03;
  let crouch = 1 + Math.sin(p.animTime * 2.3) * 0.8;
  let hipShift = 0;
  let footL = { x: -8, y: 0 };
  let footR = { x: 9, y: 0 };
  let headTilt = 0;
  let twoHand = false;
  let bladeLen = 57;

  const speed = Math.abs(p.vx);
  const isAir = !p.grounded;

  const base = () => {
    if (p.state === "dead" || p.dead) {
      const t = clamp(p.deadT / 0.45, 0, 1);
      return {
        handR: { x: lerp(10, 17, t), y: lerp(-24, -5, t) },
        handL: { x: lerp(-3, -16, t), y: lerp(-22, -4, t) },
        angle: lerp(1.15, 1.55, t),
        lean: lerp(0.03, -1.35, easeOutCubic(t)),
        crouch: lerp(1, 21, t),
        hipShift: lerp(0, -5, t),
        footL: { x: lerp(-8, -17, t), y: 0 },
        footR: { x: lerp(9, 13, t), y: 0 },
        headTilt: -0.15 * t,
        twoHand: false,
      };
    }
    if (p.state === "hurt") {
      const k = clamp(p.hurtT / 0.26, 0, 1);
      return {
        handR: { x: 2 - k * 3, y: -30 - k * 4 },
        handL: { x: -10, y: -32 + k * 3 },
        angle: 1.75 + k * 0.3,
        lean: -0.34 * k,
        crouch: 3,
        hipShift: -4 * k,
        footL: { x: -13, y: 0 },
        footR: { x: 15, y: 0 },
        headTilt: -0.2 * k,
        twoHand: false,
      };
    }
    if (p.state === "parry") {
      const t = clamp(p.parryT / 0.45, 0, 1);
      const guard = Math.sin(clamp(t * 3, 0, 1) * PI * 0.5);
      return {
        handR: { x: lerp(6, 13, guard), y: lerp(-28, -39, guard) },
        handL: { x: lerp(-2, 3, guard), y: lerp(-30, -43, guard) },
        angle: lerp(1.2, -1.57, guard),
        lean: 0.02,
        crouch: 4 + Math.sin(p.animTime * 15) * 0.4,
        hipShift: 1,
        footL: { x: -14, y: 0 },
        footR: { x: 12, y: 0 },
        headTilt: -0.02,
        twoHand: true,
        bladeLen: 59,
      };
    }
    if (p.state === "charge") {
      const lv = p.chargeLevel;
      const tremor = lv > 0.65 ? Math.sin(p.animTime * 53) * 0.7 : 0;
      return {
        handR: { x: -8 + tremor, y: -22 + (Math.random() - 0.5) * tremor },
        handL: { x: 1, y: -25 },
        angle: -2.65 - lv * 0.12,
        lean: -0.15 - lv * 0.05,
        crouch: 11 + lv * 2,
        hipShift: -5,
        footL: { x: -18, y: 0 },
        footR: { x: 15, y: 0 },
        headTilt: -0.05 - lv * 0.04,
        twoHand: true,
        bladeLen: 58 + lv * 9,
      };
    }
    if (p.state === "dash") {
      return {
        handR: { x: -9, y: -26 },
        handL: { x: -12, y: -18 },
        angle: 2.35,
        lean: 0.62,
        crouch: 6,
        hipShift: 3,
        footL: { x: -17, y: -5 },
        footR: { x: 16, y: -2 },
        headTilt: 0.12,
        twoHand: false,
      };
    }
    if (isAir) {
      const rising = p.vy < 0;
      return {
        handR: { x: 11, y: -26 },
        handL: { x: -8, y: -28 },
        angle: rising ? 1.95 : 0.92,
        lean: rising ? 0.04 : -0.04,
        crouch: 0,
        hipShift: 0,
        footL: { x: -9, y: rising ? -12 : -7 },
        footR: { x: 9, y: rising ? -6 : -10 },
        headTilt: rising ? 0.02 : -0.04,
        twoHand: false,
      };
    }
    if (speed > 35) {
      const k = clamp(speed / MAX_RUN, 0, 1);
      const step = Math.sin(p.runPhase);
      return {
        handR: { x: -8 - k * 3, y: -20 - Math.abs(step) * 2 },
        handL: { x: 8 + step * 2, y: -19 },
        angle: 2.18,
        lean: 0.16 + k * 0.12,
        crouch: 2 + Math.abs(step) * 1.2,
        hipShift: 1,
        footL: { x: -8 + step * 14, y: -Math.max(0, step) * 7 },
        footR: { x: 8 - step * 14, y: -Math.max(0, -step) * 7 },
        headTilt: 0.03,
        twoHand: false,
      };
    }
    // idle
    return {
      handR: { x: 10, y: -24 + Math.sin(p.animTime * 2.3) * 0.7 },
      handL: { x: -3, y: -22 },
      angle: 1.14 + Math.sin(p.animTime * 1.9) * 0.02,
      lean: 0.03,
      crouch,
      hipShift: 0,
      footL: { x: -8, y: 0 },
      footR: { x: 9, y: 0 },
      headTilt: 0.01 + Math.sin(p.animTime * 1.2) * 0.015,
      twoHand: false,
    };
  };

  let spec = base();

  if (p.state === "skill" && p.skill) {
    const sk = skillPoseSpec(p);
    if (sk) spec = sk;
  } else if (p.state === "attack" && p.atk) {
    const a = p.atk;
    const def = a.def;
    const poses = ATTACK_POSES[def.pose];
    if (poses) {
      const t = a.t;
      let blended;
      if (t < def.startup) {
        const k = easeOutCubic(clamp(t / def.startup, 0, 1));
        blended = blendPoseSpec(spec, poses.wind, k);
      } else if (t < def.startup + def.active) {
        const k = easeOutQuint(clamp((t - def.startup) / def.active, 0, 1));
        blended = blendPoseSpec(poses.wind, poses.strike, k);
      } else {
        const k = easeInOutCubic(clamp((t - def.startup - def.active) / Math.max(0.001, def.recovery), 0, 1));
        blended = blendPoseSpec(poses.strike, poses.recover, k);
      }
      spec = blended;
    }
  }

  handR = spec.handR;
  handL = spec.handL;
  angle = spec.angle;
  lean = spec.lean;
  crouch = spec.crouch;
  hipShift = spec.hipShift;
  footL = spec.footL;
  footR = spec.footR;
  headTilt = spec.headTilt;
  twoHand = spec.twoHand;

  if (p.state === "attack" && p.atk && p.atk.def.pose === "cleave") {
    bladeLen = 59 + (p.atk.def.chargeLevel || 0) * 11;
  }
  if (p.state === "attack" && p.atk && p.atk.def.pose === "moonfall") bladeLen = 62;
  if (p.state === "skill" && p.skill) {
    bladeLen = p.skill.id === 4 ? 70 : p.skill.id === 2 ? 64 : p.skill.id === 3 ? 58 : 62;
  }

  // build skeleton (local coordinates, origin at feet, +x forward)
  const hip = { x: hipShift, y: -30 + crouch };
  const torsoAng = lean;
  const chest = { x: hip.x + Math.sin(torsoAng) * 20.5, y: hip.y - Math.cos(torsoAng) * 20.5 };
  const headBase = {
    x: chest.x + Math.sin(torsoAng * 0.7 + headTilt) * 10.5 + 0.8,
    y: chest.y - Math.cos(torsoAng * 0.7 + headTilt) * 10.5,
  };
  const shoulderPad = 5.8;
  const shoulderL = { x: chest.x + Math.cos(torsoAng) * -shoulderPad, y: chest.y + Math.sin(torsoAng) * -shoulderPad - 0.5 };
  const shoulderR = { x: chest.x + Math.cos(torsoAng) * shoulderPad, y: chest.y + Math.sin(torsoAng) * shoulderPad - 0.5 };

  const armL1 = 13.2;
  const armL2 = 13.8;
  const elbowL = twoBone(shoulderL, handL, armL1, armL2, 0.85);
  const elbowR = twoBone(shoulderR, handR, armL1, armL2, 0.85);

  const hipL = { x: hip.x - 4.8, y: hip.y + 1 };
  const hipR = { x: hip.x + 4.8, y: hip.y + 1 };
  const thigh = 16.5;
  const shin = 17.5;
  const kneeL = twoBone(hipL, footL, thigh, shin, -1);
  const kneeR = twoBone(hipR, footR, thigh, shin, -1);

  return {
    x: p.x,
    y: p.y,
    facing: p.facing,
    hip, chest, head: headBase,
    shoulderL, shoulderR, elbowL, elbowR, handL, handR,
    hipL, hipR, kneeL, kneeR, footL, footR,
    bladeAngle: angle,
    bladeLen,
    lean,
    torsoAng,
    headTilt,
    twoHand,
    crouch,
    guard: p.state === "parry",
    chargeLevel: p.state === "charge" ? p.chargeLevel : 0,
    state: p.state,
    spin: p.state === "skill" && p.skill ? skillSpinValue(p) : 0,
    scarfNeck: { x: p.x + p.facing * 1.5, y: p.y - 59 + (p.state === "charge" ? 8 : 0) },
  };
}

function blendPoseSpec(a, b, t) {
  return {
    handR: { x: lerp(a.handR.x, b.handR.x, t), y: lerp(a.handR.y, b.handR.y, t) },
    handL: { x: lerp(a.handL.x, b.handL.x, t), y: lerp(a.handL.y, b.handL.y, t) },
    angle: angLerp(a.angle, b.angle, t),
    lean: lerp(a.lean, b.lean, t),
    crouch: lerp(a.crouch, b.crouch, t),
    hipShift: lerp(a.hipShift, b.hipShift, t),
    footL: { x: lerp(a.footL.x, b.footL.x, t), y: lerp(a.footL.y, b.footL.y, t) },
    footR: { x: lerp(a.footR.x, b.footR.x, t), y: lerp(a.footR.y, b.footR.y, t) },
    headTilt: lerp(a.headTilt, b.headTilt, t),
    twoHand: t < 0.5 ? a.twoHand : b.twoHand,
  };
}

function snapshotPose(pose) {
  return {
    x: pose.x, y: pose.y, facing: pose.facing,
    hip: { ...pose.hip }, chest: { ...pose.chest }, head: { ...pose.head },
    shoulderL: { ...pose.shoulderL }, shoulderR: { ...pose.shoulderR },
    elbowL: { ...pose.elbowL }, elbowR: { ...pose.elbowR },
    handL: { ...pose.handL }, handR: { ...pose.handR },
    hipL: { ...pose.hipL }, hipR: { ...pose.hipR },
    kneeL: { ...pose.kneeL }, kneeR: { ...pose.kneeR },
    footL: { ...pose.footL }, footR: { ...pose.footR },
    bladeAngle: pose.bladeAngle, bladeLen: pose.bladeLen,
    lean: pose.lean, headTilt: pose.headTilt, guard: pose.guard, state: pose.state,
    spin: pose.spin || 0, chargeLevel: pose.chargeLevel,
  };
}

/* ---------------- player update ---------------- */
function moveDir() {
  let d = 0;
  if (input.down.KeyD || input.down.ArrowRight) d += 1;
  if (input.down.KeyA || input.down.ArrowLeft) d -= 1;
  return d;
}

function updatePlayer(p, dt) {
  p.animTime += dt;
  p.iframes = Math.max(0, p.iframes - dt);
  p.dashCd = Math.max(0, p.dashCd - dt);
  p.parryCd = Math.max(0, p.parryCd - dt);
  p.skillDenyT = Math.max(0, p.skillDenyT - dt);
  for (let si = 1; si <= 4; si++) p.skillCd[si] = Math.max(0, p.skillCd[si] - dt);
  if (p.skillQueue.length) {
    for (const q of p.skillQueue) q.ttl -= dt;
    p.skillQueue = p.skillQueue.filter((q) => q.ttl > 0);
  }
  p.hurtFlash = Math.max(0, p.hurtFlash - dt * 4.5);
  p.parryFlash = Math.max(0, p.parryFlash - dt * 6);
  p.landSquash = Math.max(0, p.landSquash - dt * 7);
  p.lightBuffer = Math.max(0, p.lightBuffer - dt);
  p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  p.heavyQueued = Math.max(0, p.heavyQueued - dt);
  p.dashQueued = Math.max(0, p.dashQueued - dt);
  p.parryQueued = Math.max(0, p.parryQueued - dt);
  p.lightWindow = Math.max(0, p.lightWindow - dt);
  p.displayHp = damp(p.displayHp, p.hp, 7, dt);
  if (p.lightWindow <= 0) p.lightNext = 0;

  if (input.pressed.Space) p.jumpBuffer = 0.13;
  if (input.pressed.KeyJ) p.lightBuffer = 0.19;
  if (input.pressed.KeyK) p.heavyQueued = 0.5;
  if (input.pressed.KeyL) p.dashQueued = 0.15;
  if (input.pressed.KeyI) p.parryQueued = 0.13;

  if (p.dead) {
    p.skill = null;
    p.skillQueue.length = 0;
    p.deadT += dt;
    p.vx = damp(p.vx, 0, p.grounded ? 6 : 0.6, dt);
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  // Independent skills: 1-4. They can cancel attacks/dash/charge/parry.
  // Pressing another skill during a cast queues it for a seamless chain.
  if (p.state !== "hurt") {
    for (let si = 1; si <= 4; si++) {
      if (!input.pressed["Digit" + si]) continue;
      if (p.state === "skill") {
        if (
          p.skillQueue.length < 3 &&
          !p.skillQueue.some((q) => q.id === si) &&
          !(p.skill && p.skill.id === si)
        ) {
          p.skillQueue.push({ id: si, ttl: 8.0 });
        }
      } else {
        tryStartSkill(p, si);
      }
      break;
    }
  }

  if (p.state === "skill") {
    updatePlayerSkill(p, dt);
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "hurt") {
    p.hurtT -= dt;
    p.vx = damp(p.vx, 0, p.grounded ? 4 : 1.2, dt);
    if (p.hurtT <= 0) p.state = "idle";
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "dash") {
    p.dashT += dt;
    p.vx = p.dashDir * (760 - 150 * clamp(p.dashT / 0.16, 0, 1));
    p.vy = 0;
    p.iframes = Math.max(p.iframes, 0.05);
    p.ghostTick += dt;
    if (p.ghostTick > 0.028) {
      p.ghostTick = 0;
      addAfterimage(snapshotPose(computePlayerPose(p)), "#ff4d64", 0.22);
    }
    if (chance(dt * 40)) {
      addParticle({
        kind: "spark", x: p.x - p.facing * rand(4, 20), y: p.y - rand(8, 50),
        vx: -p.facing * rand(80, 260), vy: rand(-40, 40),
        life: rand(0.12, 0.24), maxLife: 0.24, size: rand(0.7, 1.6),
        color: "#ff7b72", grav: 0, drag: 0.88, back: false, additive: true,
      });
    }
    if (p.lightBuffer > 0) {
      p.lightBuffer = 0;
      startDashAttack(p);
      updateScarf(p, dt);
      return;
    }
    if (p.dashT >= 0.16) {
      p.state = p.grounded ? "idle" : "idle";
      p.vx = p.dashDir * 255;
      p.dashCd = Math.max(p.dashCd, 0.23);
      if (!p.grounded) p.airDashUsed = true;
    }
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "parry") {
    p.parryT += dt;
    p.vx = damp(p.vx, 0, 12, dt);
    if (p.parryT > 0.34 && p.parryT - dt <= 0.34) {
      // last-moment sparkle, communicating the window closed
      p.parryFlash = Math.max(p.parryFlash, 0.3);
    }
    if (p.parryT >= 0.56) {
      p.state = "idle";
    }
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "charge") {
    p.chargeT += dt;
    const prevLevel = p.chargeLevel;
    p.chargeLevel = clamp(p.chargeT / 0.72, 0, 1);
    if (prevLevel < 1 && p.chargeLevel >= 1 && !p.chargeFullNotified) {
      p.chargeFullNotified = true;
      audio.chargeFull();
      screenFlash(0.035);
      addRing(p.x, p.y - 38, "#ff6a5c", 44, 0.22, 2.5, false);
      emberBurst(p.x, p.y - 30, 6, "#ffb060", 1.1, false);
    }
    if (chance(dt * (14 + p.chargeLevel * 34))) {
      addParticle({
        kind: "ember",
        x: p.x + rand(-28, 28), y: p.y - rand(6, 62),
        vx: rand(-18, 18), vy: -rand(30, 120) * (0.5 + p.chargeLevel),
        life: rand(0.25, 0.7), maxLife: 0.7,
        size: rand(1, 2.6), color: p.chargeLevel > 0.8 ? "#ffd9a0" : "#ff6d5e",
        grav: -30, drag: 0.96, back: false, additive: true,
      });
    }
    const dir = moveDir();
    if (dir) p.facing = dir;
    p.vx = damp(p.vx, dir * 95, 9, dt);
    if (p.dashQueued > 0 && p.dashCd <= 0) {
      p.dashQueued = 0;
      stopCharge(p);
      startDash(p);
      applyPlayerPhysics(p, dt);
      updateScarf(p, dt);
      return;
    }
    if (!input.down.KeyK) {
      const level = p.chargeLevel;
      stopCharge(p);
      startHeavyAttack(p, level);
      applyPlayerPhysics(p, dt);
      updateScarf(p, dt);
      return;
    }
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  if (p.state === "attack" && p.atk) {
    updatePlayerAttack(p, dt);
    applyPlayerPhysics(p, dt);
    updateScarf(p, dt);
    return;
  }

  // free state
  updatePlayerFree(p, dt);
  applyPlayerPhysics(p, dt);
  updateScarf(p, dt);
}

function updatePlayerFree(p, dt) {
  const dir = moveDir();
  if (dir) p.facing = dir;

  if (p.dashQueued > 0 && p.dashCd <= 0 && (p.grounded || !p.airDashUsed)) {
    p.dashQueued = 0;
    startDash(p);
    return;
  }
  if (p.parryQueued > 0 && p.parryCd <= 0) {
    p.parryQueued = 0;
    startParry(p);
    return;
  }
  if (p.jumpBuffer > 0) {
    if (p.grounded || p.coyote > 0) {
      doJump(p);
      return;
    } else if (p.jumpCount < 2) {
      doAirJump(p);
      return;
    }
  }
  if (p.heavyQueued > 0 || input.down.KeyK) {
    p.heavyQueued = 0;
    if (!p.grounded) {
      startAirHeavy(p);
    } else {
      startCharge(p);
    }
    return;
  }
  if (p.lightBuffer > 0) {
    p.lightBuffer = 0;
    const idx = p.lightWindow > 0 ? p.lightNext : 0;
    startLight(p, idx, !p.grounded);
    return;
  }

  const target = dir * (p.grounded ? MAX_RUN : MAX_AIR);
  if (dir !== 0) {
    p.vx = damp(p.vx, target, p.grounded ? 17 : 9, dt);
  } else {
    p.vx = damp(p.vx, 0, p.grounded ? 14 : 2.8, dt);
  }
}

function doJump(p) {
  p.vy = JUMP_VY;
  p.grounded = false;
  p.jumpCount = 1;
  p.coyote = 0;
  p.jumpBuffer = 0;
  p.jumpCutDone = false;
  p.jumpCutDone = false;
  if (p.state !== "charge") p.state = "idle";
  dustBurst(p.x, GROUND_Y, 7, -p.facing, 0.8);
  addRing(p.x, GROUND_Y - 2, "#cfc2a4", 26, 0.18, 1.5, true);
  audio.jump();
}

function doAirJump(p) {
  p.vy = AIR_JUMP_VY;
  p.jumpCount = 2;
  p.grounded = false;
  p.jumpBuffer = 0;
  p.jumpCutDone = false;
  if (p.state !== "attack") p.state = "idle";
  addRing(p.x, p.y - 10, "#ffd0a0", 34, 0.24, 2, false);
  for (let i = 0; i < 9; i++) {
    addParticle({
      kind: "spark",
      x: p.x + rand(-10, 10), y: p.y - rand(0, 8),
      vx: rand(-150, 150), vy: rand(80, 260),
      life: rand(0.12, 0.26), maxLife: 0.26, size: rand(0.8, 1.8),
      color: "#ffcf96", grav: 300, drag: 0.9, back: false, additive: true,
    });
  }
  audio.doubleJump();
}

function startDash(p) {
  const dir = moveDir() || p.facing;
  p.facing = dir;
  p.state = "dash";
  p.dashT = 0;
  p.dashDir = dir;
  p.iframes = Math.max(p.iframes, 0.15);
  p.dashCd = 0.26;
  p.ghostTick = 0;
  if (!p.grounded) p.airDashUsed = true;
  p.vx = dir * 760;
  p.vy = 0;
  p.hurtFlash = 0;
  dustBurst(p.x, p.y - 2, 6, -dir, 0.8);
  addRing(p.x - dir * 8, p.y - 28, "#ff8790", 30, 0.18, 2, false);
  addAfterimage(snapshotPose(computePlayerPose(p)), "#ff4d64", 0.24);
  audio.dash();
}

function startParry(p) {
  p.state = "parry";
  p.parryT = 0;
  p.parryCd = 0.64;
  p.vx *= 0.15;
  p.parryFlash = 0;
  addRing(p.x + p.facing * 12, p.y - 38, "#9fe8e0", 26, 0.18, 1.2, false);
}

function isParryActive(p) {
  // 290ms active window: readable, but still a deliberate read
  return p && !p.dead && p.state === "parry" && p.parryT >= 0.03 && p.parryT <= 0.32;
}

function startLight(p, index, air) {
  const defs = air ? LIGHT_AIR : LIGHT_GROUND;
  const def = defs[clamp(index, 0, 2)];
  p.state = "attack";
  p.atk = {
    def,
    t: 0,
    kind: "light",
    index: def.index,
    air: !!air,
    hasHit: false,
    hitSet: new Set(),
    swingDone: false,
    lungeDone: false,
    ghostTick: 0,
  };
  p.lightNext = (def.index + 1) % 3;
  p.lightWindow = 0.5;
  if (moveDir()) p.facing = moveDir();
  p.vx = p.facing * 35;
  p.vy = Math.min(p.vy, 0);
}

function startHeavyAttack(p, level) {
  const chargeLevel = clamp(level, 0, 1);
  const def = Object.assign({}, HEAVY_DEF, {
    chargeLevel,
    startup: lerp(0.19, 0.125, chargeLevel),
    active: 0.1,
    recovery: lerp(0.34, 0.36, chargeLevel),
    dmg: 30 + 24 * chargeLevel,
    limb: 37 + 25 * chargeLevel,
    poise: 52 + 66 * chargeLevel,
    hitstop: 0.095 + 0.035 * chargeLevel,
    shake: 4.4 + 2.6 * chargeLevel,
    kb: 290 + 120 * chargeLevel,
    launch: 280 + 80 * chargeLevel,
    r: 67 + 25 * chargeLevel,
    ox: 51 + 7 * chargeLevel,
    lunge: 260 + 80 * chargeLevel,
    aoeParts: chargeLevel > 0.55,
    slash: {
      r: 76 + 16 * chargeLevel, ox: 30 + 4 * chargeLevel, oy: 36,
      a0: -2.6, a1: 0.9, width: 24 + 10 * chargeLevel,
      life: 0.2 + 0.05 * chargeLevel,
    },
    sound: "heavy",
  });
  def.pose = "cleave";
  p.state = "attack";
  p.atk = {
    def, t: 0, kind: "heavy", index: 0, air: false,
    hasHit: false, hitSet: new Set(), swingDone: false, lungeDone: false, ghostTick: 0,
  };
  if (moveDir()) p.facing = moveDir();
  p.chargeT = 0;
  p.chargeLevel = chargeLevel;
  p.chargeFullNotified = false;
  if (chargeLevel > 0.5) {
    addRing(p.x, p.y - 34, "#ff7a62", 52 + chargeLevel * 30, 0.26, 3, false);
    emberBurst(p.x, p.y - 34, 8 + Math.round(chargeLevel * 8), "#ffb36a", 1.2, false);
  }
  audio.swing(true);
}

function startAirHeavy(p) {
  p.state = "attack";
  p.atk = {
    def: Object.assign({}, AIR_HEAVY_DEF),
    t: 0, kind: "airHeavy", index: 0, air: true,
    hasHit: false, hitSet: new Set(), swingDone: false, lungeDone: false, ghostTick: 0,
    slammed: false,
  };
  p.vy = Math.min(p.vy, 260);
  audio.swing(true);
}

function startDashAttack(p) {
  p.state = "attack";
  p.atk = {
    def: Object.assign({}, DASH_ATK_DEF),
    t: 0, kind: "dashAtk", index: 0, air: !p.grounded,
    hasHit: false, hitSet: new Set(), swingDone: false, lungeDone: false, ghostTick: 0,
  };
  p.iframes = Math.max(p.iframes, 0.08);
  p.vx = p.facing * 460;
  audio.swing(true);
}

function startCharge(p) {
  p.state = "charge";
  p.chargeT = 0;
  p.chargeLevel = 0;
  p.chargeFullNotified = false;
  p.vx *= 0.35;
  audio.chargeStart();
}

function stopCharge(p) {
  p.chargeT = 0;
  p.chargeLevel = 0;
  audio.chargeStop();
}

function endAttack(p) {
  const a = p.atk;
  if (!a) return;
  if (p.state === "attack") p.state = "idle";
  if (a.kind === "light") {
    p.lightNext = (a.index + 1) % 3;
    p.lightWindow = 0.48;
  }
  p.atk = null;
  p.vy = Math.min(p.vy, 260);
}

function updatePlayerAttack(p, dt) {
  const a = p.atk;
  const def = a.def;
  a.t += dt;
  const t = a.t;

  if (!a.swingDone && t >= def.startup) {
    a.swingDone = true;
    spawnAttackSlash(p, def);
    if (def.sound === "heavy") audio.swing(true);
    else if (def.sound === "heavyish") {
      audio.swing(false);
      audio.noiseHit(0.06, 0.11, "bandpass", 500, 1800, 0.9, 0.01);
    } else audio.swing(false);
    if (def.chargeLevel && def.chargeLevel > 0.55) {
      screenFlash(0.05 + def.chargeLevel * 0.03);
      addShake(2 + def.chargeLevel * 1.2);
    }
  }

  const activeStart = def.startup;
  const activeEnd = def.startup + def.active;

  if (t >= activeStart && t < activeEnd + 0.0001) {
    if (!a.lungeDone && a.kind !== "airHeavy") {
      a.lungeDone = true;
      p.vx = p.facing * def.lunge;
      if (!p.grounded) p.vy = Math.min(p.vy, -20);
    }
    playerAttackHits(p, a, def);
    a.ghostTick += dt;
    if (a.ghostTick > 0.038) {
      a.ghostTick = 0;
      addAfterimage(snapshotPose(computePlayerPose(p)), "#ff596c", 0.18);
    }
  }

  if (a.kind === "airHeavy") {
    // dive quickly; landing handled in physics
    if (!p.grounded) {
      p.vy = Math.min(p.vy + 4600 * dt, 1120);
    }
    if (t > activeEnd) {
      // still airborne: keep the dive
      if (p.grounded) endAttack(p);
    }
    return;
  }

  // chain / cancel windows once the active portion has begun
  if (t >= activeStart + def.active * 0.45) {
    if (p.lightBuffer > 0 && a.kind === "light") {
      p.lightBuffer = 0;
      p.atk = null;
      startLight(p, (a.index + 1) % 3, a.air && !p.grounded);
      return;
    }
    if (p.dashQueued > 0 && p.dashCd <= 0 && (p.grounded || !p.airDashUsed)) {
      p.dashQueued = 0;
      p.atk = null;
      p.state = "idle";
      startDash(p);
      return;
    }
    if (p.heavyQueued > 0 && a.hasHit) {
      p.heavyQueued = 0;
      p.atk = null;
      p.state = "idle";
      if (!p.grounded) startAirHeavy(p);
      else startCharge(p);
      return;
    }
  }
  if (t >= activeStart + def.active && a.hasHit && p.jumpBuffer > 0 && (p.grounded || p.jumpCount < 2)) {
    p.jumpBuffer = 0;
    p.atk = null;
    p.state = "idle";
    if (p.grounded) doJump(p);
    else doAirJump(p);
    return;
  }

  if (t >= activeStart + def.active) {
    p.vx = damp(p.vx, 0, p.grounded ? 7 : 1.5, dt);
  }

  if (t >= def.startup + def.active + def.recovery) {
    endAttack(p);
  }
}

function spawnAttackSlash(p, def) {
  const s = def.slash;
  if (!s) return;
  const y = p.y - s.oy;
  const x = p.x + p.facing * s.ox;
  addSlash(x, y, s.r, s.a0, s.a1, def.chargeLevel > 0.6 ? "#ffb26f" : "#ff6f7d", s.life || 0.2, s.width || 20, p.facing, def.chargeLevel > 0.6 ? 0.64 : 0.74);
  if (def.chargeLevel > 0.6) {
    addSlash(x, y, s.r * 0.74, s.a0 + 0.3, s.a1 - 0.24, "#ffe9c4", s.life * 0.65, s.width * 0.28, p.facing, 0.78);
  }
  if (def.sound === "heavy" || def.kind === "airHeavy") {
    dustBurst(p.x + p.facing * 20, p.y - 2, 4, p.facing, 0.6);
  }
}

/* ---------------- physics & actions ---------------- */
function applyPlayerPhysics(p, dt) {
  const wasGrounded = p.grounded;
  let gravity = GRAV;
  if (p.state === "skill") {
    gravity = 0;
    p.vy = 0;
  }
  if (p.state === "attack" && p.atk && p.atk.air && p.atk.kind !== "airHeavy") gravity = GRAV * 0.42;
  if (p.state === "parry" && !p.grounded) gravity = GRAV * 0.55;
  if (p.state !== "dash") {
    p.vy = Math.min(p.vy + gravity * dt, 1280);
  }
  if (!input.down.Space && p.vy < -150 && !p.jumpCutDone && !p.grounded) {
    p.vy *= 0.54;
    p.jumpCutDone = true;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  const minX = 30;
  const maxX = WORLD_W - 30;
  if (p.x < minX) {
    p.x = minX;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > maxX) {
    p.x = maxX;
    if (p.vx > 0) p.vx = 0;
  }

  if (p.y >= GROUND_Y) {
    const fallSpeed = p.vy;
    if (!wasGrounded) {
      p.y = GROUND_Y;
      p.vy = 0;
      p.grounded = true;
      p.jumpCount = 0;
      p.airDashUsed = false;
      p.coyote = 0.1;
      p.jumpCutDone = true;
      p.landSquash = clamp(fallSpeed / 1000, 0, 1) * 0.12;
      if (fallSpeed > 340) {
        dustBurst(p.x, GROUND_Y, 8, 0, clamp(fallSpeed / 900, 0.5, 1.2));
        addRing(p.x, GROUND_Y - 2, "#d7c6a5", 22 + clamp(fallSpeed * 0.02, 0, 20), 0.18, 1.5, true);
        audio.land(fallSpeed > 750);
        if (fallSpeed > 760) addShake(1.6);
      }
      if (p.state === "attack" && p.atk && p.atk.air) {
        if (p.atk.kind === "airHeavy" && !p.atk.slammed) {
          p.atk.slammed = true;
          triggerAirSlam(p);
        } else {
          endAttack(p);
        }
      }
      if (p.state === "parry") {
        // allow parry to finish on the ground
      }
    } else {
      p.y = GROUND_Y;
      p.vy = 0;
    }
  } else {
    p.grounded = false;
    if (wasGrounded) p.coyote = 0.1;
    p.coyote = Math.max(0, p.coyote - dt);
    if (!wasGrounded && p.jumpCount === 0 && p.vy > 40) p.jumpCount = 1;
  }

  if (p.grounded) {
    p.coyote = 0.1;
    p.jumpCutDone = false;
  }

  const moveSpeed = Math.abs(p.vx);
  if (p.grounded && p.state !== "dash") {
    p.runPhase += moveSpeed * dt * 0.052;
  }
  // slow residual slide while attacking
  if (p.state === "attack" && p.grounded) {
    p.vx *= Math.pow(0.15, dt);
  }
}

function triggerAirSlam(p) {
  const def = AIR_SLAM_DEF;
  const cx = p.x + p.facing * 22;
  const cy = p.y - 20;
  let hitAny = false;
  for (const e of game.enemies) {
    if (!e.alive) continue;
    const dx = e.x - cx;
    const dy = e.y - 35 - cy;
    if (Math.sqrt(dx * dx + dy * dy * 0.6) < def.r + 18) {
      hitAny = true;
      damageEnemyFromPlayer(e, {
        dmg: def.dmg, limb: def.limb, poise: def.poise,
        kb: def.kb * sgn(dx || p.facing), launch: def.launch,
        hitstop: def.hitstop, shake: def.shake, bias: def.bias,
        partBias: def.bias, aoeParts: true, charged: true, heavy: true,
        reach: def.r, sourceX: p.x,
      }, { x: e.x, y: e.y - 35 }, p);
    }
  }
  addShockwave(cx, GROUND_Y, "#ffd2a2", 150, 0.45, 7);
  addRing(cx, GROUND_Y - 8, "#fff0d0", 60, 0.28, 4, false);
  dustBurst(cx, GROUND_Y, 16, p.facing, 1.4);
  for (let i = 0; i < 10; i++) {
    addParticle({
      kind: "spark", x: cx + rand(-40, 40), y: GROUND_Y - rand(0, 8),
      vx: rand(-380, 380), vy: -rand(80, 420), life: rand(0.2, 0.5), maxLife: 0.5,
      size: rand(1, 2.4), color: "#ffd18a", grav: 900, drag: 0.9, back: false, additive: true,
    });
  }
  addDecal(cx, GROUND_Y, "scorch", 1, 1.2, "#160c0b", 7);
  addShake(hitAny ? 7 : 2.4);
  if (hitAny) {
    requestHitStop(0.11);
    screenFlash(0.055);
    audio.heavyHit();
  } else {
    audio.land(true);
  }
  endAttack(p);
}

/* ---------------- player damage ---------------- */
function damagePlayer(amount, sourceX, opts = {}) {
  const p = game.player;
  if (!p || p.dead) return false;
  amount = Math.max(1, Math.round(amount));
  if (p.state === "dash" && p.iframes > 0) {
    if (Math.abs((sourceX || p.x) - p.x) < 180) {
      addFloater("闪", p.x + p.facing * 12, p.y - 70, "#cfe9e6", 15, { vy: -36, life: 0.55 });
      sparkBurst(p.x, p.y - 38, -p.facing, 4, 0.6, "#9fe8e0");
    }
    return false;
  }
  if (isParryActive(p)) {
    parrySuccess(opts.enemy || null);
    return false;
  }
  if (p.iframes > 0) return false;

  p.hp = Math.max(0, p.hp - amount);
  p.iframes = 0.9;
  p.hurtFlash = 1;
  p.state = "hurt";
  p.hurtT = 0.27;
  p.atk = null;
  p.parryT = 0;
  if (p.chargeT > 0) stopCharge(p);
  audio.chargeStop();
  p.chargeT = 0;
  p.chargeLevel = 0;
  p.vx = sgn(p.x - (sourceX == null ? p.x - p.facing * 20 : sourceX)) * 270;
  p.vy = -190;
  p.grounded = false;
  p.jumpCount = 1;
  game.hurtVignette = 1;
  game.combo = 0;
  game.comboTimer = 0;
  game.comboPop = 0;
  game.rank = "";
  game.lastPlayerHitAt = game.time;

  addFloater(`-${Math.round(amount)}`, p.x, p.y - 78, "#ff7f76", 15, { vy: -44, life: 0.7, glow: "#ff3d3d" });
  petalBurst(p.x, p.y - 42, 7, "#c92b43");
  sparkBurst(p.x, p.y - 40, p.facing, 7, 0.9, "#ff8b70");
  requestHitStop(0.07);
  addShake(6.2);
  screenFlash(0.055);
  audio.hurt();
  if (p.hp <= 0) killPlayer();
  return true;
}

function parrySuccess(sourceEnemy) {
  const p = game.player;
  if (!p) return;
  p.parryFlash = 1;
  p.iframes = Math.max(p.iframes, 0.55);
  p.hp = Math.min(p.maxHp, p.hp + 3);
  game.combo += 1;
  game.comboTimer = 2.5;
  game.comboPop = 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  if (sourceEnemy) {
    staggerEnemy(sourceEnemy, 1.15);
    sourceEnemy.hp -= 5;
    sourceEnemy.flash = 0.16;
  }
  addFloater("弹", p.x + p.facing * 18, p.y - 98, "#fff2c2", 25, {
    vy: -24, life: 0.85, glow: "#ffcf6a", pop: true,
  });
  addFloater("+3", p.x, p.y - 68, "#b9f0c5", 12, { vy: -40, life: 0.75 });
  addRing(p.x + p.facing * 14, p.y - 40, "#ffe1a0", 58, 0.3, 4, false);
  addRing(p.x + p.facing * 14, p.y - 40, "#9ff4e5", 34, 0.24, 2, false);
  for (let i = 0; i < 22; i++) {
    const a = rand(0, TAU);
    const r = rand(10, 34);
    addParticle({
      kind: "spark",
      x: p.x + p.facing * 14 + Math.cos(a) * r,
      y: p.y - 40 + Math.sin(a) * r,
      vx: Math.cos(a) * rand(120, 420),
      vy: Math.sin(a) * rand(120, 420) - 80,
      life: rand(0.18, 0.5), maxLife: 0.5,
      size: rand(0.9, 2.2), color: chance(0.5) ? "#fff0bd" : "#9ff4e5",
      grav: 500, drag: 0.9, back: false, additive: true,
    });
  }
  screenFlash(0.075);
  addShake(3.6);
  requestHitStop(0.17);
  setSlowmo(0.34, 0.24);
  audio.parry();
}

function parryProjectile(proj) {
  const p = game.player;
  if (!p) return;
  parrySuccess(proj.owner && proj.owner.alive ? proj.owner : null);
  const dir = proj.owner && proj.owner.alive ? sgn(proj.owner.x - p.x) || p.facing : p.facing;
  game.projectiles.push({
    type: "reflect",
    x: p.x + p.facing * 22,
    y: p.y - 42,
    vx: dir * 820,
    vy: 0,
    r: 13,
    life: 1.3,
    damage: 18,
    limb: 22,
    color: "#ffe6ab",
    owner: null,
    reflectDir: dir,
    trail: [],
  });
  addShockwave(p.x, p.y - 38, "#ffe3a0", 90, 0.35, 4);
}

function killPlayer() {
  const p = game.player;
  if (!p || p.dead) return;
  p.dead = true;
  p.state = "dead";
  p.deadT = 0;
  p.hp = 0;
  game.dying = true;
  game.deathTimer = 0;
  game.combo = 0;
  game.comboTimer = 0;
  game.rank = "";
  setSlowmo(1.4, 0.34);
  requestHitStop(0.13);
  addShake(8.5);
  screenFlash(0.1);
  audio.death();
  petalBurst(p.x, p.y - 45, 18, "#b82238");
  sparkBurst(p.x, p.y - 45, -p.facing, 12, 1.2, "#ff7c6a");
  addRing(p.x, p.y - 34, "#ff5d63", 70, 0.5, 4, false);
  audio.chargeStop();
}

/* heal helper */
function healPlayer(amount, show = true) {
  const p = game.player;
  if (!p || p.dead) return;
  const before = p.hp;
  p.hp = Math.min(p.maxHp, p.hp + amount);
  const gained = Math.round(p.hp - before);
  if (gained > 0) {
    if (show) addFloater(`+${gained}`, p.x, p.y - 76, "#b8f0bd", 13, { vy: -38, life: 0.8, glow: "#5ecf7a" });
    if (show) {
      addRing(p.x, p.y - 34, "#a5e8ae", 36, 0.35, 2, false);
      for (let i = 0; i < 8; i++) {
        addParticle({
          kind: "ember", x: p.x + rand(-22, 22), y: p.y - rand(4, 56),
          vx: rand(-20, 20), vy: -rand(30, 90), life: rand(0.35, 0.9), maxLife: 0.9,
          size: rand(1, 2.4), color: "#9ff0a8", grav: -20, drag: 0.95, back: false, additive: true,
        });
      }
    }
    audio.heal();
  }
}
