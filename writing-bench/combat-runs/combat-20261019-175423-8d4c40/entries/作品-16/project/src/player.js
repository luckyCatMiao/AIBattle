// ---- player: movement, combos, charge heavy, launcher, slam, dash ----
'use strict';

const P_DIMS = { torsoLen: 26, headR: 8, upperArm: 16, foreArm: 15, upperLeg: 20, lowerLeg: 20, hipW: 13, shoulderW: 21 };

const ATTACKS = {
  j1: { dur: 0.24, hs: 0.07, he: 0.15, lunge: 5.0, reach: 68, hh: 52, dmg: 8, poise: 13, kx: 5.5, ky: -1.5, stop: 0.05, shake: 0.14, wind: -2.35, fol: 0.95, crouch: 0.12, sfx: 0.15 },
  j2: { dur: 0.26, hs: 0.08, he: 0.16, lunge: 5.5, reach: 72, hh: 54, dmg: 9, poise: 15, kx: 6.5, ky: -2.5, stop: 0.055, shake: 0.16, wind: -2.0, fol: 1.15, crouch: 0.1, sfx: 0.25 },
  j3: { dur: 0.38, hs: 0.13, he: 0.24, lunge: 7.5, reach: 80, hh: 58, dmg: 17, poise: 32, kx: 11, ky: -7, stop: 0.1, shake: 0.34, wind: 1.15, fol: -2.7, crouch: 0.05, sfx: 0.5 },
  air: { dur: 0.28, hs: 0.06, he: 0.18, lunge: 2, reach: 74, hh: 56, dmg: 12, poise: 18, kx: 4, ky: 2, stop: 0.06, shake: 0.2, wind: -2.2, fol: 1.0, crouch: 0, sfx: 0.3, air: true },
  heavyL: { dur: 0.34, hs: 0.1, he: 0.22, lunge: 6, reach: 86, hh: 58, dmg: 14, poise: 24, kx: 10, ky: -4, stop: 0.075, shake: 0.3, wind: -2.6, fol: 1.2, crouch: 0.18, sfx: 0.6, heavy: true },
  heavyF: { dur: 0.42, hs: 0.13, he: 0.28, lunge: 9, reach: 116, hh: 66, dmg: 30, poise: 50, kx: 17, ky: -9, stop: 0.15, shake: 0.65, wind: -2.9, fol: 1.35, crouch: 0.22, sfx: 1, heavy: true, full: true },
  launcher: { dur: 0.36, hs: 0.1, he: 0.24, lunge: 4, reach: 74, hh: 62, dmg: 12, poise: 26, kx: 2, ky: 0, launch: -16, stop: 0.085, shake: 0.3, wind: 1.3, fol: -2.9, crouch: 0.1, sfx: 0.55 },
};

class Player {
  constructor() { this.reset(0, 0); }
  reset(x, y) {
    this.x = x; this.y = y; this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = true; this.coyote = 0; this.jumpBuf = 0; this.airJumps = 1;
    this.hp = 100; this.maxHp = 100;
    this.state = 'free'; this.stateT = 0;
    this.attack = null; this.comboStage = 0; this.comboOpenT = 0; this.queuedNext = false; this.hitDone = false;
    this.charge = 0; this.charging = false;
    this.dashT = 0; this.dashCD = 0; this.airDashed = false; this.dashDir = 1;
    this.invulnT = 0; this.flashT = 0;
    this.animT = 0; this.runAmt = 0;
    this.chargeGlow = 0;
    this.deadT = 0;
    this.skel = null;
    this.trail = new Trail();
    this.aimEnemy = null;
    this.landT = 0;
    // scarf verlet chain
    this.scarf = [];
    for (let i = 0; i < 9; i++) this.scarf.push({ x: x, y: y - 70, px: x, py: y - 70 });
    // input buffers (seconds remaining)
    this.bufLight = 0; this.bufHeavy = 0; this.bufDash = 0; this.bufSpecial = 0; this.bufJump = 0;
  }
  get busy() { return this.state !== 'free'; }
  get hurtBox() { return { x: this.x - 11, y: this.y - 60, w: 22, h: 60 }; }
  get iframe() { return this.dashT > 0 || this.invulnT > 0; }

  bufferInputs() {
    if (Input.wasPressed('light')) this.bufLight = 0.16;
    if (Input.wasPressed('heavy')) this.bufHeavy = 0.16;
    if (Input.wasPressed('dash')) this.bufDash = 0.14;
    if (Input.wasPressed('special')) this.bufSpecial = 0.16;
    if (Input.wasPressed('jump')) this.bufJump = 0.14;
  }

  update(dt, game) {
    const G = game;
    this.animT += dt;
    this.stateT += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.invulnT = Math.max(0, this.invulnT - dt);
    this.dashCD = Math.max(0, this.dashCD - dt);
    this.comboOpenT = Math.max(0, this.comboOpenT - dt);
    this.landT = Math.max(0, this.landT - dt);
    for (const b of ['bufLight', 'bufHeavy', 'bufDash', 'bufSpecial', 'bufJump']) this[b] = Math.max(0, this[b] - dt);
    if (this.comboOpenT <= 0 && this.state === 'free') this.comboStage = 0;
    this.bufferInputs();

    if (this.state === 'dead') { this.updateDead(dt, G); return; }
    const dtf = dt * 60; // frame units: velocities are px/frame @60fps

    // ---- gravity & ground ----
    const wasGround = this.onGround;
    if (this.state !== 'dash' && !(this.state === 'slam')) this.vy = Math.min(this.vy + 46 * dtf, 27);
    this.x += this.vx * dtf;
    this.y += this.vy * dtf;
    this.onGround = false;
    if (this.y >= G.groundY) {
      this.y = G.groundY;
      if (!wasGround && this.vy > 8) { AUDIO.land(); G.fx.dust(this.x, this.y, 5); if (this.state === 'slam') this.slamImpact(G); }
      this.vy = 0; this.onGround = true; this.airJumps = 1; this.airDashed = false;
    }
    this.coyote = this.onGround ? 0.1 : Math.max(0, this.coyote - dt);
    this.x = clamp(this.x, 30, G.arenaW - 30);
    // friction when free
    if (this.state === 'free' && this.onGround) {
      const fr = 2600 * dt;
      this.vx = Math.abs(this.vx) <= fr ? 0 : this.vx - sign(this.vx) * fr;
    }

    // ---- state machine ----
    switch (this.state) {
      case 'free': this.stFree(dt, G); break;
      case 'attack': this.stAttack(dt, G); break;
      case 'charge': this.stCharge(dt, G); break;
      case 'strike': this.stAttack(dt, G); break;
      case 'launcher': this.stAttack(dt, G); break;
      case 'slam': this.stSlam(dt, G); break;
      case 'dash': this.stDash(dt, G); break;
      case 'hurt': if (this.stateT > 0.34) this.toFree(); break;
    }

    // run amount for anim
    const targetRun = (this.state === 'free' && Math.abs(this.vx) > 0.5) ? 1 : 0;
    this.runAmt = approach(this.runAmt, targetRun, dt * 8);

    // scarf sim
    const neckX = this.x - this.facing * 2, neckY = this.y - 62;
    const s0 = this.scarf[0];
    s0.x = neckX; s0.y = neckY;
    for (let i = 1; i < this.scarf.length; i++) {
      const p = this.scarf[i], q = this.scarf[i - 1];
      const vx = (p.x - p.px) * 0.92, vy = (p.y - p.py) * 0.92;
      p.px = p.x; p.py = p.y;
      p.x += vx - this.vx * 0.002 * dtf + Math.sin(this.animT * 5 + i) * 0.3 * dtf;
      p.y += vy + (0.35 + Math.cos(this.animT * 4 + i * 0.7) * 0.15) * dtf;
      // constraint
      const dx = p.x - q.x, dy = p.y - q.y;
      const d = Math.hypot(dx, dy) || 1;
      const want = 7;
      p.x = q.x + dx / d * want; p.y = q.y + dy / d * want;
    }

    // trail fade
    this.trail.update(dt);
    if (!this.trailActive()) this.trail.pushLen = 0;
  }

  toFree() { this.state = 'free'; this.stateT = 0; this.attack = null; }

  stFree(dt, G) {
    // movement
    const ax = (Input.isDown('right') ? 1 : 0) - (Input.isDown('left') ? 1 : 0);
    const maxRun = 8.4, accel = this.onGround ? 3000 : 1900;
    if (ax !== 0) {
      this.vx = approach(this.vx, ax * maxRun, accel * dt);
      this.facing = ax;
    }
    // jump (buffered)
    if (this.bufJump > 0) {
      if (this.onGround || this.coyote > 0) {
        this.vy = -16.2; this.onGround = false; this.coyote = 0; this.bufJump = 0;
        AUDIO.jump(); G.fx.dust(this.x, this.y, 4);
      } else if (this.airJumps > 0) {
        this.airJumps--; this.bufJump = 0;
        this.vy = -14; AUDIO.jump();
        G.fx.particles.burst(this.x, this.y - 10, 8, { spMin: 40, spMax: 160, color: ['#9fe8ff', '#fff'], type: 'dot', g: 300, lifeMax: 0.35 });
      }
    }
    // dash
    if (this.bufDash > 0 && this.dashCD <= 0 && !(this.airDashed && !this.onGround)) this.startDash(G, ax);
    // attacks
    if (this.bufLight > 0) {
      this.bufLight = 0;
      if (!this.onGround) this.startAttack('air', G);
      else this.startAttack(this.comboStage === 0 ? 'j1' : this.comboStage === 1 ? 'j2' : 'j3', G);
    } else if (this.bufHeavy > 0) {
      this.bufHeavy = 0;
      if (this.onGround) { this.state = 'charge'; this.stateT = 0; this.charge = 0; this.charging = true; AUDIO.chargeStart(); }
      else this.startSlam(G);
    } else if (this.bufSpecial > 0) {
      this.bufSpecial = 0;
      if (this.onGround) this.startLauncher(G);
      else this.startSlam(G);
    }
  }

  startDash(G, ax) {
    this.state = 'dash'; this.stateT = 0;
    this.dashDir = ax !== 0 ? ax : this.facing;
    this.facing = this.dashDir;
    this.dashT = 0.17; this.dashCD = 0.4;
    if (!this.onGround) this.airDashed = true;
    this.vy = 0;
    this.trail.clear();
    AUDIO.dash();
  }
  stDash(dt, G) {
    this.dashT -= dt;
    this.vx = this.dashDir * 22;
    this.vy = 0;
    if (this.stateT > 0.03 && this.stateT < 0.15 && G.frame % 2 === 0) {
      const pose = this.buildPose();
      const sk = computeSkeleton(this.facing < 0 ? mirrorPose(pose) : pose, P_DIMS, 1, this.x, this.pelvisY());
      sk.f = this.facing;
      G.afterimages.add(sk, '#8be9ff');
    }
    if (this.dashT <= 0) { this.dashT = 0; this.vx = this.dashDir * 6; this.toFree(); }
  }

  softAim(G) {
    // face nearest living enemy within range
    let best = null, bd = 280 * 280;
    for (const e of G.enemies) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      const dx = e.x - this.x, dy = e.y - this.y;
      const d = dx * dx + dy * dy * 4;
      if (d < bd) { bd = d; best = e; }
    }
    if (best) this.facing = best.x >= this.x ? 1 : -1;
    this.aimEnemy = best;
  }

  startAttack(kind, G) {
    this.softAim(G);
    this.state = 'attack'; this.stateT = 0;
    this.attack = ATTACKS[kind]; this.attackKind = kind;
    this.swingId = ++G.swingCounter;
    this.hitDone = false; this.queuedNext = false;
    this.comboStage = kind === 'j1' ? 1 : kind === 'j2' ? 2 : kind === 'j3' ? 3 : this.comboStage;
    this.comboOpenT = 0;
    this.vx = this.facing * this.attack.lunge;
    if (this.attack.air) this.vy = Math.min(this.vy, -3);
    if (kind === 'j3') this.vy = -5.5; // rising finisher
    AUDIO.swing(this.attack.sfx);
    this.trail.clear();
  }
  startLauncher(G) {
    this.softAim(G);
    this.state = 'launcher'; this.stateT = 0;
    this.attack = ATTACKS.launcher; this.attackKind = 'launcher';
    this.swingId = ++G.swingCounter;
    this.hitDone = false;
    this.vy = -9.5; this.onGround = false;
    this.vx = this.facing * 3;
    AUDIO.swing(0.55);
    this.trail.clear();
  }
  startSlam(G) {
    this.state = 'slam'; this.stateT = 0;
    this.attack = null;
    this.vy = 26; this.vx = this.facing * 5.5;
    AUDIO.swing(0.7);
  }
  slamImpact(G) {
    this.vy = 0;
    G.onSlamImpact(this);
    this.state = 'free'; this.stateT = 0;
    this.vx = 0;
  }

  stAttack(dt, G) {
    const A = this.attack;
    if (!A) { this.toFree(); return; }
    const t = this.stateT;
    // hold slight forward drift
    if (t > A.hs) this.vx *= (1 - 6 * dt);
    // buffering next combo hit
    if (this.bufLight > 0 && t > A.hs && !A.heavy && !A.air && this.attackKind !== 'launcher') {
      this.bufLight = 0;
      if (this.comboStage < 3) this.queuedNext = true;
    }
    // dash cancel after hit
    if (this.bufDash > 0 && t > A.he && this.dashCD <= 0) {
      this.bufDash = 0; this.comboOpenT = 0.45; this.startDash(G, 0); return;
    }
    if (t >= A.dur) {
      if (this.queuedNext && this.onGround) {
        const nxt = this.comboStage === 1 ? 'j2' : 'j3';
        this.startAttack(nxt, G);
      } else {
        this.comboOpenT = 0.42;
        this.toFree();
      }
    }
  }

  stCharge(dt, G) {
    this.charge = Math.min(1, this.charge + dt / 0.85);
    this.chargeGlow = this.charge;
    this.vx *= (1 - 8 * dt);
    if (G.frame % 4 === 0) G.fx.particles.spawn({
      x: this.x + rand(-20, 20), y: this.y - rand(10, 60),
      vx: rand(-30, 30), vy: rand(-80, -20), g: -100, type: 'dot',
      size: rand(1.5, 3), color: this.charge >= 1 ? '#ff9a3d' : '#ffd76a', life: 0.3,
    });
    if (this.bufDash > 0 && this.dashCD <= 0) { // cancel
      this.bufDash = 0; AUDIO.chargeStop(); this.charging = false; this.chargeGlow = 0;
      this.startDash(G, 0); return;
    }
    if (!Input.isDown('heavy') || this.charge >= 1 && !Input.isDown('heavy')) {
      AUDIO.chargeStop(); this.charging = false;
      const full = this.charge >= 0.95;
      this.chargeGlow = 0;
      this.startAttack(full ? 'heavyF' : 'heavyL', G);
      this.state = 'strike';
      if (full) G.fx.shocks.spawn(this.x, this.y - 30, { r0: 6, r1: 90, life: 0.25, color: '#ffd76a', width: 4 });
    }
  }

  stSlam(dt, G) {
    // diving; steer slightly
    const ax = (Input.isDown('right') ? 1 : 0) - (Input.isDown('left') ? 1 : 0);
    this.vx += ax * 0.5 * dt * 60;
    if (G.frame % 2 === 0) {
      G.fx.particles.spawn({ x: this.x + rand(-8, 8), y: this.y - rand(0, 50), vx: 0, vy: 40, type: 'dot', size: 3, color: '#9fe8ff', life: 0.25 });
    }
  }

  updateDead(dt, G) {
    const dtf = dt * 60;
    this.deadT += dt;
    this.vy = Math.min(this.vy + 46 * dtf, 27);
    this.x += this.vx * dtf; this.y += this.vy * dtf;
    if (this.y > G.groundY) { this.y = G.groundY; this.vy = 0; }
    this.vx *= (1 - 4 * dt);
    this.trail.update(dt);
  }

  takeHit(dmg, dirX, G, opts) {
    opts = opts || {};
    if (this.state === 'dead') return false;
    if (this.iframe) {
      G.fx.floaters.spawn(this.x, this.y - 78, '闪避', '#8be9ff', 15);
      return false;
    }
    this.hp -= dmg;
    this.flashT = 0.12;
    this.invulnT = 0.75;
    AUDIO.hurt();
    G.fx.hitSpark(this.x, this.y - 40, false, dirX);
    G.fx.bloodOil(this.x, this.y - 40, dirX, 6);
    G.addShake(0.3);
    G.hitStop(0.035);
    this.vx = dirX * 6.5; this.vy = -5.5;
    if (this.hp <= 0) {
      this.hp = 0;
      this.state = 'dead'; this.deadT = 0;
      AUDIO.gameOver();
      G.onPlayerDeath();
      return true;
    }
    this.state = 'hurt'; this.stateT = 0; this.attack = null; this.charging = false; this.chargeGlow = 0;
    AUDIO.chargeStop();
    return true;
  }

  pelvisY() { return this.y - 40 + (this.poseCache ? this.poseCache.crouch * 12 : 0); }

  trailActive() {
    if ((this.state === 'attack' || this.state === 'strike' || this.state === 'launcher') && this.attack) {
      return this.stateT >= this.attack.hs * 0.6 && this.stateT <= this.attack.he + 0.06;
    }
    return this.state === 'dash' || this.state === 'slam';
  }

  // facing-right-space pose; mirrored by caller when facing left
  buildPose() {
    const p = basePose();
    const t = this.animT;
    if (this.state === 'dead') {
      p.crouch = 1; p.lean = 1.35;
      p.armL = { a: 0.6, b: 0.4 }; p.armR = { a: 2.4, b: 0.3 };
      p.legL = { a: 1.7, b: 1.2 }; p.legR = { a: 1.2, b: 1.5 };
      p.blade.on = true; p.blade.a = 1.9;
      return p;
    }
    if (this.state === 'hurt') {
      p.lean = -0.5; p.crouch = 0.25;
      p.armL = { a: 0.4, b: 0.9 }; p.armR = { a: 2.8, b: 0.6 };
      p.legL = { a: 1.3, b: 0.7 }; p.legR = { a: 1.7, b: 0.5 };
      p.blade.a = 2.6;
      return p;
    }
    if (this.state === 'dash') {
      p.lean = 0.85; p.crouch = 0.45;
      p.armL = { a: 2.9, b: 0.3 }; p.armR = { a: -0.4, b: 0.25 };
      p.legL = { a: 2.5, b: 0.4 }; p.legR = { a: 0.9, b: 0.5 };
      p.blade.a = -0.3;
      return p;
    }
    if (this.state === 'slam') {
      p.lean = 0.3; p.crouch = 0.2;
      p.armL = { a: -1.4, b: 0.3 }; p.armR = { a: 1.4, b: 0.15 };
      p.legL = { a: 1.0, b: 0.3 }; p.legR = { a: 2.1, b: 0.3 };
      p.blade.a = 1.5;
      return p;
    }
    if ((this.state === 'attack' || this.state === 'strike' || this.state === 'launcher') && this.attack) {
      const A = this.attack;
      const tt = clamp(this.stateT / A.dur, 0, 1);
      const w = A.hs / A.dur, e2 = A.he / A.dur;
      let k;
      if (tt < w) k = -easeOutCubic(tt / w) * 0.25;        // windup: hold back
      else if (tt < e2) k = easeOutQuart((tt - w) / (e2 - w)); // strike: sweep
      else k = 1 + (tt - e2) / (1 - e2) * 0.15;             // follow-through
      const ang = lerp(A.wind, A.fol, clamp(k, -0.3, 1.15));
      p.lean = 0.12 + (tt < w ? -0.15 : 0.3 * Math.sin(clamp(k, 0, 1) * Math.PI));
      p.crouch = A.crouch + (tt < w ? 0.1 : -0.05);
      p.armR = { a: ang, b: tt < w ? 1.0 : 0.12 };
      p.armL = { a: Math.PI - ang * 0.4, b: 0.7 };
      p.blade.a = ang;
      p.blade.len = A.full ? 62 : A.heavy ? 56 : 46;
      const st = Math.sin(clamp(k, 0, 1) * Math.PI);
      p.legL = { a: Math.PI / 2 + 0.5 * st, b: 0.6 * st };
      p.legR = { a: Math.PI / 2 - 0.6 * st, b: 0.8 * st };
      if (this.attackKind === 'launcher') { p.lean = lerp(0.5, -0.45, clamp(k, 0, 1)); p.crouch = 0; }
      if (this.attackKind === 'j3') { p.lean = lerp(-0.2, -0.6, clamp(k, 0, 1)); }
      return p;
    }
    if (this.state === 'charge') {
      const c = this.charge;
      p.crouch = 0.35 + c * 0.15; p.lean = -0.2;
      p.armR = { a: -2.5 + c * 0.4, b: 0.9 };
      p.armL = { a: -2.2, b: 1.0 };
      p.blade.a = -2.5 + c * 0.4; p.blade.len = 50 + c * 12;
      p.legL = { a: Math.PI / 2 + 0.4, b: 0.8 }; p.legR = { a: Math.PI / 2 - 0.4, b: 0.9 };
      return p;
    }
    // free: idle / run / air
    if (!this.onGround) {
      const up = this.vy < 0;
      p.lean = up ? 0.15 : -0.1;
      p.armL = { a: up ? -0.8 : 0.5, b: 0.5 };
      p.armR = { a: up ? -0.4 : 1.9, b: up ? 0.4 : 0.3 };
      p.blade.a = up ? -0.5 : 2.0;
      p.legL = { a: up ? 1.9 : 1.0, b: up ? 0.9 : 0.25 };
      p.legR = { a: up ? 0.9 : 1.95, b: up ? 0.3 : 0.9 };
      if (this.stateT < 99 && this.landT > 0) p.crouch = 0.3;
      return p;
    }
    const r = this.runAmt;
    const sw = Math.sin(t * 11) * 0.75 * r;
    const bob = Math.abs(Math.sin(t * 11)) * 2.5 * r;
    p.crouch = 0.08 * r + (this.landT > 0 ? 0.35 * (this.landT / 0.14) : 0);
    p.lean = 0.22 * r;
    p.legL = { a: Math.PI / 2 + sw, b: Math.max(0, -sw) * 1.1 + 0.1 * r };
    p.legR = { a: Math.PI / 2 - sw, b: Math.max(0, sw) * 1.1 + 0.1 * r };
    p.armL = { a: Math.PI / 2 - sw * 0.7 + 0.15, b: 0.35 };
    p.armR = { a: Math.PI / 2 + sw * 0.7 - 0.2, b: 0.3 };
    p.blade.a = Math.PI / 2 - 0.55 + Math.sin(t * 2) * 0.05;
    p.headTilt = 0.05;
    void bob;
    return p;
  }

  computeSkel() {
    const pose = this.buildPose();
    this.poseCache = pose;
    const p2 = this.facing < 0 ? mirrorPose(pose) : pose;
    const sk = computeSkeleton(p2, P_DIMS, 1, this.x, this.pelvisY());
    sk.f = this.facing;
    this.skel = sk;
    return sk;
  }
}
