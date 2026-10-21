/* ============================================================
   Enemies: segmented puppets, telegraphs, AI, limb destruction
   ============================================================ */

const ENEMY_DIMS = {
  axe: { hipY: 31, chest: 21, headLen: 10, shoulder: 8.5, arm1: 15, arm2: 16, thigh: 16.5, shin: 17.5, stance: 9, hipW: 4.6, bodyW: 20, lean: 0.1 },
  bolt: { hipY: 30, chest: 20, headLen: 9.5, shoulder: 6, arm1: 13, arm2: 14.5, thigh: 15, shin: 16, stance: 8, hipW: 4, bodyW: 12, lean: 0.02 },
  rend: { hipY: 24, chest: 17, headLen: 9, shoulder: 7, arm1: 15, arm2: 16, thigh: 14, shin: 15, stance: 10, hipW: 4.4, bodyW: 15, lean: 0.3 },
};

const ENEMY_INFO = {
  axe: {
    name: "裂斧傀",
    hp: 148, poise: 62, speed: 67, scale: 1.08,
    palette: {
      wood: "#7d5a3a", woodLight: "#b58956", dark: "#221812", armor: "#55504a",
      armorLight: "#9a9081", cloth: "#34241f", accent: "#ffab63", eye: "#ffd47c",
      rope: "#c9a978", core: "#ff7c4a",
    },
    armHp: [31, 26], legHp: [28, 23], headHp: 40,
  },
  bolt: {
    name: "弦弩傀",
    hp: 94, poise: 40, speed: 97, scale: 0.97,
    palette: {
      wood: "#5f5c51", woodLight: "#8f8b79", dark: "#1b1c22", armor: "#3f4652",
      armorLight: "#7d8a95", cloth: "#2a3140", accent: "#87ecdc", eye: "#a6fff2",
      rope: "#a8a08a", core: "#5fe3d0",
    },
    armHp: [22, 18], legHp: [20, 16], headHp: 31,
  },
  rend: {
    name: "疾爪傀",
    hp: 82, poise: 32, speed: 152, scale: 0.88,
    palette: {
      wood: "#6b4a44", woodLight: "#a47a6a", dark: "#1f1518", armor: "#493b36",
      armorLight: "#8d7666", cloth: "#35262b", accent: "#ff8a72", eye: "#ffb491",
      rope: "#bfa07d", core: "#ff6b57",
    },
    armHp: [18, 15], legHp: [19, 15], headHp: 25,
  },
};

const ENEMY_ATTACKS = {
  chop: { windup: 0.6, active: 0.2, recover: 0.62, dmg: 15, reach: 58, r: 52, yOff: 31 },
  leap: { windup: 0.62, active: 0.9, recover: 0.72, dmg: 18, radius: 84 },
  swipe: { windup: 0.46, active: 0.14, recover: 0.48, dmg: 9, reach: 52, r: 44, yOff: 30 },
  headbutt: { windup: 0.5, active: 0.52, recover: 0.72, dmg: 12, reach: 20, r: 40, yOff: 26 },
  aim: { windup: 0.72, active: 0.2, recover: 0.56, dmg: 9 },
  kick: { windup: 0.38, active: 0.16, recover: 0.5, dmg: 9, reach: 48, r: 43, yOff: 28 },
  pounce: { windup: 0.43, active: 0.8, recover: 0.5, dmg: 10, reach: 20, r: 40, yOff: 28 },
  bite: { windup: 0.38, active: 0.24, recover: 0.45, dmg: 8, reach: 34, r: 39, yOff: 26 },
};

function makeEnemyParts(type, scale, elite) {
  const info = ENEMY_INFO[type];
  const hpMul = (elite ? 1.25 : 1) * (1 + Math.max(0, getWaveNumber() - 1) * 0.045);
  const mk = (id, hp) => ({ id, hp: hp * hpMul, maxHp: hp * hpMul, broken: false });
  return {
    armL0: mk("armL0", info.armHp[0]),
    armL1: mk("armL1", info.armHp[1]),
    armR0: mk("armR0", info.armHp[0]),
    armR1: mk("armR1", info.armHp[1]),
    legL0: mk("legL0", info.legHp[0]),
    legL1: mk("legL1", info.legHp[1]),
    legR0: mk("legR0", info.legHp[0]),
    legR1: mk("legR1", info.legHp[1]),
    head: mk("head", info.headHp),
  };
}

function getWaveNumber() {
  return Math.max(1, game.wave || 1);
}

function spawnEnemy(type, x, opts = {}) {
  const info = ENEMY_INFO[type];
  if (!info) return null;
  const elite = !!opts.elite;
  const scale = info.scale * (elite ? 1.16 : 1);
  const hpMul = (1 + Math.max(0, getWaveNumber() - 1) * 0.135) * (elite ? 1.45 : 1);
  const e = {
    id: ++game.enemyId,
    type,
    def: info,
    palette: info.palette,
    x: clamp(x, 70, WORLD_W - 70),
    y: GROUND_Y,
    vx: 0,
    vy: 0,
    facing: -1,
    grounded: true,
    scale,
    elite,
    hp: info.hp * hpMul,
    maxHp: info.hp * hpMul,
    poise: info.poise * (elite ? 1.35 : 1),
    maxPoise: info.poise * (elite ? 1.35 : 1),
    parts: makeEnemyParts(type, scale, elite),
    alive: true,
    state: "spawn",
    stateT: 0,
    spawnT: 0.55,
    invuln: 0.7,
    stun: 0,
    hurtT: 0,
    flash: 0,
    animTime: rand(0, 10),
    walkPhase: rand(0, TAU),
    cooldown: rand(0.5, 1.2),
    atk: null,
    tele: null,
    targetX: x,
    hasToken: false,
    barTimer: 2.5,
    deathT: 0,
    landLock: 0,
    speedMul: 1,
    arms: 2,
    legsCount: 2,
    canShoot: type === "bolt",
    armLok: true,
    armRok: true,
    legLok: true,
    legRok: true,
    hitFlashT: 0,
    lastCrackle: 0,
    airHitBounce: false,
    inAirFromHit: false,
  };
  e.parts.head.maxHp = info.headHp * (elite ? 1.35 : 1);
  e.parts.head.hp = e.parts.head.maxHp;
  refreshEnemyCaps(e);
  e.facing = game.player ? sgn(game.player.x - e.x) || -1 : -1;
  e.pose = computeEnemyPose(e);
  game.enemies.push(e);

  // entrance effect
  addRing(e.x, GROUND_Y - 2, "#ff5d6c", 48, 0.5, 3, false);
  addRing(e.x, GROUND_Y - 24, e.palette.accent, 32, 0.4, 1.5, false);
  smokeBurst(e.x, GROUND_Y - 10, 8, "#1a1218", 0.9);
  emberBurst(e.x, GROUND_Y - 16, 14, e.palette.accent, 0.8, true);
  return e;
}

function refreshEnemyCaps(e) {
  const P = e.parts;
  e.armLok = !P.armL0.broken && !P.armL1.broken;
  e.armRok = !P.armR0.broken && !P.armR1.broken;
  e.legLok = !P.legL0.broken && !P.legL1.broken;
  e.legRok = !P.legR0.broken && !P.legR1.broken;
  e.arms = (e.armLok ? 1 : 0) + (e.armRok ? 1 : 0);
  e.legsCount = (e.legLok ? 1 : 0) + (e.legRok ? 1 : 0);
  e.speedMul = e.legsCount === 2 ? 1 : e.legsCount === 1 ? 0.52 : 0.16;
  e.canShoot = e.type === "bolt" && e.armRok;
}

function acquireToken(e) {
  if (e.hasToken) return true;
  if (game.attackerCount < 2) {
    e.hasToken = true;
    game.attackerCount++;
    return true;
  }
  return false;
}

function releaseToken(e) {
  if (!e.hasToken) return;
  e.hasToken = false;
  game.attackerCount = Math.max(0, game.attackerCount - 1);
}

function staggerEnemy(e, time) {
  if (!e || !e.alive) return;
  if (e.state === "stagger" && e.stun > time) return;
  e.stun = Math.max(e.stun, time);
  e.state = "stagger";
  e.stateT = time;
  e.poise = 0;
  e.vx *= 0.25;
  e.atk = null;
  e.tele = null;
  releaseToken(e);
  if (e.vy < 0) e.vy *= 0.4;
}

/* ============================================================
   Enemy pose + skeleton
   ============================================================ */
function computeEnemyPose(e) {
  const s = e.scale;
  const B = ENEMY_DIMS[e.type];
  const P = e.parts;
  const pal = e.palette;
  const bothLegs = !e.legLok && !e.legRok;
  const oneLeg = e.legsCount === 1;

  let crouch = 0;
  if (bothLegs) crouch = B.hipY * 0.62 * s;
  else if (oneLeg) crouch = B.hipY * 0.16 * s;
  let lean = B.lean;
  let headTilt = 0;
  let footL = { x: -B.stance * s, y: 0 };
  let footR = { x: B.stance * s, y: 0 };
  let handR = { x: 15 * s, y: -28 * s };
  let handL = { x: 4 * s, y: -29 * s };
  let axeAngle = -0.8;
  let bowAngle = 0;

  const p = game.player;
  const moving = e.grounded && Math.abs(e.vx) > 16 && (e.state === "idle" || e.state === "recover" || e.state === "spawn");
  if (moving) {
    const step = Math.sin(e.walkPhase);
    footL = { x: (-B.stance + step * 10) * s, y: -Math.max(0, step) * 5 * s };
    footR = { x: (B.stance - step * 10) * s, y: -Math.max(0, -step) * 5 * s };
  }
  if (!e.grounded && e.state !== "dead") {
    footL = { x: -8 * s, y: -10 * s };
    footR = { x: 8 * s, y: -7 * s };
  }

  // baseline hand poses per type
  if (e.type === "axe") {
    handR = { x: 15 * s, y: -28 * s };
    handL = { x: 4 * s, y: -29 * s };
    axeAngle = -0.82;
  } else if (e.type === "bolt") {
    handR = { x: 17 * s, y: -31 * s };
    handL = { x: 6 * s, y: -30 * s };
  } else if (e.type === "rend") {
    handR = { x: 15 * s, y: -20 * s };
    handL = { x: 4 * s, y: -19 * s };
  }

  if (!e.alive) {
    const k = clamp(e.deathT / 0.55, 0, 1);
    lean = lerp(B.lean, -1.35, easeOutCubic(k));
    crouch = lerp(crouch, B.hipY * 0.55 * s, easeOutCubic(k));
    headTilt = -0.18 * k;
    handR = { x: lerp(15 * s, 19 * s, k), y: lerp(-28 * s, -4 * s, k) };
    handL = { x: lerp(4 * s, -15 * s, k), y: lerp(-29 * s, -3 * s, k) };
    footR = { x: 9 * s, y: 0 };
    footL = { x: -15 * s, y: 0 };
    axeAngle = lerp(axeAngle, 1.55, k);
  } else if (e.spawnT > 0) {
    lean = 0.34;
    crouch = B.hipY * 0.3 * s;
    headTilt = 0.24;
    handR = { x: 10 * s, y: -18 * s };
    handL = { x: -2 * s, y: -18 * s };
  } else if (e.state === "stagger" || e.stun > 0) {
    lean = -0.5;
    crouch = Math.max(crouch, 5 * s);
    headTilt = -0.22;
    handR = { x: 4 * s, y: -36 * s };
    handL = { x: -9 * s, y: -33 * s };
    footL = { x: -14 * s, y: 0 };
    footR = { x: 12 * s, y: 0 };
    axeAngle = -2.35;
  } else if (e.state === "windup" && e.atk) {
    const kind = e.atk.kind;
    if (kind === "chop") {
      lean = -0.2;
      crouch = 5 * s;
      headTilt = -0.05;
      handR = { x: -4 * s, y: -48 * s };
      handL = { x: 4 * s, y: -44 * s };
      axeAngle = -2.08;
      footL = { x: -13 * s, y: 0 };
      footR = { x: 13 * s, y: 0 };
    } else if (kind === "leap") {
      lean = -0.16;
      crouch = 13 * s;
      handR = { x: -1 * s, y: -35 * s };
      handL = { x: 6 * s, y: -34 * s };
      axeAngle = -2.45;
      footL = { x: -13 * s, y: 0 };
      footR = { x: 12 * s, y: 0 };
    } else if (kind === "headbutt") {
      lean = 0.3;
      crouch = 7 * s;
      headTilt = 0.17;
      handR = { x: -8 * s, y: -24 * s };
      handL = { x: -14 * s, y: -22 * s };
      footL = { x: -14 * s, y: 0 };
      footR = { x: 13 * s, y: 0 };
    } else if (kind === "swipe") {
      lean = 0.16;
      crouch = 4 * s;
      handR = { x: 2 * s, y: -31 * s };
      handL = { x: 10 * s, y: -24 * s };
      footL = { x: -12 * s, y: 0 };
      footR = { x: 12 * s, y: 0 };
    } else if (kind === "aim") {
      lean = 0.03;
      crouch = 2 * s;
      handR = { x: 19 * s, y: -32 * s };
      handL = { x: 9 * s, y: -30 * s };
      footL = { x: -11 * s, y: 0 };
      footR = { x: 11 * s, y: 0 };
    } else if (kind === "kick") {
      lean = -0.12;
      crouch = 9 * s;
      handR = { x: 8 * s, y: -33 * s };
      handL = { x: -2 * s, y: -30 * s };
      footL = { x: -14 * s, y: 0 };
      footR = { x: 9 * s, y: 0 };
    } else if (kind === "pounce") {
      lean = 0.38;
      crouch = 14 * s;
      headTilt = 0.1;
      handR = { x: 2 * s, y: -18 * s };
      handL = { x: -8 * s, y: -17 * s };
      footL = { x: -14 * s, y: 0 };
      footR = { x: 12 * s, y: 0 };
    } else if (kind === "bite") {
      lean = 0.36;
      crouch = 10 * s;
      headTilt = 0.2;
      handR = { x: -6 * s, y: -20 * s };
      handL = { x: -12 * s, y: -18 * s };
    }
  } else if (e.state === "leap") {
    lean = 0.42;
    crouch = 0;
    footL = { x: -6 * s, y: -4 * s };
    footR = { x: 9 * s, y: -12 * s };
    if (e.atk && e.atk.kind === "pounce") {
      handR = { x: 18 * s, y: -23 * s };
      handL = { x: 8 * s, y: -22 * s };
      lean = 0.55;
      headTilt = 0.15;
    } else {
      handR = { x: 14 * s, y: -41 * s };
      handL = { x: 4 * s, y: -38 * s };
      axeAngle = -1.35;
    }
  } else if (e.state === "attack" && e.atk) {
    const kind = e.atk.kind;
    if (kind === "chop") {
      lean = 0.46;
      crouch = 4 * s;
      headTilt = 0.1;
      handR = { x: 22 * s, y: -29 * s };
      handL = { x: 13 * s, y: -31 * s };
      axeAngle = 1.0;
      footL = { x: -15 * s, y: 0 };
      footR = { x: 15 * s, y: 0 };
    } else if (kind === "swipe") {
      lean = 0.38;
      crouch = 4 * s;
      handR = { x: 24 * s, y: -24 * s };
      handL = { x: 14 * s, y: -26 * s };
      footL = { x: -15 * s, y: 0 };
      footR = { x: 15 * s, y: 0 };
    } else if (kind === "headbutt") {
      lean = 0.55;
      crouch = 5 * s;
      headTilt = 0.2;
      handR = { x: -10 * s, y: -20 * s };
      handL = { x: -16 * s, y: -18 * s };
      footL = { x: -17 * s, y: 0 };
      footR = { x: 15 * s, y: 0 };
    } else if (kind === "aim") {
      lean = -0.16;
      crouch = 2 * s;
      handR = { x: 16 * s, y: -35 * s };
      handL = { x: 7 * s, y: -31 * s };
    } else if (kind === "kick") {
      lean = 0.42;
      crouch = 3 * s;
      handR = { x: 1 * s, y: -32 * s };
      handL = { x: -8 * s, y: -29 * s };
      footL = { x: -14 * s, y: 0 };
      footR = { x: 25 * s, y: -16 * s };
    } else if (kind === "pounce") {
      lean = 0.55;
      headTilt = 0.16;
      handR = { x: 20 * s, y: -22 * s };
      handL = { x: 10 * s, y: -21 * s };
    } else if (kind === "bite") {
      lean = 0.5;
      headTilt = 0.24;
      handR = { x: -7 * s, y: -18 * s };
      handL = { x: -13 * s, y: -16 * s };
    }
  } else if (e.state === "recover") {
    lean = 0.18;
    crouch = Math.max(crouch, 3 * s);
    handR = { x: 12 * s, y: -27 * s };
    handL = { x: 2 * s, y: -26 * s };
    axeAngle = 0.9;
  }

  // impact flinch (distinct from poise stagger)
  if (e.alive && e.hurtT > 0 && e.state !== "stagger") {
    const k = clamp(e.hurtT / 0.17, 0, 1);
    lean -= 0.24 * k;
    headTilt -= 0.13 * k;
    crouch += 2.2 * s * k;
    handR = { x: handR.x - 5.5 * s * k, y: handR.y - 2.2 * s * k };
    handL = { x: handL.x - 5.0 * s * k, y: handL.y - 1.4 * s * k };
  }

  // broken legs force the body down and tilt
  if (bothLegs) {
    lean += 0.22;
    headTilt += 0.06;
  } else if (oneLeg) {
    lean += 0.08;
  }
  if (!e.grounded && e.state !== "leap" && e.alive) {
    lean += clamp(e.vy * 0.00025, -0.18, 0.3);
    footL = { x: -9 * s, y: -7 * s };
    footR = { x: 10 * s, y: -11 * s };
  }

  const hipY = Math.max(8, B.hipY * s - crouch);
  const hip = { x: 0, y: -hipY };
  const chest = { x: hip.x + Math.sin(lean) * B.chest * s, y: hip.y - Math.cos(lean) * B.chest * s };
  const head = {
    x: chest.x + Math.sin(lean * 0.6 + headTilt) * B.headLen * s + 0.8 * s,
    y: chest.y - Math.cos(lean * 0.6 + headTilt) * B.headLen * s,
  };
  const shoulderL = { x: chest.x - B.shoulder * s * Math.cos(lean), y: chest.y - B.shoulder * s * Math.sin(lean) - 1 * s };
  const shoulderR = { x: chest.x + B.shoulder * s * Math.cos(lean), y: chest.y + B.shoulder * s * Math.sin(lean) - 1 * s };

  const elbowL = twoBone(shoulderL, handL, B.arm1 * s, B.arm2 * s, 0.9);
  const elbowR = twoBone(shoulderR, handR, B.arm1 * s, B.arm2 * s, 0.9);

  const hipL = { x: hip.x - B.hipW * s, y: hip.y + 1 };
  const hipR = { x: hip.x + B.hipW * s, y: hip.y + 1 };
  const kneeL = twoBone(hipL, footL, B.thigh * s, B.shin * s, -1);
  const kneeR = twoBone(hipR, footR, B.thigh * s, B.shin * s, -1);

  // crossbow aim orientation
  if (e.type === "bolt" && p) {
    const handWorld = { x: e.x + e.facing * handR.x, y: e.y + handR.y };
    const tx = p.x;
    const ty = p.y - 35;
    bowAngle = Math.atan2(ty - handWorld.y, (tx - handWorld.x) * e.facing);
    if (Math.abs(bowAngle) > 0.85) bowAngle = clamp(bowAngle, -0.85, 0.85);
  }

  return {
    s,
    type: e.type,
    x: e.x, y: e.y, facing: e.facing,
    hip, chest, head, headTilt,
    shoulderL, shoulderR, elbowL, elbowR, handL, handR,
    hipL, hipR, kneeL, kneeR, footL, footR,
    axeAngle, bowAngle, lean, crouch,
    bodyW: B.bodyW * s,
  };
}

function localToWorld(e, pt) {
  return { x: e.x + e.facing * pt.x, y: e.y + pt.y };
}

function getEnemySegments(e) {
  const pose = e.pose;
  if (!pose) return [];
  const P = e.parts;
  const segs = [];
  const w = (pt) => localToWorld(e, pt);
  if (!P.armL0.broken) segs.push({ id: "armL0", a: w(pose.shoulderL), b: w(pose.elbowL), r: 5.2 * e.scale, zone: "arm" });
  if (!P.armL0.broken && !P.armL1.broken) segs.push({ id: "armL1", a: w(pose.elbowL), b: w(pose.handL), r: 4.6 * e.scale, zone: "arm" });
  if (!P.armR0.broken) segs.push({ id: "armR0", a: w(pose.shoulderR), b: w(pose.elbowR), r: 5.4 * e.scale, zone: "arm" });
  if (!P.armR0.broken && !P.armR1.broken) segs.push({ id: "armR1", a: w(pose.elbowR), b: w(pose.handR), r: 4.8 * e.scale, zone: "arm" });
  if (!P.legL0.broken) segs.push({ id: "legL0", a: w(pose.hipL), b: w(pose.kneeL), r: 5.2 * e.scale, zone: "leg" });
  if (!P.legL0.broken && !P.legL1.broken) segs.push({ id: "legL1", a: w(pose.kneeL), b: w(pose.footL), r: 4.8 * e.scale, zone: "leg" });
  if (!P.legR0.broken) segs.push({ id: "legR0", a: w(pose.hipR), b: w(pose.kneeR), r: 5.2 * e.scale, zone: "leg" });
  if (!P.legR0.broken && !P.legR1.broken) segs.push({ id: "legR1", a: w(pose.kneeR), b: w(pose.footR), r: 4.8 * e.scale, zone: "leg" });
  if (!P.head.broken) segs.push({ id: "head", a: w(pose.head), b: w(pose.head), r: 9 * e.scale, zone: "head" });
  for (const s of segs) {
    s.mid = { x: (s.a.x + s.b.x) / 2, y: (s.a.y + s.b.y) / 2 };
  }
  return segs;
}

function getEnemyBody(e) {
  return { x: e.x, y: e.y - 34 * e.scale, r: 20 * e.scale };
}

/* ============================================================
   Player -> enemy damage & limb breaks
   ============================================================ */
function playerAttackHits(p, a, def) {
  if (!def) return;
  const hb = {
    x: p.x + p.facing * def.ox,
    y: p.y - def.oy,
    r: def.r,
  };
  for (const e of game.enemies) {
    if (!e.alive || a.hitSet.has(e.id) || e.invuln > 0 || e.spawnT > 0) continue;
    const segs = getEnemySegments(e);
    const body = getEnemyBody(e);
    let best = null;
    let bestScore = 1e9;
    const bias = def.bias || { arm: 1, leg: 1, head: 1 };
    for (const seg of segs) {
      const d = seg.a === seg.b
        ? Math.hypot(hb.x - seg.a.x, hb.y - seg.a.y)
        : distPointSeg(hb.x, hb.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      if (d > hb.r + seg.r + 2) continue;
      const weight = bias[seg.zone] || 1;
      const score = d * weight + rand(0, 5);
      if (score < bestScore) {
        bestScore = score;
        best = { seg, d };
      }
    }
    const bodyDist = Math.hypot(hb.x - body.x, hb.y - body.y);
    const bodyHit = bodyDist < hb.r + body.r;
    if (!best && !bodyHit) continue;

    a.hitSet.add(e.id);
    a.hasHit = true;
    let contact;
    let targetPartId = null;
    if (best) {
      const seg = best.seg;
      if (seg.a === seg.b) contact = { x: seg.a.x, y: seg.a.y };
      else contact = closestPointOnSegment(hb.x, hb.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      targetPartId = seg.id;
    } else {
      contact = { x: lerp(hb.x, body.x, 0.65), y: lerp(hb.y, body.y, 0.65) };
    }
    damageEnemyFromPlayer(e, {
      dmg: def.dmg,
      limb: def.limb,
      poise: def.poise,
      kb: def.kb,
      launch: def.launch,
      hitstop: def.hitstop,
      shake: def.shake,
      heavy: def.sound === "heavy" || def.kind === "heavy" || def.kind === "airHeavy" || def.kind === "dashAtk",
      charged: !!def.charged || (def.chargeLevel || 0) > 0.55,
      aoeParts: !!def.aoeParts,
      bias: def.bias,
      reach: def.r,
      sourceX: p.x,
      playerFacing: p.facing,
    }, contact, p, targetPartId);
  }
  // cleave incoming bolts out of the air
  const hb2 = { x: p.x + p.facing * def.ox, y: p.y - def.oy, r: def.r + 8 };
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const pr = game.projectiles[i];
    if (pr.type !== "bolt") continue;
    if (Math.hypot(pr.x - hb2.x, pr.y - hb2.y) < hb2.r + pr.r) {
      sparkBurst(pr.x, pr.y, p.facing, 6, 0.7, "#9ff4e5");
      addRing(pr.x, pr.y, "#9ff4e5", 18, 0.16, 1.4, false);
      game.projectiles.splice(i, 1);
      audio.deflect();
    }
  }
}

function closestPointOnSegment(px, py, ax, ay, bx, by) {
  const vx = bx - ax;
  const vy = by - ay;
  const len2 = vx * vx + vy * vy || 1;
  const t = clamp(((px - ax) * vx + (py - ay) * vy) / len2, 0, 1);
  return { x: ax + vx * t, y: ay + vy * t };
}

function damageEnemyFromPlayer(e, hit, contact, p, targetPartId) {
  if (!e.alive) return;
  const pal = e.palette;
  const dir = sgn(e.x - p.x) || p.facing;
  let dmg = hit.dmg;
  if (targetPartId === "head") dmg *= 1.32;
  dmg *= e.elite ? 0.92 : 1;

  e.hp -= dmg;
  e.hurtT = Math.max(e.hurtT, 0.17);
  e.flash = 0.16;
  e.barTimer = 5;
  e.poise -= hit.poise;
  if (!e.grounded) e.inAirFromHit = true;

  const heavy = !!hit.heavy;
  e.vx += dir * hit.kb * (e.elite ? 0.8 : 1) * (e.grounded ? 1 : 0.7);
  if (hit.launch) {
    if (hit.launch > 0) {
      e.vy = Math.min(e.vy, -hit.launch);
      e.grounded = false;
    } else {
      e.vy = Math.max(e.vy, -hit.launch);
      e.grounded = false;
    }
  } else if (e.grounded) {
    e.vx += dir * 20;
  }

  if (!hit.aoeParts && !targetPartId) {
    targetPartId = chooseNearestPartId(e, contact, hit.bias || { arm: 1, leg: 1, head: 1 });
  }

  // part damage
  let brokeSomething = false;
  let brokeHead = false;
  if (hit.aoeParts) {
    const segs = getEnemySegments(e);
    for (const seg of segs) {
      const d = seg.a === seg.b
        ? Math.hypot(contact.x - seg.a.x, contact.y - seg.a.y)
        : distPointSeg(contact.x, contact.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
      if (d <= hit.reach + 46) {
        const part = e.parts[seg.id];
        if (!part || part.broken) continue;
        part.hp -= hit.limb * 1.05;
        e.flash = 0.2;
        if (part.hp <= 0) {
          breakPart(e, seg.id, dir);
          brokeSomething = true;
          if (!e.alive) { brokeHead = true; break; }
        }
      }
    }
  } else if (targetPartId) {
    const part = e.parts[targetPartId];
    if (part && !part.broken) {
      part.hp -= hit.limb;
      if (part.hp <= 0) {
        breakPart(e, targetPartId, dir);
        brokeSomething = true;
        if (!e.alive) brokeHead = true;
      } else if (part.hp < part.maxHp * 0.5) {
        // crackle once in a while
        if (chance(0.55)) {
          cracklePart(e, targetPartId);
        }
      }
    }
  }

  // poise break
  if (e.alive && e.poise <= 0 && e.stun <= 0 && !brokeSomething) {
    staggerEnemy(e, heavy ? 0.72 : 0.52);
    if (game.time - (game.lastPoiseLabelAt || -99) > 0.38) {
      game.lastPoiseLabelAt = game.time;
      addFloater("破", e.x + rand(-6, 6), e.y - 88 * e.scale, "#ffdc9a", 11, { vy: -30, life: 0.5 });
    }
  }

  // impact effects
  const power = clamp(hit.dmg / 22, 0.55, 2.2);
  sparkBurst(contact.x, contact.y, dir, heavy ? 15 : 7, power, chance(0.55) ? "#ffc36d" : "#ff8a6a");
  if (chance(0.5)) metalBurst(contact.x, contact.y, dir, heavy ? 4 : 1);
  if (chance(0.35)) woodBurst(contact.x, contact.y, dir, heavy ? 4 : 1, 0.7, pal.wood);
  addRing(contact.x, contact.y, "#ffd9a6", 13 + power * 8, 0.13, 1.1, false);

  game.hitCount++;
  game.combo += 1;
  game.comboTimer = 2.4;
  game.comboPop = 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  updateRank();

  const dmgColor = targetPartId === "head" ? "#ffd57e" : heavy ? "#ffe8b8" : "#fff1d8";
  const numCount = game.floaters.reduce((n, f) => n + (/^[0-9]+$/.test(f.text) ? 1 : 0), 0);
  if (numCount < 6) {
    addFloater(`${Math.round(dmg)}`, contact.x + rand(-18, 18), contact.y - rand(10, 28), dmgColor, heavy ? 13 : 10, {
      vy: -46, life: 0.38, glow: heavy ? "#ff8d58" : null,
    });
  }

  const st = hit.hitstop + (brokeSomething ? 0.02 : 0);
  requestHitStop(st);
  addShake(hit.shake);
  if (heavy) audio.heavyHit();
  else audio.hit(power);
  if (brokeSomething && !brokeHead) audio.breakLimb();
  if (e.grounded && heavy) addShake(hit.shake * 0.2);

  if (e.hp <= 0 && e.alive) {
    killEnemy(e, { cause: brokeHead ? "head" : "hp", dir });
  }
  if (brokeSomething) updateRank();
}

function chooseNearestPartId(e, contact, bias) {
  const segs = getEnemySegments(e);
  let best = null;
  let bestScore = 1e9;
  for (const seg of segs) {
    const d = seg.a === seg.b
      ? Math.hypot(contact.x - seg.a.x, contact.y - seg.a.y)
      : distPointSeg(contact.x, contact.y, seg.a.x, seg.a.y, seg.b.x, seg.b.y);
    if (d > 42) continue;
    const weight = bias[seg.zone] || 1;
    const score = d * weight + rand(0, 4);
    if (score < bestScore) {
      bestScore = score;
      best = seg.id;
    }
  }
  return best;
}

function cracklePart(e, partId) {
  const segs = getEnemySegments(e);
  const seg = segs.find((s) => s.id === partId);
  if (!seg) return;
  for (let i = 0; i < 3; i++) {
    addParticle({
      kind: "spark",
      x: seg.mid.x + rand(-5, 5), y: seg.mid.y + rand(-5, 5),
      vx: rand(-60, 60), vy: rand(-80, 20),
      life: rand(0.1, 0.25), maxLife: 0.25,
      size: rand(0.6, 1.3), color: e.palette.accent,
      grav: 300, drag: 0.9, additive: true,
    });
  }
  addParticle({
    kind: "smoke", x: seg.mid.x, y: seg.mid.y,
    vx: rand(-10, 10), vy: rand(-28, -10),
    life: rand(0.35, 0.6), maxLife: 0.6,
    size: rand(4, 8), color: "#161116", grav: -15, drag: 0.95, back: true,
  });
}

/* ============================================================
   Break a limb / kill
   ============================================================ */
const PART_NAMES = {
  armL0: "左臂", armL1: "左腕", armR0: "右臂", armR1: "右腕",
  legL0: "左腿", legL1: "左胫", legR0: "右腿", legR1: "右胫",
  head: "首级",
};

function breakPart(e, partId, dir) {
  if (!e.alive) return;
  const part = e.parts[partId];
  if (!part || part.broken) return;
  const pose = e.pose || computeEnemyPose(e);
  const pal = e.palette;
  const s = e.scale;
  const w = (pt) => localToWorld(e, pt);
  const partName = PART_NAMES[partId] || "肢";
  const isHead = partId === "head";
  const isArm = partId.startsWith("arm");
  const isLeg = partId.startsWith("leg");
  const side = partId.includes("R") ? "R" : "L";
  const upper = partId.endsWith("0");

  part.broken = true;

  // auto-sever the child segment if the upper part is destroyed
  let childBroken = false;
  if (upper) {
    const childId = partId.slice(0, -1) + "1";
    const child = e.parts[childId];
    if (child && !child.broken) {
      child.broken = true;
      childBroken = true;
    }
  }

  game.limbBreakCount++;

  // spawn debris for this limb piece
  const pieces = [];
  if (isHead) {
    pieces.push({
      kind: "head",
      x: w(pose.head).x, y: w(pose.head).y,
      weapon: null, len: 11 * s,
    });
  } else if (isArm) {
    const sh = side === "R" ? pose.shoulderR : pose.shoulderL;
    const el = side === "R" ? pose.elbowR : pose.elbowL;
    const hd = side === "R" ? pose.handR : pose.handL;
    if (upper) {
      const a = w(sh);
      const b = w(el);
      pieces.push({
        kind: "armUpper", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        len: 20 * s,
      });
      if (childBroken) {
        const c = w(hd);
        pieces.push({
          kind: "armLower", x: (b.x + c.x) / 2, y: (b.y + c.y) / 2,
          len: 19 * s,
          weapon: weaponForArm(e, side),
        });
      }
    } else {
      const a = w(el);
      const b = w(hd);
      pieces.push({
        kind: "armLower", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        len: 19 * s,
        weapon: weaponForArm(e, side),
      });
    }
  } else if (isLeg) {
    const hipP = side === "R" ? pose.hipR : pose.hipL;
    const kneeP = side === "R" ? pose.kneeR : pose.kneeL;
    const footP = side === "R" ? pose.footR : pose.footL;
    if (upper) {
      const a = w(hipP);
      const b = w(kneeP);
      pieces.push({
        kind: "legUpper", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        len: 19 * s,
      });
      if (childBroken) {
        const c = w(footP);
        pieces.push({
          kind: "legLower", x: (b.x + c.x) / 2, y: (b.y + c.y) / 2,
          len: 18 * s,
        });
      }
    } else {
      const a = w(kneeP);
      const b = w(footP);
      pieces.push({
        kind: "legLower", x: (a.x + b.x) / 2, y: (a.y + b.y) / 2,
        len: 18 * s,
      });
    }
  }

  for (const pc of pieces) {
    spawnDebris({
      kind: pc.kind,
      x: pc.x + rand(-4, 4),
      y: pc.y + rand(-4, 4),
      vx: dir * rand(140, 380) + rand(-70, 70),
      vy: -rand(180, 430),
      rot: rand(0, TAU),
      vr: rand(-11, 11),
      len: pc.len,
      width: (isArm ? 6.4 : 7.4) * s,
      color: pal.wood,
      dark: pal.dark,
      accent: pal.accent,
      weapon: pc.weapon || null,
      scale: s,
      life: rand(4, 5.5),
    });
  }

  // fx
  const mid = pieces.length
    ? { x: pieces[0].x, y: pieces[0].y }
    : { x: e.x, y: e.y - 40 * s };
  woodBurst(mid.x, mid.y, dir, isHead ? 12 : 14, 1.2, pal.wood);
  metalBurst(mid.x, mid.y, dir, 6);
  sparkBurst(mid.x, mid.y, dir, 10, 1.15, pal.accent);
  smokeBurst(mid.x, mid.y, 4, "#191216", 0.9);
  addRing(mid.x, mid.y, pal.accent, 28, 0.24, 2, false);
  addShockwave(e.x, GROUND_Y, "#c7a17a", 80, 0.35, 3);
  addShake(isHead ? 7 : 4.2);
  requestHitStop(isHead ? 0.12 : 0.045);
  screenFlash(isHead ? 0.1 : 0.025);
  audio.breakLimb();
  if (isHead) audio.kill();

  const label = isHead ? "斩首" : isArm ? "断臂" : "断腿";
  if (isHead || game.time - (game.lastLimbLabelAt || -99) > 0.42) {
    if (!isHead) game.lastLimbLabelAt = game.time;
    addFloater(label, e.x + rand(-8, 8), e.y - (isHead ? 94 : 82) * s, isHead ? "#ffd88a" : "#ffb08a", isHead ? 19 : 15, {
      vy: -36, life: 0.68, glow: isHead ? "#ff8a4e" : "#ff6a5c", pop: true,
    });
  }
  e.hp -= isHead ? 0 : 4;
  e.barTimer = 5;
  e.flash = 0.25;
  refreshEnemyCaps(e);

  if (isHead) {
    if (e.hp <= 0) e.hp = 0;
    killEnemy(e, { cause: "head", dir, headless: true });
    return;
  }
  if (e.hp <= 0) {
    killEnemy(e, { cause: "hp", dir });
    return;
  }
  staggerEnemy(e, 0.72);
  game.combo += 1;
  game.comboTimer = 2.4;
  game.comboPop = 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  updateRank();
}

function weaponForArm(e, side) {
  if (side === "R") {
    if (e.type === "axe") return "axe";
    if (e.type === "bolt") return "crossbow";
    if (e.type === "rend") return "claw";
  }
  if (e.type === "rend") return "claw";
  return null;
}

function killEnemy(e, opts = {}) {
  if (!e.alive) return;
  e.alive = false;
  e.state = "dead";
  e.deathT = 0;
  e.hp = 0;
  e.tele = null;
  e.atk = null;
  releaseToken(e);
  game.kills++;
  game.combo += opts.cause === "head" ? 2 : 1;
  game.comboTimer = 2.5;
  game.comboPop = 1;
  game.maxCombo = Math.max(game.maxCombo, game.combo);
  updateRank();
  healPlayer(opts.cause === "head" ? 5 : 3, true);
  if (opts.cause !== "head") {
    addFloater("斩", e.x, e.y - 88 * e.scale, "#ffedad", 20, {
      vy: -40, life: 0.85, glow: "#ffcf78", pop: true,
    });
  }
  sparkBurst(e.x, e.y - 40, opts.dir || 1, 18, 1.3, "#ffc77a");
  emberBurst(e.x, e.y - 36, 20, e.palette.accent, 1.1, false);
  woodBurst(e.x, e.y - 36, opts.dir || 1, 12, 1, e.palette.wood);
  addRing(e.x, e.y - 36, "#ffd49a", 58, 0.36, 3, false);
  addShockwave(e.x, GROUND_Y, "#d8b07c", 100, 0.4, 4);
  addDecal(e.x, GROUND_Y, "scorch", 1, 0.9, "#180d0b", 6);
  addShake(4.4);
  requestHitStop(opts.cause === "head" ? 0.09 : 0.045);
  if (opts.cause === "head") audio.kill();
}

/* ============================================================
   Enemy AI
   ============================================================ */
function updateEnemy(e, dt) {
  e.animTime += dt;
  e.flash = Math.max(0, e.flash - dt * 5.5);
  e.hurtT = Math.max(0, e.hurtT - dt);
  e.barTimer = Math.max(0, e.barTimer - dt);
  e.cooldown = Math.max(0, e.cooldown - dt);
  e.invuln = Math.max(0, e.invuln - dt);

  if (!e.alive) {
    e.deathT += dt;
    if (e.deathT > 0.35 && chance(dt * 12)) {
      addParticle({
        kind: "ember", x: e.x + rand(-16, 16), y: e.y - rand(4, 40) * e.scale,
        vx: rand(-20, 20), vy: -rand(20, 80), life: rand(0.5, 1.2), maxLife: 1.2,
        size: rand(0.8, 2.2), color: e.palette.accent, grav: -15, drag: 0.95, additive: true,
      });
    }
    if (e.deathT > 1.7) {
      smokeBurst(e.x, e.y - 20, 5, "#171217", 1.1);
      emberBurst(e.x, e.y - 20, 8, e.palette.accent, 0.7);
      e.remove = true;
    }
    applyEnemyPhysics(e, dt);
    e.pose = computeEnemyPose(e);
    return;
  }

  if (e.spawnT > 0) {
    e.spawnT -= dt;
    if (e.spawnT <= 0) {
      e.state = "idle";
      e.invuln = 0;
      smokeBurst(e.x, e.y - 20, 4, "#171217", 0.8);
    }
    applyEnemyPhysics(e, dt);
    e.pose = computeEnemyPose(e);
    return;
  }

  if (e.stun > 0) {
    e.stun -= dt;
    e.vx = damp(e.vx, 0, 4, dt);
    if (e.stun <= 0) {
      e.stun = 0;
      e.poise = e.maxPoise;
      e.state = "idle";
      e.cooldown = 0.35;
    }
    applyEnemyPhysics(e, dt);
    e.pose = computeEnemyPose(e);
    return;
  }

  const p = game.player;
  const playerGone = !p || p.dead || game.dying;

  if (e.grounded) {
    if (e.state === "windup" && e.atk) {
      e.atk.t += dt;
      e.tele = { kind: e.atk.kind, p: clamp(e.atk.t / e.atk.windup, 0, 1), targetX: e.targetX };
      e.vx = damp(e.vx, 0, 9, dt);
      if (e.atk.t >= e.atk.windup) {
        beginEnemyActive(e);
      }
    } else if (e.state === "attack" && e.atk) {
      updateEnemyActive(e, dt);
    } else if (e.state === "recover") {
      e.stateT -= dt;
      e.vx = damp(e.vx, 0, 7, dt);
      if (e.stateT <= 0) {
        e.state = "idle";
        e.atk = null;
        e.cooldown = rand(0.8, 1.5) * (e.elite ? 0.8 : 1);
        releaseToken(e);
      }
    } else if (e.state === "leap") {
      updateEnemyLeap(e, dt);
    } else {
      // idle
      if (!playerGone) {
        e.facing = sgn(p.x - e.x) || e.facing;
        moveEnemyIdle(e, dt);
        if (e.cooldown <= 0) tryEnemyAttack(e);
      } else {
        e.vx = damp(e.vx, 0, 5, dt);
      }
    }
  } else {
    // airborne
    if (e.state === "leap" && e.atk) {
      updateEnemyLeap(e, dt);
    }
    // otherwise simply fall
  }

  applyEnemyPhysics(e, dt);
  e.pose = computeEnemyPose(e);
}

function moveEnemyIdle(e, dt) {
  const p = game.player;
  if (!p) return;
  const dx = p.x - e.x;
  const ad = Math.abs(dx);
  const dir = sgn(dx) || 1;
  let target = 0;
  const chaseBonus = ad > 320 ? 1.6 : ad > 220 ? 1.2 : 1;
  const spd = e.def.speed * e.speedMul * (e.elite ? 1.06 : 1) * chaseBonus;
  if (e.type === "axe") {
    if (ad > 82) target = dir * spd;
    else if (ad < 48) target = -dir * spd * 0.4;
  } else if (e.type === "bolt") {
    if (e.canShoot) {
      if (ad < 225 && e.legsCount > 0) target = -dir * spd * 0.85;
      else if (ad > 345) target = dir * spd * 0.85;
      else target = 0;
    } else {
      if (ad > 62) target = dir * spd * 1.05;
      else if (ad < 42) target = -dir * spd * 0.25;
    }
  } else if (e.type === "rend") {
    if (ad > 68) target = dir * spd;
    else if (ad < 42) target = -dir * spd * 0.3;
  }
  // separation from other enemies
  for (const o of game.enemies) {
    if (o === e || !o.alive) continue;
    const dd = e.x - o.x;
    if (Math.abs(dd) < 34 && Math.abs(e.y - o.y) < 70) {
      target += sgn(dd) * 45;
    }
  }
  e.vx = damp(e.vx, target, 9, dt);
  e.walkPhase += Math.abs(e.vx) * dt * 0.085;
}

function tryEnemyAttack(e) {
  const p = game.player;
  if (!p || p.dead || game.dying) return;
  const ad = Math.abs(p.x - e.x);
  const kind = chooseEnemyAttack(e, ad);
  if (!kind) {
    e.cooldown = 0.2;
    return;
  }
  if (game.attackerCount >= 2 && !e.hasToken) {
    e.cooldown = 0.25;
    return;
  }
  startEnemyAttack(e, kind);
}

function chooseEnemyAttack(e, ad) {
  if (e.type === "axe") {
    if (e.arms === 0) {
      return ad < 350 ? "headbutt" : null;
    }
    if (e.armRok) {
      if (ad < 150) return "chop";
      if (e.legsCount === 2 && ad < 480) return "leap";
      return ad < 300 ? "chop" : null;
    }
    if (e.armLok) {
      return ad < 135 ? "swipe" : null;
    }
  } else if (e.type === "bolt") {
    if (e.canShoot) {
      if (ad < 560) return "aim";
      return null;
    }
    if (ad < 120 && e.legsCount > 0) return "kick";
    return null;
  } else if (e.type === "rend") {
    if (e.arms > 0) {
      if (ad < 100) return "swipe";
      if (e.legsCount === 2 && ad < 390) return "pounce";
      return ad < 150 ? "swipe" : null;
    }
    return ad < 175 ? "bite" : null;
  }
  return null;
}

function startEnemyAttack(e, kind) {
  const base = ENEMY_ATTACKS[kind];
  if (!base) return;
  if (!acquireToken(e)) return;
  const p = game.player;
  const windScale = clamp(1 - (getWaveNumber() - 1) * 0.026, 0.7, 1) * (e.elite ? 0.9 : 1);
  const dmgBonus = Math.min(6, (getWaveNumber() - 1) * 0.55) + (e.elite ? 2 : 0);
  const def = {
    ...base,
    windup: base.windup * windScale,
    recover: base.recover * (e.elite ? 0.92 : 1),
    dmg: Math.round(base.dmg + dmgBonus),
  };
  e.atk = { kind, ...def, t: 0, didHit: false };
  e.state = "windup";
  e.stateT = def.windup;
  e.facing = p ? sgn(p.x - e.x) || e.facing : e.facing;
  e.targetX = p ? p.x : e.x;
  e.tele = { kind, p: 0, targetX: e.targetX };
  e.vx = 0;
  e.barTimer = Math.max(e.barTimer, 1.4);
  audio.telegraph(e.type === "bolt" ? "bolt" : e.type === "rend" ? "rend" : "axe");
  if (e.type === "bolt" && kind === "aim") {
    addRing(e.x + e.facing * 18 * e.scale, e.y - 32 * e.scale, "#8ff0e0", 18, 0.2, 1.2, false);
  }
}

function beginEnemyActive(e) {
  const a = e.atk;
  if (!a) return;
  e.tele = null;
  if (a.kind === "leap") {
    e.state = "leap";
    e.atk.t = 0;
    const p = game.player;
    const targetX = p ? p.x : e.x + e.facing * 120;
    e.vy = -530 * Math.sqrt(e.scale);
    e.vx = clamp((targetX - e.x) / 0.58, -390, 390);
    e.grounded = false;
    e.atk.didHit = false;
    dustBurst(e.x, GROUND_Y, 10, e.facing, 1.1);
    audio.noiseHit(0.1, 0.2, "bandpass", 300, 900, 0.9);
    return;
  }
  e.state = "attack";
  e.atk.t = 0;
  e.atk.didHit = false;
  const legPower = e.legsCount === 2 ? 1 : e.legsCount === 1 ? 0.6 : 0.22;
  audio.noiseHit(a.kind === "headbutt" ? 0.12 : 0.085, 0.16, "bandpass", 320, 1500, 1.1);
  if (a.kind === "aim") {
    fireBolt(e);
    e.atk.didHit = true;
    e.vx = -e.facing * 40;
  } else if (a.kind === "kick") {
    e.vx = e.facing * 340 * legPower;
  } else if (a.kind === "chop") {
    e.vx = e.facing * 230 * legPower;
  } else if (a.kind === "swipe") {
    e.vx = e.facing * 170 * legPower;
  } else if (a.kind === "headbutt") {
    e.vx = e.facing * 420 * legPower;
  } else if (a.kind === "pounce") {
    const p = game.player;
    const targetX = p ? p.x : e.x + e.facing * 150;
    e.state = "leap";
    e.atk.t = 0;
    e.vy = -420 * Math.sqrt(e.scale);
    const airTime = 0.62;
    e.vx = clamp((targetX - e.x) / airTime, -560, 560);
    e.grounded = false;
    dustBurst(e.x, GROUND_Y, 8, e.facing, 1);
  }
}

function updateEnemyActive(e, dt) {
  const a = e.atk;
  a.t += dt;
  const legPower = e.legsCount === 2 ? 1 : e.legsCount === 1 ? 0.6 : 0.22;
  if (a.kind === "chop") {
    if (a.t < 0.09) e.vx = e.facing * 230 * legPower;
    else e.vx = damp(e.vx, 0, 8, dt);
    if (!a.didHit && a.t >= 0.035) enemyMeleeCheck(e, a.reach, a.r, a.yOff, a.dmg, a);
  } else if (a.kind === "swipe") {
    if (a.t < 0.08) e.vx = e.facing * 190 * legPower;
    if (!a.didHit && a.t >= 0.025) enemyMeleeCheck(e, a.reach, a.r, a.yOff, a.dmg, a);
  } else if (a.kind === "kick") {
    if (a.t < 0.12) e.vx = e.facing * 340 * legPower;
    else e.vx = damp(e.vx, 0, 7, dt);
    if (!a.didHit && a.t >= 0.03) enemyMeleeCheck(e, a.reach, a.r, a.yOff, a.dmg, a);
  } else if (a.kind === "headbutt") {
    e.vx = e.facing * 420 * legPower;
    if (!a.didHit) enemyMeleeCheck(e, a.reach, a.r, a.yOff, a.dmg, a);
  }
  if (a.t >= a.active && e.state === "attack") {
    e.state = "recover";
    e.stateT = a.recover;
    e.vx *= 0.25;
    if (a.kind === "headbutt") {
      // overcommitted shoulder rush
      e.stun = 0.18;
      e.state = "stagger";
      e.stateT = 0.32;
      e.atk = null;
      releaseToken(e);
    }
  }
}

function updateEnemyLeap(e, dt) {
  const a = e.atk;
  if (!a) return;
  a.t += dt;
  if (a.kind === "pounce" && !a.didHit) {
    const p = game.player;
    if (p && !p.dead) {
      const dx = p.x - e.x;
      const dy = p.y - 36 - (e.y - 32 * e.scale);
      if (Math.hypot(dx, dy) < 40 * e.scale + 20) {
        a.didHit = true;
        damagePlayer(a.dmg, e.x, { enemy: e });
        sparkBurst(p.x, p.y - 38, sgn(dx) || 1, 8, 0.9, "#ffb078");
      }
    }
  }
  if (e.grounded) {
    onEnemyLeaveAirAfterAttack(e);
  }
}

function onEnemyLeaveAirAfterAttack(e) {
  const a = e.atk;
  if (!a) return;
  if (a.kind === "leap") {
    const p = game.player;
    if (p && !p.dead) {
      const d = Math.abs(p.x - e.x);
      if (d < a.radius * e.scale && p.y > GROUND_Y - 90) {
        damagePlayer(a.dmg, e.x, { enemy: e });
      }
    }
    addShockwave(e.x, GROUND_Y, "#cba57c", 150, 0.4, 5);
    addRing(e.x, GROUND_Y - 2, "#ff9d6c", 80, 0.32, 3, false);
    dustBurst(e.x, GROUND_Y, 16, 0, 1.5);
    addShake(4.2);
    addDecal(e.x, GROUND_Y, "crack", 1, 1.1, "#221311", 6);
    audio.land(true);
  } else if (a.kind === "pounce") {
    dustBurst(e.x, GROUND_Y, 9, e.facing, 1);
    addRing(e.x, GROUND_Y - 2, "#ff9a7c", 40, 0.25, 2, false);
    addShake(2.2);
    audio.land(false);
  }
  if (e.state === "stagger" || e.stun > 0) {
    e.atk = null;
    return;
  }
  e.state = "recover";
  e.stateT = a.recover;
  e.vx *= 0.2;
}

function enemyMeleeCheck(e, reach, radius, yOff, dmg, atk) {
  if (!atk || atk.didHit) return;
  const p = game.player;
  if (!p || p.dead) return;
  const hx = e.x + e.facing * reach * e.scale;
  const hy = e.y - yOff * e.scale;
  const px = p.x;
  const py = p.y - 35;
  const d = Math.hypot(px - hx, (py - hy) * 0.85);
  if (d < radius * e.scale + 16) {
    atk.didHit = true;
    const hit = damagePlayer(dmg, e.x, { enemy: e });
    const dir = sgn(p.x - e.x) || 1;
    if (hit) {
      sparkBurst(p.x, p.y - 38, dir, 10, 1, "#ffb070");
      addRing(p.x, p.y - 36, "#ff8d72", 24, 0.18, 1.5, false);
    } else {
      sparkBurst(hx, hy, dir, 4, 0.5, "#9fe8e0");
    }
    // telegraph slash flash from the enemy weapon
    addSlash(hx, hy, 40 * e.scale, -1.4, 1.2, "#ff7468", 0.14, 12, e.facing, 0.55);
  }
}

function fireBolt(e) {
  const p = game.player;
  if (!p) return;
  const sx = e.x + e.facing * 18 * e.scale;
  const sy = e.y - 33 * e.scale;
  const tx = p.x;
  const ty = p.y - 35;
  const ang = Math.atan2(ty - sy, tx - sx);
  game.projectiles.push({
    type: "bolt",
    x: sx,
    y: sy,
    vx: Math.cos(ang) * 555,
    vy: Math.sin(ang) * 555,
    r: 7,
    life: 2.6,
    damage: e.atk ? e.atk.dmg : 9,
    owner: e,
    color: "#8ff2e0",
    angle: ang,
    trail: [],
  });
  addRing(sx, sy, "#8ff2e0", 18, 0.18, 2, false);
  for (let i = 0; i < 6; i++) {
    addParticle({
      kind: "spark", x: sx, y: sy,
      vx: Math.cos(ang) * rand(80, 260) + rand(-60, 60),
      vy: Math.sin(ang) * rand(80, 260) + rand(-60, 60),
      life: rand(0.1, 0.25), maxLife: 0.25, size: rand(0.8, 1.8),
      color: "#a8fff1", grav: 100, drag: 0.9, additive: true,
    });
  }
  audio.shoot();
}

/* ============================================================
   Enemy physics + projectile updates
   ============================================================ */
function applyEnemyPhysics(e, dt) {
  const wasGrounded = e.grounded;
  if (e.state !== "leap" || !e.atk) {
    // normal gravity
  }
  e.vy += 1950 * dt;
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  if (e.state === "leap") {
    e.vx *= Math.pow(0.55, dt);
  } else if (e.grounded) {
    e.vx *= Math.pow(0.02, dt);
  } else {
    e.vx *= Math.pow(0.9, dt);
  }
  e.x = clamp(e.x, 50, WORLD_W - 50);
  if (e.y >= GROUND_Y) {
    e.y = GROUND_Y;
    e.vy = 0;
    if (!wasGrounded) {
      e.grounded = true;
      if (e.alive) {
        if (e.state === "leap") {
          onEnemyLeaveAirAfterAttack(e);
        } else if (e.inAirFromHit) {
          e.inAirFromHit = false;
          dustBurst(e.x, GROUND_Y, 7, 0, 1);
          addRing(e.x, GROUND_Y - 2, "#d8c4a6", 28, 0.2, 1.5, true);
          if (e.state !== "stagger") {
            e.state = "recover";
            e.stateT = 0.32;
          }
          audio.land(false);
        }
      }
    }
  } else {
    e.grounded = false;
  }
}

function updateProjectiles(dt) {
  const p = game.player;
  for (let i = game.projectiles.length - 1; i >= 0; i--) {
    const pr = game.projectiles[i];
    pr.life -= dt;
    let dead = pr.life <= 0;
    pr.x += pr.vx * dt;
    pr.y += pr.vy * dt;
    if (!pr.trail) pr.trail = [];
    if (pr.trail) {
      pr.trail.push({ x: pr.x, y: pr.y, life: 0.18 });
      if (pr.trail.length > 10) pr.trail.shift();
      for (const t of pr.trail) t.life -= dt;
      pr.trail = pr.trail.filter((t) => t.life > 0);
    }
    if (pr.type === "bolt") {
      if (pr.y > GROUND_Y - 2 || pr.x < 20 || pr.x > WORLD_W - 20) {
        sparkBurst(pr.x, Math.min(pr.y, GROUND_Y - 2), sgn(pr.vx), 5, 0.6, "#8ff2e0");
        dead = true;
      }
      if (!dead && p && !p.dead) {
        const px = p.x;
        const py = p.y - 35;
        const rr = 17 + pr.r;
        if (Math.hypot(px - pr.x, py - pr.y) < rr) {
          if (isParryActive(p)) {
            parryProjectile(pr);
            dead = true;
          } else if (p.state === "dash" && p.iframes > 0) {
            sparkBurst(pr.x, pr.y, -sgn(pr.vx), 7, 0.8, "#9ff4e5");
            addFloater("闪", p.x, p.y - 70, "#cfe9e6", 13, { vy: -30, life: 0.5 });
            dead = true;
          } else if (p.iframes <= 0) {
            damagePlayer(pr.damage, pr.x - pr.vx * 0.02, { enemy: pr.owner });
            sparkBurst(pr.x, pr.y, -sgn(pr.vx), 8, 1, "#ff9c72");
            dead = true;
          } else {
            dead = true;
          }
        }
      }
    } else if (pr.type === "reflect") {
      if (pr.y > GROUND_Y - 2 || pr.x < 20 || pr.x > WORLD_W - 20) {
        sparkBurst(pr.x, Math.min(pr.y, GROUND_Y - 2), sgn(pr.vx), 8, 0.9, "#ffe3a0");
        dead = true;
      }
      if (!dead && p) {
        for (const e of game.enemies) {
          if (!e.alive || e.spawnT > 0) continue;
          const ex = e.x;
          const ey = e.y - 34 * e.scale;
          if (Math.hypot(ex - pr.x, ey - pr.y) < 30 * e.scale + pr.r) {
            const contact = { x: pr.x, y: pr.y };
            damageEnemyFromPlayer(e, {
              dmg: pr.damage, limb: pr.limb, poise: 40, kb: 220, launch: 150,
              hitstop: 0.06, shake: 3.5, heavy: false, aoeParts: false,
              bias: { arm: 1, leg: 1, head: 1 }, reach: 20, sourceX: p.x,
            }, contact, p, null);
            addShockwave(pr.x, pr.y, "#ffe3a0", 80, 0.3, 3);
            audio.deflect();
            dead = true;
            break;
          }
        }
      }
    }
    if (dead) game.projectiles.splice(i, 1);
  }
}

function updateEnemyList(dt) {
  for (let i = game.enemies.length - 1; i >= 0; i--) {
    const e = game.enemies[i];
    updateEnemy(e, dt);
    if (e.remove) game.enemies.splice(i, 1);
  }
}
