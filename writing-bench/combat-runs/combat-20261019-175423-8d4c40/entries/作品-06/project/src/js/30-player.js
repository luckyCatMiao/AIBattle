'use strict';
/* ============================================================
   Player: the Ashen Blade. Movement, combat state machine, rig.
   ============================================================ */

const PLAYER = {
  W: 46, H: 92,
  RUN: 235,
  ACC_GROUND: 2600,
  ACC_AIR: 1700,
  FRICTION: 2400,
  GRAVITY: 2050,
  JUMP: 700,
  MAX_HP: 100
};

class Player {
  constructor() {
    this.x = -160; this.y = WORLD.ground; this.vx = 0; this.vy = 0;
    this.facing = 1;
    this.onGround = true;
    this.hp = PLAYER.MAX_HP; this.maxHp = PLAYER.MAX_HP;
    this.stars = 0;
    this.alive = true;
    // animation state
    this.t = 0; this.stateT = 0; this.state = 'idle';
    this.anim = {};
    this.act = null;         // active action descriptor
    this.actT = 0;
    this.combo = 0;          // 0 none, 1..3 chain index
    this.comboWindow = 0;
    this.queued = null;      // buffered action
    this.queuedT = 0;
    this.airAttacks = 0;
    this.jumps = 0;
    this.dashes = 0;
    this.dashCd = 0;
    this.parryT = 0;         // parry window active
    this.parryCd = 0;
    this.parrySuccessFlash = 0;
    this.chargeT = 0; this.chargeHeld = false; this.chargeLevel = 0;
    this.invuln = 0;
    this.hurtT = 0;
    this.hitstun = 0;
    this.hitFlash = 0;
    this.iframes = 0;
    this.airDashUsed = false;
    this.lockedFacingT = 0;
    this.launched = 0;
    this.landT = 0;
    this.coyote = 0;
    this.attackBuffer = 0;
    this.specialCd = 0;
    this.qi = 40; this.maxQi = 100;
    this.skillCd = { iai: 0, vortex: 0, sky: 0, rift: 0 };
    this.skillCastT = 0;
    this.regenT = 0;
    this.afterimageT = 0;
    this.trail = [];
    this.bladeGlow = 0;
    this.chainHits = 0;
    this.chainTimer = 0;
    this.sheatheT = 0;
    // rig trails (blade positions over recent time)
    this.tipPrev = null;
    this.swingTrace = [];
    this.deadT = 0;
    this.pose = {
      spine: 0, head: 0, lean: 0, crouch: 0, hipShift: 0,
      armF: 0.78, elbowF: 0.42, armB: 2.25, elbowB: 0.28,
      bladeRot: -0.55, blade: 0,
      footFx: 11, footFy: 0, footFAng: 0,
      footBx: -12, footBy: 0, footBAng: 0
    };
  }

  get cy() { return this.y - 46; }
  get cx() { return this.x; }

  reset() {
    this.x = -160; this.y = WORLD.ground; this.vx = 0; this.vy = 0; this.facing = 1;
    this.hp = this.maxHp; this.alive = true; this.state = 'idle'; this.act = null;
    this.t = 0; this.stateT = 0; this.combo = 0; this.queued = null; this.airAttacks = 0;
    this.jumps = 0; this.dashes = 0; this.dashCd = 0; this.parryT = 0; this.parryCd = 0;
    this.chargeT = 0; this.chargeHeld = false; this.invuln = 0; this.hurtT = 0;
    this.hitstun = 0; this.hitFlash = 0; this.airDashUsed = false; this.launched = 0;
    this.qi = 40; this.maxQi = 100;
    this.skillCd = { iai: 0, vortex: 0, sky: 0, rift: 0 };
    this.skillCastT = 0; this.regenT = 0;
    this.trail.length = 0; this.swingTrace.length = 0; this.chainHits = 0;
    this.chainTimer = 0; this.deadT = 0; this.bladeGlow = 0;
  }

  /* ---------------- update ---------------- */
  update(dt) {
    this.t += dt; this.stateT += dt;
    this.stateT = this.stateT || 0;
    if (!this.alive) { this.updateDead(dt); return; }

    this.hitFlash = Math.max(0, this.hitFlash - dt * 6);
    this.invuln = Math.max(0, this.invuln - dt);
    this.parryCd = Math.max(0, this.parryCd - dt);
    this.dashCd = Math.max(0, this.dashCd - dt);
    this.specialCd = Math.max(0, this.specialCd - dt);
    this.parrySuccessFlash = Math.max(0, this.parrySuccessFlash - dt * 3);
    this.chainTimer -= dt;
    this.chainGapT = (this.chainGapT || 99) + dt;
    if (this.chainTimer <= 0) { this.chainHits = 0; }
    // keep the chain alive while a light swing is still playing
    if (this.act && this.act.light) this.chainGapT = 0;
    this.bladeGlow = Math.max(0, this.bladeGlow - dt * 2.2);
    this.dodgeT = Math.max(0, (this.dodgeT || 0) - dt);
    this.afterimageT -= dt;
    this.skillCastT += dt;
    for (const k in this.skillCd) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);
    // 刃气 regenerates slowly, faster the more you press the attack
    this.regenT += dt;
    const regen = 8 + this.chainHits * 0.9;
    this.qi = Math.min(this.maxQi, this.qi + regen * dt);

    // hitstop handled globally; internally we just keep state.

    if (this.hitstun > 0) {
      this.hitstun -= dt;
      this.state = 'hurt';
      this.vx = approach(this.vx, 0, 1500 * dt);
      this.applyPhysics(dt, true);
      if (this.hitstun <= 0) this.act = null;
      return;
    }
    if (this.hurtT > 0) this.hurtT -= dt;

    // queue expiry
    if (this.queued) { this.queuedT -= dt; if (this.queuedT <= 0) this.queued = null; }

    if (this.act) {
      this.bufferInputs();
      this.updateAction(dt);
    } else {
      // an input buffered during recovery/landing fires the moment control returns
      if (this.queued && this.queuedT > 0) {
        const q = this.queued; this.queued = null;
        this.doQueued(q);
      } else {
        this.updateFree(dt);
      }
    }

    this.applyPhysics(dt, false);
    this.updateRig(dt);
    this.updateTrail(dt);

    // facing lock
    this.lockedFacingT -= dt;
  }

  updateDead(dt) {
    this.deadT += dt;
    this.vy += PLAYER.GRAVITY * dt;
    this.y += this.vy * dt;
    if (this.y >= WORLD.ground) { this.y = WORLD.ground; this.vy = 0; }
    this.vx = approach(this.vx, 0, 900 * dt);
    this.x += this.vx * dt;
    this.x = clamp(this.x, WORLD.left + 24, WORLD.right - 24);
    this.updateRig(dt);
  }

  updateFree(dt) {
    const ax = Input.axis();
    const grounded = this.onGround;
    // movement
    if (ax !== 0 && !this.act) {
      const target = ax * PLAYER.RUN;
      const acc = grounded ? PLAYER.ACC_GROUND : PLAYER.ACC_AIR;
      this.vx = approach(this.vx, target, acc * dt);
      if (this.lockedFacingT <= 0) this.facing = ax;
    } else {
      const fr = grounded ? PLAYER.FRICTION : 700;
      this.vx = approach(this.vx, 0, fr * dt);
    }

    // state label for animation
    if (!grounded) {
      this.state = this.vy < -80 ? 'jump' : (this.vy > 160 ? 'fall' : 'air');
    } else if (Math.abs(this.vx) > 40) {
      this.state = ax !== 0 ? 'run' : 'slide';
    } else {
      this.state = 'idle';
    }
    this.anim.move = clamp(Math.abs(this.vx) / PLAYER.RUN, 0, 1);

    if (this.onGround) { this.jumps = 0; this.airDashUsed = false; this.coyote = 0.09; }
    else this.coyote = Math.max(0, this.coyote - dt);

    // --- inputs ---
    if (Input.hit('Space') && (this.onGround || this.coyote > 0)) {
      this.jump();
    } else if (Input.hit('Space') && !this.onGround && this.jumps < 1) {
      this.jumps++;
      this.vy = -PLAYER.JUMP * 0.86;
      this.vx += ax * 130;
      Sfx.jump();
      FX.dust(this.x, this.y, 0, 0.5, 4);
      FX.ring(this.x, this.y, 6, 30, 0.2, 'rgba(200,220,255,0.5)', 2, 0.35);
    }

    if (Input.hit('KeyL')) this.tryDash(ax);
    if (Input.hit('KeyI')) this.tryParry();
    for (const def of SKILL_DEFS) {
      if (Input.hit(def.key)) { Skills.keyDown(this, def.id); return; }
    }
    if (Input.hit('KeyJ')) this.startLight();
    if (Input.isDown('KeyK')) this.startChargeHold();
    if (Input.up('KeyK') && this.chargeT > 0) this.releaseCharge();
    if (this.chargeHeld) {
      this.chargeT += dt;
      const ready = this.chargeT >= 0.46;
      if (Math.random() < (ready ? 0.45 : 0.22)) {
        FX.part({
          x: this.x + rand(-18, 18) + this.facing * 22, y: this.y - rand(50, 140),
          vx: rand(-30, 30), vy: rand(-120, -30), g: -40, drag: 1.2,
          life: rand(0.3, 0.7), size: rand(1.2, 2.8),
          color: ready ? '#ffb060' : '#8fc8ff', type: 'ember', glow: 1
        });
      }
      if (ready && !this.chargeReadyFired) {
        this.chargeReadyFired = true;
        Sfx.charged();
        FX.ring(this.x + this.facing * 20, this.y - 90, 8, 64, 0.3, 'rgba(255,180,110,0.6)', 3, 1);
        FX.text(this.x, this.y - 172, '蓄满', '#ffcf8f', 20, { life: 0.6, vy: -50 });
      }
    } else this.chargeReadyFired = false;
  }

  /* ---------------- actions ---------------- */
  jump() {
    this.vy = -PLAYER.JUMP;
    this.onGround = false;
    this.coyote = 0;
    Sfx.jump();
    FX.dust(this.x, this.y, 0, 0.7, 6);
    FX.ring(this.x, this.y, 8, 38, 0.24, 'rgba(210,230,255,0.5)', 2, 0.32);
  }

  tryDash(ax) {
    if (this.dashCd > 0) return;
    this.lastDashT = this.t;
    if (!this.onGround && this.airDashUsed) return;
    const dir = ax !== 0 ? ax : this.facing;
    this.facing = dir;
    this.dashCd = 0.3;
    if (!this.onGround) this.airDashUsed = true;
    this.startAction({
      name: 'dash', dur: 0.22, cancelable: 0.14, dash: true,
      vx: dir * 760, dir, skipGravity: true, endVx: dir * 215
    });
    this.vy = this.onGround ? 0 : this.vy * 0.15;
    // dodge i-frames: generous enough to read, short enough to require timing
    this.invuln = Math.max(this.invuln, 0.3);
    this.dodgeT = 0.3;
    Sfx.dash();
    FX.ghost((c, x, y, f) => drawPlayerSilhouette(c, x, y, f, 'run'), this.x, this.y, this.facing, 0.35, '#9fc4ff', 0.26);
    FX.dust(this.x, this.y, -dir, 0.7, 6);
    for (let i = 0; i < 5; i++) {
      FX.part({ x: this.x - dir * rand(0, 30), y: this.y - rand(5, 70), vx: -dir * rand(100, 300),
        vy: rand(-30, 30), life: rand(0.15, 0.3), size: rand(1, 2.4), color: '#9fc4ff', type: 'streak', glow: 1 });
    }
  }

  tryParry() {
    if (this.parryCd > 0) return;
    this.parryCd = 0.34;
    this.parryT = 0.2;
    this.startAction({ name: 'parry', dur: 0.3, cancelable: 0.24 });
    Sfx.deflect();
    // parry sparkles
    for (let i = 0; i < 7; i++) {
      FX.part({ x: this.x + this.facing * rand(10, 42), y: this.y - rand(30, 78),
        vx: rand(-60, 60), vy: rand(-100, 20), life: rand(0.2, 0.45), size: rand(1, 2.4),
        color: '#bfefff', type: 'dot', glow: 1 });
    }
    FX.ring(this.x + this.facing * 24, this.y - 54, 6, 40, 0.24, 'rgba(160,230,255,0.7)', 2, 0.9);
  }

  startLight() {
    // auto-face a nearby target so strings connect in the air too
    if (Game.nearestEnemyDist(this.x, 1, 260) > Game.nearestEnemyDist(this.x, -1, 260)) {
      if (!this.onGround) this.facing = -1;
    } else if (!this.onGround) this.facing = 1;
    if (this.onGround) {
      const prev = this.lastSwingIdx || 0;
      const fresh = (this.chainTimer > 0 || (this.act && this.act.light)) ? prev : 0;
      const next = fresh >= 3 ? 1 : fresh + 1;
      this.performLight(next, false);
    } else {
      // air combo chain 1..3, then must land
      const next = Math.min(3, (this.combo >= 1 ? this.combo + 1 : 1));
      this.performLight(next, true);
    }
  }

  performLight(idx, air) {
    this.combo = idx;
    this.lastSwingIdx = idx;
    this.chainGapT = 0;
    const dir = this.facing;
    const heavy = idx === 3;
    const specs = air ? AIR_LIGHT[idx] : GROUND_LIGHT[idx];
    if (!air && specs.step) {
      // small committed advance on the swing itself; stops when close to a target
      const ahead = Game.nearestEnemyDist(this.x, dir, 260);
      const step = clamp(ahead - 40, 0, specs.step);
      this.vx = Math.max(this.vx, dir * (step * 5.2));
    }
    this.startAction(Object.assign({ name: 'light' + idx, dir, light: true, air }, specs));
    this.airAttacks = air ? this.airAttacks + 1 : 0;
    Sfx.swing(heavy);
    this.spawnSlashFX(idx, air);
    if (air) {
      // air attacks float the player slightly; the last one drops them
      this.vy = idx === 3 ? Math.min(this.vy + 260, 520) : Math.min(this.vy, -140);
      this.airHoverT = idx === 3 ? 0 : 0.16;
    }
  }

  startChargeHold() {
    if (this.chargeHeld || this.act) return;
    this.chargeHeld = true; this.chargeT = 0;
    this.state = 'chargeWind';
    Sfx.chargeStart();
  }

  releaseCharge() {
    const lvl = this.chargeT >= 0.46 ? 2 : 1;
    this.chargeHeld = false;
    this.chargeT = 0;
    const dir = this.facing;
    this.startAction({
      name: 'heavy', dir, heavy: true, dur: lvl === 2 ? 0.52 : 0.4, cancelable: lvl === 2 ? 0.36 : 0.3,
      hitStart: lvl === 2 ? 0.14 : 0.11, hitEnd: lvl === 2 ? 0.26 : 0.2,
      damage: lvl === 2 ? 42 : 26, knock: lvl === 2 ? 640 : 400, lift: lvl === 2 ? -280 : -110,
      hitstop: lvl === 2 ? 0.17 : 0.1, reach: lvl === 2 ? 210 : 172, h: lvl === 2 ? 196 : 168,
      guardBreak: true, armor: true, lvl
    });
    this.invuln = Math.max(this.invuln, lvl === 2 ? 0.08 : 0);
    Sfx.swing(true);
    if (lvl === 2) {
      Sfx.charged();
      FX.slash(this.x + dir * 30, this.y - 108, 158, dir > 0 ? -2.7 : Math.PI + 0.5, dir > 0 ? 1.2 : Math.PI - 1.2, dir, 0.42, 'rgba(255,172,96,0.95)', 54);
      FX.ring(this.x + dir * 40, this.y - 100, 10, 150, 0.34, 'rgba(255,190,120,0.7)', 5);
      FX.ring(this.x + dir * 40, this.y - 2, 12, 120, 0.3, 'rgba(255,200,140,0.5)', 3, 0.3);
      Camera.kick(dir * 7, -3);
      for (let i = 0; i < 14; i++) {
        FX.part({
          x: this.x + dir * rand(20, 90), y: this.y - rand(20, 150),
          vx: dir * rand(100, 380), vy: rand(-120, 120), g: 200, drag: 2,
          life: rand(0.2, 0.5), size: rand(1.4, 3.4), color: '#ffd39a', type: 'streak', glow: 1
        });
      }
    } else {
      FX.slash(this.x + dir * 30, this.y - 104, 130, dir > 0 ? -2.35 : Math.PI + 0.6, dir > 0 ? 0.9 : Math.PI - 0.9, dir, 0.3, 'rgba(255,205,140,0.92)', 40);
      Camera.kick(dir * 3, -1.5);
    }
  }

  startAction(spec) {
    this.act = Object.assign({}, spec);
    this.perfectOpen = false;
    this.actT = 0;
    this.state = spec.name;
    this.stateT = 0;
    this.hitIds = new Set();
    this.hasHit = false;
    this.landedHit = false;
    this.queued = null;
    this.queuedT = 0;
    if (spec.vx != null) this.vx = spec.vx;
    if (spec.vy != null) this.vy = spec.vy;
    if (spec.lift != null && spec.vy == null) { /* applied on hit */ }
  }

  cancelAction() {
    this.act = null; this.actT = 0; this.parryT = 0;
  }

  // While committed to an action, remember what the player asked for next.
  bufferInputs() {
    const a = this.act;
    if (!a) return;
    if (Input.hit('KeyJ')) this.setQueue('light');
    if (Input.hit('KeyL') && a.name !== 'dash') this.setQueue('dash');
    if (Input.hit('KeyI') && a.name !== 'parry') this.setQueue('parry');
    if (Input.hit('KeyK')) this.setQueue('charge');
    for (const def of SKILL_DEFS) {
      if (Input.hit(def.key) && !a.skill) { Skills.keyDown(this, def.id); return; }
    }
    if (Input.hit('Space')) this.setQueue('jump');
  }

  setQueue(q) {
    this.queued = q;
    // Generous input buffer: presses during recovery still land on the next swing.
    this.queuedT = 0.4;
  }

  // When may the current action be cancelled into a follow-up?
  cancelReady() {
    const a = this.act;
    if (!a) return true;
    // After a confirmed hit, follow-ups chain almost immediately (hit-confirm).
    if (a.hasHit && this.actT >= (a.hitStart || 0) + 0.045) return true;
    return a.cancelable != null && this.actT >= a.cancelable;
  }

  spawnSlashFX(idx, air) {
    const dir = this.facing;
    const cy = this.y - (air ? 96 : 104);
    const cx = this.x + dir * 26;
    if (idx === 3) {
      FX.slash(cx + dir * 8, cy - 6, 128, dir > 0 ? -2.5 : Math.PI + 0.45, dir > 0 ? 1.0 : Math.PI - 1.0, dir, 0.34, 'rgba(255,206,140,0.95)', 40);
      FX.ring(cx + dir * 30, cy + 60, 8, 100, 0.3, 'rgba(255,210,150,0.55)', 3, 0.28);
      Camera.kick(dir * 4, -2);
    } else if (idx === 2) {
      FX.slash(cx, cy, 112, dir > 0 ? 1.15 : Math.PI - 1.75, dir > 0 ? -1.35 : Math.PI + 1.35, dir, 0.24, 'rgba(206,234,255,0.92)', 34);
    } else {
      FX.slash(cx, cy, 120, dir > 0 ? -2.45 : Math.PI + 0.6, dir > 0 ? 0.85 : Math.PI - 0.85, dir, 0.24, 'rgba(216,238,255,0.92)', 36);
    }
    // blade flick sparks along the arc
    for (let i = 0; i < 5; i++) {
      const a = rand(-1.2, 0.4);
      const r = rand(60, 120);
      FX.part({
        x: cx + Math.cos(a) * r * dir, y: cy + Math.sin(a) * r,
        vx: -dir * rand(40, 160), vy: rand(-40, 40), g: 0, drag: 3,
        life: rand(0.12, 0.3), size: rand(1, 2.2), color: '#dff0ff', type: 'streak', glow: 1
      });
    }
  }

  updateAction(dt) {
    const a = this.act;
    this.actT += dt;
    const prevT = this.actT - dt;

    if (a.skill) {
      Skills.updateAction(this, dt);
      return;
    }

    if (Input.hit('KeyJ')) this.setQueue('light');
    if (Input.hit('KeyL') && a.name !== 'dash') this.setQueue('dash');
    if (Input.hit('KeyI') && a.name !== 'parry') this.setQueue('parry');

    // buffered follow-up, gated by the cancel window (or hit-confirm)
    if (this.queued && this.actT >= 0.05) {
      if (this.cancelReady()) {
        const q = this.queued; this.queued = null;
        // only consume inputs the current action may actually cancel into
        const canDash = q !== 'dash' || (this.dashCd <= 0 && (this.onGround || !this.airDashUsed));
        const canParry = q !== 'parry' || this.parryCd <= 0;
        if (canDash && canParry) {
          this.cancelAction();
          this.doQueued(q);
          return;
        } else {
          this.queued = null;
        }
      }
    }

    // hit window
    if (a.hitStart != null) {
      const inWin = this.actT >= a.hitStart && this.actT <= a.hitEnd;
      if (inWin) this.resolveHits(a, dt);
    }
    // charge hold: if K still held during a light, do nothing special.
    // end of action
    if (this.actT >= a.dur) {
      this.endAction(a);
      return;
    }
    // gravity / velocity handling per action
    if (!a.skipGravity) {
      // handled in applyPhysics
    } else {
      this.vx = approach(this.vx, a.endVx != null ? a.endVx : 0, 3200 * dt);
    }
    if (a.name && a.name.startsWith('light') && this.onGround) {
      this.vx = approach(this.vx, 0, 1500 * dt);
    }
    if (a.heavy && this.onGround) this.vx = approach(this.vx, 0, 1200 * dt);
  }

  doQueued(q) {
    if (q === 'light') this.startLight();
    else if (q === 'charge') { this.chargeHeld = true; this.chargeT = 0; Sfx.chargeStart(); }
    else if (q === 'dash') this.tryDash(Input.axis());
    else if (q === 'parry') this.tryParry();
    else if (q === 'jump') {
      if (this.onGround || this.coyote > 0) this.jump();
      else if (this.jumps < 1) {
        this.jumps++; this.vy = -PLAYER.JUMP * 0.86;
        Sfx.jump();
        FX.dust(this.x, this.y, 0, 0.5, 4);
      }
    }
  }

  endAction(a) {
    this.act = null; this.actT = 0;
    this.state = 'idle';
    if (a.name && a.name.startsWith('light')) {
      if (!this.hasHit && this.onGround) this.combo = 0;
      // combo resets if window passes; handled by comboWindow
    }
    if (a.dash && this.onGround) this.vx *= 0.55;
    if (a.heavy) this.vx *= 0.4;
  }

  resolveHits(a, dt) {
    const dir = a.dir;
    const reach = a.reach || 130;
    const hh = a.h || 150;
    const near = 18;
    const x0 = this.x + (dir > 0 ? -near : -reach);
    const box = { x0, x1: x0 + reach + near, y0: this.y - hh, y1: this.y + 6 };
    const enemyHit = Game.hitEnemies(this, box, a);
    if (enemyHit) this.hasHit = true;
  }

  // Called by Game when this player's attack connects
  onHitEnemy(enemy, a, hx, hy, brokeTarget) {
    this.hasHit = true;
    this.qi = Math.min(this.maxQi, this.qi + (a.heavy ? 7 : 3.5));
    this.landedHit = true;
    let hs = a.hitstop != null ? a.hitstop : 0.055;
    if (brokeTarget) hs += 0.055;
    Game.addHitstop(hs, this, enemy);
    this.bladeGlow = 1;
    // small self recoil / camera kick
    const dir = a.dir;
    Camera.kick(dir * (a.heavy ? 6 : 3), a.heavy ? -3 : -1.5);
    // chain
    if (a.light) {
      this.chainHits++; this.chainTimer = 1.1;
      Game.registerHit(a, hx, hy, enemy);
    } else {
      Game.registerHit(a, hx, hy, enemy);
    }
    // input buffer: permit chaining by pressing J during the active window
    if (Input.hit('KeyJ')) this.setQueue('light');
    // momentum: a small forward lunge on hit keeps the chain in range
    if (this.onGround) this.vx = dir * Math.max(Math.abs(this.vx) * 0.35, a.heavy ? 90 : 58);
    // and if the target got knocked away, close the gap a touch
    const gap = (enemy.x - this.x) * dir;
    if (gap > (a.reach || 140)) this.vx = dir * Math.max(Math.abs(this.vx), 190);
  }

  applyPhysics(dt, stunned) {
    const g = this.act && this.act.skipGravity ? 0 : PLAYER.GRAVITY;
    if (!this.onGround) {
      if (this.airHoverT > 0) {
        this.airHoverT -= dt;
        this.vy = lerp(this.vy, -30, Math.min(1, dt * 14));
      } else {
        this.vy += g * dt;
      }
      if (this.vy > 1500) this.vy = 1500;
    }
    // variable jump cut
    if (!Input.isDown('Space') && this.vy < -260 && !(this.act && this.act.name === 'launch')) this.vy += 2600 * dt;

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    if (this.y >= WORLD.ground) {
      if (!this.onGround && this.vy > 260) {
        const impact = clamp(this.vy / 900, 0.3, 1.4);
        FX.dust(this.x, this.y, 0, impact, Math.round(6 + impact * 6));
        FX.ring(this.x, this.y, 6, 20 + impact * 26, 0.22, 'rgba(200,210,240,0.4)', 2, 0.32);
        Sfx.land(impact > 0.8);
        if (impact > 1.0) Camera.shake(2.2, 0.12);
        if (this.act && this.act.air) {
          // air attacks cancel into landing recovery
          if (this.act.name !== 'light3') { /* keep */ }
        }
      }
      this.y = WORLD.ground; this.vy = 0; this.onGround = true; this.jumps = 0; this.airDashUsed = false;
      this.airAttacks = 0;
    } else this.onGround = false;

    // walls
    if (this.x < WORLD.left + 20) { this.x = WORLD.left + 20; if (this.vx < 0) this.vx = 0; }
    if (this.x > WORLD.right - 20) { this.x = WORLD.right - 20; if (this.vx > 0) this.vx = 0; }

    // combo window decay
    if (this.act == null && !this.onGround) this.combo = 0;
    if (this.onGround && this.act == null && this.stateT > 0.4 && !Input.isDown('KeyJ')) {
      // let combo expire after a while on the ground too
      this.comboWindow -= dt;
      if (this.comboWindow <= 0) this.combo = 0;
    }
    if (this.act && this.act.light) { this.comboWindow = 0.7; this.chainGapT = 0; }
  }

  /* ---------------- damage ---------------- */
  takeDamage(amount, fromX, opts = {}) {
    if (!this.alive || this.invuln > 0) return false;
    this.hp -= amount;
    this.hitFlash = 1;
    this.invuln = opts.invuln || 0.55;
    const dir = fromX < this.x ? 1 : -1;
    if (this.hp <= 0) {
      this.hp = 0; this.alive = false; this.deadT = 0;
      this.vy = -520; this.vx = dir * 360;
      this.act = null;
      Sfx.death(); Camera.shake(6, 0.5);
      Game.onPlayerDeath();
      return true;
    }
    this.hitstun = opts.hitstun || 0.32;
    this.hurtT = 0.5;
    this.lastSwingIdx = 0;
    this.combo = 0;
    this.act = null;
    this.vy = opts.launch ? -420 : -180;
    this.vx = dir * (opts.knock || 380);
    Sfx.hurt(); Camera.shake(4.5, 0.22);
    FX.hitBurst(this.x, this.y - 50, dir, 1.2, 'heavy');
    FX.text(this.x, this.y - 100, '-' + amount, '#ff7a7a', 22, { vy: -60, life: 0.7 });
    Game.playerHurt();
    return true;
  }

  /* ---------------- rig / animation ---------------- */
  basePose() {
    return this.pose;
  }

  updateRig(dt) {
    const p = this.pose;
    const t = this.t;
    const a = this.act;
    const moving = Math.abs(this.vx) > 30;
    const m = clamp(Math.abs(this.vx) / PLAYER.RUN, 0, 1);
    const runPhase = t * 11;

    // Full pose target. Feet are absolute local positions (y=0 is the floor).
    const tgt = {
      spine: -0.05, head: 0.02, lean: 0, crouch: 0,
      armF: 0.35, elbowF: 0.45, armB: -0.5, elbowB: -0.7,
      bladeRot: -0.4, blade: 0,
      footFx: 9, footFy: 0, footFAng: 0,
      footBx: -10, footBy: 0, footBAng: 0,
      hipShift: 0
    };

    // --- base locomotion ---
    if (this.state === 'idle' && !a) {
      const b = Math.sin(t * 2.0);
      tgt.spine = -0.04 + b * 0.012;
      tgt.head = 0.01 + b * 0.01;
      tgt.armF = 0.66 + b * 0.04; tgt.elbowF = 0.5;
      tgt.armB = 2.25 + b * 0.04; tgt.elbowB = 0.28;
      tgt.bladeRot = -0.72;
      tgt.footFx = 11; tgt.footFy = 0; tgt.footFAng = 0.06;
      tgt.footBx = -12; tgt.footBy = 0; tgt.footBAng = -0.08;
      tgt.lean = -0.02;
    } else if (!this.onGround && !a) {
      const rising = this.vy < 0;
      tgt.spine = rising ? -0.16 : 0.12;
      tgt.armF = rising ? 0.15 : 0.95;
      tgt.elbowF = rising ? 0.55 : 0.3;
      tgt.armB = rising ? 2.9 : 2.05;
      tgt.elbowB = 0.3;
      tgt.bladeRot = rising ? -0.9 : -0.15;
      tgt.lean = clamp(this.vx * 0.0009, -0.25, 0.25);
      // tucked legs
      tgt.footFx = rising ? 14 : 9; tgt.footFy = rising ? -16 : -6; tgt.footFAng = rising ? 0.5 : 0.2;
      tgt.footBx = rising ? -8 : -13; tgt.footBy = rising ? -12 : -3; tgt.footBAng = rising ? 0.35 : 0.1;
    } else if (moving && !a) {
      const s = Math.sin(runPhase), c = Math.cos(runPhase);
      tgt.spine = -0.16 * m - 0.02;
      tgt.lean = 0.1 * m;
      tgt.armF = 0.85 - s * 0.5 * m;
      tgt.armB = 2.25 + s * 0.5 * m;
      tgt.elbowF = 0.5 + Math.max(0, s) * 0.3;
      tgt.elbowB = 0.3;
      tgt.bladeRot = -0.55 + s * 0.12;
      tgt.head = -0.05;
      // feet alternate through the run cycle; swing leg lifts
      tgt.footFx = 8 + s * 17 * m;
      tgt.footFy = -Math.max(0, s) * 11 * m;
      tgt.footFAng = -s * 0.25;
      tgt.footBx = -9 - s * 17 * m;
      tgt.footBy = -Math.max(0, -s) * 11 * m;
      tgt.footBAng = s * 0.25;
      tgt.crouch = Math.abs(c) * 1.6 * m;
    }
    if (this.state === 'chargeWind' && !a) {
      const k = clamp(this.chargeT / 0.46, 0, 1);
      tgt.spine = 0.3; tgt.crouch = 9 + k * 5; tgt.lean = -0.18;
      tgt.armF = -2.75 + k * 0.1; tgt.elbowF = -0.55;
      tgt.armB = 2.5; tgt.elbowB = 0.5;
      tgt.bladeRot = -0.2;
      tgt.footFx = 22; tgt.footFy = 0; tgt.footFAng = -0.12;
      tgt.footBx = -22; tgt.footBy = 0; tgt.footBAng = 0.18;
      tgt.hipShift = -4;
      tgt.blade = 1;
    }
    if (this.state === 'hurt' || this.hitstun > 0) {
      tgt.spine = 0.4; tgt.head = 0.25; tgt.lean = -0.24;
      tgt.armF = 1.4; tgt.elbowF = 0.2; tgt.armB = 2.6; tgt.elbowB = 0.3;
      tgt.footFx = 15; tgt.footFy = 0; tgt.footFAng = -0.1;
      tgt.footBx = -20; tgt.footBy = 0; tgt.footBAng = 0.2;
    }

    // --- action poses ---
    if (a) {
      const aT = this.actT;
      if (a.name === 'dash') {
        tgt.spine = -0.42; tgt.lean = 0.26; tgt.crouch = 12; tgt.head = -0.15;
        tgt.armF = 1.35; tgt.elbowF = 0.15; tgt.armB = 2.9; tgt.elbowB = 0.1;
        tgt.bladeRot = -1.05;
        tgt.footFx = 24; tgt.footFy = -6; tgt.footFAng = -0.4;
        tgt.footBx = -26; tgt.footBy = -3; tgt.footBAng = 0.5;
        tgt.hipShift = 5;
      } else if (a.name === 'light1' || a.name === 'light2' || a.name === 'light3') {
        // three phases: wind-up / active / recovery
        const ph = aT < a.hitStart
          ? -1 + aT / Math.max(0.001, a.hitStart)
          : (aT < a.hitEnd ? (aT - a.hitStart) / Math.max(0.001, a.hitEnd - a.hitStart)
                           : 1 + (aT - a.hitEnd) / Math.max(0.001, a.dur - a.hitEnd));
        if (a.name === 'light1') {
          // right-to-left diagonal cut, starting high over the shoulder
          if (ph < 0) {
            const k = ph + 1;
            tgt.armF = lerp(0.3, -2.25, easeOut(k));
            tgt.elbowF = lerp(0.5, -0.25, k);
            tgt.bladeRot = lerp(-0.4, -0.85, k);
            tgt.spine = lerp(-0.04, 0.16, k); tgt.lean = lerp(0, -0.16, k);
            tgt.hipShift = lerp(0, -4, k);
            tgt.footFx = 12; tgt.footBx = -14;
          } else if (ph <= 1.1) {
            const k = clamp((ph + 0.28) / 1.28, 0, 1);
            const e = easeOut(k);
            tgt.armF = lerp(-2.25, 1.05, e); tgt.elbowF = lerp(-0.25, 0.22, e);
            tgt.bladeRot = lerp(-0.85, -0.2, e);
            tgt.spine = lerp(0.16, -0.34, e); tgt.lean = lerp(-0.16, 0.3, e);
            tgt.hipShift = lerp(-4, 6, e);
            tgt.footFx = lerp(12, 27, e); tgt.footBx = lerp(-14, -25, e);
            tgt.footFAng = -0.08; tgt.footBAng = 0.14;
            tgt.crouch = 4 * e;
          } else {
            const k = clamp(ph - 1.1, 0, 1);
            tgt.armF = lerp(1.05, 0.45, k); tgt.elbowF = 0.45;
            tgt.bladeRot = -0.5;
            tgt.spine = lerp(-0.34, -0.1, k); tgt.lean = lerp(0.3, 0.06, k);
            tgt.hipShift = lerp(6, 1, k);
            tgt.footFx = lerp(27, 15, k); tgt.footBx = lerp(-25, -16, k);
          }
        } else if (a.name === 'light2') {
          // backhand rising cut from low left
          if (ph < 0) {
            const k = ph + 1;
            tgt.armF = lerp(0.35, 1.15, easeOut(k));
            tgt.elbowF = lerp(0.5, 0.05, k);
            tgt.bladeRot = lerp(-0.4, 0.35, k);
            tgt.spine = lerp(-0.04, -0.22, k); tgt.lean = lerp(0, 0.18, k);
            tgt.hipShift = lerp(0, 5, k);
            tgt.crouch = 5 * k;
            tgt.footFx = 13; tgt.footBx = -13;
          } else if (ph <= 1.1) {
            const k = clamp((ph + 0.25) / 1.25, 0, 1);
            const e = easeOut(k);
            tgt.armF = lerp(1.15, -1.75, e); tgt.elbowF = lerp(0.05, -0.12, e);
            tgt.bladeRot = lerp(0.35, -0.5, e);
            tgt.spine = lerp(-0.22, 0.3, e); tgt.lean = lerp(0.18, -0.26, e);
            tgt.hipShift = lerp(5, -5, e);
            tgt.crouch = lerp(5, 7, e);
            tgt.footFx = lerp(13, 26, e); tgt.footBx = lerp(-13, -24, e);
          } else {
            const k = clamp(ph - 1.1, 0, 1);
            tgt.armF = lerp(-1.75, 0.4, k); tgt.bladeRot = -0.45;
            tgt.spine = lerp(0.3, 0, k); tgt.lean = lerp(-0.26, 0, k);
            tgt.hipShift = lerp(-5, 0, k); tgt.crouch = lerp(7, 1, k);
            tgt.footFx = lerp(26, 14, k); tgt.footBx = lerp(-24, -15, k);
          }
        } else {
          // finisher: huge overhead cleave
          if (ph < 0) {
            const k = ph + 1;
            tgt.armF = lerp(0.4, -2.85, easeOut(k));
            tgt.elbowF = lerp(0.4, -0.5, k);
            tgt.bladeRot = lerp(-0.4, -0.5, k);
            tgt.spine = lerp(0, 0.5, k); tgt.lean = lerp(0, -0.3, k);
            tgt.crouch = 13 * k;
            tgt.hipShift = lerp(0, -6, k);
            tgt.footFx = 20; tgt.footFy = 0; tgt.footBx = -22; tgt.footBy = 0;
            tgt.footFAng = -0.1; tgt.footBAng = 0.16;
            tgt.armB = 2.4;
          } else if (ph <= 1.1) {
            const k = clamp((ph + 0.22) / 1.22, 0, 1);
            const e = easeOut(k);
            tgt.armF = lerp(-2.85, 1.28, e); tgt.elbowF = lerp(-0.5, 0.3, e);
            tgt.bladeRot = lerp(-0.5, -0.12, e);
            tgt.spine = lerp(0.5, -0.52, e); tgt.lean = lerp(-0.3, 0.38, e);
            tgt.crouch = lerp(13, 17, e);
            tgt.hipShift = lerp(-6, 8, e);
            tgt.footFx = lerp(20, 36, e); tgt.footFy = 0; tgt.footFAng = -0.12;
            tgt.footBx = lerp(-22, -32, e); tgt.footBy = 0; tgt.footBAng = 0.2;
            tgt.armB = lerp(2.4, 2.8, e);
          } else {
            const k = clamp(ph - 1.1, 0, 1);
            tgt.armF = lerp(1.28, 0.4, k); tgt.elbowF = 0.5;
            tgt.bladeRot = -0.55;
            tgt.spine = lerp(-0.52, -0.12, k); tgt.lean = lerp(0.38, 0.08, k);
            tgt.crouch = lerp(17, 3, k); tgt.hipShift = lerp(8, 2, k);
            tgt.footFx = lerp(36, 16, k); tgt.footBx = lerp(-32, -18, k);
          }
        }
        if (a.air) {
          tgt.crouch = 0;
          tgt.footFx = 12; tgt.footFy = -14; tgt.footFAng = 0.35;
          tgt.footBx = -14; tgt.footBy = -8; tgt.footBAng = 0.25;
          tgt.spine += 0.08;
        }
        tgt.blade = 1;
      } else if (a.name === 'heavy') {
        const lvl = a.lvl || 1;
        if (aT < a.hitStart) {
          const k = easeOut(clamp(aT / Math.max(0.01, a.hitStart), 0, 1));
          tgt.armF = lerp(-2.75, -3.0, k); tgt.elbowF = lerp(-0.55, -0.6, k);
          tgt.bladeRot = -0.35;
          tgt.spine = lerp(0.3, 0.58, k); tgt.lean = lerp(-0.18, -0.3, k);
          tgt.crouch = lerp(9, 15, k); tgt.hipShift = lerp(-4, -8, k);
          tgt.footFx = lerp(22, 28, k); tgt.footBx = lerp(-22, -28, k);
          tgt.footFAng = -0.14; tgt.footBAng = 0.2;
          tgt.armB = 2.6;
        } else if (aT < a.hitEnd + 0.07) {
          const k = easeOut(clamp((aT - a.hitStart) / Math.max(0.01, a.hitEnd - a.hitStart + 0.07), 0, 1));
          tgt.armF = lerp(-3.0, 1.55, k); tgt.elbowF = lerp(-0.6, 0.28, k);
          tgt.bladeRot = lerp(-0.35, -0.05, k);
          tgt.spine = lerp(0.58, -0.58, k); tgt.lean = lerp(-0.3, 0.42, k);
          tgt.crouch = lerp(15, 18, k); tgt.hipShift = lerp(-8, 10, k);
          tgt.footFx = lerp(28, 42, k); tgt.footBx = lerp(-28, -36, k);
          tgt.armB = lerp(2.6, 2.9, k);
        } else {
          const k = clamp((aT - a.hitEnd - 0.07) / Math.max(0.01, a.dur - a.hitEnd - 0.07), 0, 1);
          tgt.armF = lerp(1.55, 0.4, k); tgt.elbowF = 0.5;
          tgt.bladeRot = -0.55;
          tgt.spine = lerp(-0.58, -0.12, k); tgt.lean = lerp(0.42, 0.06, k);
          tgt.crouch = lerp(18, 3, k); tgt.hipShift = lerp(10, 2, k);
          tgt.footFx = lerp(42, 16, k); tgt.footBx = lerp(-36, -18, k);
        }
        tgt.blade = lvl === 2 ? 2 : 1;
      } else if (a.name === 'parry') {
        const k = easeOut(clamp(aT / 0.1, 0, 1));
        // sword raised vertically in front, both hands framing the guard
        tgt.armF = lerp(0.35, -1.5, k); tgt.elbowF = lerp(0.5, -1.15, k);
        tgt.bladeRot = lerp(-0.5, -1.55, k);
        tgt.armB = lerp(2.25, 1.55, k); tgt.elbowB = lerp(0.3, 0.15, k);
        tgt.spine = lerp(-0.04, -0.2, k); tgt.lean = lerp(0, -0.12, k);
        tgt.crouch = 7 * k;
        tgt.footFx = 15; tgt.footBx = -17; tgt.footFAng = -0.06; tgt.footBAng = 0.12;
        tgt.hipShift = -2;
        tgt.blade = 1;
      } else if (a.name === 'sk_iai') {
        const k = clamp(aT / 0.17, 0, 1);
        if (aT < 0.17) {
          // sheathing crouch: sword drawn low behind, body coiled
          tgt.spine = 0.42; tgt.lean = -0.3; tgt.crouch = 16;
          tgt.armF = 2.15; tgt.elbowF = 1.1; tgt.bladeRot = 0.55;
          tgt.armB = 2.9; tgt.elbowB = 0.4;
          tgt.hipShift = -8;
          tgt.footFx = 24; tgt.footBx = -26; tgt.footFAng = -0.12; tgt.footBAng = 0.2;
          tgt.blade = 0.5;
        } else {
          // the cut is invisible; the body arrives in an extended lunge
          const e2 = easeOut(clamp((aT - 0.17) / 0.12, 0, 1));
          tgt.spine = lerp(0.42, -0.45, e2); tgt.lean = lerp(-0.3, 0.34, e2);
          tgt.crouch = lerp(16, 7, e2);
          tgt.armF = lerp(2.15, 0.45, e2); tgt.elbowF = lerp(1.1, 0.05, e2);
          tgt.bladeRot = lerp(0.55, -0.75, e2);
          tgt.armB = 2.4; tgt.elbowB = 0.3;
          tgt.hipShift = lerp(-8, 10, e2);
          tgt.footFx = lerp(24, 38, e2); tgt.footBx = lerp(-26, -34, e2);
          tgt.blade = 1;
        }
        if (tgt.crouch === undefined) tgt.crouch = 0;
      } else if (a.name === 'sk_vortex') {
        tgt.spine = -0.1; tgt.lean = 0.16; tgt.crouch = 10;
        tgt.armF = 0.2; tgt.elbowF = 0.9; tgt.bladeRot = -1.9;
        tgt.armB = 1.9; tgt.elbowB = 0.6;
        tgt.footFx = 22; tgt.footBx = -22; tgt.footFAng = -0.1; tgt.footBAng = 0.16;
        tgt.hipShift = 4; tgt.blade = 1.5;
      } else if (a.name === 'sk_sky') {
        if (aT < 0.13) {
          const k = clamp(aT / 0.13, 0, 1);
          tgt.crouch = 15 * k; tgt.spine = 0.5 * k; tgt.lean = -0.25 * k;
          tgt.armF = lerp(0.7, 2.0, k); tgt.elbowF = 0.8;
          tgt.bladeRot = 0.9 * k;
          tgt.footFx = 22; tgt.footBx = -24;
          tgt.hipShift = -6 * k;
        } else {
          // rising dragon: blade swept up and forward, body stretched tall
          const rk = clamp((aT - 0.13) / 0.3, 0, 1);
          tgt.spine = lerp(-0.42, -0.18, rk);
          tgt.lean = lerp(0.22, 0.1, rk);
          tgt.head = -0.08;
          tgt.armF = lerp(-2.62, -1.85, rk);
          tgt.elbowF = lerp(-0.25, -0.5, rk);
          tgt.bladeRot = lerp(-0.35, -0.15, rk);
          tgt.armB = 2.75; tgt.elbowB = 0.25;
          tgt.footFx = 14; tgt.footFy = -20; tgt.footFAng = 0.45;
          tgt.footBx = -16; tgt.footBy = -6; tgt.footBAng = 0.25;
          tgt.crouch = 0; tgt.blade = 2;
        }
        if (tgt.crouch === undefined) tgt.crouch = 0;
      } else if (a.name === 'sk_rift') {
        // draw the clock: sword held point-down, hand raised
        tgt.spine = -0.25; tgt.lean = -0.05; tgt.head = -0.18;
        tgt.armF = 1.5; tgt.elbowF = 0.4; tgt.bladeRot = 0.55;
        tgt.armB = -0.3; tgt.elbowB = 0.5;
        tgt.crouch = 6;
        tgt.footFx = 16; tgt.footBx = -18; tgt.footFAng = -0.08; tgt.footBAng = 0.14;
        tgt.hipShift = 0; tgt.blade = 2;
        if (tgt.crouch === undefined) tgt.crouch = 0;
      } else if (a.name && a.name.startsWith('l')) {
        // keep sensible defaults
      }
    }

    // bleed-out / death
    if (!this.alive) {
      tgt.spine = 0.7; tgt.head = 0.4; tgt.lean = -0.5;
      tgt.armF = 1.3; tgt.elbowF = 0.2; tgt.armB = 2.4; tgt.elbowB = 0.2;
      tgt.bladeRot = 0.4; tgt.crouch = 22;
      tgt.footFx = 18; tgt.footBx = -16;
    }

    // --- smooth ---
    // Frame-rate-independent smoothing: heavier during locomotion, snappier
    // during attacks so every wind-up and cut lands on the right frame.
    const tau = a ? 0.028 : (this.onGround ? 0.085 : 0.11);
    const k = 1 - Math.exp(-dt / tau);
    for (const key in tgt) {
      if (typeof tgt[key] !== 'number') continue;
      p[key] = Number.isFinite(p[key]) ? lerp(p[key], tgt[key], k) : tgt[key];
    }
    this.poseTime = (this.poseTime || 0) + dt;
  }

  updateTrail(dt) {
    // afterimage during dash
    if (this.act && this.act.dash) {
      this.afterimageT -= dt;
    this.skillCastT += dt;
    for (const k in this.skillCd) this.skillCd[k] = Math.max(0, this.skillCd[k] - dt);
    // 刃气 regenerates slowly, faster the more you press the attack
    this.regenT += dt;
    const regen = 8 + this.chainHits * 0.9;
    this.qi = Math.min(this.maxQi, this.qi + regen * dt);
      if (this.afterimageT <= 0) {
        this.afterimageT = 0.03;
        FX.ghost((c, x, y, f) => drawPlayerSilhouette(c, x, y, f, 'dash'), this.x, this.y, this.facing, 0.28, '#9fc4ff', 0.2);
      }
    }
  }

  draw(ctx) {
    drawPlayerRig(ctx, this);
  }
}

/* ---------------- Move descriptor tables ---------------- */
const GROUND_LIGHT = {
  1: { dur: 0.3, cancelable: 0.17, hitStart: 0.085, hitEnd: 0.16, damage: 8, knock: 250, lift: 0,
       hitstop: 0.06, reach: 150, h: 148, step: 130 },
  2: { dur: 0.32, cancelable: 0.18, hitStart: 0.09, hitEnd: 0.17, damage: 9, knock: 290, lift: 0,
       hitstop: 0.065, reach: 156, h: 152, step: 140 },
  3: { dur: 0.5, cancelable: 0.33, hitStart: 0.15, hitEnd: 0.25, damage: 16, knock: 250, lift: -620,
       hitstop: 0.1, reach: 176, h: 190, step: 195, heavy: true, launcher: true }
};
const AIR_LIGHT = {
  1: { dur: 0.3, cancelable: 0.16, hitStart: 0.07, hitEnd: 0.15, damage: 7, knock: 60, lift: -150,
       hitstop: 0.055, reach: 150, h: 190, airHover: true },
  2: { dur: 0.32, cancelable: 0.18, hitStart: 0.08, hitEnd: 0.16, damage: 8, knock: 70, lift: -130,
       hitstop: 0.055, reach: 156, h: 195, airHover: true },
  3: { dur: 0.44, cancelable: 0.28, hitStart: 0.12, hitEnd: 0.22, damage: 15, knock: 130, lift: 980,
       hitstop: 0.085, reach: 168, h: 200, heavy: true, spike: true }
};
