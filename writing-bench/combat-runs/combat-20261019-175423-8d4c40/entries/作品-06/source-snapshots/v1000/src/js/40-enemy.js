'use strict';
/* ============================================================
   Enemies: limb-based bodies, telegraphed attacks, AI.
   ============================================================ */

const ENEMY_TYPES = {
  husk: {
    kind: 'husk', name: '灰骸', hp: 68, speed: 178, accel: 1500, w: 26, h: 112, scale: 1,
    aggro: 980, prefer: 132, attackRange: 160, cooldown: [1.0, 1.9],
    limbHp: { head: 36, armR: 32, armL: 28, legL: 26, legR: 26 },
    score: 100,
    palette: { cloth: '#5a5a63', cloth2: '#3c3d46', bone: '#e8dcc2', bone2: '#c4b79d', metal: '#917854', glow: '#ff7a4a', rim: 'rgba(172,198,246,0.4)' }
  },
  stalker: {
    kind: 'stalker', name: '影噬', hp: 44, speed: 252, accel: 2000, w: 24, h: 104, scale: 0.93,
    aggro: 1100, prefer: 172, attackRange: 180, cooldown: [0.75, 1.4],
    limbHp: { head: 26, armR: 22, armL: 22, legL: 20, legR: 20 },
    score: 130,
    palette: { cloth: '#3f5162', cloth2: '#2a3946', bone: '#cfe7ee', bone2: '#9fc4d2', metal: '#7198a8', glow: '#6fe0ff', rim: 'rgba(140,220,255,0.45)' }
  },
  warden: {
    kind: 'warden', name: '铁钟卫', hp: 158, speed: 112, accel: 900, w: 42, h: 158, scale: 1.06,
    aggro: 1000, prefer: 165, attackRange: 215, cooldown: [1.6, 2.6],
    limbHp: { head: 54, armR: 64, armL: 64, legL: 50, legR: 50 },
    score: 260,
    armorTell: true,
    palette: { cloth: '#555a68', cloth2: '#383c46', bone: '#bcc4d0', bone2: '#8d95a3', metal: '#a58a5c', glow: '#ffc46a', rim: 'rgba(190,170,130,0.4)' }
  }
};

let ENEMY_ID = 1;

class Enemy {
  constructor(kind, x, opts = {}) {
    const cfg = ENEMY_TYPES[kind];
    this.id = ENEMY_ID++;
    this.cfg = cfg;
    this.kind = kind;
    this.x = x; this.y = WORLD.ground; this.vx = 0; this.vy = 0;
    this.facing = opts.facing || -1;
    this.hp = cfg.hp * (opts.hpMul || 1);
    this.maxHp = this.hp;
    this.w = cfg.w; this.h = cfg.h; this.scale = cfg.scale;
    this.onGround = true;
    this.state = 'spawn';
    this.stateT = 0;
    this.cooldown = rand(0.4, 1.1);
    this.attack = null;
    this.attackDone = false;
    this.hitstun = 0;
    this.staggerT = 0;
    this.flash = 0;
    this.squash = 1;
    this.launched = false;
    this.airTime = 0;
    this.dead = false;
    this.deathT = 0;
    this.removeMe = false;
    this.animT = rand(0, 10);
    this.walkPhase = rand(0, TAU);
    this.attackToken = false;
    this.spawnT = 0.55;
    this.bob = 0;
    this.weaponDropped = false;
    this.limbBreakFlash = 0;
    this.lastStand = false;
    this.hitCounter = 0;
    this.aggroed = false;
    this.stumbleT = 0;
    this.limbs = {};
    for (const k in cfg.limbHp) {
      this.limbs[k] = { hp: cfg.limbHp[k], max: cfg.limbHp[k], broken: false };
    }
    this.pose = {
      lean: 0, spine: 0, armR: 0.4, armL: -0.5, elbowR: 0.6, elbowL: -0.6,
      legF: 0.2, legB: -0.2, kneeF: -0.25, kneeB: -0.25, head: 0, crouch: 0, bodyY: 0, twist: 0
    };
    this.spawnX = x;
    // rift emergence: rise out of the ground. The spawn state ends on its own timer.
    this.yOff = opts.emerge ? 82 : 0;
    this.spawnDur = 0.5;
    this.armorFlash = 0;
    this.hasToken = false;
  }

  get cx() { return this.x; }
  get cy() { return this.y - this.h * 0.55; }
  alive() { return !this.dead; }

  hurtBox() {
    // body height is a gameplay measure, not a drawing measure
    return { x0: this.x - 22, x1: this.x + 22, y0: this.y - this.h * 1.16, y1: this.y - 2 };
  }

  /* ---------- damage ---------- */
  takeHit(dmg, fromX, opts = {}) {
    if (this.dead) return { hit: false };
    const dir = fromX < this.x ? 1 : -1;
    const res = { hit: true, broke: [], killed: false, limb: null, hx: this.x, hy: this.y - this.h * 0.55 };

    // Damage reduction for armored warden unless heavy/charged/counter
    let finalDmg = dmg;
    let armored = false;
    if (this.kind === 'warden' && !opts.heavy && !opts.counter && this.state !== 'stagger') {
      finalDmg *= 0.72; armored = true;
    }
    if (opts.counter) finalDmg *= 1.9;
    if (opts.charged) finalDmg *= 1.5;

    this.hp -= finalDmg;
    this.flash = 1;
    this.squash = 0.82;
    this.hitCounter++;
    this.aggroed = true;

    // ---- limb damage ----
    const limbId = this.chooseLimb(opts);
    if (limbId && !this.limbs[limbId].broken && !opts.noLimb) {
      const L = this.limbs[limbId];
      let ld = finalDmg * (opts.heavy ? 1.85 : (opts.counter ? 1.7 : 0.95)) * (opts.limbMul || 1);
      if (limbId === 'head') ld *= 0.8;
      L.hp -= ld;
      if (L.hp <= 0) {
        res.broke.push(limbId);
        this.breakLimb(limbId, dir, opts);
      }
      res.limb = limbId;
    }

    // ---- reaction ----
    const heavy = !!opts.heavy || !!opts.counter;
    if (this.hp <= 0) {
      this.die(dir, opts);
      res.killed = true;
    } else {
      this.vx += dir * (opts.knock || 100) * (heavy ? 1.4 : 1);
      if (opts.lift) {
        // Launches ignore the ground clamp: set airborne first, then velocity.
        this.onGround = false;
        this.vy = Math.min(this.vy, opts.lift);
        this.launched = opts.lift < -120;
        this.airborneT = 0;
        this.y -= 0.5;
        // Cancel any ground attack pose so the body reads airborne immediately.
        if (this.launched) { this.cancelAttack(); this.state = 'stagger'; this.stateT = 0; }
      }
      this.hitstun = Math.max(this.hitstun, heavy ? 0.34 : 0.17);
      if (this.state === 'tell' || this.state === 'attack') {
        // Armored warden keeps swinging through light hits while winding up
        if (this.kind === 'warden' && !heavy && this.state === 'tell') {
          this.armorFlash = 0.25;
        } else if (heavy || !this.attack || this.attack.armor !== true) {
          this.cancelAttack();
          this.staggerT = heavy ? 0.42 : 0.16;
          this.state = 'stagger';
          this.stateT = 0;
        }
      }
    }
    this.hitstun = Math.max(this.hitstun, 0.05);
    if (armored && Math.random() < 0.7) {
      Game.fxArmorClank(res.hx, res.hy);
    }
    return res;
  }

  chooseLimb(opts) {
    const L = this.limbs;
    if (opts.targetLimb && L[opts.targetLimb] && !L[opts.targetLimb].broken) return opts.targetLimb;
    const attached = (id) => L[id] && !L[id].broken;
    if (!this.onGround || this.launched) {
      const legs = ['legL', 'legR'].filter(attached);
      return legs.length ? pick(legs) : null;
    }
    if (opts.heavy || opts.counter) {
      const pool = [];
      if (attached('armR')) pool.push('armR', 'armR', 'armR');
      if (attached('armL')) pool.push('armL', 'armL');
      if (attached('head') && (this.hp < this.maxHp * 0.45 || opts.counter)) pool.push('head');
      if (attached('legL')) pool.push('legL');
      if (attached('legR')) pool.push('legR');
      return pool.length ? pick(pool) : null;
    }
    const pool = [];
    for (const id of ['armL', 'legL', 'armR', 'legR']) if (attached(id)) pool.push(id);
    if (attached('head') && this.hp < this.maxHp * 0.25) pool.push('head');
    return pool.length ? pick(pool) : null;
  }

  breakLimb(id, dir, opts = {}) {
    const L = this.limbs[id];
    if (!L || L.broken) return;
    L.broken = true;
    this.limbBreakFlash = 1;
    Game.limbBreakCount++;
    Game.onLimbBreak(this, id, dir);
    const local = ENEMY_DRAW[this.kind].limbAnchor(id, this);
    const px = this.x + local.x * this.facing, py = this.y + local.y;
    Sfx.breakLimb();
    Game.addHitstop(0.1, null, null);
    Camera.shake(5.5, 0.3);
    FX.hitBurst(px, py, dir, 1.5, 'break');
    FX.dust(px, py, dir, 0.8, 8);

    // severed pieces
    const col = ENEMY_DRAW[this.kind].debrisColor(id, this);
    const n = id === 'head' ? 1 : (id.startsWith('leg') ? 1 : 1);
    for (let i = 0; i < n; i++) {
      FX.part({
        x: px, y: py, vx: dir * rand(140, 340) + rand(-60, 60), vy: rand(-520, -240),
        g: 1700, drag: 0.35, life: rand(3.2, 4.6), size: (id === 'head' ? 15 : 12) * this.scale,
        rot: rand(0, TAU), vr: rand(-14, 14), color: col, type: 'limb',
        limbKind: id, scale: this.scale, floor: id === 'head' ? 11 : 7
      });
    }
    // blood / ichor
    for (let i = 0; i < 14; i++) {
      FX.part({
        x: px, y: py, vx: rand(-180, 180) + dir * 120, vy: rand(-260, 40),
        g: 1300, drag: 1.3, life: rand(0.4, 1.0), size: rand(1.4, 3.4),
        color: this.kind === 'warden' ? '#a8c4d8' : (this.kind === 'stalker' ? '#7fe4ff' : '#b8402f'),
        type: 'blob', glow: this.kind !== 'husk' ? 0.6 : 0
      });
    }

    if (id === 'head') {
      // decapitation is lethal
      this.hp = 0;
      this.die(dir, { heavy: true });
      FX.text(this.x, this.y - this.h - 18, '斩首', '#ffd27a', 30, { life: 1.0, weight: 900 });
    } else {
      this.hitstun = Math.max(this.hitstun, 0.6);
      this.staggerT = 0.8;
      this.cancelAttack();
      this.state = 'stagger'; this.stateT = 0;
      const lbl = id.startsWith('leg') ? '断腿' : '断臂';
      FX.text(this.x, this.y - this.h - 10, lbl, '#ffb070', 24, { life: 0.9 });
      if (id.startsWith('leg')) this.stumbleT = 1.0;
    }
  }

  die(dir, opts = {}) {
    if (this.dead) return;
    this.dead = true;
    this.releaseTokens();
    this.deathT = 0;
    this.vx = dir * 190 + rand(-40, 40);
    this.vy = -280;
    this.onGround = false;
    this.cancelAttack();
    Sfx.death();
    Camera.shake(4, 0.35);
    FX.dust(this.x, this.y, dir, 1.2, 12);
    for (let i = 0; i < 26; i++) {
      FX.part({
        x: this.x + rand(-16, 16), y: this.y - rand(20, this.h), vx: rand(-220, 220) + dir * 150,
        vy: rand(-420, -40), g: 1500, drag: 0.8, life: rand(0.5, 1.3), size: rand(1.6, 4),
        color: this.kind === 'warden' ? '#cfe6ff' : (this.kind === 'stalker' ? '#8ff0ff' : '#c04a34'),
        type: 'blob', glow: 0.5
      });
    }
    // ash drifting upward as the body comes apart
    for (let i = 0; i < 16; i++) {
      FX.part({
        x: this.x + rand(-22, 22), y: this.y - rand(10, this.h * 1.1),
        vx: rand(-40, 40), vy: rand(-110, -35), g: -30, drag: 0.7,
        life: rand(0.9, 1.8), size: rand(3, 9),
        color: '#8a8498', type: 'smoke', glow: 0
      });
    }
    // soul wisp rising from the wound
    FX.part({
      x: this.x, y: this.y - this.h * 0.6, vx: rand(-20, 20), vy: -90, g: -60, drag: 0.4,
      life: 1.4, size: 4, color: this.kind === 'warden' ? '#ffd8a0' : '#bfefff',
      type: 'ember', glow: 1
    });
    Game.onEnemyKilled(this, dir);
  }

  releaseTokens() {
    this.attackToken = false;
    this.hasToken = false;
    if (typeof Game !== 'undefined' && Game.releaseAttackToken) Game.releaseAttackToken(this);
  }

  cancelAttack() {
    this.releaseTokens();
    this.attack = null;
  }

  /* ---------- AI ---------- */
  update(dt) {
    this.stateT += dt;
    this.animT += dt;
    this.flash = Math.max(0, this.flash - dt * 5);
    this.limbBreakFlash = Math.max(0, this.limbBreakFlash - dt * 2);
    this.squash = lerp(this.squash, 1, 1 - Math.pow(0.0005, dt));
    this.armorFlash = Math.max(0, (this.armorFlash || 0) - dt);

    if (this.dead) { this.updateDead(dt); return; }

    // spawn / emerge
    if (this.state === 'spawn') {
      this.spawnT -= dt;
      this.yOff = Math.max(0, this.yOff - dt * 190);
      this.vx = 0;
      if (this.spawnT <= 0) { this.yOff = 0; this.state = 'chase'; this.stateT = 0; }
    }

    const player = Game.player;
    const dist = player.x - this.x;
    const adist = Math.abs(dist);
    const sameLevel = Math.abs((player.y) - (this.y)) < 90;

    if (this.hitstun > 0) {
      this.hitstun -= dt;
      if (this.hitstun <= 0 && this.onGround) {
        if (this.state === 'stagger') { this.state = 'recover'; this.stateT = 0; }
      }
    }

    if (this.staggerT > 0) this.staggerT -= dt;

    const canAct = this.hitstun <= 0 && this.staggerT <= 0 && this.yOff <= 0;

    if (this.launched && this.onGround) this.launched = false;
    if (!this.onGround) { this.airborneT = (this.airborneT || 0) + dt; }
    else this.airborneT = 0;

    // Physics/motion
    if (canAct) {
      switch (this.state) {
        case 'spawn':
          break;
        case 'chase': this.thinkChase(dt, dist, adist, sameLevel); break;
        case 'tell': this.updateTell(dt); break;
        case 'attack': this.updateAttack(dt); break;
        case 'recover':
          this.vx = approach(this.vx, 0, 1400 * dt);
          if (this.stateT > 0.3) {
            this.state = 'chase'; this.stateT = 0;
            // corrective step toward the player after whiffing
            const d2 = Game.player.x - this.x;
            if (Math.abs(d2) > 60) this.vx = sign(d2) * this.cfg.speed * 0.7;
          }
          break;
        case 'stagger':
          this.vx = approach(this.vx, 0, 1100 * dt);
          if (this.stateT > 0.42 && this.staggerT <= 0) { this.state = 'chase'; this.stateT = 0; }
          break;
        default:
          this.state = 'chase'; this.stateT = 0;
      }
    } else {
      this.vx = approach(this.vx, 0, 900 * dt);
    }

    // attack cooldown
    this.cooldown -= dt;

    // physics
    this.applyPhysics(dt);
    this.updatePose(dt);
  }

  thinkChase(dt, dist, adist, sameLevel) {
    const p = Game.player;
    if (!p.alive) { this.vx = approach(this.vx, 0, 1200 * dt); return; }
    this.facing = dist >= 0 ? 1 : -1;
    const legBroken = (this.limbs.legL.broken ? 1 : 0) + (this.limbs.legR.broken ? 1 : 0);
    const speedMul = Math.pow(0.62, legBroken);
    const speed = this.cfg.speed * speedMul;

    // separation from other enemies handled by Game, here we add a personal offset
    const side = (this.id % 2 === 0) ? 1 : -1;
    const want = this.cfg.prefer * (this.kind === 'warden' ? 1.0 : 1) + (this.id % 3) * 16;
    const gap = adist - want;

    if (this.cooldown <= 0 && !p.dead) {
      const choice = this.chooseAttack(adist, sameLevel);
      if (choice) {
        if (Game.requestAttackToken(this)) this.startAttack(choice);
        else this.vx = approach(this.vx, 0, 900 * dt);
        return;
      }
    }

    if (gap > 8) {
      const dir = dist > 0 ? 1 : -1;
      const sprint = gap > 200 ? 1.32 : (gap > 60 ? 1 : 0.7);
      this.vx = approach(this.vx, dir * speed * sprint, this.cfg.accel * dt);
      // brake as we arrive so we don't skid past the target
      if (gap < 34 && Math.abs(this.vx) > 60) this.vx = approach(this.vx, 0, 1500 * dt);
    } else if (gap < -40) {
      // too close: back off slightly, but don't run away forever
      const dir = dist > 0 ? -1 : 1;
      this.vx = approach(this.vx, dir * speed * 0.55, this.cfg.accel * dt);
    } else {
      // circle/stalk around the player
      const strafe = Math.sin(this.animT * 1.4 + this.id) * 0.5 + side * 0.2;
      this.vx = approach(this.vx, strafe * speed * 0.42, this.cfg.accel * 0.7 * dt);
      // if very close and cooldown, ease out
      if (adist < 70) this.vx = approach(this.vx, (dist > 0 ? -1 : 1) * speed * 0.5, this.cfg.accel * dt);
    }

    // stagger stumble
    if (this.stumbleT > 0) {
      this.stumbleT -= dt;
      this.vx *= 0.5;
    }
    // face player
    if (Math.abs(this.vx) < 30) this.facing = dist >= 0 ? 1 : -1;
  }

  chooseAttack(adist, sameLevel) {
    if (this.kind === 'husk') {
      if (!sameLevel) return null;
      if (adist < 118) return Math.random() < 0.35 ? HOWL_HUSK.combo : HOWL_HUSK.slash;
      if (adist < 168) return HOWL_HUSK.slash;
      if (adist < 400) return HOWL_HUSK.lunge;
      return null;
    }
    if (this.kind === 'stalker') {
      if (adist < 158 && sameLevel) return HOWL_STALKER.doubleSlash;
      if (adist < 420) return HOWL_STALKER.pounce;
      return null;
    }
    if (this.kind === 'warden') {
      const bothArms = this.limbs.armR.broken && this.limbs.armL.broken;
      if (adist < 300 && sameLevel) {
        if (bothArms) return HOWL_WARDEN.bodyBash;
        return adist < 110 ? HOWL_WARDEN.smash : HOWL_WARDEN.smash;
      }
      if (adist < 520) return HOWL_WARDEN.charge;
      return null;
    }
    return HOWL_HUSK.slash;
  }

  startAttack(atk) {
    this.attack = atk;
    this.attackDone = false;
    this.attackStart = this.stateT;
    this.state = 'tell';
    this.stateT = 0;
    this.vx *= 0.2;
    this.tellDur = atk.tell;
    this.attackToken = true;
    this.hasToken = true;
    Sfx.enemyTell();
    if (atk.tell > 0.6) {
      FX.ring(this.x, this.y - 4, 10, 42, 0.4, 'rgba(255,120,70,0.5)', 2, 0.3);
    }
  }

  updateTell(dt) {
    const a = this.attack;
    if (!a) { this.state = 'chase'; return; }
    this.vx = approach(this.vx, 0, 1200 * dt);
    // Slow re-aim: the telegraph commits, but never locks out a dodging player entirely.
    if (this.stateT > a.tell * 0.55) {
      this.facing = (Game.player.x >= this.x) ? 1 : -1;
    }
    if (this.stateT >= a.tell) {
      this.state = 'attack'; this.stateT = 0;
      this.attackDone = false;
      if (a.lunge) {
        this.vx = this.facing * (a.lungeSpeed || 460);
      }
      if (a.leap) {
        this.vy = -a.leap; this.vx = this.facing * (a.leapSpeed || 420); this.onGround = false;
      }
      if (a.slam) {
        Camera.shake(3, 0.2);
      }
      Sfx.enemySwing();
    }
  }

  updateAttack(dt) {
    const a = this.attack;
    if (!a) { this.state = 'chase'; return; }
    const t = this.stateT;
    if (a.lunge) this.vx = approach(this.vx, this.facing * (a.lungeSpeed || 460), 2600 * dt);
    else this.vx = approach(this.vx, 0, 1300 * dt);

    // a second, chained swing (husk combo)
    if (a.second && !this.secondDone && t >= a.second.at) {
      this.secondDone = true;
      this.attackDone = false;
      this.secondSwing = true;
      Sfx.enemySwing();
      FX.slash(this.x + this.facing * 20, this.y - this.h * 0.8, 70, this.facing > 0 ? -1.2 : Math.PI + 0.6,
               this.facing > 0 ? 0.9 : Math.PI - 0.9, this.facing, 0.16, 'rgba(255,150,90,0.45)', 8);
    }
    const phase = this.secondSwing ? a.second : a;

    // active window
    if (!this.attackDone && t >= (this.secondSwing ? a.second.at + a.second.hitStart : a.hitStart)
        && t <= (this.secondSwing ? a.second.at + a.second.hitEnd : a.hitEnd)) {
      this.checkPlayerHit(phase);
    }
    if (a.shock && !this.attackDone && t >= a.hitStart) {
      this.attackDone = true;
      Game.spawnShockwave(this.x + this.facing * 46, this.y, this.facing, a.shock.damage, a.shock.speed, a.shock.range);
    }
    // spawn an extra ground slam ring visual
    if (a.slam && t >= a.hitStart && !this.slamDone) {
      this.slamDone = true;
      FX.ring(this.x + this.facing * 30, WORLD.ground, 10, 90, 0.3, 'rgba(255,190,120,0.7)', 4, 0.3);
      FX.dust(this.x + this.facing * 40, WORLD.ground, this.facing, 1.2, 10);
      Camera.shake(3.5, 0.22);
    }
    if (t >= a.dur) {
      this.attack = null;
      this.attackToken = false;
      this.hasToken = false;
      this.secondSwing = false;
      this.secondDone = false;
      Game.releaseAttackToken(this);
      this.state = 'recover'; this.stateT = 0;
      this.cooldown = rand(this.cfg.cooldown[0], this.cfg.cooldown[1]);
      this.slamDone = false;
    }
  }

  checkPlayerHit(a) {
    const p = Game.player;
    if (!p.alive) return;
    const fx = this.facing;
    const bx0 = this.x + (fx > 0 ? a.ox || 8 : -(a.reach + (a.ox || 8)));
    const bx1 = bx0 + a.reach;
    const px0 = p.x - 18, px1 = p.x + 18;
    const py0 = p.y - 126, py1 = p.y;
    const by0 = this.y - (a.yh || 140), by1 = this.y + 6;
    if (bx1 > px0 && bx0 < px1 && by1 > py0 && by0 < py1) {
      this.attackDone = true;
      if (a.second && !this.secondSwing) this.attackDone = true;
      if (p.parryT > 0) {
        Game.onParry(this, a);
        return;
      }
      p.takeDamage(a.damage, this.x, { knock: a.knock || 360, launch: a.launch, hitstun: a.stun || 0.34 });
      FX.hitBurst(p.x, p.y - 50, fx, 1.4, 'heavy');
      Camera.shake(5, 0.25);
    }
  }

  applyPhysics(dt) {
    if (!this.onGround) {
      const g = this.launched ? 1450 : 2100;
      this.vy += g * dt;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const wasAir = !this.onGround;
    if (this.y >= WORLD.ground) {
      const impact = this.vy;
      this.y = WORLD.ground;
      if (wasAir) {
        this.onGround = true;
        if (impact > 320) {
          FX.dust(this.x, this.y, 0, clamp(impact / 700, 0.4, 1.6), 8);
          FX.ring(this.x, this.y, 6, 20 + impact * 0.035, 0.22, 'rgba(210,200,220,0.35)', 2, 0.3);
          if (impact > 620) {
            Camera.shake(this.spikeLand ? 6 : 3, 0.2);
            Sfx.land(true);
            if (this.spikeLand) {
              this.spikeLand = false;
              FX.ring(this.x, WORLD.ground, 10, 110, 0.34, 'rgba(255,210,170,0.7)', 4, 0.28);
              FX.dust(this.x, WORLD.ground, 0, 1.5, 14);
              FX.text(this.x, this.y - this.h * 1.1, '坠地', '#ffd9a8', 22, { life: 0.7 });
              this.hitstun = Math.max(this.hitstun, 0.5);
              this.staggerT = Math.max(this.staggerT, 0.35);
            } else if (this.launched) {
              this.takeHit(6, this.x, { heavy: false, knock: 0, noLimb: true });
              this.hitstun = Math.max(this.hitstun, 0.4);
              FX.text(this.x, this.y - this.h * 1.1, '坠地', '#cdbfae', 18, { life: 0.6 });
            }
          } else Sfx.land(false);
        }
        this.vy = 0;
        if (this.launched && impact > 260) {
          this.launched = false;
          this.hitstun = Math.max(this.hitstun, 0.35);
        }
      }
      this.vy = 0;
    } else {
      this.onGround = false;
    }
    if (this.x < WORLD.left + 30) { this.x = WORLD.left + 30; this.vx = 0; }
    if (this.x > WORLD.right - 30) { this.x = WORLD.right - 30; this.vx = 0; }
  }

  updateDead(dt) {
    this.deathT += dt;
    if (!this.onGround) this.vy += 1800 * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.vx = approach(this.vx, 0, 900 * dt);
    if (this.y >= WORLD.ground) {
      this.y = WORLD.ground;
      if (!this.onGround && this.vy > 200) {
        FX.dust(this.x, this.y, 0, 1.2, 10);
        this.vy *= -0.3;
      } else this.vy = 0;
      this.onGround = true;
    }
    this.x = clamp(this.x, WORLD.left + 20, WORLD.right - 20);
    if (this.deathT > 1.8) this.removeMe = true;
  }

  /* ---------- pose ---------- */
  updatePose(dt) {
    const p = this.pose;
    const t = this.animT;
    const cfg = this.cfg;
    const moving = Math.abs(this.vx) > 25;
    let tgt = {
      lean: 0, spine: 0, armR: 0.5, armL: -0.35, elbowR: 0.55, elbowL: -0.7,
      legF: 0.1, legB: -0.12, kneeF: -0.18, kneeB: -0.2, head: 0, crouch: 0, bodyY: 0, twist: 0
    };
    const legBroken = (this.limbs.legL.broken ? 1 : 0) + (this.limbs.legR.broken ? 1 : 0);
    if (this.state === 'chase' && moving) {
      const ph = t * (this.kind === 'warden' ? 5 : 9);
      const s = Math.sin(ph), c = Math.cos(ph);
      const m = clamp(Math.abs(this.vx) / cfg.speed, 0, 1);
      tgt.legF = s * 0.85 * m; tgt.legB = -s * 0.85 * m;
      tgt.kneeF = -(0.3 + Math.max(0, -s) * 0.7) * m; tgt.kneeB = -(0.3 + Math.max(0, s) * 0.7) * m;
      tgt.armR = -s * 0.4 * m + 0.5; tgt.armL = s * 0.4 * m - 0.35;
      tgt.spine = -0.12 * m; tgt.bodyY = Math.abs(c) * 2.5 * m;
      if (legBroken > 0) {
        tgt.legF *= 0.35; tgt.legB *= 0.35;
        tgt.lean = 0.14 * legBroken;
        tgt.bodyY += Math.sin(t * 9) * 3 * (legBroken > 1 ? 1 : 0.5);
      }
    } else if (this.state === 'idle' || this.state === 'recover') {
      tgt.spine = 0.04; tgt.armR = 0.45 + Math.sin(t * 2) * 0.05;
      if (legBroken > 1) { tgt.legF = 0.5; tgt.kneeF = -0.9; tgt.legB = -0.1; tgt.kneeB = -0.2; }
    }

    if (this.state === 'tell' && this.attack) {
      const k = clamp(this.stateT / this.attack.tell, 0, 1);
      const e = easeOut(k);
      const a = this.attack;
      if (this.kind === 'warden') {
        if (a.name === 'smash' || a.name === 'bodyBash') {
          tgt.armR = lerp(0.5, -2.9, e); tgt.armL = lerp(-0.3, -3.1, e);
          tgt.elbowR = lerp(0.5, -0.4, e); tgt.elbowL = lerp(-0.7, -0.4, e);
          tgt.spine = lerp(0.05, 0.35, e); tgt.crouch = 8 * e; tgt.lean = -0.12 * e;
        } else if (a.name === 'charge') {
          tgt.spine = lerp(0.05, 0.5, e); tgt.lean = 0.2 * e; tgt.crouch = 12 * e;
          tgt.armR = lerp(0.5, -1.9, e); tgt.armL = lerp(-0.3, 1.6, e);
          tgt.legF = lerp(0.1, -0.5, e); tgt.legB = lerp(-0.1, 0.6, e);
        } else {
          tgt.armR = lerp(0.5, -2.2, e); tgt.spine = lerp(0.05, 0.25, e);
        }
      } else if (this.kind === 'stalker') {
        if (a.name === 'pounce') {
          tgt.crouch = 16 * e; tgt.spine = lerp(0.05, 0.55, e);
          tgt.legF = lerp(0.1, 0.9, e); tgt.legB = lerp(-0.1, -0.7, e);
          tgt.kneeF = lerp(-0.2, -1.5, e); tgt.kneeB = lerp(-0.2, -0.6, e);
          tgt.armR = lerp(0.4, 1.0, e); tgt.armL = lerp(-0.4, 0.9, e);
        } else {
          tgt.armR = lerp(0.4, -1.9, e); tgt.armL = lerp(-0.4, -1.2, e);
          tgt.spine = lerp(0.05, 0.2, e); tgt.twist = 0.2 * e;
        }
      } else {
        if (a.name === 'lunge') {
          tgt.spine = lerp(0.05, 0.45, e); tgt.crouch = 12 * e;
          tgt.armR = lerp(0.4, -2.4, e); tgt.elbowR = 0.2;
          tgt.armL = lerp(-0.3, -1.0, e);
          tgt.legF = lerp(0.1, 0.6, e); tgt.kneeF = -0.5;
        } else {
          tgt.armR = lerp(0.4, -2.6, e); tgt.elbowR = lerp(0.5, -0.2, e);
          tgt.spine = lerp(0.05, 0.28, e); tgt.crouch = 6 * e;
          tgt.armL = lerp(-0.3, 0.2, e);
        }
        tgt.lean = 0.08 * e;
      }
    }

    if (this.state === 'attack' && this.attack) {
      const a = this.attack;
      const t2 = this.stateT;
      const prog = clamp(t2 / Math.max(0.05, a.hitEnd), 0, 1);
      if (this.kind === 'warden') {
        tgt.armR = lerp(-2.9, 1.6, easeOut(prog)); tgt.armL = lerp(-3.1, 1.5, easeOut(prog));
        tgt.spine = lerp(0.35, -0.4, easeOut(prog)); tgt.lean = 0.2 * prog;
        tgt.crouch = lerp(8, 16, prog);
        tgt.legF = 0.6; tgt.kneeF = -0.8;
      } else if (this.kind === 'stalker') {
        if (a.name === 'pounce') {
          tgt.spine = 0.35; tgt.armR = 1.2; tgt.armL = 1.0; tgt.legF = 0.7; tgt.kneeF = -0.9;
          tgt.legB = -0.5; tgt.crouch = 4;
        } else {
          tgt.armR = lerp(-1.9, 1.4, easeOut(prog)); tgt.armL = lerp(-1.2, 1.1, easeOut(prog));
          tgt.spine = 0.2; tgt.lean = 0.14;
        }
      } else if (a.name === 'lunge') {
        tgt.spine = 0.5; tgt.armR = lerp(-2.4, 1.4, easeOut(prog)); tgt.lean = 0.2;
        tgt.legF = 0.7; tgt.legB = -0.6; tgt.kneeF = -0.6;
      } else {
        tgt.armR = lerp(-2.6, 1.55, easeOut(prog)); tgt.spine = lerp(0.28, -0.3, easeOut(prog));
        tgt.lean = 0.16; tgt.armL = lerp(0.2, -0.6, prog);
      }
    }

    if (this.state === 'stagger') {
      tgt.spine = 0.3; tgt.lean = -0.2; tgt.armR = 0.9; tgt.armL = -0.9; tgt.head = 0.2;
      tgt.crouch = 5; tgt.bodyY = Math.sin(this.stateT * 30) * 1.5;
    }

    if (this.dead) {
      tgt = { lean: 0.5, spine: 0.4, armR: 1.2, armL: 0.8, elbowR: 0.3, elbowL: 0.3,
              legF: 0.4, legB: -0.4, kneeF: -0.5, kneeB: -0.6, head: 0.3, crouch: 10, bodyY: 0, twist: 0 };
    }

    const rate = this.dead ? 10 : 16;
    for (const k in tgt) p[k] = lerp(p[k], tgt[k], 1 - Math.pow(0.001, dt * (rate / 16)));

    // weapon drop marker
    if (!this.limbs.armR.broken) this.weaponDropped = false;
  }

  draw(ctx) {
    ENEMY_DRAW[this.kind].draw(ctx, this);
  }
}

/* ---------------- Attack tables ---------------- */
const HOWL_HUSK = {
  combo: { name: 'combo', tell: 0.36, dur: 0.9, hitStart: 0.08, hitEnd: 0.16, damage: 7, knock: 200,
           reach: 140, yh: 145, ox: 4, stun: 0.24, second: { at: 0.44, dur: 0.5, hitStart: 0.04, hitEnd: 0.14,
           damage: 11, knock: 400, reach: 158, yh: 155, ox: 6, stun: 0.36 } },
  slash: { name: 'slash', tell: 0.46, dur: 0.56, hitStart: 0.09, hitEnd: 0.2, damage: 9, knock: 320,
           reach: 150, yh: 150, ox: 6, stun: 0.32 },
  lunge: { name: 'lunge', tell: 0.55, dur: 0.66, hitStart: 0.12, hitEnd: 0.3, damage: 12, knock: 400,
           reach: 135, yh: 150, ox: 8, lunge: true, lungeSpeed: 470, stun: 0.4 }
};
const HOWL_STALKER = {
  doubleSlash: { name: 'doubleSlash', tell: 0.34, dur: 0.52, hitStart: 0.06, hitEnd: 0.16, damage: 7, knock: 240,
                 reach: 135, yh: 135, ox: 4, stun: 0.26, lunge: true, lungeSpeed: 260 },
  pounce: { name: 'pounce', tell: 0.44, dur: 0.7, hitStart: 0.15, hitEnd: 0.38, damage: 11, knock: 360,
            reach: 145, yh: 160, ox: 0, leap: 560, leapSpeed: 440, stun: 0.36 }
};
const HOWL_WARDEN = {
  smash: { name: 'smash', tell: 0.74, dur: 0.9, hitStart: 0.13, hitEnd: 0.26, damage: 17, knock: 440,
           reach: 205, yh: 220, ox: -12, slam: true, stun: 0.45,
           shock: { damage: 10, speed: 420, range: 360 } },
  charge: { name: 'charge', tell: 0.64, dur: 0.8, hitStart: 0.09, hitEnd: 0.32, damage: 14, knock: 500,
            reach: 150, yh: 210, ox: 0, lunge: true, lungeSpeed: 540, stun: 0.44 },
  bodyBash: { name: 'bodyBash', tell: 0.6, dur: 0.82, hitStart: 0.1, hitEnd: 0.22, damage: 8, knock: 320,
              reach: 155, yh: 210, ox: 0, slam: true, stun: 0.35, shock: { damage: 5, speed: 340, range: 250 } }
};
