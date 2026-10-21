/* =========================================================
   Player — 织命者
   Procedural bone rig, keyframed attack poses.
   ========================================================= */
const PL = {
  maxHp: 100,
  maxStam: 100,
  scal: 1,
  armU: 25, armL: 24,
  thigh: 30, shin: 30,
  spine: 34, neck: 13,
  blade: 56,
};

// Pose: absolute screen-space angles (0=+x, PI/2=down), radians.
const POSE_KEYS = ['lean', 'crouch', 'hipX', 'neck', 'head', 'roll',
  'shF', 'elF', 'shB', 'elB', 'hipF', 'knF', 'hipB', 'knB', 'sword', 'swordOff', 'headTilt'];

const BASE_POSE = {
  lean: -0.05, crouch: 0, hipX: 0, neck: -0.03, head: 0, roll: 0,
  shF: 1.30, elF: 1.46, shB: 1.62, elB: 1.74,
  hipF: 1.38, knF: 1.62, hipB: 1.74, knB: 1.56,
  sword: 0.62, swordOff: 0, headTilt: 0,
};

function pose(over) { return Object.assign({}, BASE_POSE, over); }
function blendPose(a, b, t) {
  const o = {};
  for (const k of POSE_KEYS) o[k] = lerp(a[k], b[k], t);
  return o;
}
function sampleKeys(keys, t) {
  // keys: [{t, pose, ease}]
  if (t <= keys[0].t) return keys[0].pose;
  for (let i = 0; i < keys.length - 1; i++) {
    const A = keys[i], B = keys[i + 1];
    if (t <= B.t) {
      const u = (t - A.t) / Math.max(0.0001, B.t - A.t);
      return blendPose(A.pose, B.pose, (B.ease || Ease.inOutQuad)(clamp(u, 0, 1)));
    }
  }
  return keys[keys.length - 1].pose;
}

// ---------------- pose library ----------------
const P = {
  idle: pose({}),
  idle2: pose({ lean: -0.02, crouch: 1.2, shF: 1.27, elF: 1.42, shB: 1.6, elB: 1.77, sword: 0.7 }),

  runA: pose({
    lean: 0.22, hipF: 0.95, knF: 1.38, hipB: 1.95, knB: 2.5,
    shF: 2.05, elF: 2.35, shB: 0.85, elB: 0.6, sword: 1.55, crouch: 2,
  }),
  runB: pose({
    lean: 0.22, hipF: 1.98, knF: 2.45, hipB: 1.15, knB: 1.25,
    shF: 0.9, elF: 0.66, shB: 2.0, elB: 2.3, sword: 0.35, crouch: 2,
  }),

  jumpUp: pose({
    lean: 0.18, hipF: 1.0, knF: 1.95, hipB: 1.95, knB: 2.6,
    shF: 0.5, elF: 0.1, shB: 2.3, elB: 2.6, sword: 0.9, crouch: 4,
  }),
  jumpFall: pose({
    lean: -0.12, hipF: 1.35, knF: 1.55, hipB: 1.85, knB: 2.1,
    shF: 0.35, elF: 0.0, shB: 2.4, elB: 2.7, sword: 0.45,
  }),
  land: pose({ lean: 0.3, crouch: 12, hipF: 1.0, knF: 1.7, hipB: 2.0, knB: 2.5, shF: 0.8, elF: 0.4, sword: 0.9 }),

  // light 1 — horizontal cut
  atk1a: pose({ lean: -0.24, crouch: 3, shF: 2.35, elF: 2.72, shB: 1.2, elB: 1.0, sword: 2.55, hipF: 1.35, knF: 1.5, hipB: 1.85, knB: 2.1 }),
  atk1b: pose({ lean: 0.42, crouch: 4, hipX: 6, shF: 0.32, elF: 0.12, shB: 2.1, elB: 2.4, sword: 0.02, hipF: 1.05, knF: 1.2, hipB: 2.15, knB: 2.45 }),
  atk1c: pose({ lean: 0.3, crouch: 5, hipX: 4, shF: 0.82, elF: 0.6, shB: 1.9, elB: 2.2, sword: 0.55, hipF: 1.2, knF: 1.35, hipB: 2.0, knB: 2.3 }),

  // light 2 — rising cut
  atk2a: pose({ lean: 0.5, crouch: 16, shF: 2.6, elF: 2.9, shB: 1.0, elB: 0.8, sword: 2.7, hipF: 0.9, knF: 1.65, hipB: 2.0, knB: 2.5 }),
  atk2b: pose({ lean: -0.3, crouch: -6, hipX: 2, shF: -1.85, elF: -1.62, shB: 2.0, elB: 2.3, sword: -1.5, hipF: 1.35, knF: 1.15, hipB: 2.0, knB: 2.25 }),
  atk2c: pose({ lean: -0.12, crouch: -3, shF: -1.2, elF: -1.35, shB: 1.9, elB: 2.2, sword: -2.1, hipF: 1.45, knF: 1.3, hipB: 1.95, knB: 2.2 }),

  // light 3 — overhead cleave
  atk3a: pose({ lean: -0.34, crouch: 6, shF: -2.35, elF: -2.05, shB: -1.9, elB: -1.7, sword: -2.5, hipF: 1.3, knF: 1.42, hipB: 1.8, knB: 2.05 }),
  atk3b: pose({ lean: 0.62, crouch: 14, hipX: 8, shF: 0.7, elF: 0.28, shB: 0.35, elB: 0.4, sword: 1.3, hipF: 1.0, knF: 1.62, hipB: 2.2, knB: 2.55 }),
  atk3c: pose({ lean: 0.45, crouch: 18, hipX: 6, shF: 0.95, elF: 0.7, shB: 0.6, elB: 0.7, sword: 1.52, hipF: 0.9, knF: 1.75, hipB: 2.25, knB: 2.6 }),

  // heavy charge / release
  chg1: pose({ lean: 0.32, crouch: 18, hipX: -5, shF: 2.5, elF: 2.95, shB: 1.15, elB: 0.9, sword: 2.9, hipF: 0.85, knF: 1.7, hipB: 2.1, knB: 2.6 }),
  chg2: pose({ lean: 0.5, crouch: 26, hipX: -9, shF: 2.65, elF: 3.1, shB: 1.05, elB: 0.75, sword: 3.0, hipF: 0.72, knF: 1.85, hipB: 2.2, knB: 2.72 }),
  hvyA: pose({ lean: -0.4, crouch: 8, shF: -2.5, elF: -2.2, shB: -2.1, elB: -1.85, sword: -2.65, hipF: 1.25, knF: 1.4, hipB: 1.85, knB: 2.1 }),
  hvyB: pose({ lean: 0.72, crouch: 20, hipX: 12, shF: 0.78, elF: 0.35, shB: 0.42, elB: 0.5, sword: 1.38, hipF: 0.95, knF: 1.75, hipB: 2.3, knB: 2.7 }),
  hvyC: pose({ lean: 0.6, crouch: 24, hipX: 10, shF: 1.0, elF: 0.78, shB: 0.7, elB: 0.8, sword: 1.58, hipF: 0.85, knF: 1.9, hipB: 2.35, knB: 2.75 }),

  // air
  airA: pose({ roll: -0.35, lean: 0.2, hipF: 0.9, knF: 1.9, hipB: 1.9, knB: 2.55, shF: 2.3, elF: 2.6, shB: 1.1, elB: 0.9, sword: 2.5 }),
  airB: pose({ roll: 0.55, lean: 0.15, hipF: 1.1, knF: 1.85, hipB: 1.85, knB: 2.4, shF: 0.3, elF: 0.05, shB: 2.2, elB: 2.5, sword: 0.15 }),
  plunge: pose({ roll: 0, lean: 0.35, crouch: 6, hipF: 1.15, knF: 2.0, hipB: 2.05, knB: 2.75, shF: 1.45, elF: 1.4, shB: 1.2, elB: 1.1, sword: 1.55 }),
  plungeB: pose({ roll: 0, lean: 0.15, crouch: 20, hipF: 0.9, knF: 1.75, hipB: 1.9, knB: 2.35, shF: 1.55, elF: 1.5, shB: 1.3, elB: 1.25, sword: 1.57 }),

  // dash
  dashA: pose({ lean: 0.85, crouch: 22, hipX: 4, hipF: 0.8, knF: 1.35, hipB: 2.35, knB: 2.9, shF: 2.5, elF: 2.8, shB: 0.9, elB: 0.55, sword: 2.75 }),
  dashB: pose({ lean: 1.0, crouch: 26, hipX: 6, hipF: 0.6, knF: 1.15, hipB: 2.5, knB: 3.05, shF: 2.6, elF: 2.95, shB: 0.75, elB: 0.4, sword: 2.9 }),

  // parry
  parryA: pose({ lean: 0.15, crouch: 10, shF: 0.05, elF: -0.35, shB: 1.0, elB: 1.3, sword: -1.45, hipF: 1.25, knF: 1.55, hipB: 1.95, knB: 2.3 }),
  parryB: pose({ lean: -0.1, crouch: 6, shF: -0.1, elF: -0.5, shB: 0.9, elB: 1.2, sword: -1.55, hipF: 1.4, knF: 1.6, hipB: 2.0, knB: 2.25 }),

  hurt: pose({ lean: -0.5, crouch: 4, shF: -0.4, elF: -0.9, shB: 2.2, elB: 2.5, sword: 2.2, hipF: 1.2, knF: 1.5, hipB: 2.0, knB: 2.4, headTilt: -0.3 }),
  dead: pose({ lean: -0.9, crouch: 30, roll: -0.5, shF: 2.6, elF: 3.0, shB: 2.4, elB: 2.8, sword: 2.8, hipF: 1.1, knF: 2.2, hipB: 1.9, knB: 2.6 }),
};

// ---------------- attack definitions ----------------
// phase times in seconds; `active` is [start,end] within windup+active+recovery
const ATK = {
  L1: { name: 'L1', total: 0.30, windup: 0.075, active: 0.075, reach: 66, h: 40, cy: -64,
        dmg: 9, sev: 0.16, kb: 160, up: 0, hs: 0.075, shake: 2.2, stam: 0, next: 'L2',
        keys: [{ t: 0, pose: P.idle }, { t: 0.26, pose: P.atk1a, ease: Ease.outQuad },
               { t: 0.5, pose: P.atk1b, ease: Ease.inCubic }, { t: 1, pose: P.atk1c, ease: Ease.outCubic }] },
  L2: { name: 'L2', total: 0.34, windup: 0.09, active: 0.08, reach: 62, h: 46, cy: -70,
        dmg: 10, sev: 0.17, kb: 110, up: -430, hs: 0.09, shake: 2.6, stam: 0, next: 'L3',
        keys: [{ t: 0, pose: P.atk1c }, { t: 0.27, pose: P.atk2a, ease: Ease.outQuad },
               { t: 0.5, pose: P.atk2b, ease: Ease.outCubic }, { t: 1, pose: P.atk2c, ease: Ease.outCubic }] },
  L3: { name: 'L3', total: 0.46, windup: 0.14, active: 0.09, reach: 70, h: 52, cy: -62,
        dmg: 17, sev: 0.3, kb: 340, up: -190, hs: 0.12, shake: 4.2, stam: 0, next: null,
        keys: [{ t: 0, pose: P.atk2c }, { t: 0.3, pose: P.atk3a, ease: Ease.outQuad },
               { t: 0.55, pose: P.atk3b, ease: Ease.inCubic }, { t: 1, pose: P.atk3c, ease: Ease.outCubic }] },
  HVY: { name: 'HVY', total: 0.62, windup: 0.2, active: 0.1, reach: 80, h: 60, cy: -58,
        dmg: 26, sev: 0.62, kb: 430, up: -150, hs: 0.16, shake: 6.5, stam: 0, next: null,
        keys: [{ t: 0, pose: P.chg2 }, { t: 0.32, pose: P.hvyA, ease: Ease.outQuad },
               { t: 0.48, pose: P.hvyB, ease: Ease.inCubic }, { t: 1, pose: P.hvyC, ease: Ease.outCubic }] },
  AIR1: { name: 'AIR1', total: 0.30, windup: 0.07, active: 0.09, reach: 62, h: 48, cy: -60,
        dmg: 9, sev: 0.18, kb: 120, up: -80, hs: 0.075, shake: 2, stam: 0, next: 'AIR2', air: true,
        keys: [{ t: 0, pose: P.jumpFall }, { t: 0.24, pose: P.airA, ease: Ease.outQuad },
               { t: 0.5, pose: P.airB, ease: Ease.outCubic }, { t: 1, pose: P.jumpFall, ease: Ease.inOutQuad }] },
  AIR2: { name: 'AIR2', total: 0.34, windup: 0.07, active: 0.11, reach: 64, h: 56, cy: -58,
        dmg: 11, sev: 0.22, kb: 160, up: -70, hs: 0.09, shake: 2.8, stam: 0, next: null, air: true,
        keys: [{ t: 0, pose: P.jumpFall }, { t: 0.2, pose: P.airA, ease: Ease.outQuad },
               { t: 0.48, pose: P.airB, ease: Ease.outCubic }, { t: 1, pose: P.jumpFall, ease: Ease.inOutQuad }] },
  PLUNGE: { name: 'PLUNGE', total: 0.5, windup: 0.06, active: 0.08, reach: 54, h: 70, cy: -50,
        dmg: 16, sev: 0.4, kb: 140, up: 120, hs: 0.13, shake: 5, stam: 0, next: null, air: true,
        keys: [{ t: 0, pose: P.plunge }, { t: 0.15, pose: P.plunge }, { t: 0.35, pose: P.plungeB, ease: Ease.outQuad }, { t: 1, pose: P.land, ease: Ease.outCubic }] },
};

const Player = {
  x: 620, y: WORLD.groundY, vx: 0, vy: 0,
  facing: 1, ground: true,
  hp: 100, stam: 100, stamDelay: 0,
  state: 'idle', t: 0,
  atk: null, atkTime: 0, hitSet: new Set(), comboIdx: 0, comboWindow: 0,
  buffer: null, bufferT: 0,
  dashT: 0, dashCd: 0, airDash: true,
  charge: 0, charging: false,
  parryT: 0, parryWindow: 0, parryCd: 0, parrySuccess: 0,
  invuln: 0, hurtT: 0, dead: false, deathT: 0,
  runPhase: 0, scarf: [], trail: [], pose: Object.assign({}, BASE_POSE),
  ghostT: 0, landingT: 0, lastHitAt: -10,
  perfectFlash: 0, jumpCount: 0, coyote: 0, jumpBuffer: 0,
  chargeFxT: 0, atkCount: 0,
  // visuals
  flashT: 0, slowT: 0,

  reset() {
    this.x = 620; this.y = WORLD.groundY; this.vx = 0; this.vy = 0;
    this.facing = 1; this.ground = true;
    this.hp = PL.maxHp; this.stam = PL.maxStam; this.stamDelay = 0;
    this.state = 'idle'; this.t = 0; this.atk = null; this.atkTime = 0;
    this.hitSet.clear(); this.comboIdx = 0; this.comboWindow = 0;
    this.buffer = null; this.bufferT = 0;
    this.dashT = 0; this.dashCd = 0; this.airDash = true;
    this.charge = 0; this.charging = false;
    this.parryT = 0; this.parryWindow = 0; this.parryCd = 0;
    this.invuln = 0; this.hurtT = 0; this.dead = false; this.deathT = 0;
    this.runPhase = 0; this.trail.length = 0; this.ghostT = 0;
    this.scarf = [];
    for (let i = 0; i < 10; i++) this.scarf.push({ x: -6 - i * 2, y: -88 + i * 2 });
    this.pose = Object.assign({}, BASE_POSE);
    this.jumpCount = 0; this.coyote = 0; this.jumpBuffer = 0;
  },

  get cy() { return this.y; },
  get alive() { return this.hp > 0; },

  press(action) {
    this.buffer = action; this.bufferT = 0.19;
  },

  readInput() {
    // newest press wins; buffer length gives a forgiving input window
    if (this.dead) return;
    const b = this.bufferT > 0 ? this.buffer : null;
    let order = [];
    if (Input.anyPressed('dash')) order.push('dash');
    if (Input.anyPressed('special')) order.push('parry');
    if (Input.anyPressed('heavy')) order.push('heavy');
    if (Input.anyPressed('atk')) order.push('atk');
    if (Input.anyPressed('jump')) order.push('jump');
    if (order.length) {
      // resolve priority: attack > dash > parry > heavy > jump for same-frame presses
      const prio = { atk: 5, dash: 4, parry: 3, heavy: 2, jump: 1 };
      order.sort((a, b2) => prio[b2] - prio[a]);
      this.press(order[0]);
    } else if (b) {
      this.buffer = b;
    }
  },

  update(dt, enemies, game) {
    if (this.dead) {
      this.deathT += dt;
      this.vy += WORLD.gravity * dt;
      this.y += this.vy * dt;
      if (this.y > WORLD.groundY) { this.y = WORLD.groundY; this.vy = 0; }
      this.t += dt;
      this.pose = blendPose(this.pose, P.dead, 1 - Math.pow(0.02, dt));
      this.updateScarf(dt);
      return;
    }
    this.readInput();
    this.t += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.flashT = Math.max(0, this.flashT - dt);
    this.perfectFlash = Math.max(0, this.perfectFlash - dt);
    this.hitFlash = Math.max(0, (this.hitFlash || 0) - dt);

    // stamina regen
    this.stamDelay -= dt;
    if (this.stamDelay <= 0 && this.state !== 'dash') {
      this.stam = Math.min(PL.maxStam, this.stam + 42 * dt);
    }

    if (this.bufferT > 0) this.bufferT -= dt;
    else this.buffer = null;

    // ----- state machine -----
    if (this.state === 'hurt') {
      this.hurtT -= dt;
      this.vx *= Math.pow(0.02, dt);
      if (this.hurtT <= 0) this.state = 'idle';
    } else if (this.state === 'dash') {
      this.updateDash(dt, game);
    } else if (this.state === 'attack') {
      this.updateAttack(dt, enemies, game);
    } else if (this.state === 'parry') {
      this.updateParry(dt, game);
    }

    // Ability actions (except during dash / attack lock / hurt)
    if (this.state !== 'hurt' && this.state !== 'dash' && this.state !== 'attack' && this.state !== 'dead') {
      this.handleActions(enemies, game);
    }

    // gravity
    this.vy += WORLD.gravity * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;

    // ground collision
    if (this.y >= WORLD.groundY) {
      if (!this.ground && this.vy > 500) {
        const power = clamp(this.vy / 1100, 0.3, 1.6);
        FX.dust(this.x, WORLD.groundY, 6, power);
        Camera.addShake(1.2 + power * 1.6);
        if (power > 0.9) Sfx.land();
        this.landingT = 0.18;
        if (this.state === 'attack' && this.atk && this.atk.name === 'PLUNGE' && !this.plunged) {
          this.doPlungeImpact(game);
        }
      }
      this.y = WORLD.groundY; this.vy = 0; this.ground = true; this.jumpCount = 0; this.airDash = true;
      this.coyote = 0.1;
    } else {
      this.ground = false;
      this.coyote = Math.max(0, this.coyote - dt);
    }
    this.x = clamp(this.x, WORLD.left + 24, WORLD.right - 24);

    // run / idle animation and movement
    const ax = Input.axis();
    if (this.state === 'idle' || this.state === 'run') {
      if (Math.abs(ax) > 0) {
        this.facing = ax;
        const spd = 330;
        this.vx += (ax * spd - this.vx) * Math.min(1, dt * 18);
        this.state = 'run';
        this.runPhase += dt * 13;
      } else {
        this.vx *= Math.pow(0.0006, dt);
        if (Math.abs(this.vx) < 12) { this.vx = 0; this.state = 'idle'; }
      }
      if (!this.ground) { /* handled by pose below */ }
    }

    // jump input
    if (this.buffer === 'jump' && (this.ground || this.coyote > 0 || this.jumpCount < 1)) {
      if (this.state !== 'attack' || (this.atk && this.atkTime > this.atk.windup + this.atk.active * 2)) {
        this.buffer = null;
        this.jump();
      }
    }

    this.updatePoseAndVisuals(dt, ax);
    this.updateScarf(dt);
    this.updateTrail(dt);
    this.updateBladeTrail();
  },

  handleActions(enemies, game) {
    // dash
    if (this.buffer === 'dash' && this.dashCd <= 0 && this.stam >= 18 && (this.ground || this.airDash)) {
      this.buffer = null;
      this.startDash();
      return;
    }
    // parry
    if (this.buffer === 'parry' && this.parryCd <= 0 && this.ground) {
      this.buffer = null;
      this.startParry(game);
      return;
    }
    // heavy
    if (this.buffer === 'heavy' && this.ground && this.state !== 'parry') {
      this.buffer = null;
      this.startCharge();
      return;
    }
    // attack
    if (this.buffer === 'atk') {
      this.buffer = null;
      if (!this.ground) {
        this.startAttack(this.airAttackNext || 'AIR1', game);
      } else {
        const chain = (this.comboWindow > 0) ? (this.comboIdx < 3 ? 'L' + (this.comboIdx + 1) : 'L1') : 'L1';
        this.startAttack(chain, game);
      }
      return;
    }
    // charge release
    if (this.charging) {
      if (!Input.anyDown('heavy')) {
        this.releaseCharge(game);
      }
    }
    // move while charging (slow)
    if (this.charging) {
      const ax = Input.axis();
      if (ax) this.facing = ax;
      this.vx += (ax * 70 - this.vx) * Math.min(1, 0.016 * 10);
    }
    // jump
  },

  jump() {
    if (!this.ground && this.jumpCount >= 1) return;
    this.charging = false;
    const isDouble = !this.ground && this.jumpCount >= 1;
    this.vy = isDouble ? -760 : -880;
    this.ground = false;
    this.jumpCount++;
    this.state = 'air';
    this.airDash = true;
    if (isDouble) {
      FX.ring(this.x, this.y - 40, 6, 220, '#9ff4ec', 0.3, 2);
      FX.dust(this.x, this.y, 7, 0.8);
      Sfx.swing('air');
    } else {
      FX.dust(this.x, this.y, 5, 0.7);
    }
    Sfx.jump();
    this.jumpHold = 0;
  },

  startDash() {
    this.charging = false;
    const ax = Input.axis();
    if (ax) this.facing = ax;
    this.state = 'dash';
    this.dashT = 0.19;
    this.airDash = this.ground ? this.airDash : false;
    this.vx = this.facing * 800;
    this.vy = this.ground ? 0 : Math.min(this.vy, 60);
    this.stam -= 18; this.stamDelay = 0.5;
    this.invuln = 0.17;
    this.ghostT = 0;
    Sfx.dash();
    FX.ring(this.x, this.y - 60, 8, 230, '#8ef2e4', 0.22, 2.2);
  },

  updateDash(dt, game) {
    this.dashT -= dt;
    this.ghostT -= dt;
    this.vx = this.facing * 800;
    if (this.ground) this.vy = 0;
    if (this.ghostT <= 0) {
      this.ghostT = 0.035;
      FX.ghost(this.pose, '#6ff2e2', 0.2);
    }
    if (this.buffer === 'atk' && this.dashT < 0.17) {
      this.buffer = null;
      // dash attack — a lunging slash
      this.startAttack(this.ground ? 'L1' : 'AIR1', game);
      this.vx = this.facing * 260;
      this.vx0 = this.vx;
      this.dashAtk = true;
      return;
    }
    if (this.dashT <= 0) {
      this.state = 'idle';
      this.vx *= 0.35;
      this.dashAtk = false;
    }
  },

  startParry(game) {
    this.state = 'parry';
    this.parryT = 0.34;
    this.parryWindow = 0.2;
    this.parryCd = 0.38;
    this.stam = Math.max(0, this.stam - 8);
    this.stamDelay = 0.4;
    FX.ring(this.x, this.y - 62, 14, 90, '#bff6ff', 0.2, 1.6);
    Sfx.swing('air');
  },

  updateParry(dt, game) {
    this.parryT -= dt;
    this.parryWindow -= dt;
    this.vx *= Math.pow(0.0001, dt);
    if (this.parryT <= 0) this.state = 'idle';
    if (this.buffer === 'atk' && this.parryT < 0.2) { this.buffer = null; this.startAttack('L1', game); }
  },

  startCharge() {
    this.charging = true;
    this.charge = 0;
    this.state = 'charge';
    this.vx *= 0.3;
  },

  releaseCharge(game) {
    this.charging = false;
    const full = this.charge >= 1;
    this.startAttack('HVY', game);
    this.atkCharge = this.charge;
    if (full) {
      FX.ring(this.x, this.y - 60, 20, 260, '#ffe28a', 0.35, 3);
      FX.text(this.x, this.y - 150, '满', { size: 26, color: '#ffe9a8', glow: 'rgba(255,200,80,.9)' });
    }
  },

  startAttack(name, game) {
    this.charging = false;
    const def = ATK[name];
    this.atk = def;
    this.atkTime = 0;
    this.hitSet.clear();
    this.state = 'attack';
    this.chargeGlow = 0;
    if (def.air) {
      this.state = 'attack';
      if (name === 'PLUNGE') this.vy = Math.max(this.vy, 300);
    }
    if (this.ground) {
      this.vx = this.facing * (def.name === 'HVY' ? 120 : 100);
    }
    this.comboIdx = name === 'L1' ? 1 : name === 'L2' ? 2 : name === 'L3' ? 3 : this.comboIdx;
    this.comboWindow = 0;
    Sfx.swing(def.name === 'HVY' ? 'heavy' : 'light');
    this.swingFxDone = false;
    this.atkCount++;
  },

  updateAttack(dt, enemies, game) {
    const a = this.atk;
    this.atkTime += dt;
    const t = this.atkTime / a.total;
    const windEnd = a.windup / a.total;
    const actEnd = (a.windup + a.active) / a.total;

    // movement during attack
    if (this.ground) {
      this.vx *= Math.pow(0.02, dt * 3);
      if (a.name === 'HVY' && this.atkTime > a.windup * 0.9 && this.atkTime < a.windup + a.active) {
        this.vx = this.facing * 520 * (1 + (this.atkCharge || 0) * 0.35);
      }
    } else if (a.name === 'PLUNGE') {
      this.vy = Math.max(this.vy, 620);
    } else {
      this.vx *= Math.pow(0.15, dt);
      this.vy *= Math.pow(0.965, dt);
    }

    // active hit window
    if (this.atkTime >= a.windup && this.atkTime <= a.windup + a.active) {
      this.checkHits(enemies, game);
    }
    if (!this.swingFxDone && this.atkTime >= a.windup * 0.82) {
      this.swingFxDone = true;
      this.spawnSlashFx(a);
    }

    // combo chain buffering
    if (this.buffer === 'atk' && this.atkTime > a.windup + a.active * 0.55 && a.next) {
      this.buffer = null;
      this.startAttack(a.next, game);
      return;
    }
    if (this.buffer === 'dash' && this.atkTime > a.windup + a.active * 0.4 && this.dashCd <= 0 && this.stam >= 18) {
      this.buffer = null;
      this.startDash();
      return;
    }
    if (this.buffer === 'jump' && this.atkTime > a.windup + a.active * 0.6) {
      this.buffer = null;
      this.jump();
      return;
    }
    if (this.atkTime >= a.total) {
      this.state = 'idle';
      if (a.next) { this.comboWindow = 0.28; this.comboIdx = a.name === 'L1' ? 1 : a.name === 'L2' ? 2 : 3; }
      else { this.comboWindow = 0; this.comboIdx = 0; }
      this.atk = null;
    }
    if (this.ground) this.comboWindow = Math.max(0, this.comboWindow - dt);
  },

  spawnSlashFx(a) {
    const cy = this.y + a.cy + 4;
    const d = this.facing;
    const heavy = a.name === 'HVY' || a.name === 'L3';
    const len = a.reach * 1.35;
    let ang, col, tint;
    if (a.name === 'L1') { ang = -0.25; col = '#fff6e0'; tint = '#ffcf9a'; }
    else if (a.name === 'L2') { ang = -1.25; col = '#e8fffb'; tint = '#7ff2e6'; }
    else if (a.name === 'L3' || a.name === 'HVY') { ang = 0.75; col = '#fff2c8'; tint = '#ffb060'; }
    else if (a.name === 'AIR1' || a.name === 'AIR2') { ang = -0.6; col = '#eafffb'; tint = '#7ff2e6'; }
    else { ang = 1.2; col = '#fff6e0'; tint = '#ffcf9a'; }
    if (!this.ground && a.name !== 'PLUNGE') ang *= 1.0;
    FX.slashFx(this.x + d * 46, cy, ang * d, len, d, {
      life: heavy ? 0.2 : 0.15, color: col, tint,
      w: heavy ? 1.5 : 1.0,
    });
    if (heavy) {
      FX.slashFx(this.x + d * 54, cy + 4, (ang + 0.28) * d, len * 0.9, d,
        { life: 0.24, color: '#fff', tint: '#ff8a4a', w: 0.8 });
    }
  },

  hitbox(a) {
    const d = this.facing;
    return {
      x: this.x + d * (a.reach * 0.55 + 8),
      y: this.y + a.cy,
      r: a.reach * 0.62,
      h: a.h * 0.5,
      d,
      cy: this.y + a.cy,
    };
  },

  checkHits(enemies, game) {
    const a = this.atk;
    const hb = this.hitbox(a);
    for (const e of enemies) {
      if (e.dead || e.dying || this.hitSet.has(e.id)) continue;
      if (e.hitTest(hb, this)) {
        this.hitSet.add(e.id);
        const powerMul = a.name === 'HVY' ? (1 + (this.atkCharge || 0) * 0.9) : 1;
        const dirX = this.facing;
        const isHeavy = a.name === 'HVY' || a.name === 'L3' || a.name === 'PLUNGE';
        const res = e.takeHit({
          dmg: a.dmg * powerMul,
          sev: a.sev * powerMul,
          kb: a.kb * (isHeavy ? 1.15 : 1),
          up: a.up,
          dirX,
          px: hb.x + dirX * 10, py: hb.cy,
          heavy: isHeavy,
          charge: this.atkCharge || 0,
          hitStop: a.hs,
          shake: a.shake,
          attacker: 'player',
        }, game);
        // hit stop — stronger on sever
        game.hitStop = Math.max(game.hitStop, a.hs + (res && res.severed ? 0.04 : 0));
        game.hitStopScale = 1;
        Camera.addShake(a.shake + (res && res.severed ? 3 : 0), (dirX > 0 ? 0 : Math.PI) + rnd(0.5, -0.5));
        Sfx.hit(a.name === 'HVY' ? 2.6 : a.name === 'L3' ? 2.0 : 1.1);
        this.vx = -dirX * 30;
        // hitstop freezes player position but we want micro pushback: handled by vx above
        this.flashT = 0.07;
        game.hitCount++;
        game.playerHitThisFrame = true;
      }
    }
  },

  doPlungeImpact(game) {
    this.plunged = true;
    const d = this.facing;
    FX.shock(this.x, WORLD.groundY, d, 1.5);
    FX.dust(this.x, WORLD.groundY, 16, 1.5);
    FX.debris(this.x, WORLD.groundY - 4, 10, 0, ['#4a3a2c', '#2a2420']);
    Camera.addShake(6);
    Sfx.slam();
    for (const e of game.enemies) {
      if (e.dead || e.dying) continue;
      const dx = e.x - this.x;
      if (Math.abs(dx) < 150 && Math.abs(e.y - this.y) < 110) {
        e.takeHit({ dmg: 14, sev: 0.34, kb: 260, up: -320, dirX: sign(dx || 1), px: e.x, py: this.y - 20, heavy: true, hitStop: 0.1, shake: 4, attacker: 'player' }, game);
        game.hitCount++;
      }
    }
  },

  takeDamage(dmg, dirX, game, opts = {}) {
    if (this.invuln > 0 || this.dead) return false;
    // parry check
    if (this.state === 'parry' && this.parryWindow > 0) {
      this.parrySuccess = 0.6;
      this.parryWindow = 0;
      this.parryT = 0.1;
      this.invuln = 0.35;
      game.hitStop = Math.max(game.hitStop, 0.18);
      game.hitStopScale = 0.06;
      game.slowT = Math.max(game.slowT, 0.42);
      Camera.addShake(5);
      Sfx.parry();
      FX.ring(this.x, this.y - 62, 10, 420, '#ffffff', 0.45, 3);
      FX.ring(this.x, this.y - 62, 6, 260, '#9ff6ff', 0.5, 2);
      FX.sparks(this.x + this.facing * 30, this.y - 64, this.facing, 2.2, '#bff6ff');
      FX.text(this.x, this.y - 150, '弹 反', { size: 30, color: '#e9ffff', glow: 'rgba(120,240,255,.95)', life: 0.6 });
      this.stam = Math.min(PL.maxStam, this.stam + 40);
      game.parryCount++;
      return false;
    }
    let finalDmg = dmg;
    if (this.state === 'parry' && this.parryT > 0) finalDmg *= 0.35;
    this.hp -= finalDmg;
    this.flashT = 0.14;
    this.hitFlash = 0.2;
    this.invuln = 0.55;
    this.charging = false;
    this.atk = null;
    this.state = 'hurt';
    this.hurtT = 0.28;
    this.vx = dirX * 260;
    this.vy = -140;
    game.hitStop = Math.max(game.hitStop, 0.09);
    Camera.addShake(4.5, dirX > 0 ? 0 : Math.PI);
    Sfx.hurt();
    FX.blood(this.x, this.y - 66, dirX, 10, 1);
    if (this.hp <= 0) {
      this.hp = 0; this.dead = true; this.state = 'dead';
      this.vy = -400; this.vx = dirX * 300;
      game.onPlayerDeath();
    }
    return true;
  },

  heal(n) { this.hp = Math.min(PL.maxHp, this.hp + n); },

  // ---------------- pose + visuals ----------------
  updatePoseAndVisuals(dt, ax) {
    let target;
    const spd = Math.abs(this.vx);
    if (this.state === 'attack' && this.atk) {
      const a = this.atk;
      const t = clamp(this.atkTime / a.total, 0, 1);
      target = sampleKeys(a.keys, t);
      if (a.name === 'HVY' && this.atkTime < 0.01) target = P.chg1;
    } else if (this.state === 'charge') {
      this.charge = Math.min(1, this.charge + dt * 1.55);
      const t = Ease.outCubic(this.charge);
      target = blendPose(P.chg1, P.chg2, t);
      // const tremble when nearly full
      if (this.charge > 0.9) {
        target = Object.assign({}, target, {
          lean: target.lean + Math.sin(this.t * 60) * 0.02,
          crouch: target.crouch + Math.sin(this.t * 47) * 1.4,
        });
      }
      this.vx *= Math.pow(0.05, dt);
      if (this.charge > 0.55) {
        this.chargeFxT -= dt;
        if (this.chargeFxT <= 0) {
          this.chargeFxT = 0.05;
          FX.add({
            kind: 'spark', x: this.x + rnd(30, -30), y: this.y - rnd(30, 100),
            vx: rnd(40, -40), vy: rnd(-40, -160), g: -100, drag: 0.95, life: 0.4,
            w: rnd(1.4, 2.4), color: '#ffe6a0',
          });
        }
      }
    } else if (this.state === 'dash') {
      target = blendPose(P.dashA, P.dashB, 0.5 + Math.sin(this.t * 40) * 0.2);
    } else if (this.state === 'parry') {
      const k = this.parryT > 0.24 ? 1 : 0.5;
      target = blendPose(P.parryA, P.parryB, k);
    } else if (this.state === 'hurt') {
      target = P.hurt;
    } else if (this.state === 'dead') {
      target = P.dead;
    } else if (!this.ground) {
      const rising = this.vy < 0;
      target = rising ? P.jumpUp : P.jumpFall;
      if (this.vy > 260 && this.state !== 'attack') target = blendPose(P.jumpFall, P.land, clamp((this.vy - 260) / 900, 0, 0.4));
    } else if (spd > 40) {
      const ph = this.runPhase;
      const s = Math.sin(ph);
      const c = Math.cos(ph);
      target = {
        lean: 0.2 + s * 0.05,
        crouch: 2 + Math.abs(s) * 4,
        hipX: 0, neck: -0.04, head: -s * 0.04, roll: 0, headTilt: 0,
        shF: 1.4 + s * 0.75, elF: 1.5 + s * 0.7,
        shB: 1.4 - s * 0.75, elB: 1.5 - s * 0.7,
        hipF: 1.57 + Math.sin(ph) * 0.62, knF: 1.6 + Math.max(0, -Math.sin(ph - 0.7)) * 1.0,
        hipB: 1.57 - Math.sin(ph) * 0.62, knB: 1.6 + Math.max(0, Math.sin(ph - 0.7)) * 1.0,
        sword: 1.95 - s * 0.25, swordOff: 0,
      };
      if (this.facing * ax < 0) target.lean = 0.12;
    } else {
      const b = Math.sin(this.t * 2.4) * 0.5 + 0.5;
      target = blendPose(P.idle, P.idle2, b);
      if (this.landingT > 0) { this.landingT -= dt; target = blendPose(target, P.land, this.landingT / 0.18); }
    }
    // smooth pose toward target
    const k = 1 - Math.pow(0.0000015, dt);
    this.pose = blendPose(this.pose, target, this.state === 'attack' ? 1 : k);

    // breathing aura / charge glow
    this.chargeGlow = this.state === 'charge' ? this.charge : Math.max(0, (this.chargeGlow || 0) - dt * 4);
  },

  updateScarf(dt) {
    // local-space ribbon trailing behind the body (facing-independent)
    const p = this.pose;
    const anchorY = -88 - p.crouch * 0.5 + Math.sin(this.t * 3.1) * 1.5;
    const speed = clamp(Math.abs(this.vx) / 330, 0, 1.6);
    const airborne = this.ground ? 0 : 1;
    for (let i = 0; i < this.scarf.length; i++) {
      const s = this.scarf[i];
      const k = i / (this.scarf.length - 1);
      const tx = -6 - k * (26 + speed * 30 + airborne * 8);
      const ty = anchorY + k * (10 + speed * 14) + Math.sin(this.t * 7.2 - i * 0.85) * (1.2 + i * 0.55);
      const stiff = i === 0 ? 1 : 0.55 - k * 0.18;
      s.x += (tx - s.x) * Math.min(1, dt * 30 * stiff + dt * 8);
      s.y += (ty - s.y) * Math.min(1, dt * 30 * stiff + dt * 8);
    }
  },

  updateBladeTrail() {
    const hot = (this.state === 'attack' && this.atk && this.atkTime >= this.atk.windup * 0.7)
      || (this.state === 'charge' && this.charge > 0.35);
    if (!hot) { if (FX.trail.pts.length) FX.trail.pts.length = 0; return; }
    const J = this.localJoints();
    // sample several points along the blade for a fuller ribbon
    for (let i = 1; i <= 3; i++) {
      const k = i / 3;
      const x = this.x + this.facing * lerp(J.handF.x, J.swordTip.x, k);
      const y = this.y + lerp(J.handF.y, J.swordTip.y, k);
      FX.trailPush(x, y, 1 - i * 0.2, 5 + k * 3);
    }
  },

  updateTrail(dt) {
    for (const t of this.trail) { t.life -= dt; }
    this.trail = this.trail.filter(t => t.life > 0);
  },

  // ---------------- drawing ----------------
  joints() {
    const p = this.pose;
    const crouch = p.crouch;
    const hipY = this.y - 62 + crouch;
    const hip = { x: this.x + p.hipX * this.facing, y: hipY };
    const spineAng = -Math.PI / 2 + p.lean;
    const chest = { x: hip.x + Math.cos(spineAng) * PL.spine, y: hip.y + Math.sin(spineAng) * PL.spine };
    const neckAng = -Math.PI / 2 + p.lean * 0.55 + p.neck;
    const neck = { x: chest.x + Math.cos(neckAng) * PL.neck, y: chest.y + Math.sin(neckAng) * PL.neck };
    const headAng = neckAng + p.head + p.headTilt;
    const head = { x: neck.x + Math.cos(headAng) * 10, y: neck.y + Math.sin(headAng) * 10 };

    const shF = { x: chest.x + 2, y: chest.y + 3 };
    const shB = { x: chest.x - 3, y: chest.y + 4 };
    const elbF = { x: shF.x + Math.cos(p.shF) * PL.armU, y: shF.y + Math.sin(p.shF) * PL.armU };
    const handF = { x: elbF.x + Math.cos(p.elF) * PL.armL, y: elbF.y + Math.sin(p.elF) * PL.armL };
    const elbB = { x: shB.x + Math.cos(p.shB) * PL.armU, y: shB.y + Math.sin(p.shB) * PL.armU };
    const handB = { x: elbB.x + Math.cos(p.elB) * PL.armL, y: elbB.y + Math.sin(p.elB) * PL.armL };

    const hipF = { x: hip.x + 2, y: hip.y + 2 };
    const hipB = { x: hip.x - 3, y: hip.y + 2 };
    const kneeF = { x: hipF.x + Math.cos(p.hipF) * PL.thigh, y: hipF.y + Math.sin(p.hipF) * PL.thigh };
    const footF = { x: kneeF.x + Math.cos(p.knF) * PL.shin, y: kneeF.y + Math.sin(p.knF) * PL.shin };
    const kneeB = { x: hipB.x + Math.cos(p.hipB) * PL.thigh, y: hipB.y + Math.sin(p.hipB) * PL.thigh };
    const footB = { x: kneeB.x + Math.cos(p.knB) * PL.shin, y: kneeB.y + Math.sin(p.knB) * PL.shin };
    // keep both feet on (or above) the ground plane
    for (const f of [footF, footB]) {
      if (f.y > -2) { const over = f.y + 1.5; f.y -= over; }
    }

    const swordAng = p.sword;
    const hand = handF;
    const swordTip = { x: hand.x + Math.cos(swordAng) * PL.blade, y: hand.y + Math.sin(swordAng) * PL.blade };
    return { hip, chest, neck, head, shF, shB, elbF, elbB, handF, handB, hipF, hipB, kneeF, kneeB, footF, footB, swordAng, swordTip, headAng, lean: p.lean };
  },

  draw(ctx, game) {
    const p = this.pose;
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(this.facing, 1);

    // dash afterimages handled by FX.ghost (drawn in skeleton space)
    const J = this.localJoints();
    const flip = 1;

    // ground shadow
    if (this.__drawShadow !== false) {
      const airH = clamp((WORLD.groundY - this.y) / 260, 0, 1);
      ctx.save();
      ctx.globalAlpha = 0.45 * (1 - airH * 0.6);
      ctx.fillStyle = '#000';
      ctx.beginPath(); ctx.ellipse(0, WORLD.groundY - this.y + 1, 30 * (1 - airH * 0.35), 7 * (1 - airH * 0.4), 0, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // flip is handled by scale so all coordinates are "facing right"
    // scarf behind
    this.drawScarfLocal(ctx);

    // back arm + back leg
    this.drawBone(ctx, J.shB, J.elbB, 9, 7, '#151a2a', '#1b2236');
    this.drawBone(ctx, J.elbB, J.handB, 7, 5, '#c9b9a2', '#e8d9c4');
    this.drawBone(ctx, J.hipB, J.kneeB, 12, 9, '#10131e', '#181d2e');
    this.drawBone(ctx, J.kneeB, J.footB, 9, 6, '#0e1119', '#161a27');
    this.drawFoot(ctx, J.footB, J.knB, '#0e1119');

    // neck
    this.drawNeck(ctx, J);
    // torso robe
    this.drawTorso(ctx, J);

    // head
    this.drawHead(ctx, J);

    // front leg
    this.drawBone(ctx, J.hipF, J.kneeF, 13, 10, '#141826', '#1d2438');
    this.drawBone(ctx, J.kneeF, J.footF, 10, 7, '#12151f', '#1a2030');
    this.drawFoot(ctx, J.footF, J.knF, '#12151f');

    // front arm
    this.drawBone(ctx, J.shF, J.elbF, 10, 8, '#181e30', '#232c44');
    this.drawBone(ctx, J.elbF, J.handF, 8, 6, '#d6c5ac', '#eddfc8');

    // sword
    this.drawSword(ctx, J);

    ctx.restore();
  },

  localJoints() {
    const p = this.pose;
    const tilt = p.roll;
    const crouch = p.crouch;
    const hipY = -62 + crouch;
    const hip = { x: p.hipX, y: hipY };
    const spineAng = -Math.PI / 2 + p.lean;
    const chest = { x: hip.x + Math.cos(spineAng) * PL.spine, y: hip.y + Math.sin(spineAng) * PL.spine };
    const neckAng = -Math.PI / 2 + p.lean * 0.55 + p.neck;
    const neck = { x: chest.x + Math.cos(neckAng) * PL.neck, y: chest.y + Math.sin(neckAng) * PL.neck };
    const headAng = neckAng + p.head + (p.headTilt || 0);
    const head = { x: neck.x + Math.cos(headAng) * 10, y: neck.y + Math.sin(headAng) * 10 };

    const shF = { x: chest.x + 2, y: chest.y + 3 };
    const shB = { x: chest.x - 3, y: chest.y + 4 };
    const elbF = { x: shF.x + Math.cos(p.shF) * PL.armU, y: shF.y + Math.sin(p.shF) * PL.armU };
    const handF = { x: elbF.x + Math.cos(p.elF) * PL.armL, y: elbF.y + Math.sin(p.elF) * PL.armL };
    const elbB = { x: shB.x + Math.cos(p.shB) * PL.armU, y: shB.y + Math.sin(p.shB) * PL.armU };
    const handB = { x: elbB.x + Math.cos(p.elB) * PL.armL, y: elbB.y + Math.sin(p.elB) * PL.armL };

    const hipF = { x: hip.x + 2, y: hip.y + 2 };
    const hipB = { x: hip.x - 3, y: hip.y + 2 };
    const kneeF = { x: hipF.x + Math.cos(p.hipF) * PL.thigh, y: hipF.y + Math.sin(p.hipF) * PL.thigh };
    const footF = { x: kneeF.x + Math.cos(p.knF) * PL.shin, y: kneeF.y + Math.sin(p.knF) * PL.shin };
    const kneeB = { x: hipB.x + Math.cos(p.hipB) * PL.thigh, y: hipB.y + Math.sin(p.hipB) * PL.thigh };
    const footB = { x: kneeB.x + Math.cos(p.knB) * PL.shin, y: kneeB.y + Math.sin(p.knB) * PL.shin };
    // keep both feet on (or above) the ground plane
    for (const f of [footF, footB]) {
      if (f.y > -2) { const over = f.y + 1.5; f.y -= over; }
    }

    const swordTip = { x: handF.x + Math.cos(p.sword) * PL.blade, y: handF.y + Math.sin(p.sword) * PL.blade };
    return { hip, chest, neck, head, shF, shB, elbF, elbB, handF, handB, hipF, hipB, kneeF, kneeB, footF, footB, swordTip, headAng };
  },

  drawBone(ctx, a, b, w1, w2, outline, fill) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w1 / 2, a.y + ny * w1 / 2);
    ctx.quadraticCurveTo(a.x + dx * 0.5 + nx * (w1 + w2) * 0.26, a.y + dy * 0.5 + ny * (w1 + w2) * 0.26, b.x + nx * w2 / 2, b.y + ny * w2 / 2);
    ctx.lineTo(b.x - nx * w2 / 2, b.y - ny * w2 / 2);
    ctx.quadraticCurveTo(a.x + dx * 0.5 - nx * (w1 + w2) * 0.26, a.y + dy * 0.5 - ny * (w1 + w2) * 0.26, a.x - nx * w1 / 2, a.y - ny * w1 / 2);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    // rim light on the leading edge
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w1 * 0.5, a.y + ny * w1 * 0.5);
    ctx.lineTo(b.x + nx * w2 * 0.5, b.y + ny * w2 * 0.5);
    ctx.strokeStyle = 'rgba(190,220,235,.30)';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  },

  drawFoot(ctx, foot, knAng, col) {
    ctx.save();
    ctx.translate(foot.x, foot.y);
    ctx.rotate(knAng - Math.PI / 2);
    ctx.fillStyle = '#0b0d13';
    ctx.beginPath();
    ctx.moveTo(-8, -1);
    ctx.quadraticCurveTo(4, -6, 13, 2);
    ctx.quadraticCurveTo(14, 5, 9, 6);
    ctx.lineTo(-8, 5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(140,180,200,.18)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-6, 1); ctx.lineTo(10, 1.5); ctx.stroke();
    ctx.restore();
  },

  drawNeck(ctx, J) {
    const a = J.chest, b = J.head;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * 5.5, a.y + ny * 5.5);
    ctx.lineTo(b.x + nx * 5, b.y + ny * 5);
    ctx.lineTo(b.x - nx * 5, b.y - ny * 5);
    ctx.lineTo(a.x - nx * 5.5, a.y - ny * 5.5);
    ctx.closePath();
    ctx.fillStyle = '#dcc6a8';
    ctx.fill();
    ctx.fillStyle = 'rgba(90,60,50,.28)';
    ctx.beginPath();
    ctx.moveTo(a.x + nx * 5.5, a.y + ny * 5.5);
    ctx.lineTo(b.x + nx * 5, b.y + ny * 5);
    ctx.lineTo(b.x - nx * 1.5, b.y - ny * 1.5);
    ctx.lineTo(a.x - nx * 1.5, a.y - ny * 1.5);
    ctx.closePath(); ctx.fill();
  },

  drawTorso(ctx, J) {
    const hip = J.hip, chest = J.chest, neck = J.neck;
    const lean = this.pose.lean;
    const px = Math.cos(lean), py = Math.sin(lean);
    const nx = -py, ny = px;
    const sway = Math.sin(this.t * 2.6) * 0.9 + clamp(-this.vx * this.facing * 0.004, -3, 3);
    const air = this.ground ? 0 : 1;

    // ---- long coat tail (behind hips, follows motion) ----
    ctx.save();
    const tailLen = 34 + clamp(Math.abs(this.vx) * 0.02, 0, 10) + air * 10;
    const tsw = sway + Math.sin(this.t * 3.4) * 2.2 + air * 5;
    ctx.beginPath();
    ctx.moveTo(hip.x + nx * 9, hip.y - 4);
    ctx.quadraticCurveTo(hip.x + nx * 16 + tsw, hip.y + tailLen * 0.55, hip.x + nx * 12 + tsw * 1.7, hip.y + tailLen);
    ctx.lineTo(hip.x - nx * 2 + tsw * 1.2, hip.y + tailLen - 4);
    ctx.lineTo(hip.x - nx * 12, hip.y + 8);
    ctx.lineTo(hip.x - nx * 10, hip.y - 6);
    ctx.closePath();
    const gTail = ctx.createLinearGradient(hip.x, hip.y, hip.x, hip.y + tailLen);
    gTail.addColorStop(0, '#2a1015');
    gTail.addColorStop(1, '#5a1c18');
    ctx.fillStyle = gTail; ctx.fill();
    ctx.strokeStyle = '#0b0a10'; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.restore();

    // ---- torso: tapered coat over the chest ----
    const topW = 13, waistW = 10;
    ctx.beginPath();
    ctx.moveTo(chest.x - px * 2 - nx * topW, chest.y - py * 2 - ny * topW);
    ctx.quadraticCurveTo(chest.x - nx * 14, chest.y + 6, hip.x - nx * (waistW + 2), hip.y + 4);
    ctx.lineTo(hip.x - nx * (waistW + 5), hip.y + 17);
    ctx.lineTo(hip.x + nx * (waistW + 3), hip.y + 15);
    ctx.lineTo(hip.x + nx * (waistW + 1), hip.y + 2);
    ctx.quadraticCurveTo(chest.x + nx * 14, chest.y + 5, chest.x + nx * topW, chest.y);
    ctx.closePath();
    const g = ctx.createLinearGradient(chest.x - 16, chest.y - 10, hip.x + 18, hip.y + 18);
    g.addColorStop(0, '#2b3654');
    g.addColorStop(0.5, '#1d2539');
    g.addColorStop(1, '#121828');
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = '#080b13'; ctx.lineWidth = 1.8; ctx.stroke();

    // lapel / inner shirt
    ctx.beginPath();
    ctx.moveTo(chest.x + nx * 1, chest.y - 8);
    ctx.lineTo(chest.x + nx * 9, chest.y + 2);
    ctx.lineTo(hip.x + nx * 5, hip.y - 6);
    ctx.lineTo(hip.x + nx * 1, hip.y - 8);
    ctx.closePath();
    ctx.fillStyle = '#dfd2b8'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1; ctx.stroke();

    // crimson sash at the waist
    ctx.beginPath();
    ctx.moveTo(hip.x - nx * 12, hip.y - 1);
    ctx.lineTo(hip.x + nx * 13, hip.y - 4);
    ctx.lineTo(hip.x + nx * 12, hip.y + 5);
    ctx.lineTo(hip.x - nx * 12, hip.y + 8);
    ctx.closePath();
    ctx.fillStyle = '#a8302a'; ctx.fill();
    ctx.strokeStyle = '#5c1612'; ctx.lineWidth = 1; ctx.stroke();
    // sash knot + hanging end
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(hip.x + nx * 8, hip.y + 2);
    ctx.quadraticCurveTo(hip.x + nx * 18 + sway, hip.y + 18, hip.x + nx * 15 + sway * 1.4, hip.y + 30);
    ctx.lineTo(hip.x + nx * 9 + sway * 1.2, hip.y + 27);
    ctx.quadraticCurveTo(hip.x + nx * 11, hip.y + 16, hip.x + nx * 4, hip.y + 4);
    ctx.closePath();
    ctx.fillStyle = '#8e2620'; ctx.fill();
    ctx.restore();

    // shoulder guard on the sword arm
    ctx.save();
    ctx.translate(J.shF.x, J.shF.y);
    const armAng = Math.atan2(J.elbF.y - J.shF.y, J.elbF.x - J.shF.x);
    ctx.rotate(armAng - Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(-11, -3);
    ctx.quadraticCurveTo(-9, -14, 2, -13);
    ctx.quadraticCurveTo(11, -10, 9, 2);
    ctx.quadraticCurveTo(4, 8, -6, 6);
    ctx.quadraticCurveTo(-12, 3, -11, -3);
    ctx.closePath();
    const sg = ctx.createLinearGradient(-10, -12, 8, 6);
    sg.addColorStop(0, '#39476b');
    sg.addColorStop(1, '#1a2134');
    ctx.fillStyle = sg; ctx.fill();
    ctx.strokeStyle = '#080b13'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(150,220,220,.4)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-6, -8); ctx.quadraticCurveTo(2, -11, 7, -6); ctx.stroke();
    ctx.restore();
  },

  drawHead(ctx, J) {
    const h = J.head, ang = J.headAng;
    ctx.save();
    ctx.translate(h.x, h.y);
    ctx.rotate(ang + Math.PI / 2);
    const t = this.t;

    // --- ponytail: flows behind and up ---
    ctx.save();
    ctx.rotate(-0.35 + Math.sin(t * 4.6) * 0.1 - this.pose.lean * 0.6 - (this.ground ? 0 : 0.25));
    ctx.beginPath();
    ctx.moveTo(-1, 6);
    ctx.quadraticCurveTo(-12, 16, -17, 40 + Math.sin(t * 4.2) * 2);
    ctx.quadraticCurveTo(-23, 44, -24, 34);
    ctx.quadraticCurveTo(-21, 20, -9, 8);
    ctx.closePath();
    ctx.fillStyle = '#f0e6d2'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,105,90,.5)'; ctx.lineWidth = 0.9; ctx.stroke();
    ctx.restore();

    // --- hair silhouette (top + back of head) ---
    ctx.beginPath();
    ctx.moveTo(-9.5, 4);
    ctx.quadraticCurveTo(-12.5, -10, -3, -13.5);
    ctx.quadraticCurveTo(7, -15, 10, -5);
    ctx.quadraticCurveTo(10.5, 2, 7, 5);
    ctx.lineTo(4, 2);
    ctx.lineTo(2, 4);
    ctx.quadraticCurveTo(-3, 8, -9.5, 4);
    ctx.closePath();
    ctx.fillStyle = '#f0e6d2'; ctx.fill();
    ctx.strokeStyle = 'rgba(120,105,90,.45)'; ctx.lineWidth = 1; ctx.stroke();

    // --- face ---
    ctx.beginPath();
    ctx.ellipse(1.2, 1.5, 7.4, 8.6, 0, 0, TAU);
    ctx.fillStyle = '#e6cbaa'; ctx.fill();
    ctx.fillStyle = 'rgba(150,100,80,.14)';
    ctx.beginPath(); ctx.ellipse(2, 5.6, 5.6, 3.6, 0, 0, TAU); ctx.fill();

    // --- eyes: two sharp glowing slits ---
    const glow = 0.82 + Math.sin(t * 3.2) * 0.12;
    ctx.save();
    ctx.shadowColor = 'rgba(120,245,235,0.95)';
    ctx.shadowBlur = 7;
    ctx.fillStyle = `rgba(190,255,248,${glow})`;
    ctx.beginPath();
    ctx.moveTo(2.3, -1.4); ctx.lineTo(6.2, -2.4); ctx.lineTo(6.7, -0.9); ctx.lineTo(2.8, 0.2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-1.6, -1.0); ctx.lineTo(0.9, -1.6); ctx.lineTo(1.0, -0.4); ctx.lineTo(-1.3, 0.2);
    ctx.closePath(); ctx.fill();
    ctx.restore();
    // brows
    ctx.strokeStyle = 'rgba(70,45,35,.55)'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(1.8, -4.2); ctx.lineTo(6.6, -4.6); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-2.4, -3.4); ctx.lineTo(0.4, -4.2); ctx.stroke();

    // --- crimson headband + tails ---
    ctx.strokeStyle = '#a8302a'; ctx.lineWidth = 2.6; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-9.4, -4.6); ctx.quadraticCurveTo(-1, -7.6, 8.2, -5.4); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,180,140,.35)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(-8.6, -5.9); ctx.quadraticCurveTo(-1, -8.6, 7.6, -6.4); ctx.stroke();
    // band tail flapping back
    ctx.save();
    ctx.rotate(-0.5);
    ctx.beginPath();
    ctx.moveTo(-9, -3);
    ctx.quadraticCurveTo(-20, 2 + Math.sin(t * 7) * 3, -26, 14);
    ctx.lineTo(-22.5, 15);
    ctx.quadraticCurveTo(-16, 4, -7.5, 0);
    ctx.closePath();
    ctx.fillStyle = '#a8302a'; ctx.fill();
    ctx.restore();

    ctx.restore();
  },

  drawSword(ctx, J) {
    const a = J.handF, b = J.swordTip;
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const hot = this.state === 'attack' || this.charge > 0.5;
    ctx.save();
    ctx.translate(a.x, a.y);
    ctx.rotate(ang);

    // sheath-ish handle / wrapped grip
    ctx.fillStyle = '#211a17';
    ctx.fillRect(-15, -2.6, 15, 5.2);
    ctx.strokeStyle = '#4a3a2c'; ctx.lineWidth = 0.9;
    for (let i = -13; i < -2; i += 3.2) { ctx.beginPath(); ctx.moveTo(i, -2.6); ctx.lineTo(i + 2, 2.6); ctx.stroke(); }
    // pommel
    ctx.fillStyle = '#6b5636'; ctx.beginPath(); ctx.arc(-15, 0, 2.8, 0, TAU); ctx.fill();
    // guard
    ctx.fillStyle = '#7a6544';
    ctx.beginPath(); ctx.ellipse(-0.6, 0, 2.6, 6.2, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = '#231a12'; ctx.lineWidth = 1; ctx.stroke();

    // blade with a slight curve, bright edge
    ctx.save();
    ctx.shadowColor = hot ? 'rgba(120,245,235,.95)' : 'rgba(120,220,220,.55)';
    ctx.shadowBlur = hot ? 16 : 7;
    const grad = ctx.createLinearGradient(0, 0, len, 0);
    grad.addColorStop(0, '#dff6fa');
    grad.addColorStop(0.5, '#ffffff');
    grad.addColorStop(1, '#cdeef4');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(1, -2.8);
    ctx.quadraticCurveTo(len * 0.55, -3.9, len * 0.95, -1.8);
    ctx.lineTo(len, 0.2);
    ctx.quadraticCurveTo(len * 0.5, 2.4, 1, 2.6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    // hamon line
    ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 0.9;
    ctx.beginPath(); ctx.moveTo(2, -1.5); ctx.quadraticCurveTo(len * 0.5, -2.3, len * 0.92, -0.9); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,140,150,.45)'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(2, 1.6); ctx.quadraticCurveTo(len * 0.5, 0.6, len * 0.9, 0.1); ctx.stroke();
    ctx.restore();

    // charge glow along the blade
    if (this.chargeGlow > 0.15 || this.state === 'charge') {
      const c = this.state === 'charge' ? this.charge : this.chargeGlow;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 + c * 0.5;
      const lg = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
      lg.addColorStop(0, 'rgba(120,240,230,0)');
      lg.addColorStop(0.55, `rgba(255,214,130,${0.3 + c * 0.35})`);
      lg.addColorStop(1, 'rgba(255,255,235,.9)');
      ctx.strokeStyle = lg; ctx.lineWidth = 4 + c * 9; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      // orbiting motes
      if (c > 0.4) {
        for (let i = 0; i < 5; i++) {
          const k = ((this.t * 1.6 + i / 5) % 1);
          const px2 = lerp(a.x, b.x, 0.15 + k * 0.85) + Math.sin(this.t * 9 + i * 2) * 5;
          const py2 = lerp(a.y, b.y, 0.15 + k * 0.85) + Math.cos(this.t * 9 + i * 2) * 5;
          ctx.globalAlpha = 0.5 * c;
          ctx.fillStyle = '#ffe8b0';
          ctx.beginPath(); ctx.arc(px2, py2, 1.6 + c, 0, TAU); ctx.fill();
        }
      }
      ctx.restore();
    }
  },

  drawScarfLocal(ctx) {
    if (!this.scarf.length) return;
    ctx.save();
    const pts = this.scarf;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const last = pts[pts.length - 1];
    ctx.lineTo(last.x, last.y);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.strokeStyle = '#4a110f'; ctx.lineWidth = 7.5; ctx.stroke();
    ctx.strokeStyle = '#a8302a'; ctx.lineWidth = 5; ctx.stroke();
    ctx.strokeStyle = 'rgba(255,150,120,.5)'; ctx.lineWidth = 1.8; ctx.stroke();
    ctx.restore();
  },

  drawOverlays(ctx, game) {
    // speed lines while dashing
    if (this.state === 'dash') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(150,255,240,.35)';
      for (let i = 0; i < 6; i++) {
        const y = this.y - 30 - i * 16 - Math.random() * 8;
        const len = 40 + Math.random() * 90;
        ctx.globalAlpha = 0.2 + Math.random() * 0.3;
        ctx.lineWidth = 1 + Math.random() * 2;
        ctx.beginPath();
        ctx.moveTo(this.x - this.facing * (20 + Math.random() * 30), y);
        ctx.lineTo(this.x - this.facing * (20 + len), y);
        ctx.stroke();
      }
      ctx.restore();
    }
    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = this.hitFlash * 1.6;
      ctx.fillStyle = 'rgba(255,40,30,.35)';
      ctx.beginPath(); ctx.arc(this.x, this.y - 60, 46, 0, TAU); ctx.fill();
      ctx.restore();
    }
  },
};

// ghost drawing hook used by FX
function drawPlayerSkeleton(ctx, sk, opt) {
  // sk is a pose object; draw a simplified silhouette
  const savePose = Player.pose;
  Player.pose = sk;
  const J = Player.localJoints();
  ctx.save();
  ctx.translate(Player.x, Player.y);
  ctx.scale(Player.facing, 1);
  const col = opt.color || '#ffcf9a';
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineCap = 'round';
  const seg = (a, b, w) => {
    ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  };
  seg(J.hip, J.chest, 11);
  seg(J.chest, J.neck, 6);
  seg(J.shF, J.elbF, 8); seg(J.elbF, J.handF, 6);
  seg(J.shB, J.elbB, 8); seg(J.elbB, J.handB, 6);
  seg(J.hipF, J.kneeF, 10); seg(J.kneeF, J.footF, 8);
  seg(J.hipB, J.kneeB, 10); seg(J.kneeB, J.footB, 8);
  seg(J.handF, J.swordTip, 3);
  ctx.beginPath(); ctx.arc(J.head.x, J.head.y, 9, 0, TAU); ctx.fill();
  ctx.restore();
  Player.pose = savePose;
}
