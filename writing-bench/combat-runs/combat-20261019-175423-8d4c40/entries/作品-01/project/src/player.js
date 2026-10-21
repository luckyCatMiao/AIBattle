/* =========================================================
   player.js — the Reaper of Crimson Moon
   ========================================================= */
const GRAVITY = 2050;
const GROUND_Y = 470;          // ground surface y in world space
const ARENA = { x1: 80, x2: 1920 };

// Combo definitions. Startup / active / recovery in seconds.
// box: {x offset from player front, y offset from player y (feet at +? player.y is centre of torso)}
const ATTACKS = {
  // light chain
  L1: { startup: 0.055, active: 0.085, recovery: 0.14, damage: 10, box: { ox: 18, oy: -58, w: 78, h: 64 }, kb: 120, lift: 40, hitstop: 0.045, heavy: false, next: 'L2', cancelAt: 0.55, sfx: 'light', step: 110, arc: -0.8 },
  L2: { startup: 0.06, active: 0.09, recovery: 0.15, damage: 11, box: { ox: 20, oy: -60, w: 82, h: 66 }, kb: 140, lift: 50, hitstop: 0.05, heavy: false, next: 'L3', cancelAt: 0.55, sfx: 'light', step: 130, arc: 0.9 },
  L3: { startup: 0.075, active: 0.1, recovery: 0.18, damage: 13, box: { ox: 22, oy: -58, w: 90, h: 64 }, kb: 190, lift: 30, hitstop: 0.06, heavy: false, next: 'L4', cancelAt: 0.6, sfx: 'light', step: 150, arc: -1.0 },
  L4: { startup: 0.11, active: 0.12, recovery: 0.28, damage: 22, box: { ox: 20, oy: -92, w: 96, h: 100 }, kb: 380, lift: -320, hitstop: 0.085, heavy: false, next: null, cancelAt: 0.75, launcher: true, sfx: 'heavy', step: 150, arc: 1.5, up: true },
  // air
  AIR1: { startup: 0.05, active: 0.09, recovery: 0.16, damage: 9, box: { ox: 14, oy: -46, w: 76, h: 70 }, kb: 90, lift: -30, hitstop: 0.04, heavy: false, next: 'AIR2', cancelAt: 0.5, sfx: 'light', step: 30, arc: -0.6, air: true },
  AIR2: { startup: 0.055, active: 0.1, recovery: 0.2, damage: 14, box: { ox: 16, oy: -40, w: 82, h: 82 }, kb: 200, lift: 260, hitstop: 0.06, heavy: false, next: null, cancelAt: 0.55, sfx: 'light', step: 40, arc: 1.2, air: true },
  // heavy
  H1: { startup: 0.24, active: 0.12, recovery: 0.34, damage: 34, box: { ox: 22, oy: -66, w: 116, h: 84 }, kb: 820, lift: 230, hitstop: 0.13, heavy: true, next: null, cancelAt: 1, sfx: 'heavy', step: 260, arc: -1.35 },
  H2: { startup: 0.28, active: 0.13, recovery: 0.34, damage: 42, box: { ox: 24, oy: -64, w: 124, h: 92 }, kb: 980, lift: 140, hitstop: 0.15, heavy: true, next: null, cancelAt: 1, sfx: 'heavy', step: 300, arc: 1.4 },
  H3: { startup: 0.32, active: 0.14, recovery: 0.38, damage: 52, box: { ox: 24, oy: -78, w: 132, h: 104 }, kb: 1150, lift: 320, hitstop: 0.18, heavy: true, next: null, cancelAt: 1, sfx: 'heavy', step: 330, arc: -1.5, smash: true },
  // air heavy — pogo plunge
  AIRH: { startup: 0.16, active: 0.34, recovery: 0.18, damage: 30, box: { ox: -34, oy: -40, w: 92, h: 130 }, kb: 260, lift: 60, hitstop: 0.12, heavy: true, next: null, cancelAt: 1, sfx: 'heavy', step: 0, arc: 1.6, plunge: true }
};

class Player {
  constructor(world) {
    this.world = world;
    this.reset();
  }
  reset() {
    this.x = 240;
    this.y = GROUND_Y;
    this.vx = 0; this.vy = 0;
    this.w = 30; this.h = 68;
    this.hp = 100; this.maxHp = 100;
    this.facing = 1;
    this.onGround = true;
    this.runT = 0;
    this.state = 'idle'; // idle|run|air|attack|hurt|dash|parry|dead|land
    this.attack = null;
    this.attackT = 0;
    this.attackHits = null;
    this.attackChain = null;
    this.stage = null;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboBest = 0;
    this.queuedNext = null;
    this.dashT = 0; this.dashCd = 0;
    this.parryT = 0; this.parryCd = 0; this.parrySuccess = 0;
    this.iframe = 0;
    this.chargeT = 0; this.charging = false; this.chargeLevel = 0;
    this.hurtT = 0;
    this.koFlash = 0;
    this.trail = [];
    this.stepTimer = 0;
    this.focus = 1;            // focus gauge for special (0..1)
    this.skillCd = [0, 0, 0, 0];
    this.skillId = -1;
    this.skillT = 0;
    this.skillDur = 0;
    this.skillFired = false;
    this.skillDashDir = 1;
    this.specialT = 0;
    this.specialHits = null; this.specialSeq = 0;
    this.lastHitTarget = null;
    this.anim = { armA: 0, armB: 0.4, legA: 0, legB: 0, lean: 0, swordA: -0.9, bladeGlow: 0 };
    this.prevY = this.y;
    this.landTimer = 0;
    this.dashTrailT = 0;
    this.sweepGlow = 0;
  }

  get cx() { return this.x; }
  get cy() { return this.y - this.h * 0.5; }
  get top() { return this.y - this.h; }

  hitbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  canAct() {
    return this.state !== 'dead' && this.state !== 'hurt' && this.state !== 'skill' && !(this.state === 'attack' && !this.canCancel()) && this.state !== 'dash' && this.specialT <= 0;
  }
  canCancel() {
    if (!this.attack) return true;
    if (this.state !== 'attack') return true;
    const def = this.attack;
    const total = def.startup + def.active + def.recovery;
    return this.attackT >= total * def.cancelAt || (this.attackHits && this.attackHits.size > 0 && this.attackT >= def.startup + def.active * 0.5);
  }

  tryAttack(defKey, isHeavy) {
    const def = ATTACKS[defKey];
    if (!def) return false;
    this.state = 'attack';
    this.attack = def;
    this.attackKey = defKey;
    this.attackT = 0;
    this.attackHits = new Set();
    this.attackChain = this.stage;
    this.stage = defKey;
    this.charging = false;
    this.chargeT = 0;
    this.anim.bladeGlow = 1;
    // attack lunge
    const step = def.step || 0;
    const groundedStep = this.onGround ? 1 : 0.35;
    this.vx += this.facing * step * groundedStep;
    if (this.onGround) this.vy = 0;
    if (def.launcher) this.vy = -120;
    if (def.plunge) this.vy = 1250;
    if (def.air && this.onGround) {
      // air moves initiated on ground give a little hop
      this.vy = -180;
      this.onGround = false;
    }
    Sfx.swing(!!def.heavy);
    const w = this.world;
    // sword arc light
    const arcColor = def.heavy ? 'rgba(255,150,110,0.85)' : 'rgba(190,235,255,0.8)';
    const cy = this.cy - 6;
    w.fx.slashLight(this.x + this.facing * 18, cy, this.facing > 0 ? (def.arc || 0) : Math.PI - (def.arc || 0), 1.9, def.heavy ? 104 : 78, arcColor, def.heavy ? 0.3 : 0.2, def.heavy ? 15 : 8);
    w.fx.spark(this.x + this.facing * 46, cy, { count: def.heavy ? 10 : 5, speed: 260, size: 2, life: 0.18, color: '#bfefff', dir: this.facing > 0 ? 0 : Math.PI, spread: 1.2, grav: 300 });
    return true;
  }

  update(dt, input) {
    const w = this.world;
    this.iframe = Math.max(0, this.iframe - dt);
    for (let i = 0; i < 4; i++) this.skillCd[i] = Math.max(0, this.skillCd[i] - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.parrySuccess = Math.max(0, this.parrySuccess - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.koFlash = Math.max(0, this.koFlash - dt * 3);
    this.anim.bladeGlow = Math.max(0, this.anim.bladeGlow - dt * 4.5);
    this.sweepGlow = Math.max(0, this.sweepGlow - dt * 3);
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    if (this.comboTimer <= 0 && this.combo > 0) this.combo = 0;
    if (this.specialT > 0) this.specialT -= dt;

    if (this.state === 'dead') {
      this.vy += GRAVITY * dt;
      this.y = Math.min(GROUND_Y, this.y + this.vy * dt);
      return;
    }

    if (this.state === 'hurt') {
      this.hurtT -= dt;
      this.vx *= Math.pow(0.02, dt);
      if (this.hurtT <= 0) this.state = this.onGround ? 'idle' : 'air';
    }

    // ---- input intents (buffered) ----
    const wantLeft = input.held('left');
    const wantRight = input.held('right');
    const dir = (wantRight ? 1 : 0) - (wantLeft ? 1 : 0);

    // ---- skills (1-4) ----
    if (this.state !== 'dead' && this.state !== 'hurt') {
      for (let i = 0; i < 4; i++) {
        if (this.state !== 'skill' && input.consume('skill' + (i + 1)) && this.skillCd[i] <= 0) {
          this.startSkill(i);
          return this.updateSkill(dt);
        }
      }
    }
    if (this.state === 'skill') return this.updateSkill(dt);

    // parry (I)
    if (input.consume('special') && this.parryCd <= 0 && this.state !== 'hurt' && this.state !== 'dash' && this.specialT <= 0) {
      this.state = 'parry';
      this.parryT = 0.24;
      this.parryCd = 0.62;
      this.vx *= 0.3;
      Sfx.swing(false);
      w.fx.ring(this.x, this.cy, 12, 56, 'rgba(160,220,255,0.9)', 0.24, 2.5);
    }

    // dash (L)
    if (input.consume('dash') && this.dashCd <= 0 && this.state !== 'hurt' && this.state !== 'dead' && this.specialT <= 0) {
      this.state = 'dash';
      this.dashT = 0.17;
      this.dashCd = 0.16;
      this.iframe = Math.max(this.iframe, 0.2);
      this.charging = false; this.chargeT = 0;
      const d = dir !== 0 ? dir : this.facing;
      this.facing = d;
      this.vx = d * 880;
      this.vy = this.onGround ? 0 : Math.min(this.vy, 0) * 0.2;
      Sfx.dash();
      w.fx.streak(this.x, this.cy, d > 0 ? Math.PI : 0, 54, 3, 'rgba(160,225,255,0.9)', 0.2);
      w.fx.burst(this.x - d * 10, this.cy, 'rgba(150,210,255,0.8)', 5, 200, 2, 0.3, 100);
      this.dashTrailT = 0;
    }

    // jump (buffered)
    if (input.buffered('jump')) {
      if (this.onGround && this.state !== 'hurt' && this.state !== 'dead' && this.state !== 'parry') {
        input.consume('jump');
        this.vy = -720;
        this.onGround = false;
        this.state = 'air';
        this.charging = false;
        Sfx.jump();
        w.fx.dust(this.x, GROUND_Y, 6, 0);
        w.fx.ring(this.x, GROUND_Y - 1, 6, 34, 'rgba(220,200,180,0.5)', 0.25, 1.5);
      } else if (!this.onGround && this.jumpUsed === false) {
        // no double jump implemented — keep tight
        input.consume('jump');
      }
    }

    // ---- attacks ----
    if (this.state === 'parry') {
      this.parryT -= dt;
      this.vx *= Math.pow(0.08, dt);
      if (this.parryT <= 0) this.state = this.onGround ? 'idle' : 'air';
    }

    if (this.state === 'dash') {
      this.dashT -= dt;
      this.dashTrailT -= dt;
      if (this.dashTrailT <= 0) {
        this.dashTrailT = 0.025;
        w.fx.addPart({ kind: 'smoke', x: this.x + rand(-8, 8), y: this.cy + rand(-22, 22), vx: -this.facing * 40, vy: rand(-10, 10), life: 0.26, max: 0.26, size: rand(7, 13), color: 'rgba(110,190,255,0.35)', grav: 0, drag: 4 });
      }
      if (this.dashT <= 0) { this.state = this.onGround ? 'idle' : 'air'; this.vx *= 0.45; }
    }

    // heavy charge start
    if (this.state !== 'attack' && this.state !== 'hurt' && this.state !== 'dash' && this.state !== 'parry' && this.specialT <= 0) {
      if (input.held('heavy')) {
        if (!this.charging) { this.charging = true; this.chargeT = 0; }
        this.chargeT += dt;
        if (this.chargeT > 0.05 && this.chargeT < 0.09) Sfx.charge(0);
        if (this.chargeT > 0.62 && this.chargeT < 0.66) Sfx.charge(1);
        if (this.chargeT > 1.08 && this.chargeT < 1.12) Sfx.charge(2);
        if (this.chargeT > 1.35 && Math.random() < dt * 20) {
          w.fx.ember(this.x + this.facing * 30 + rand(-8, 8), this.cy + rand(-20, 20), 1);
        }
      } else if (this.charging) {
        // release heavy
        const lvl = this.chargeT > 1.08 ? 3 : this.chargeT > 0.62 ? 2 : 1;
        this.charging = false;
        if (this.chargeT > 0.12) {
          const key = this.onGround ? ('H' + Math.min(3, lvl)) : 'AIRH';
          this.tryAttack(key, true);
          this.lastChargeLevel = lvl;
          this.charging = false;
          this.chargeT = 0;
          return this.postAttackInput(dt, input, dir);
        }
        this.chargeT = 0;
      }
    }

    if (this.state === 'attack') {
      this.attackT += dt;
      const def = this.attack;
      const total = def.startup + def.active + def.recovery;
      const inActive = this.attackT >= def.startup && this.attackT < def.startup + def.active;

      // light chain buffered input
      if (input.buffered('attack')) {
        if (this.attackHits && this.attackHits.size > 0 && this.attackT >= def.startup + def.active * 0.35 && def.next) {
          input.consume('attack');
          const nextKey = def.next;
          this.tryAttack(nextKey, false);
          return this.postAttackInput(dt, input, dir);
        } else if (this.attackT >= total * def.cancelAt && this.attackT > 0.02) {
          input.consume('attack');
          if (this.onGround) this.tryAttack('L1', false);
          else this.tryAttack('AIR1', false);
          return this.postAttackInput(dt, input, dir);
        }
      }

      if (inActive) {
        if (def.hitstop && this.attackHits && this.attackHits.size > 0) {
          this.vx *= Math.pow(0.001, dt * 8);
        }
        w.resolvePlayerAttack(this, def);
      }
      if (this.attackT >= total) {
        this.state = this.onGround ? 'idle' : 'air';
        this.attack = null;
      }
    }

    // light attack start
    if (input.buffered('attack') && this.state !== 'hurt' && this.state !== 'dash' && this.state !== 'parry' && this.specialT <= 0) {
      const canStart = this.state !== 'attack' || (this.attack && this.canCancel() && !this.attack.next);
      if (canStart) {
        input.consume('attack');
        this.charging = false; this.chargeT = 0;
        if (this.onGround) this.tryAttack('L1', false);
        else this.tryAttack('AIR1', false);
        return this.postAttackInput(dt, input, dir);
      }
    }

    // ---- movement ----
    const control = this.state !== 'attack' && this.state !== 'hurt' && this.state !== 'dash' && this.state !== 'parry' && this.specialT <= 0;
    const accel = this.onGround ? 3600 : 2100;
    const maxSpeed = this.onGround ? 340 : 300;
    if (control) {
      if (dir !== 0) {
        this.vx = approach(this.vx, dir * maxSpeed, accel * dt);
        this.facing = dir;
      } else {
        this.vx = approach(this.vx, 0, (this.onGround ? 3000 : 700) * dt);
      }
      if (dir !== 0 && this.onGround) {
        this.runT += dt;
        this.stepTimer -= dt;
        if (this.stepTimer <= 0) { this.stepTimer = 0.27; w.fx.dust(this.x - dir * 8, GROUND_Y, 2, -dir); }
      } else if (this.onGround) {
        this.runT = 0;
      }
    } else if (this.state === 'attack') {
      this.vx *= Math.pow(0.045, dt);
    }

    if (this.charging && this.state !== 'attack') {
      this.vx *= Math.pow(0.01, dt);
      if (this.onGround) this.facing = this.facing; // hold facing
    }

    // gravity & integration
    this.prevY = this.y;
    if (!this.onGround) this.vy += GRAVITY * dt;
    // ledge check
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, ARENA.x1 + 18, ARENA.x2 - 18);

    if (this.y >= GROUND_Y) {
      if (!this.onGround) {
        const impact = this.vy;
        this.onGround = true;
        this.y = GROUND_Y;
        this.vy = 0;
        if (impact > 300) {
          Sfx.land();
          w.fx.dust(this.x, GROUND_Y, impact > 900 ? 12 : 6, 0);
          w.fx.ring(this.x, GROUND_Y - 1, 8, impact > 900 ? 70 : 40, 'rgba(220,200,180,0.55)', 0.3, 2);
          if (impact > 1000) w.cam.shake(2.2, 0.12);
        }
        if (this.state === 'air' || this.state === 'idle') this.state = 'idle';
        if (this.state === 'attack' && this.attack && this.attack.plunge) {
          // pogo landing impact
          w.fx.ring(this.x, GROUND_Y - 1, 10, 100, 'rgba(255,170,120,0.8)', 0.32, 4);
          w.cam.shake(3, 0.14);
          w.damageArea(this.x, GROUND_Y - 10, 92, 44, 12, 200, 1);
          this.state = 'idle';
          this.attack = null;
        } else if (this.state === 'attack') {
          // air attack landing -> brief recovery, keep attack running
        }
        if (this.state === 'run') this.state = 'idle';
        this.landTimer = 0.08;
      }
      this.y = GROUND_Y;
      this.onGround = true;
    } else {
      this.onGround = false;
    }

    if (this.landTimer > 0) this.landTimer -= dt;

    // walk state
    if (this.state === 'idle' || this.state === 'run' || this.state === 'air') {
      if (!this.onGround) this.state = 'air';
      else if (Math.abs(this.vx) > 25) this.state = 'run';
      else this.state = 'idle';
    }

    // ---- animation targets ----
    this.updateAnim(dt);
    this.postAttackInput(dt, input, dir);
  }

  postAttackInput(dt, input, dir) {
    // no-op placeholder for future; kept for structural symmetry
  }

  updateAnim(dt) {
    const a = this.anim;
    let tArmA = 0, tArmB = 0.35, tLegA = 0, tLegB = 0, tLean = 0, tSword = -0.95;
    const runPhase = this.runT * 15;
    if (this.state === 'run') {
      tLegA = Math.sin(runPhase) * 0.85;
      tLegB = -Math.sin(runPhase) * 0.85;
      tArmA = -Math.sin(runPhase) * 0.6;
      tArmB = Math.sin(runPhase) * 0.4;
      tLean = 0.16;
      tSword = -0.7;
    } else if (this.state === 'air') {
      const fall = clamp(this.vy / 900, -0.4, 1);
      tLegA = -0.5 + fall * 0.5; tLegB = 0.3;
      tArmA = -0.5; tArmB = -0.9;
      tLean = 0.08 * this.facing;
      tSword = -1.4;
    } else if (this.state === 'dead') {
      tLegA = -1.2; tLegB = 0.4; tArmA = -1.8; tArmB = -1.2; tLean = -1.1; tSword = -0.1;
    } else if (this.state === 'hurt') {
      tLean = -0.32 * this.facing;
      tArmA = -1.1; tArmB = -1.4; tSword = -0.3;
      tLegA = -0.3; tLegB = 0.3;
    } else if (this.state === 'dash') {
      tLean = 0.5; tLegA = -0.6; tLegB = 0.7; tArmA = -0.8; tArmB = 1.1; tSword = 2.5;
    } else if (this.state === 'parry') {
      tLean = -0.06; tArmA = -1.35; tArmB = -1.1; tSword = -2.4;
      tLegA = -0.25; tLegB = 0.25;
    } else if (this.charging) {
      const e = clamp(this.chargeT / 1.2, 0, 1);
      tLean = -0.18 - e * 0.15;
      tArmA = -2.1 - e * 0.3; tArmB = -1.7; tSword = -2.8 - e * 0.3;
      tLegA = -0.35; tLegB = 0.4;
    } else if (this.state === 'skill') {
      const k = this.skillT / Math.max(0.01, this.skillDur);
      if (this.skillId === 0) {
        tLean = 0.1; tArmA = -1.6 - Math.sin(k * Math.PI) * 1.2; tArmB = 1.2; tSword = tArmA - 0.4;
        tLegA = -0.4; tLegB = 0.4;
      } else if (this.skillId === 1) {
        tLean = 0.6; tLegA = -0.7; tLegB = 0.8; tArmA = 2.1; tArmB = 1.4; tSword = 2.6;
      } else if (this.skillId === 2) {
        tLean = -0.25; tArmA = -2.7; tArmB = -2.4; tSword = -3.0;
        tLegA = k < 0.5 ? -0.7 : 0.2; tLegB = 0.5;
      } else {
        tLean = -0.1; tLegA = -0.35; tLegB = 0.35;
        tArmA = -2.5 + Math.sin(k * 18) * 0.5; tArmB = -2.2; tSword = tArmA - 0.5;
      }
    } else if (this.state === 'attack' && this.attack) {
      const def = this.attack;
      const t = this.attackT;
      const total = def.startup + def.active + def.recovery;
      const k = clamp(t / def.startup, 0, 1);
      const hitK = clamp((t - def.startup) / def.active, 0, 1);
      const recK = clamp((t - def.startup - def.active) / def.recovery, 0, 1);
      if (def.plunge) {
        tLean = 0.9; tArmA = 2.4; tArmB = 1.9; tSword = 2.7;
        tLegA = -0.5; tLegB = 1.0;
      } else {
        const windup = def.arc < 0 ? -2.3 : 2.0;
        const follow = def.arc < 0 ? 2.2 : -2.0;
        if (t < def.startup) {
          tArmA = lerp(-0.4, windup, easeOutQuad(k));
          tArmB = lerp(-0.4, windup + 0.3, easeOutQuad(k));
          tSword = tArmA - 0.5;
          tLean = -0.12;
          tLegA = -0.2; tLegB = 0.25;
        } else if (t < def.startup + def.active + 0.02) {
          const blow = def.smash ? 1.15 : 1;
          tArmA = lerp(windup, follow * blow, easeOutCubic(Math.min(1, hitK * 1.6)));
          tArmB = lerp(windup + 0.3, follow * blow, easeOutCubic(Math.min(1, hitK * 1.6)));
          tSword = tArmA - 0.6;
          tLean = 0.22 + hitK * 0.12;
          tLegA = -0.45; tLegB = 0.4;
        } else {
          tArmA = lerp(follow, -0.6, easeOutQuad(recK));
          tArmB = lerp(follow, 0.1, easeOutQuad(recK));
          tSword = tArmA - 0.4;
          tLean = lerp(0.2, 0.02, recK);
          tLegA = -0.2; tLegB = 0.2;
        }
      }
    } else if (this.state === 'idle') {
      const b = Math.sin(this.world.time * 2.6);
      tArmA = -0.1 + b * 0.04;
      tArmB = 0.3 + b * 0.05;
      tLean = 0.02;
      tSword = -1.05 + b * 0.03;
    }
    const speed = 22;
    a.armA = lerp(a.armA, tArmA, Math.min(1, speed * dt));
    a.armB = lerp(a.armB, tArmB, Math.min(1, speed * dt));
    a.legA = lerp(a.legA, tLegA, Math.min(1, speed * dt));
    a.legB = lerp(a.legB, tLegB, Math.min(1, speed * dt));
    a.lean = lerp(a.lean, tLean, Math.min(1, speed * dt));
    a.swordA = lerp(a.swordA, tSword, Math.min(1, 34 * dt));
  }

  getChargeLevel() {
    if (!this.charging) return 0;
    return this.chargeT > 1.08 ? 3 : this.chargeT > 0.62 ? 2 : this.chargeT > 0.12 ? 1 : 0;
  }

  /* ---------------- skills ---------------- */
  startSkill(id) {
    const w = this.world;
    this.state = 'skill';
    this.skillId = id;
    this.skillT = 0;
    this.skillFired = false;
    this.skillDur = [0.55, 0.54, 0.6, 1.75][id];
    this.skillCd[id] = [4.5, 6.5, 8.5, 20][id];
    this.charging = false; this.chargeT = 0; this.attack = null;
    this.iframe = Math.max(this.iframe, [0.35, 0.3, 0.25, 1.75][id]);
    Sfx.skill(id);
    if (id === 0) {
      this.vx = 0;
      w.fx.ring(this.x, this.cy, 14, 150, 'rgba(255,110,180,0.9)', 0.45, 5);
      w.fx.word2(this.x, this.cy - 74, '月轮斩', 'MOON WHEEL', '#ffb3d9', 22, 0.95);
    } else if (id === 1) {
      this.skillDashDir = this.facing;
      this.vx = 0;
      w.fx.word2(this.x, this.cy - 74, '影袭·断踪', 'SHADOW REND', '#ff9a7a', 20, 0.95);
    } else if (id === 2) {
      this.vy = -620; this.onGround = false;
      w.startBladeRain(this);
      w.fx.word2(this.x, this.cy - 84, '刃雨', 'BLADE RAIN', '#cfe6ff', 20, 0.95);
    } else {
      this.vx = 0; this.vy = 0;
      w.startUltimate(this);
    }
  }

  updateSkill(dt) {
    const w = this.world;
    this.skillT += dt;
    const id = this.skillId, t = this.skillT;
    this.prevY = this.y;
    if (id === 0) {
      this.vx *= Math.pow(0.01, dt);
      if (!this.skillFired && t >= 0.1) { this.skillFired = true; w.doMoonWheel(this); }
    } else if (id === 1) {
      if (t < 0.17) {
        this.x += this.skillDashDir * 1850 * dt;
        this.iframe = Math.max(this.iframe, 0.06);
        w.markShadow(this);
        if (Math.random() < dt * 46) {
          w.fx.addPart({ kind: 'smoke', x: this.x - this.skillDashDir * 10, y: this.cy + rand(-18, 18), vx: -this.skillDashDir * 70, vy: rand(-20, 20), life: 0.3, max: 0.3, size: rand(8, 15), color: 'rgba(255,90,140,0.4)', grav: 0, drag: 4 });
        }
      } else {
        this.vx *= Math.pow(0.02, dt);
        if (!this.skillFired && t >= 0.34) { this.skillFired = true; w.detonateShadow(this); }
      }
    } else if (id === 2) {
      this.vx *= Math.pow(0.05, dt);
    } else {
      this.vx *= Math.pow(0.02, dt);
      // the world ticks the ultimate sequence itself
    }
    if (!this.onGround) this.vy += GRAVITY * dt;
    this.x = clamp(this.x + this.vx * dt, ARENA.x1 + 18, ARENA.x2 - 18);
    this.y += this.vy * dt;
    if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.onGround = true; }
    else this.onGround = false;
    this.updateAnim(dt);
    if (this.skillT >= this.skillDur) {
      this.state = this.onGround ? 'idle' : 'air';
      this.skillId = -1;
    }
  }

  takeHit(amount, fromX, opts) {
    if (this.state === 'dead' || this.iframe > 0) return false;
    const o = opts || {};
    // parry window check
    if (this.state === 'parry' && this.parryT > 0) {
      this.world.onParry(this, o.source || null, o.projectile || null);
      return 'parried';
    }
    this.hp -= amount;
    this.hp = Math.max(0, this.hp);
    this.iframe = o.trueHit ? 0.25 : 0.7;
    this.state = 'hurt';
    this.hurtT = 0.32;
    this.charging = false; this.chargeT = 0;
    this.attack = null;
    this.combo = 0;
    const dir = sign(this.x - fromX);
    this.vx = dir * 380;
    this.vy = -240;
    this.onGround = false;
    Sfx.hurt();
    this.world.cam.shake(4.5, 0.22);
    this.world.fx.burst(this.x, this.cy, '#ff5a5a', 14, 380, 3, 0.45, 700);
    this.world.fx.ring(this.x, this.cy, 10, 60, 'rgba(255,90,90,0.8)', 0.3, 3);
    this.world.hitstop(0.1, true);
    this.world.uiDamageFlash = 0.6;
    if (this.hp <= 0) {
      this.state = 'dead';
      this.vy = -380;
      this.world.onPlayerDeath();
    }
    return true;
  }

  draw(ctx, cam) {
    const a = this.anim;
    const x = this.x, y = this.y;
    const f = this.facing;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(f, 1);

    // aim blade tip for trails
    const hipY = -38;
    const armLen = 20;
    const swordLen = 56;
    const shoulderX = 2, shoulderY = -52;
    const drawArm = (ang, len, width, colA, colB, withSword) => {
      const ex = shoulderX + Math.sin(ang) * len;
      const ey = shoulderY + Math.cos(ang) * len;
      capsule(ctx, shoulderX, shoulderY, ex, ey, width, width * 0.78);
      ctx.fillStyle = colA; ctx.fill();
      ctx.strokeStyle = colB; ctx.lineWidth = 1.4; ctx.stroke();
      if (withSword) {
        const sAng = ang + 0.55;
        const hx = ex + Math.sin(sAng) * 4;
        const hy = ey + Math.cos(sAng) * 4;
        const tx = hx + Math.sin(sAng) * swordLen;
        const ty = hy + Math.cos(sAng) * swordLen;
        // blade
        const glow = this.anim.bladeGlow;
        if (glow > 0.02) {
          ctx.save();
          ctx.globalAlpha = glow * 0.5;
          ctx.strokeStyle = '#ffcf9a';
          ctx.lineWidth = 9;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.restore();
        }
        ctx.strokeStyle = '#cfe6ee';
        ctx.lineWidth = 4.4;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        // guard
        ctx.strokeStyle = '#caa25a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(hx - 7, hy - 4); ctx.lineTo(hx + 5, hy + 4); ctx.stroke();
        // trail anchor
        this.bladeTip = { x: tx, y: ty, hx, hy, ang: sAng };
      }
    };


    // cape
    const capeSwing = clamp(this.vx / 400, -1, 1);
    ctx.beginPath();
    ctx.moveTo(-8, -58);
    ctx.quadraticCurveTo(-30 - capeSwing * 14, -38 + Math.sin(this.world.time * 7) * 3, -26 - capeSwing * 22, -8);
    ctx.quadraticCurveTo(-10, -16, -2, -20);
    ctx.closePath();
    ctx.fillStyle = '#7d1420';
    ctx.fill();
    ctx.strokeStyle = '#3d0810'; ctx.lineWidth = 2; ctx.stroke();
    // cape edge accent
    ctx.beginPath();
    ctx.moveTo(-9, -56);
    ctx.quadraticCurveTo(-28 - capeSwing * 13, -36 + Math.sin(this.world.time * 7) * 3, -25 - capeSwing * 21, -10);
    ctx.strokeStyle = 'rgba(255,120,100,0.45)'; ctx.lineWidth = 1.2; ctx.stroke();

    // back leg
    capsule(ctx, -4, -24, -4 + Math.sin(a.legB) * 15, -2 + Math.abs(Math.cos(a.legB)) * 2, 7, 5.5);
    ctx.fillStyle = '#1b1520'; ctx.fill();
    ctx.strokeStyle = '#0a0709'; ctx.lineWidth = 1.2; ctx.stroke();
    // back arm
    drawArm(Math.PI * 0.15 + a.armB, armLen, 6.2, '#2a2130', '#0a0709', false);

    // torso
    ctx.save();
    ctx.translate(0, -40);
    ctx.rotate(a.lean * 0.35);
    poly(ctx, [[-9, -20], [10, -18], [12, 8], [4, 18], [-9, 16], [-13, -2]]);
    ctx.fillStyle = '#252030'; ctx.fill();
    ctx.strokeStyle = '#0b080e'; ctx.lineWidth = 1.6; ctx.stroke();
    // chest armour plate
    poly(ctx, [[-6, -16], [8, -14], [9, 2], [0, 8], [-8, 4]]);
    ctx.fillStyle = '#34304a'; ctx.fill();
    ctx.strokeStyle = '#8b6a3a'; ctx.lineWidth = 1.1; ctx.stroke();
    // red sash
    ctx.beginPath();
    ctx.moveTo(-8, 2); ctx.lineTo(10, 6);
    ctx.strokeStyle = '#a8202c'; ctx.lineWidth = 4; ctx.stroke();
    ctx.restore();

    // head
    const headBob = Math.sin(this.world.time * 2.6) * 0.8 + (this.state === 'run' ? Math.sin(this.runT * 15) * 1.4 : 0);
    ctx.save();
    ctx.translate(3, -60 + headBob);
    ctx.rotate(a.lean * 0.18);
    ctx.beginPath(); ctx.arc(0, 0, 9.5, 0, TAU);
    ctx.fillStyle = '#1c1622'; ctx.fill();
    ctx.strokeStyle = '#0a0709'; ctx.lineWidth = 1.4; ctx.stroke();
    // oni mask wedge
    poly(ctx, [[-2, -6], [9, -2], [7, 6], [-1, 5], [-5, 0]]);
    ctx.fillStyle = '#d9d4c4'; ctx.fill();
    ctx.strokeStyle = '#6b5f4a'; ctx.lineWidth = 1; ctx.stroke();
    // eye slit
    ctx.strokeStyle = '#ff3b2f'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(1, -1); ctx.lineTo(7, 1); ctx.stroke();
    // horn
    poly(ctx, [[-6, -7], [-2, -17], [1, -6]]);
    ctx.fillStyle = '#b9a878'; ctx.fill();
    ctx.strokeStyle = '#5a4c32'; ctx.lineWidth = 0.9; ctx.stroke();
    // hair/ribbons
    ctx.beginPath();
    ctx.moveTo(-8, -3);
    ctx.quadraticCurveTo(-22 - capeSwing * 8, -4 + Math.sin(this.world.time * 5) * 2, -27 - capeSwing * 12, 9);
    ctx.strokeStyle = '#8f1a24'; ctx.lineWidth = 2.4; ctx.stroke();
    ctx.restore();

    // front leg
    capsule(ctx, 0, -24, 2 + Math.sin(a.legA) * 15, -2 + Math.abs(Math.cos(a.legA)) * 2, 7.5, 6);
    ctx.fillStyle = '#221a28'; ctx.fill();
    ctx.strokeStyle = '#0a0709'; ctx.lineWidth = 1.2; ctx.stroke();

    // front arm with sword
    drawArm(a.armA, armLen, 7, '#2e2536', '#0a0709', true);

    // parry flash ring on blade
    if (this.state === 'parry') {
      const k = 1 - this.parryT / 0.24;
      ctx.globalAlpha = 0.7 * (1 - k);
      ctx.strokeStyle = '#bfe7ff';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(18, -44, 26 + k * 10, -2.4, 0.9); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (this.parrySuccess > 0 && this.bladeTip) {
      glowCircle(ctx, this.bladeTip.x, this.bladeTip.y, 34 * (this.parrySuccess / 0.5), 'rgba(180,235,255,0.9)', 0.7 * (this.parrySuccess / 0.5));
    }

    ctx.restore();

    // charging aura (not mirrored)
    if (this.getChargeLevel() > 0) {
      const lvl = this.getChargeLevel();
      const pulse = 0.6 + Math.sin(this.world.time * 20) * 0.2;
      const col = lvl >= 3 ? '255,90,60' : lvl === 2 ? '255,160,70' : '255,220,150';
      glowCircle(ctx, this.x + this.facing * 12, this.cy - 4, 44 + lvl * 8, 'rgba(' + col + ',0.5)', pulse * 0.5);
      // orbiting sparks
      for (let i = 0; i < 3 + lvl * 2; i++) {
        const ang = this.world.time * 3 + i * 1.7;
        const rr = 30 + (i % 3) * 9;
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = 'rgba(' + col + ',0.9)';
        ctx.beginPath();
        ctx.arc(this.x + Math.cos(ang) * rr, this.cy - 6 + Math.sin(ang) * rr * 0.55, 1.7, 0, TAU);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (lvl >= 3) {
        ctx.strokeStyle = 'rgba(255,120,80,0.85)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(this.x, this.cy - 6, 50, this.world.time * 5, this.world.time * 5 + 2.2);
        ctx.stroke();
      }
    }

    // dash afterimages
    if (this.state === 'dash') {
      ctx.globalAlpha = 0.26;
      ctx.fillStyle = '#7fcfff';
      for (let i = 1; i <= 3; i++) {
        const ox = -this.facing * i * 18;
        roundRect(ctx, this.x + ox - 10, this.top + 4, 20, this.h - 6, 8);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // death overlay tint
    if (this.state === 'dead') {
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#000';
      roundRect(ctx, this.x - 12, this.top, 26, this.h, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}
