'use strict';
// ---------------------------------------------------------------------------
// ENEMIES — "Husk" marionettes with detachable, breakable limbs.
// Three behavioural archetypes: Cutter (rush), Colossus (heavy slam), Chorus (ranged).
// ---------------------------------------------------------------------------

const ENEMY_TYPES = {
  cutter: {
    name: 'CUTTER', label: '裂刃傀儡',
    scale: 1.0,
    hp: 92, speed: 188, accel: 1500,
    poise: 26, poiseRegen: 14,
    colors: { plate: '#242838', plate2: '#3a4058', bone: '#e8dfcf', bone2: '#c9bda8', thread: '#d2455c', eye: '#ff5f6d', glow: '#ff6b7a' },
    limbHp: { arm: 26, leg: 30, head: 40 },
    reach: 112, bodyH: 168,
    attackCD: [0.9, 1.5],
  },
  colossus: {
    name: 'COLOSSUS', label: '重甲傀儡',
    scale: 1.46,
    hp: 230, speed: 106, accel: 900,
    poise: 70, poiseRegen: 18,
    colors: { plate: '#2a2530', plate2: '#454052', bone: '#e5d8c4', bone2: '#b9a893', thread: '#b53d3d', eye: '#ffae3d', glow: '#ffab4d' },
    limbHp: { arm: 52, leg: 58, head: 72 },
    reach: 150, bodyH: 232,
    attackCD: [1.4, 2.2],
  },
  chorus: {
    name: 'CHORUS', label: '鸣弦傀儡',
    scale: 0.94,
    hp: 76, speed: 158, accel: 1400,
    poise: 18, poiseRegen: 16,
    colors: { plate: '#1f2b31', plate2: '#33454e', bone: '#e4e9e0', bone2: '#b8c3ba', thread: '#4cb7c9', eye: '#63f0ff', glow: '#5ee7ff' },
    limbHp: { arm: 24, leg: 26, head: 34 },
    reach: 96, bodyH: 164,
    attackCD: [1.1, 1.8],
    ranged: true,
  },
};

const EP = {
  idle: { hx: 0, hy: 82, lean: 4, head: 0, hfx: 16, hfy: 108, hbx: -16, hby: 100, ffx: 17, ffy: 0, bfx: -18, bfy: 0, sw: -52, sf: 1, flap: 0 },
  walk1: { hx: 3, hy: 78, lean: 12, head: -4, hfx: 24, hfy: 96, hbx: -22, hby: 104, ffx: 24, ffy: 6, bfx: -26, bfy: 0, sw: -34, sf: 1, flap: 2 },
  walk2: { hx: 3, hy: 80, lean: 13, head: -4, hfx: 18, hfy: 110, hbx: -26, hby: 96, ffx: -24, ffy: 4, bfx: 24, bfy: 0, sw: -28, sf: 1, flap: 3 },
  windup: { hx: -8, hy: 84, lean: -26, head: 10, hfx: -14, hfy: 150, hbx: -6, hby: 122, ffx: 14, ffy: 0, bfx: -26, bfy: 0, sw: -172, sf: 1, flap: 4 },
  swing: { hx: 10, hy: 68, lean: 40, head: -10, hfx: 46, hfy: 88, hbx: -28, hby: 84, ffx: 34, ffy: 0, bfx: -34, bfy: 2, sw: 30, sf: 1, flap: 5 },
  recover: { hx: 6, hy: 74, lean: 24, head: -4, hfx: 36, hfy: 88, hbx: -24, hby: 88, ffx: 26, ffy: 0, bfx: -28, bfy: 0, sw: 56, sf: 1, flap: 6 },
  hurt: { hx: -8, hy: 80, lean: -26, head: -18, hfx: 18, hfy: 104, hbx: -28, hby: 92, ffx: 22, ffy: 0, bfx: -22, bfy: 4, sw: 46, sf: 1, flap: 7 },
  stagger: { hx: -10, hy: 66, lean: -30, head: -14, hfx: 6, hfy: 96, hbx: -30, hby: 82, ffx: 24, ffy: 0, bfx: -30, bfy: 0, sw: 70, sf: 1, flap: 8 },
  downed: { hx: -14, hy: 34, lean: -60, head: -30, hfx: 22, hfy: 40, hbx: -40, hby: 30, ffx: 32, ffy: 0, bfx: -20, bfy: 0, sw: 80, sf: 1, flap: 9 },
  crawl: { hx: 6, hy: 26, lean: 74, head: -22, hfx: 38, hfy: 18, hbx: 16, hby: 24, ffx: 30, ffy: 0, bfx: -24, bfy: 0, sw: 62, sf: 1, flap: 10 },
  crawlDrag: { hx: 4, hy: 22, lean: 78, head: -26, hfx: 30, hfy: 12, hbx: 8, hby: 20, ffx: 38, ffy: 0, bfx: -30, bfy: 0, sw: 54, sf: 1, flap: 11 },
  throwWind: { hx: -4, hy: 82, lean: -16, head: 6, hfx: -10, hfy: 146, hbx: 12, hby: 108, ffx: 14, ffy: 0, bfx: -26, bfy: 0, sw: -150, sf: 1, flap: 11 },
  throwGo: { hx: 12, hy: 76, lean: 28, head: -6, hfx: 54, hfy: 112, hbx: -26, hby: 92, ffx: 30, ffy: 0, bfx: -30, bfy: 0, sw: -48, sf: 1, flap: 12 },
  slamWind: { hx: -4, hy: 100, lean: -18, head: 10, hfx: 2, hfy: 178, hbx: -14, hby: 150, ffx: 8, ffy: 10, bfx: -30, bfy: 0, sw: -104, sf: 1, flap: 4 },
  slam: { hx: 14, hy: 68, lean: 34, head: -12, hfx: 60, hfy: 66, hbx: 10, hby: 88, ffx: 40, ffy: 0, bfx: -40, bfy: 0, sw: 42, sf: 1, flap: 5 },
};

class Enemy {
  constructor(game, type, x, opts = {}) {
    this.game = game;
    this.type = type;
    this.cfg = ENEMY_TYPES[type];
    this.x = x;
    this.y = game.groundY;
    this.vx = 0; this.vy = 0;
    this.facing = -1;
    this.hp = this.cfg.hp * (opts.hpMul || 1);
    this.maxHp = this.hp;
    this.poise = this.cfg.poise;
    this.maxPoise = this.cfg.poise;
    this.poiseRegenDelay = 0;
    this.state = 'spawn';
    this.stateT = 0;
    this.attack = null;
    this.attackCD = rand(0.6, 1.4);
    this.thinkT = 0;
    this.pose = poseCopy(EP.idle);
    this.hitFlash = 0;
    this.staggerT = 0;
    this.dead = false;
    this.deadT = 0;
    this.scale = this.cfg.scale;
    this.spawnT = 0;
    this.alpha = 0;
    this.attackCount = 0;
    this.walkPhase = rand(0, 10);
    this.parts = {
      head: { hp: this.cfg.limbHp.head, max: this.cfg.limbHp.head, broken: false, name: 'head' },
      armF: { hp: this.cfg.limbHp.arm, max: this.cfg.limbHp.arm, broken: false, name: 'arm' },
      armB: { hp: this.cfg.limbHp.arm, max: this.cfg.limbHp.arm, broken: false, name: 'arm' },
      legF: { hp: this.cfg.limbHp.leg, max: this.cfg.limbHp.leg, broken: false, name: 'leg' },
      legB: { hp: this.cfg.limbHp.leg, max: this.cfg.limbHp.leg, broken: false, name: 'leg' },
    };
    this.limbFlash = { head: 0, armF: 0, armB: 0, legF: 0, legB: 0 };
    this.slashTrail = null;
    this.tint = 0;
    this.spawnSide = opts.side || 1;
    this.armorHits = 0;
    this.superArmor = false;
    this.knockResist = type === 'colossus' ? 0.55 : 1;
    this.lastHitT = -99;
    this.teleGlow = 0;
    this.bloodCol = type === 'chorus' ? '#5ee7ff' : '#e8dfcf';
    this.chorusOrbit = 0;
    this.projectileCD = rand(1.6, 2.6);
    this.id = ++game.enemySerial;
    this.wasGrounded = true;
    this.landHit = false;
    this.shakeOff = 0;
    this.attackingNow = false;
  }

  get alive() { return !this.dead; }
  get h() { return this.cfg.bodyH; }
  get chestY() { return this.y - 100 * this.scale; }

  // ---------------------------------------------------------------- util
  partsIntact() {
    const p = this.parts;
    return {
      arms: (p.armF.broken ? 0 : 1) + (p.armB.broken ? 0 : 1),
      legs: (p.legF.broken ? 0 : 1) + (p.legB.broken ? 0 : 1),
      head: !p.head.broken,
    };
  }
  isCrippled() { return this.parts.legF.broken && this.parts.legB.broken; }
  isArmless() { return this.parts.armF.broken && this.parts.armB.broken; }

  // ---------------------------------------------------------------- AI
  update(dt) {
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    for (const k in this.limbFlash) this.limbFlash[k] = Math.max(0, this.limbFlash[k] - dt);
    this.poiseRegenDelay = Math.max(0, this.poiseRegenDelay - dt);
    if (this.poiseRegenDelay <= 0) this.poise = Math.min(this.maxPoise, this.poise + this.cfg.poiseRegen * dt);
    this.teleGlow = Math.max(0, this.teleGlow - dt);
    this.shakeOff = Math.max(0, this.shakeOff - dt * 6);

    if (this.dead) {
      this.updateDead(dt);
      return;
    }
    this.stateT += dt;
    this.attackCD = Math.max(0, this.attackCD - dt);
    this.projectileCD = Math.max(0, this.projectileCD - dt);

    if (this.state === 'spawn') {
      this.alpha = Math.min(1, this.alpha + dt * 4);
      this.spawnT += dt;
      if (this.spawnT > 0.45) this.setState('idle');
      this.applyGravity(dt);
      return;
    }

    const player = this.game.player;
    const dx = player.x - this.x;
    const adx = Math.abs(dx);
    const dead = !player.alive;

    if (!dead) {
      if (Math.abs(dx) > 2) this.facing = sign(dx);
    }

    switch (this.state) {
      case 'idle':
        this.vx = damp(this.vx, 0, 9, dt);
        this.thinkT -= dt;
        if (dead) { this.setState('idle'); break; }
        if (this.thinkT <= 0 || adx > 90) this.think(dt, adx, dx);
        break;
      case 'chase':
        this.chase(dt, adx, dx);
        break;
      case 'windup':
        this.updateWindup(dt);
        break;
      case 'attack':
        this.updateAttackState(dt);
        break;
      case 'recover':
        this.vx = damp(this.vx, 0, 8, dt);
        if (this.stateT > this.recoverTime) this.setState('idle');
        break;
      case 'stagger':
        this.vx = damp(this.vx, 0, this.y < this.game.groundY - 6 ? 0.4 : 4, dt);
        this.staggerT -= dt;
        if (this.staggerT <= 0) this.setState('idle');
        break;
      case 'hurt':
        this.vx = damp(this.vx, 0, 5, dt);
        if (this.stateT > this.hurtTime) this.setState('idle');
        break;
      case 'backstep':
        this.updateBackstep(dt);
        break;
      case 'downed':
        this.vx = damp(this.vx, 0, 6, dt);
        this.updateDowned(dt);
        break;
    }

    this.applyGravity(dt);
    this.animate(dt);
    // contact damage avoidance: push apart from other enemies
    for (const e of this.game.enemies) {
      if (e === this || e.dead) continue;
      const dd = this.x - e.x;
      const min = 34 * (this.scale + e.scale) * 0.5;
      if (Math.abs(dd) < min && Math.abs(this.y - e.y) < 30) {
        const push = (min - Math.abs(dd)) * 0.5;
        this.x += sign(dd || 1) * push * dt * 8;
      }
    }
  }

  think(dt, adx, dx) {
    const player = this.game.player;
    const parts = this.partsIntact();
    const canWalk = !this.isCrippled();
    if (this.isCrippled()) {
      // both legs gone: crawl toward player slowly and headbutt if close
      if (adx < 90 && this.attackCD <= 0) {
        this.startAttack(this.pickCrawlAttack());
      } else {
        this.vx = damp(this.vx, this.facing * 58, 4, dt);
      }
      this.thinkT = 0.35;
      return;
    }
    if (this.isArmless() && !parts.head) {
      // no arms & no head shouldn't happen (head break kills)
    }
    if (this.type === 'chorus') {
      this.thinkChorus(dt, adx, dx);
      return;
    }
    if (this.type === 'colossus') {
      if (adx > this.cfg.reach * 0.85) {
        this.setState('chase');
      } else if (this.attackCD <= 0) {
        this.startAttack('slam');
      } else {
        this.setState('idle');
        this.thinkT = 0.3;
      }
      return;
    }
    // cutter
    if (this.isArmless()) {
      if (adx > 70) this.setState('chase');
      else if (this.attackCD <= 0) this.startAttack('headbutt');
      else { this.setState('idle'); this.thinkT = 0.25; }
      return;
    }
    if (adx > this.cfg.reach * 0.9) {
      this.setState('chase');
      if (adx > 190 && adx < 330 && this.attackCD <= 0.25 && Math.random() < 0.35) this.startAttack('lunge');
    } else if (this.attackCD <= 0) {
      this.startAttack(this.attackCount % 3 === 2 ? 'double' : 'slash');
    } else {
      this.thinkT = 0.22;
    }
  }

  thinkChorus(dt, adx, dx) {
    if (this.isArmless()) {
      if (adx > 80) this.setState('chase');
      else if (this.attackCD <= 0) this.startAttack('headbutt');
      else this.setState('idle');
      return;
    }
    if (adx < 130) {
      // too close — retreat
      if (Math.random() < 0.5 && this.attackCD > -1) this.setState('backstep');
      else this.setState('chase');
      this.thinkT = 0.4;
      return;
    }
    if (this.projectileCD <= 0 && adx < 620) {
      this.startAttack('throw');
    } else if (adx > 380) {
      this.setState('chase');
    } else {
      this.setState('idle');
      this.thinkT = 0.3;
      this.vx = damp(this.vx, 0, 6, dt);
    }
  }

  chase(dt, adx, dx) {
    const speed = this.cfg.speed * (this.isCrippled() ? 0.3 : 1) * (this.partsIntact().legs === 1 ? 0.62 : 1);
    this.vx = damp(this.vx, this.facing * speed, 7, dt);
    this.thinkT -= dt;
    if (this.type === 'chorus') {
      if (adx < 330 && adx > 150) this.setState('idle');
    } else if (adx < this.cfg.reach * 0.82 && this.attackCD <= 0) {
      this.setState('idle');
    }
  }

  updateBackstep(dt) {
    this.vx = damp(this.vx, -this.facing * 260, 8, dt);
    if (this.stateT > 0.3) this.setState('idle');
  }

  updateDowned(dt) {
    this.staggerT -= dt;
    const legs = this.partsIntact().legs;
    // crippled husks drag themselves at the player; they're still dangerous up close
    if (legs === 0 && this.game.player.alive) {
      const dx = this.game.player.x - this.x;
      if (Math.abs(dx) > 30) {
        this.facing = sign(dx) || this.facing;
        this.vx = damp(this.vx, this.facing * 72, 3, dt);
      } else {
        this.vx = damp(this.vx, 0, 4, dt);
      }
      if (Math.abs(dx) < 84 && this.attackCD <= 0) {
        this.startAttack(this.pickCrawlAttack());
        return;
      }
    } else {
      this.vx = damp(this.vx, 0, 5, dt);
    }
    if (this.staggerT <= 0) this.setState('idle');
  }

  // ---------------------------------------------------------------- attack specs
  pickCrawlAttack() {
    if (!this.parts.armF.broken || !this.parts.armB.broken) return 'crawlSlash';
    return 'headbutt';
  }

  startAttack(kind) {
    if (this.dead) return;
    if (this.game.player.iFrames > 0.35 && this.type !== 'colossus') {
      // player is recovering/invulnerable — don't waste the swing, circle instead
      this.thinkT = 0.35;
      return;
    }
    this.attackCount++;
    const spec = this.makeAttack(kind);
    this.attack = { ...spec, t: 0, hit: false, kind };
    this.setState('windup');
    this.vx *= 0.2;
    this.attackingNow = true;
    if (this.type === 'chorus' && kind === 'throw') Sound.SFX.enemyWindup(this.pan());
    else Sound.SFX.enemyWindup(this.pan());
    this.teleGlow = 1;
  }

  makeAttack(kind) {
    const arms = this.partsIntact().arms;
    const legs = this.partsIntact().legs;
    const weak = arms <= 1 ? 0.62 : 1;
    const reachScale = this.cfg.reach / 112;
    switch (kind) {
      case 'slash':
        return {
          windup: 0.44, active: 0.14, recover: 0.46,
          dmg: 8 * weak, reach: 112 * reachScale, arcTop: 34 * this.scale, arcBot: 146 * this.scale,
          knock: 260, lift: 0, poses: ['windup', 'swing', 'recover'],
          arcCol: '#ff5f6d', lunge: 120,
        };
      case 'double':
        return {
          windup: 0.44, active: 0.26, recover: 0.5,
          dmg: 7 * weak, reach: 108 * reachScale, arcTop: 34 * this.scale, arcBot: 150 * this.scale,
          knock: 260, lift: -120, poses: ['windup', 'swing', 'recover'],
          arcCol: '#ff5f6d', lunge: 160, double: true,
        };
      case 'lunge':
        return {
          windup: 0.46, active: 0.18, recover: 0.62,
          dmg: 10 * weak, reach: 120 * reachScale, arcTop: 40 * this.scale, arcBot: 140 * this.scale,
          knock: 340, lift: 0, poses: ['windup', 'swing', 'recover'],
          arcCol: '#ff6b7a', lunge: 520,
        };
      case 'headbutt':
        return {
          windup: 0.42, active: 0.24, recover: 0.68,
          dmg: 6, reach: 80 * reachScale, arcTop: 100 * this.scale, arcBot: 160 * this.scale,
          knock: 320, lift: -100, poses: ['windup', 'swing', 'recover'],
          arcCol: '#ffb36b', lunge: 640, headbutt: true,
        };
      case 'crawlSlash':
        return {
          windup: 0.40, active: 0.15, recover: 0.5,
          dmg: 6 * weak, reach: 78 * reachScale, arcTop: 0, arcBot: 80 * this.scale,
          knock: 200, lift: 0, poses: ['crawl', 'swing', 'recover'],
          arcCol: '#ff5f6d', lunge: 80,
        };
      case 'slam':
        return {
          windup: 0.82, active: 0.16, recover: 0.9,
          dmg: 17, reach: 138 * reachScale, arcTop: 0, arcBot: 210 * this.scale,
          knock: 480, lift: -260, poses: ['slamWind', 'slam', 'recover'],
          arcCol: '#ffab4d', lunge: 90, shockwave: true, armor: true,
          slamDmgScale: arms <= 1 ? 0.6 : 1,
        };
      case 'throw':
        return {
          windup: 0.5, active: 0.2, recover: 0.55,
          dmg: 7, reach: 0, arcTop: 0, arcBot: 0, poses: ['throwWind', 'throwGo', 'recover'],
          arcCol: '#5ee7ff', lunge: 0, projectile: true, armor: true,
        };
      default:
        return this.makeAttack('slash');
    }
  }

  updateWindup(dt) {
    const a = this.attack;
    a.t += dt;
    this.vx = damp(this.vx, 0, 12, dt);
    // face player until last moment
    const dx = this.game.player.x - this.x;
    if (a.t < a.windup * 0.7 && Math.abs(dx) > 2) this.facing = sign(dx);
    if (a.t >= a.windup) {
      this.setState('attack');
      this.attack.fired = false;
      this.attack.t = 0;
      Sound.SFX.enemySwing(this.pan());
      this.teleGlow = 0.3;
    }
  }

  updateAttackState(dt) {
    const a = this.attack;
    a.t += dt;
    const windupVel = a.lunge || 0;
    if (a.t < a.active) {
      this.vx = damp(this.vx, this.facing * windupVel, 20, dt);
      if (!a.fired) {
        a.fired = true;
        if (a.kind === 'slam') {
          this.game.particles.add({ type: 'ring', x: this.x + this.facing * 40 * this.scale, y: this.y, size: 36, life: 0.3, col: 'rgba(255,180,90,0.65)', add: true });
        }
      }
      if (a.projectile && !a.spawned) {
        a.spawned = true;
        this.game.spawnProjectile(this, a);
      }
      // slash trail
      if (!a.trail && !a.headbutt) {
        this.game.slashes.add({
          life: 0.20, width: 24 * this.scale, col: '#ffd0d8', col2: a.arcCol,
          follow: () => {
            const b = this.getBladeWorld();
            return { x: b.tip.x, y: b.tip.y, bx: b.base.x, by: b.base.y };
          },
        });
        a.trail = true;
      }
      this.game.checkEnemyAttack(this, a, dt);
      // double swing second hit mid-active
      if (a.double && !a.doubleDone && a.t > a.active * 0.55) {
        a.doubleDone = true;
        a.trail = false;
        Sound.SFX.enemySwing(this.pan());
      }
    } else {
      this.vx = damp(this.vx, 0, 8, dt);
      if (a.t >= a.active + a.recover) {
        this.endAttack();
      }
    }
    // slam shockwave at active start
    if (a.shockwave && a.fired && !a.shockFired && a.t > 0.02) {
      a.shockFired = true;
      this.game.shockwave(this.x + this.facing * 40 * this.scale, this.y, 165 * this.scale, 12 * (a.slamDmgScale || 1), 'enemy', this);
      this.game.addTrauma(0.3);
      Sound.SFX.hitHeavy(this.pan());
      Sound.SFX.land(1.3, this.pan());
      for (let i = 0; i < 16; i++) {
        this.game.particles.add({
          type: 'shard', x: this.x + this.facing * 40 + rand(-20, 20), y: this.y,
          vx: rand(-280, 280), vy: rand(-420, -80), size: rand(2, 6), rot: rand(0, TAU), vr: rand(-12, 12),
          life: rand(0.3, 0.6), col: pick(['#a08c72', '#c7b49a', '#6b5b48']), grav: 1600, floor: this.y, bounce: 0.3,
        });
      }
    }
  }

  endAttack() {
    const wasProjectile = !!(this.attack && this.attack.projectile);
    this.attack = null;
    this.attackingNow = false;
    this.attackCD = rand(this.cfg.attackCD[0], this.cfg.attackCD[1]) * (this.isCrippled() ? 1.4 : 1);
    this.setState('recover');
    this.recoverTime = this.type === 'colossus' ? 0.55 : 0.35;
    if (wasProjectile || this.type === 'chorus') this.projectileCD = rand(1.9, 3.0);
  }

  setState(s) {
    if (this.state === s) return;
    this.state = s;
    this.stateT = 0;
  }

  applyGravity(dt) {
    this.vy += (this.vy < 0 ? 1750 : 2400) * dt;
    this.launched = Math.max(0, (this.launched || 0) - dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    const gy = this.game.groundY;
    if (this.y >= gy) {
      if (!this.wasGrounded && this.vy > 380) {
        this.onLand(this.vy);
      }
      this.y = gy;
      this.vy = 0;
      this.wasGrounded = true;
      this.launched = 0;
    } else this.wasGrounded = false;
    const minX = this.game.arenaMinX + 40, maxX = this.game.arenaMaxX - 40;
    this.x = clamp(this.x, minX, maxX);
  }

  onLand(impact = 600) {
    const k = clamp(impact / 1200, 0.2, 1.3);
    this.game.particles.add({ type: 'ring', x: this.x, y: this.y, size: 26 * this.scale * (0.6 + k), life: 0.22, col: 'rgba(220,200,180,0.4)', add: true });
    this.game.addTrauma(0.06 * k);
    Sound.SFX.land(0.6 + k * 0.6, this.pan());
    // dust burst + a small bounce for launched bodies
    if (k > 0.5) {
      for (let i = 0; i < 8; i++) {
        this.game.particles.add({
          type: 'dust', x: this.x + rand(-18, 18), y: this.y, vx: rand(-150, 150) * k, vy: rand(-90, -10),
          size: rand(3, 7), life: rand(0.25, 0.5), col: 'rgba(195,185,170,0.28)', drag: 3,
        });
      }
    }
    for (let i = 0; i < 5; i++) {
      this.game.particles.add({
        type: 'dust', x: this.x + rand(-14, 14), y: this.y, vx: rand(-100, 100), vy: rand(-60, -10),
        size: rand(3, 6), life: rand(0.2, 0.4), col: 'rgba(190,180,165,0.25)', drag: 3,
      });
    }
  }

  // ---------------------------------------------------------------- damage
  // --- limb segment geometry (world space) used for blade-contact targeting ---
  limbSegments() {
    const sk = this.skeleton();
    const s = this.scale;
    const segs = [];
    if (!this.parts.armF.broken) segs.push({ part: 'armF', ax: sk.shF.x, ay: sk.shF.y, bx: sk.handF.x, by: sk.handF.y, r: 11 * s });
    if (!this.parts.armB.broken) segs.push({ part: 'armB', ax: sk.shB.x, ay: sk.shB.y, bx: sk.handB.x, by: sk.handB.y, r: 10 * s });
    if (!this.parts.legF.broken) segs.push({ part: 'legF', ax: sk.hipF.x, ay: sk.hipF.y, bx: sk.footF.x, by: sk.footF.y, r: 12 * s });
    if (!this.parts.legB.broken) segs.push({ part: 'legB', ax: sk.hipB.x, ay: sk.hipB.y, bx: sk.footB.x, by: sk.footB.y, r: 11 * s });
    if (!this.parts.head.broken) segs.push({ part: 'head', ax: sk.head.x, ay: sk.head.y, bx: sk.head.x, by: sk.head.y, r: 15 * s });
    return segs;
  }

  // Given the blade segment, find which limb it actually crosses.
  // Returns { part, x, y } or null for torso hits.
  partFromBlade(blade) {
    if (!blade) return null;
    const segs = this.limbSegments();
    let best = null;
    for (const sg of segs) {
      const d = segSegDist(blade.base.x, blade.base.y, blade.tip.x, blade.tip.y, sg.ax, sg.ay, sg.bx, sg.by);
      if (d.d <= sg.r) {
        // head/armed limbs are prioritised only when actually crossed; pick nearest
        if (!best || d.d < best.d) best = { part: sg.part, x: d.px, y: d.py, d: d.d };
      }
    }
    return best;
  }

  hitPartFromPoint(hx, hy) {
    const dy = this.y - hy;       // height above feet
    const dx = hx - this.x;
    const s = this.scale;
    if (dy > 128 * s) return 'head';
    if (dy < 55 * s) {
      if (Math.abs(dx) > 10) return (dx * this.facing) > 0 ? 'legF' : 'legB';
      return 'legF';
    }
    if (dy > 66 * s && Math.abs(dx) > 24 * s) {
      return (dx * this.facing) > 0 ? 'armF' : 'armB';
    }
    return null; // torso
  }

  takeHit(dmg, hitX, hitY, opts = {}) {
    if (this.dead) return null;
    const part = opts.part !== undefined ? opts.part : this.hitPartFromPoint(hitX, hitY);
    const limbMul = opts.limbMul || 1;
    const forceBreak = opts.forceBreak || false;
    let broke = null;
    let partName = part;

    // head hit: normal damage + head limb damage
    if (part) {
      const pp = this.parts[part];
      if (!pp.broken) {
        let limbDmg = dmg * limbMul * 1.55;
        if (opts.charged) limbDmg *= 1.35;
        pp.hp -= limbDmg;
        this.limbFlash[part] = 0.12;
        if (pp.hp <= 0 || (forceBreak && opts.heavy)) {
          broke = part;
        }
      } else {
        // hitting a stump: bonus body damage
        dmg *= 1.12;
      }
    }

    const armor = this.type === 'colossus' && !opts.guardBreak && !broke && this.state !== 'stagger' && this.state !== 'downed';
    const dmgMul = armor ? 0.55 : 1;
    this.hp -= dmg * dmgMul;
    this.hitFlash = 0.11;
    this.poise -= dmg * (opts.poiseDmg || 1) * (armor ? 0.4 : 1);
    this.poiseRegenDelay = 0.9;
    this.lastHitT = this.game.time;

    // knockback
    const dir = opts.dir ?? (sign(this.x - this.game.player.x) || 1);
    this.hitDir = dir;
    const resist = this.knockResist * (armor ? 0.5 : 1);
    this.vx += dir * (opts.knock || 200) * resist * 0.95;
    // negative lift = knock upward (remember: +y is down in this engine)
    if (opts.lift) {
      this.vy = opts.lift;
      this.launched = 0.42;
      if (-opts.lift > 120) this.y -= 3;
    }

    // cancel attacks on heavy hits
    const interrupt = opts.interrupt ?? (dmg >= 12 || this.poise <= 0);
    if (interrupt && this.state !== 'downed') {
      if (this.state === 'windup' || this.state === 'attack') {
        if (!this.attack?.armor || this.poise <= 0) {
          this.attack = null;
          this.attackingNow = false;
          this.setState('stagger');
          this.staggerT = opts.staggerTime ?? 0.42;
          this.attackCD = Math.max(this.attackCD, 0.5);
        }
      } else if (this.state === 'idle' || this.state === 'chase' || this.state === 'recover') {
        this.setState('hurt');
        this.hurtTime = 0.26;
      }
    }
    if (this.poise <= 0) {
      this.poise = this.maxPoise;
      this.setState('stagger');
      this.staggerT = 0.55;
      this.attack = null;
      this.attackingNow = false;
    }

    if (broke) this.breakLimb(broke, hitX, hitY);
    if (this.parts.head.broken) this.hp = 0;
    if (this.hp <= 0) this.die(opts);
    return { broke, killed: this.dead, dmg: dmg * dmgMul, part: partName };
  }

  breakLimb(part, hitX, hitY) {
    const pp = this.parts[part];
    if (!pp || pp.broken) return;
    pp.broken = true;
    this.game.onLimbBreak(this, part, hitX, hitY);
    if (part === 'head') {
      this.hp = 0;
    }
    if (part === 'legF' || part === 'legB') {
      // losing a leg: stagger and lower
      this.setState('stagger');
      this.staggerT = 1.1;
      this.attack = null;
      this.attackingNow = false;
      if (this.partsIntact().legs === 0) {
        this.staggerT = 2.2;
        this.setState('downed');
        this.downedLinger = 2.2;
      }
    }
    // If arm broken while winding an attack, cancel it
    if ((part === 'armF' || part === 'armB') && (this.state === 'windup' || this.state === 'attack')) {
      this.attack = null;
      this.attackingNow = false;
      this.setState('stagger');
      this.staggerT = 0.85;
    }
    if (this.isArmless()) {
      this.attackCD = Math.max(this.attackCD, 0.9);
    }
    this.attackCD = Math.max(this.attackCD, 0.35);
  }

  die(opts = {}) {
    if (this.dead) return;
    this.dead = true;
    this.deadT = 0;
    this.launched = 0;
    this.hp = 0;
    this.attack = null;
    this.attackingNow = false;
    this.setState('dead');
    this.game.onEnemyDeath(this, opts);
  }

  updateDead(dt) {
    this.deadT += dt;
    this.vx = damp(this.vx, 0, 4, dt);
    this.vy += 1600 * dt;
    this.x += this.vx * dt;
    this.y = Math.min(this.game.groundY, this.y + this.vy * dt);
    if (this.y >= this.game.groundY) { this.y = this.game.groundY; this.vy = 0; }
    // crumple pose
    const t = clamp(this.deadT / 0.45, 0, 1);
    this.pose = poseBlend(this.pose, EP.downed, 1 - Math.exp(-12 * dt));
  }

  // ---------------------------------------------------------------- animation
  animate(dt) {
    let target;
    const st = this.state;
    if (st === 'spawn') {
      target = EP.idle;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-10 * dt));
      return;
    }
    if (st === 'chase') {
      this.walkPhase += dt * 11;
      const side = Math.sin(this.walkPhase);
      target = poseCopy(side > 0 ? EP.walk1 : EP.walk2);
      target.hy += Math.sin(this.walkPhase * 2) * 2.4;
      target.ffy = Math.max(0, Math.sin(this.walkPhase) * 20 + 2);
      target.bfy = Math.max(0, -Math.sin(this.walkPhase) * 20 + 2);
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-18 * dt));
      return;
    }
    if (st === 'windup') {
      const a = this.attack;
      const t = clamp(a.t / a.windup, 0, 1);
      const poseName = a.poses[0];
      target = poseCopy(EP[poseName] || EP.windup);
      // intensify: coil further as windup completes (tremble at the end as a tell)
      target.lean -= t * 4;
      target.hfx -= t * 6;
      target.sw -= t * 10;
      if (t > 0.75) {
        const sh = (t - 0.75) * 4 * 2.2;
        target.hx += Math.sin(performance.now() * 0.05) * sh;
        target.hy += Math.cos(performance.now() * 0.043) * sh * 0.5;
      }
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-(10 + t * 16) * dt));
      return;
    }
    if (st === 'attack') {
      const a = this.attack;
      const t = clamp(a.t / Math.max(0.05, a.active), 0, 1);
      const poseName = a.poses[1];
      target = poseCopy(EP[poseName] || EP.swing);
      // double swing snaps back up midway
      if (a.double && t > 0.5) {
        target = poseCopy(EP.windup);
        target.hfx = 40; target.hfy = 132; target.sw = -70; target.lean = 12;
      }
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-32 * dt));
      return;
    }
    if (st === 'recover') {
      const a = this.attack;
      target = poseCopy(EP.recover);
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-14 * dt));
      return;
    }
    if (st === 'stagger') {
      target = poseCopy(EP.stagger);
      target.hx += Math.sin(performance.now() * 0.03) * 2;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-16 * dt));
      return;
    }
    if (st === 'hurt') {
      target = poseCopy(EP.hurt);
      // lean away from the blow
      const away = sign(this.hitDir || 1) * (this.facing > 0 ? 1 : -1);
      target.lean = -18 * away;
      target.hx = 8 * away;
      target.head = -14 * away;
      target.hfx = 16 + 10 * away;
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-30 * dt));
      return;
    }
    if (st === 'backstep') {
      target = poseCopy(EP.throwWind);
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-20 * dt));
      return;
    }
    if (st === 'downed') {
      if (this.isCrippled()) {
        // dragging its torso along the ground with its arms
        this.walkPhase += dt * 7;
        const ph = Math.sin(this.walkPhase);
        target = poseCopy(ph > 0 ? EP.crawl : EP.crawlDrag);
        target.hy += Math.abs(ph) * 3;
        target.hfx += ph * 7;
        target.hfy += Math.abs(ph) * 4;
        target.hx += ph * 2;
      } else {
        target = poseCopy(EP.downed);
      }
      this.pose = poseBlend(this.pose, target, 1 - Math.exp(-12 * dt));
      return;
    }
    // idle
    const t = performance.now() * 0.0022;
    target = poseCopy(EP.idle);
    target.hy += Math.sin(t + this.id) * 1.4;
    target.sw += Math.sin(t * 1.3 + this.id) * 2.4;
    target.head = Math.sin(t * 0.8 + this.id) * 2;
    this.pose = poseBlend(this.pose, target, 1 - Math.exp(-12 * dt));
  }

  // ---------------------------------------------------------------- skeleton (cached for combat + drawing)
  skeleton() {
    if (this._skFrame === this.game.frameSerial && this._sk) return this._sk;
    const p = this.pose;
    const f = this.facing;
    const s = this.scale;
    const rig = {
      torso: 48 * s, headR: 13 * s, upperArm: 28 * s, foreArm: 27 * s, thigh: 36 * s, shin: 36 * s,
    };
    const root = { x: this.x, y: this.y };
    // A husk that lost legs collapses: its hip height drops with each severed limb.
    const legsLeft = this.partsIntact().legs;
    const drop = legsLeft === 0 ? 0.30 : legsLeft === 1 ? 0.70 : 1;
    const L = (lx, ly) => ({ x: root.x + f * lx * s, y: root.y - ly * s * drop });
    const hip = L(p.hx, p.hy);
    const leanRad = p.lean * Math.PI / 180;
    const tdx = Math.sin(leanRad), tdy = -Math.cos(leanRad);
    const neck = { x: hip.x + tdx * rig.torso * f, y: hip.y + tdy * rig.torso };
    const perp = { x: Math.cos(leanRad) * f, y: Math.sin(leanRad) };
    const shF = { x: neck.x + perp.x * 4 - tdx * 5 * f, y: neck.y + perp.y * 4 - tdy * 5 };
    const shB = { x: neck.x - perp.x * 8 - tdx * 5 * f, y: neck.y - perp.y * 8 - tdy * 5 };
    const hipF = { x: hip.x + perp.x * 4, y: hip.y + perp.y * 4 };
    const hipB = { x: hip.x - perp.x * 7, y: hip.y - perp.y * 7 };
    const handF = L(p.hfx, p.hfy);
    const handB = L(p.hbx, p.hby);
    const footF = L(p.ffx, p.ffy);
    const footB = L(p.bfx, p.bfy);
    const armF = ik(shF.x, shF.y, handF.x, handF.y, rig.upperArm, rig.foreArm, -f);
    const armB = ik(shB.x, shB.y, handB.x, handB.y, rig.upperArm, rig.foreArm, -f);
    const legF = ik(hipF.x, hipF.y, footF.x, footF.y, rig.thigh, rig.shin, f);
    const legB = ik(hipB.x, hipB.y, footB.x, footB.y, rig.thigh, rig.shin, f);
    const headAng = leanRad + p.head * Math.PI / 180;
    const head = { x: neck.x + Math.sin(headAng) * 13 * s * f, y: neck.y - Math.cos(headAng) * 13 * s };
    const sk = { hip, neck, shF, shB, hipF, hipB, handF, handB, footF, footB, armF, armB, legF, legB, head, headAng, leanRad, f, root, rig };
    this._sk = sk; this._skFrame = this.game.frameSerial;
    return sk;
  }

  getBladeWorld() {
    if (this._bladeFrame === this.game.frameSerial && this._blade) return this._blade;
    const sk = this.skeleton();
    const p = this.pose;
    const s = this.scale;
    const ang = (p.sw + p.lean * 0.12) * Math.PI / 180;
    const dx = Math.cos(ang) * this.facing, dy = Math.sin(ang);
    const hand = sk.handF;
    const len = 78 * s;
    const b = {
      base: { x: hand.x + dx * 6, y: hand.y + dy * 6 },
      tip: { x: hand.x + dx * (6 + len), y: hand.y + dy * (6 + len) },
    };
    this._blade = b; this._bladeFrame = this.game.frameSerial;
    return b;
  }

  pan() { return clamp((this.x - this.game.camera.x) / 620, -1, 1) * 0.7; }

  // ---------------------------------------------------------------- draw
  draw(ctx) {
    if (this.alpha <= 0.01) return;
    const sk = this.skeleton();
    const C = this.cfg.colors;
    const f = this.facing;
    const s = this.scale;
    const pulse = 0.5 + 0.5 * Math.sin(performance.now() * 0.005 + this.id);

    // shadow
    const hgt = clamp((this.game.groundY - this.y) / 260, 0, 1);
    ctx.save();
    ctx.globalAlpha = this.alpha * 0.35 * (1 - hgt * 0.6);
    ctx.fillStyle = '#050912';
    ctx.beginPath();
    ctx.ellipse(this.x, this.game.groundY + 2, 30 * s * (1 - hgt * 0.2), 7 * s, 0, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = this.alpha;
    if (this.state === 'spawn') {
      const t = clamp(this.spawnT / 0.45, 0, 1);
      ctx.globalAlpha = this.alpha * t;
    }

    // telegraph aura
    if (this.state === 'windup' || this.state === 'attack') {
      const a = this.attack;
      const tw = this.state === 'windup' ? clamp(a.t / a.windup, 0, 1) : 0.7;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(this.x, this.y - 90 * s, 4, this.x, this.y - 90 * s, (70 + tw * 50) * s);
      const col = this.state === 'windup' ? (this.type === 'chorus' ? '94,231,255' : '255,70,80') : '255,170,80';
      g.addColorStop(0, `rgba(${col},${0.08 + tw * 0.16})`);
      g.addColorStop(1, `rgba(${col},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, this.y - 90 * s, (70 + tw * 50) * s, 0, TAU); ctx.fill();
      // rising warning arcs — readable windup tell
      if (this.state === 'windup') {
        ctx.strokeStyle = `rgba(${col},${0.25 + tw * 0.5})`;
        for (let i = 0; i < 2; i++) {
          const r = (30 + ((performance.now() * 0.09 + i * 34) % 60)) * s;
          ctx.globalAlpha = this.alpha * (1 - r / (95 * s)) * (0.4 + tw * 0.6);
          ctx.lineWidth = 1.6 + tw * 1.4;
          ctx.beginPath();
          ctx.ellipse(this.x, this.y, r, r * 0.24, 0, 0, TAU);
          ctx.stroke();
        }
        ctx.globalAlpha = this.alpha;
      }
      ctx.restore();
    }

    // silhouette underlay for mass
    this.drawOutline(ctx, sk);

    // back arm / leg (dimmer layer)
    ctx.globalAlpha = this.alpha * 0.82;
    if (!this.parts.armB.broken) this.drawLimbArm(ctx, sk.shB, sk.armB, sk.handB, true, sk);
    if (!this.parts.legB.broken) this.drawLimbLeg(ctx, sk.hipB, sk.legB, sk.footB, true, sk);
    ctx.globalAlpha = this.alpha;
    // torso
    this.drawBody(ctx, sk);
    if (!this.parts.legF.broken) this.drawLimbLeg(ctx, sk.hipF, sk.legF, sk.footF, false, sk);
    // head
    if (!this.parts.head.broken) this.drawHead(ctx, sk);
    else this.drawNeckStump(ctx, sk);
    // front arm + weapon
    if (!this.parts.armF.broken) {
      this.drawLimbArm(ctx, sk.shF, sk.armF, sk.handF, false, sk);
      this.drawWeapon(ctx, sk);
    }
    this.drawStumps(ctx, sk);
    this.drawRimLight(ctx, sk);

    // hit flash rim
    if (this.hitFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (this.hitFlash / 0.11) * 0.22 * this.alpha;
      const g = ctx.createRadialGradient(this.x, this.y - 85 * s, 2, this.x, this.y - 85 * s, 42 * s);
      g.addColorStop(0, 'rgba(255,225,205,0.55)');
      g.addColorStop(1, 'rgba(255,210,180,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(this.x, this.y - 85 * s, 42 * s, 0, TAU); ctx.fill();
      ctx.restore();
    }

    // chorus orbiting blades
    if (this.type === 'chorus' && !this.dead && this.partsIntact().arms > 0) {
      this.chorusOrbit += 0.016 * 0.9;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 2; i++) {
        const a = this.chorusOrbit + i * Math.PI;
        const ox = this.x + Math.cos(a) * 46 * s;
        const oy = this.y - 100 * s + Math.sin(a) * 18 * s;
        ctx.save();
        ctx.translate(ox, oy);
        ctx.rotate(a * 3);
        ctx.fillStyle = 'rgba(120,240,255,0.55)';
        ctx.fillRect(-8 * s, -1.2 * s, 16 * s, 2.4 * s);
        ctx.restore();
      }
      ctx.restore();
    }

    ctx.restore();

    if (!this.dead && this.state !== 'spawn') this.drawHpBar(ctx);
    if (!this.dead && this.state === 'windup') this.drawTell(ctx);
  }

  drawTell(ctx) {
    const a = this.attack;
    if (!a) return;
    const t = clamp(a.t / a.windup, 0, 1);
    const s = this.scale;
    const x = this.x, y = this.y - this.cfg.bodyH * s - 42;
    const pop = t < 0.2 ? ease.outBack(t / 0.2) : 1;
    ctx.save();
    ctx.globalAlpha = (0.35 + 0.65 * t) * this.alpha;
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    const col = this.type === 'chorus' ? '#8ff3ff' : '#ff8a7a';
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = col;
    // chevron / warning spike
    ctx.beginPath();
    ctx.moveTo(0, -12); ctx.lineTo(6, 2); ctx.lineTo(2, 2); ctx.lineTo(2, 9);
    ctx.lineTo(-2, 9); ctx.lineTo(-2, 2); ctx.lineTo(-6, 2);
    ctx.closePath();
    ctx.fill();
    // pulse ring scaled by windup progress
    ctx.strokeStyle = col;
    ctx.globalAlpha *= 0.6;
    ctx.lineWidth = 1.5 + t * 1.5;
    ctx.beginPath();
    ctx.arc(0, -1, 16 + t * 8, 0, TAU);
    ctx.stroke();
    ctx.restore();
  }

  drawBody(ctx, sk) {
    this.drawBodyFace(ctx, sk, this.hitFlash > 0, this.cfg.colors);
  }

  drawOutline(ctx, sk) {
    const f = this.facing;
    const s = this.scale;
    ctx.save();
    ctx.strokeStyle = '#07080d';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const stroke = (a, b, w) => {
      ctx.lineWidth = w * s;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    };
    if (!this.parts.legB.broken) { stroke(sk.hipB, sk.legB, 22); stroke(sk.legB, sk.footB, 18); }
    if (!this.parts.legF.broken) { stroke(sk.hipF, sk.legF, 23); stroke(sk.legF, sk.footF, 19); }
    const ph = Math.sin(performance.now() * 0.004 + this.id) * 2;
    ctx.beginPath();
    ctx.moveTo(sk.hip.x + 14 * s, sk.hip.y - 4 * s);
    ctx.lineTo(sk.hip.x - 10 * s - f * 12, sk.hip.y + 28 * s + ph);
    ctx.lineTo(sk.hip.x - f * 24, sk.hip.y + 20 * s + ph);
    ctx.lineTo(sk.hip.x - 15 * s, sk.hip.y - 2 * s);
    ctx.closePath();
    ctx.fill();
    const perp = { x: Math.cos(sk.leanRad) * f, y: Math.sin(sk.leanRad) };
    ctx.beginPath();
    ctx.moveTo(sk.hip.x + perp.x * 11 * s, sk.hip.y + perp.y * 11 * s);
    ctx.quadraticCurveTo(sk.hip.x + perp.x * 20 * s, lerp(sk.hip.y, sk.neck.y, 0.55), sk.neck.x + perp.x * 15 * s, sk.neck.y + perp.y * 15 * s);
    ctx.lineTo(sk.neck.x - perp.x * 19 * s, sk.neck.y - perp.y * 19 * s);
    ctx.quadraticCurveTo(sk.hip.x - perp.x * 20 * s, lerp(sk.hip.y, sk.neck.y, 0.55), sk.hip.x - perp.x * 12 * s, sk.hip.y - perp.y * 12 * s);
    ctx.closePath();
    ctx.fill();
    if (!this.parts.armB.broken) { stroke(sk.shB, sk.armB, 18); stroke(sk.armB, sk.handB, 15); }
    if (!this.parts.armF.broken) { stroke(sk.shF, sk.armF, 20); stroke(sk.armF, sk.handF, 17); }
    if (!this.parts.head.broken) {
      ctx.beginPath();
      ctx.ellipse(sk.head.x, sk.head.y, 15 * s, 17 * s, sk.headAng, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawBodyFace(ctx, sk, flash, C) {
    // segmented lacquer torso: narrow waist, broad chest, layered plates
    const { hip, neck, leanRad, f } = sk;
    const s = this.scale;
    const perp = { x: Math.cos(leanRad) * f, y: Math.sin(leanRad) };
    const fwd = { x: Math.sin(leanRad) * f, y: -Math.cos(leanRad) };
    const P = (t, o) => ({
      x: lerp(hip.x, neck.x, t) + perp.x * o * s,
      y: lerp(hip.y, neck.y, t) + perp.y * o * s,
    });
    const waist = P(0.02, 0), chest = P(0.55, 0);
    ctx.save();

    // ragged skirt / hakama plates
    const ph = Math.sin(performance.now() * 0.004 + this.id) * 2;
    ctx.beginPath();
    ctx.moveTo(waist.x + perp.x * 15 * s, waist.y + perp.y * 15 * s);
    ctx.quadraticCurveTo(waist.x - f * 14 + ph, waist.y + 20, waist.x - f * 26 + ph, waist.y + 34);
    ctx.lineTo(waist.x - f * 12 + ph, waist.y + 20);
    ctx.lineTo(waist.x - perp.x * 15 * s, waist.y - perp.y * 15 * s);
    ctx.closePath();
    ctx.fillStyle = flash ? '#4a4450' : '#161b26';
    ctx.fill();

    // main torso
    ctx.beginPath();
    ctx.moveTo(waist.x + perp.x * 9 * s, waist.y + perp.y * 9 * s);
    ctx.quadraticCurveTo(chest.x + perp.x * 18 * s + fwd.x * 2, chest.y + perp.y * 18 * s + fwd.y * 2, neck.x + perp.x * 13 * s, neck.y + perp.y * 13 * s);
    ctx.lineTo(neck.x - perp.x * 17 * s, neck.y - perp.y * 17 * s);
    ctx.quadraticCurveTo(chest.x - perp.x * 18 * s, chest.y - perp.y * 18 * s, waist.x - perp.x * 10 * s, waist.y - perp.y * 10 * s);
    ctx.closePath();
    const g = ctx.createLinearGradient(waist.x - perp.x * 14 * s, waist.y - perp.y * 14 * s, chest.x + perp.x * 16 * s, chest.y + perp.y * 16 * s);
    const fPlate = mixHex(C.plate2, '#ffe8dc', 0.55);
    g.addColorStop(0, flash ? fPlate : C.plate);
    g.addColorStop(0.45, flash ? fPlate : C.plate2);
    g.addColorStop(0.72, flash ? mixHex(C.plate2, '#fff3ea', 0.7) : mixHex(C.plate2, '#ffffff', 0.12));
    g.addColorStop(1, flash ? fPlate : C.plate);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.strokeStyle = 'rgba(6,8,14,0.8)';
    ctx.lineWidth = 1.4 * s;
    ctx.stroke();

    // chest plate bands
    for (let i = 0; i < 3; i++) {
      const t = 0.35 + i * 0.18;
      const a = P(t, -14), b = P(t, 13);
      ctx.strokeStyle = flash ? 'rgba(60,50,58,0.5)' : 'rgba(10,13,20,0.65)';
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.strokeStyle = flash ? 'rgba(220,190,180,0.5)' : 'rgba(190,210,240,0.16)';
      ctx.lineWidth = 0.9 * s;
      ctx.beginPath();
      ctx.moveTo(a.x + fwd.x * 2, a.y + fwd.y * 2 - 1.2 * s);
      ctx.lineTo(b.x + fwd.x * 2, b.y + fwd.y * 2 - 1.2 * s);
      ctx.stroke();
    }

    // exposed rib / sinew on the front seam
    const cx = lerp(hip.x, neck.x, 0.55) + fwd.x * 6, cy = lerp(hip.y, neck.y, 0.55) + fwd.y * 6;
    ctx.strokeStyle = flash ? mixHex(C.thread, '#ffe8dc', 0.55) : C.thread;
    ctx.globalAlpha = 0.75;
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath();
    ctx.moveTo(cx - fwd.x * 3, cy - 18 * s);
    ctx.quadraticCurveTo(cx - fwd.x * 5 + f * 4, cy, cx - fwd.x * 2, cy + 16 * s);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const yy = cy - 12 * s + i * 8 * s;
      ctx.beginPath();
      ctx.moveTo(cx - 10 * s + f * 4, yy);
      ctx.quadraticCurveTo(cx + f * 2, yy + 2 * s, cx + 9 * s, yy - 2 * s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // painted oni face motif on chest
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = this.type === 'chorus' ? '#5ee7ff' : this.type === 'colossus' ? '#ffab4d' : '#ff5f6d';
    ctx.lineWidth = 1.8 * s;
    ctx.beginPath();
    ctx.arc(cx - f * 2, cy - 26 * s, 8 * s, 0.35, Math.PI - 0.35);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - 8 * s, cy - 33 * s); ctx.lineTo(cx - 3 * s, cy - 30 * s);
    ctx.moveTo(cx + 8 * s, cy - 33 * s); ctx.lineTo(cx + 3 * s, cy - 30 * s);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // glowing core (heart-thread)
    ctx.globalCompositeOperation = 'lighter';
    const coreCol = this.type === 'chorus' ? '#5ee7ff' : this.type === 'colossus' ? '#ffb03d' : '#ff5f6d';
    const pulse = 0.55 + 0.45 * Math.sin(performance.now() * 0.005 + this.id);
    ctx.fillStyle = coreCol;
    ctx.globalAlpha = 0.55 + pulse * 0.4;
    ctx.beginPath(); ctx.arc(cx, cy + 4 * s, (3.6 + pulse * 1.8) * s, 0, TAU); ctx.fill();
    const rg = ctx.createRadialGradient(cx, cy + 4 * s, 0, cx, cy + 4 * s, 20 * s);
    rg.addColorStop(0, this.type === 'chorus' ? 'rgba(94,231,255,0.32)' : this.type === 'colossus' ? 'rgba(255,176,61,0.32)' : 'rgba(255,95,109,0.32)');
    rg.addColorStop(1, 'rgba(255,95,109,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(cx, cy + 4 * s, 20 * s, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // threaded seam stitches
    ctx.strokeStyle = flash ? mixHex(C.thread, '#ffe8dc', 0.55) : C.thread;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1.2 * s;
    for (let i = 0; i < 5; i++) {
      const t = 0.12 + i * 0.17;
      const a = P(t, -12), b = P(t, 11);
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      ctx.beginPath();
      ctx.moveTo(mx - 3 * s, my - 2 * s); ctx.lineTo(mx + 3 * s, my + 2 * s);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // shoulder damiyo plate
    const sh = P(0.97, 5);
    ctx.beginPath();
    ctx.ellipse(sh.x + fwd.x * 1, sh.y + fwd.y * 1, 14 * s, 9 * s, leanRad + 0.1, 0, TAU);
    const sg = ctx.createLinearGradient(sh.x - 10 * s, sh.y - 8 * s, sh.x + 10 * s, sh.y + 8 * s);
    sg.addColorStop(0, flash ? mixHex(C.plate2, '#ffe8dc', 0.6) : mixHex(C.plate2, '#ffffff', 0.28));
    sg.addColorStop(1, flash ? mixHex(C.plate, '#ffe8dc', 0.55) : C.plate);
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.strokeStyle = 'rgba(5,7,12,0.8)';
    ctx.lineWidth = 1.2 * s;
    ctx.stroke();
    ctx.strokeStyle = flash ? mixHex(C.thread, '#ffe8dc', 0.55) : C.thread;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.5 * s;
    ctx.beginPath(); ctx.arc(sh.x + fwd.x, sh.y + fwd.y, 8.6 * s, Math.PI, Math.PI * 2); ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  drawHead(ctx, sk) {
    const C = this.cfg.colors;
    const { head, headAng, f } = sk;
    const s = this.scale;
    const flash = this.hitFlash > 0;
    ctx.save();
    ctx.translate(head.x, head.y);
    ctx.rotate(headAng);
    ctx.scale(f, 1);

    // hanging puppet threads from crown
    ctx.strokeStyle = C.thread;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 1.1 * s;
    const sway = Math.sin(performance.now() * 0.002 + this.id) * 4;
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.moveTo(-2 * s + i * 5 * s, -13 * s);
      ctx.quadraticCurveTo(-10 * s, -34 * s, sway * (i ? -1 : 1), -60 * s - i * 8);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // hollow mask base
    const g = ctx.createLinearGradient(0, -14 * s, 0, 14 * s);
    const fBone = mixHex(C.bone, '#fff4ec', 0.6);
    g.addColorStop(0, flash ? fBone : C.bone);
    g.addColorStop(0.6, flash ? fBone : C.bone2);
    g.addColorStop(1, flash ? fBone : '#8a7a66');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(1 * s, -14 * s);
    ctx.quadraticCurveTo(12.5 * s, -12 * s, 12.5 * s, 0);
    ctx.quadraticCurveTo(12 * s, 12 * s, 0, 15 * s);
    ctx.quadraticCurveTo(-12 * s, 12 * s, -11.5 * s, -1 * s);
    ctx.quadraticCurveTo(-11 * s, -12 * s, 1 * s, -14 * s);
    ctx.fill();

    // hollow eye sockets (dark)
    ctx.fillStyle = '#171016';
    ctx.beginPath();
    ctx.ellipse(4.2 * s, -3.6 * s, 5.2 * s, 3.2 * s, 0.2, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(-4.6 * s, -3.6 * s, 3.6 * s, 2.6 * s, -0.2, 0, TAU);
    ctx.fill();
    // glowing pupils
    const eyeCol = this.state === 'windup' ? '#ff2f3f' : C.eye;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = eyeCol;
    ctx.beginPath(); ctx.arc(4.8 * s, -3.4 * s, 1.7 * s, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(-4.2 * s, -3.4 * s, 1.4 * s, 0, TAU); ctx.fill();
    const eg = ctx.createRadialGradient(4.5 * s, -3.5 * s, 0, 4.5 * s, -3.5 * s, 15 * s);
    eg.addColorStop(0, this.type === 'chorus' ? 'rgba(94,231,255,0.45)' : 'rgba(255,110,80,0.45)');
    eg.addColorStop(1, 'rgba(255,80,60,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(4.5 * s, -3.5 * s, 15 * s, 0, TAU); ctx.fill();
    ctx.restore();

    // cracked lacquer seams
    ctx.strokeStyle = 'rgba(40,28,22,0.6)';
    ctx.lineWidth = 1 * s;
    ctx.beginPath();
    ctx.moveTo(-6 * s, -10 * s); ctx.lineTo(-2 * s, -5 * s); ctx.lineTo(-4.5 * s, 1 * s);
    ctx.moveTo(8 * s, 6 * s); ctx.lineTo(4 * s, 9 * s);
    ctx.stroke();
    // jaw plate with teeth (grin)
    ctx.fillStyle = 'rgba(50,34,28,0.85)';
    ctx.beginPath();
    ctx.moveTo(-7 * s, 8 * s);
    ctx.quadraticCurveTo(1 * s, 14 * s, 9 * s, 7 * s);
    ctx.lineTo(8 * s, 10 * s);
    ctx.quadraticCurveTo(1 * s, 16 * s, -6.5 * s, 10.5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = flash ? fBone : '#d8ccb8';
    for (let i = 0; i < 4; i++) {
      const tx = -5.4 * s + i * 3.4 * s;
      ctx.fillRect(tx, 9.2 * s, 1.9 * s, 2.8 * s);
    }
    // brow plate
    ctx.strokeStyle = flash ? mixHex(C.plate, '#ffe8dc', 0.55) : C.plate;
    ctx.lineWidth = 2.6 * s;
    ctx.beginPath();
    ctx.moveTo(-9 * s, -8.6 * s);
    ctx.quadraticCurveTo(0, -12.6 * s, 10 * s, -7.6 * s);
    ctx.stroke();
    // neck
    ctx.fillStyle = '#2a2028';
    ctx.fillRect(-4 * s, 13 * s, 8 * s, 6 * s);
    ctx.restore();
  }

  drawNeckStump(ctx, sk) {
    const n = sk.neck;
    const s = this.scale;
    ctx.save();
    // torn neck plate
    ctx.fillStyle = '#241b22';
    ctx.beginPath();
    ctx.ellipse(n.x, n.y + 2, 7 * s, 4 * s, sk.leanRad, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, 26 * s);
    g.addColorStop(0, this.type === 'chorus' ? 'rgba(94,231,255,0.75)' : 'rgba(255,110,80,0.8)');
    g.addColorStop(1, 'rgba(255,60,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(n.x, n.y, 26 * s, 0, TAU); ctx.fill();
    // spouting sparks
    ctx.fillStyle = this.bloodCol;
    ctx.globalAlpha = 0.9;
    for (let i = 0; i < 3; i++) {
      const p = (performance.now() * 0.002 + i * 0.33) % 1;
      ctx.beginPath();
      ctx.arc(n.x + Math.sin(i * 7) * 4 * s, n.y - p * 28 * s, (2.2 - p * 1.6) * s, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  drawStumps(ctx, sk) {
    const stumps = [];
    if (this.parts.armF.broken) stumps.push({ p: sk.shF, r: 8 });
    if (this.parts.armB.broken) stumps.push({ p: sk.shB, r: 7 });
    if (this.parts.legF.broken) stumps.push({ p: sk.hipF, r: 9 });
    if (this.parts.legB.broken) stumps.push({ p: sk.hipB, r: 8 });
    const s = this.scale;
    for (const { p, r } of stumps) {
      const t = performance.now() * 0.004 + this.id;
      ctx.save();
      // torn stump plate
      ctx.fillStyle = '#1d1620';
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.72 * s, 0, TAU); ctx.fill();
      ctx.globalCompositeOperation = 'lighter';
      const rr = (r + Math.sin(t) * 1.2) * s;
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr * 2.4);
      const c = this.type === 'chorus' ? '94,231,255' : '255,96,74';
      g.addColorStop(0, `rgba(${c},0.85)`);
      g.addColorStop(0.5, `rgba(${c},0.28)`);
      g.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, rr * 2.4, 0, TAU); ctx.fill();
      // dripping ichor
      ctx.fillStyle = this.bloodCol;
      ctx.globalAlpha = 0.85;
      for (let i = 0; i < 2; i++) {
        const ph = (t * 2.6 + i * 0.5) % 1;
        ctx.beginPath();
        ctx.arc(p.x + Math.sin(t * 1.7 + i * 2) * 2.5 * s, p.y + ph * 18 * s, (1.8 - ph) * s, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  drawRimLight(ctx, sk) {
    if (this.dead) return;
    const s = this.scale;
    const { hip, neck, head } = sk;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.strokeStyle = 'rgba(150,190,255,0.20)';
    ctx.lineWidth = 2.2 * s;
    ctx.beginPath(); ctx.moveTo(hip.x + 9 * s, hip.y - 6 * s); ctx.lineTo(neck.x + 8 * s, neck.y + 4 * s); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,170,120,0.16)';
    ctx.lineWidth = 2 * s;
    ctx.beginPath(); ctx.moveTo(neck.x - 9 * s, neck.y + 3 * s); ctx.lineTo(hip.x - 8 * s, hip.y - 4 * s); ctx.stroke();
    const eg = ctx.createRadialGradient(head.x, head.y, 1, head.x, head.y, 22 * s);
    const c = this.state === 'windup' ? '255,80,70' : (this.type === 'chorus' ? '94,231,255' : '255,120,90');
    eg.addColorStop(0, `rgba(${c},0.22)`);
    eg.addColorStop(1, `rgba(${c},0)`);
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(head.x, head.y, 22 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }

  drawHpBar(ctx) {
    const s = this.scale;
    const w = 54 * s, h = 4.4;
    const x = this.x - w / 2, y = this.y - this.cfg.bodyH * s - 24;
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(8,10,18,0.75)';
    ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    const pct = clamp(this.hp / this.maxHp, 0, 1);
    const g = ctx.createLinearGradient(x, y, x + w, y);
    g.addColorStop(0, this.type === 'chorus' ? '#41d8ea' : '#ff7a5c');
    g.addColorStop(1, this.type === 'chorus' ? '#9cf8ff' : '#ffd166');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w * pct, h);
    // limb pips: arm front / head / arm back
    const pips = [this.parts.armF, this.parts.head, this.parts.armB, this.parts.legF, this.parts.legB];
    for (let i = 0; i < pips.length; i++) {
      ctx.fillStyle = pips[i].broken ? '#4a1d24' : 'rgba(225,235,250,0.9)';
      ctx.fillRect(x + i * 7, y - 6, 4, 2.6);
    }
    ctx.restore();
  }

  drawLimbArm(ctx, sh, ikRes, hand, back, sk) {
    const C = this.cfg.colors;
    const s = this.scale;
    const armKey = back ? 'armB' : 'armF';
    const flash = this.limbFlash[armKey] > 0 || this.hitFlash > 0;
    const dark = back ? '#141822' : C.plate;
    const mid = back ? '#1d2330' : C.plate2;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // upper arm plate
    ctx.strokeStyle = flash ? mixHex(C.plate2, '#ffe8dc', 0.6) : dark;
    ctx.lineWidth = 11.5 * s;
    ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(ikRes.x, ikRes.y); ctx.stroke();
    // rim light
    ctx.strokeStyle = flash ? 'rgba(220,190,180,0.5)' : 'rgba(150,175,215,0.22)';
    ctx.lineWidth = 2.4 * s;
    const ux = -(ikRes.y - sh.y), uy = (ikRes.x - sh.x);
    const ul = Math.hypot(ux, uy) || 1;
    ctx.beginPath();
    ctx.moveTo(sh.x + ux / ul * 3 * s, sh.y + uy / ul * 3 * s);
    ctx.lineTo(ikRes.x + ux / ul * 3 * s, ikRes.y + uy / ul * 3 * s);
    ctx.stroke();
    // forearm
    ctx.strokeStyle = flash ? mixHex(C.plate2, '#ffe8dc', 0.7) : mid;
    ctx.lineWidth = 10 * s;
    ctx.beginPath(); ctx.moveTo(ikRes.x, ikRes.y); ctx.lineTo(hand.x, hand.y); ctx.stroke();
    // wrist binding (thread colour)
    ctx.strokeStyle = C.thread;
    ctx.lineWidth = 2.8 * s;
    const wx = lerp(ikRes.x, hand.x, 0.86), wy = lerp(ikRes.y, hand.y, 0.86);
    const wdx = -(hand.y - ikRes.y), wdy = (hand.x - ikRes.x);
    const wl = Math.hypot(wdx, wdy) || 1;
    ctx.beginPath();
    ctx.moveTo(wx - wdx / wl * 5 * s, wy - wdy / wl * 5 * s);
    ctx.lineTo(wx + wdx / wl * 5 * s, wy + wdy / wl * 5 * s);
    ctx.stroke();
    // elbow joint disc
    ctx.fillStyle = flash ? mixHex(C.bone, '#fff6ee', 0.55) : C.bone;
    ctx.beginPath(); ctx.arc(ikRes.x, ikRes.y, 4.4 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(30,22,20,0.55)';
    ctx.beginPath(); ctx.arc(ikRes.x, ikRes.y, 1.9 * s, 0, TAU); ctx.fill();
    // shoulder ball
    ctx.fillStyle = flash ? mixHex(C.bone2, '#fff6ee', 0.55) : C.bone2;
    ctx.beginPath(); ctx.arc(sh.x, sh.y, 5 * s, 0, TAU); ctx.fill();
    // clawed hand
    ctx.fillStyle = flash ? '#c9b4b4' : '#2a2430';
    ctx.beginPath(); ctx.arc(hand.x, hand.y, 5 * s, 0, TAU); ctx.fill();
    ctx.strokeStyle = flash ? mixHex(C.bone2, '#fff6ee', 0.55) : C.bone2;
    ctx.lineWidth = 1.8 * s;
    for (let i = 0; i < 3; i++) {
      const a = -0.5 + i * 0.55 + (this.facing > 0 ? 0 : Math.PI);
      ctx.beginPath();
      ctx.moveTo(hand.x, hand.y);
      ctx.lineTo(hand.x + Math.cos(a) * 5.5 * s, hand.y + Math.sin(a) * 5.5 * s);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLimbLeg(ctx, hip, ikRes, foot, back, sk) {
    const C = this.cfg.colors;
    const s = this.scale;
    const key = back ? 'legB' : 'legF';
    const flash = this.limbFlash[key] > 0 || this.hitFlash > 0;
    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    // thigh
    ctx.strokeStyle = flash ? mixHex(C.plate, '#ffe8dc', 0.55) : (back ? '#12161f' : C.plate);
    ctx.lineWidth = 14 * s;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(ikRes.x, ikRes.y); ctx.stroke();
    // rim light
    ctx.strokeStyle = flash ? 'rgba(220,190,180,0.5)' : 'rgba(150,175,215,0.16)';
    ctx.lineWidth = 2.6 * s;
    const nx = -(ikRes.y - hip.y), ny = (ikRes.x - hip.x);
    const nl = Math.hypot(nx, ny) || 1;
    ctx.beginPath();
    ctx.moveTo(hip.x + nx / nl * 4 * s, hip.y + ny / nl * 4 * s);
    ctx.lineTo(ikRes.x + nx / nl * 4 * s, ikRes.y + ny / nl * 4 * s);
    ctx.stroke();
    // shin
    ctx.strokeStyle = flash ? mixHex(C.plate2, '#ffe8dc', 0.6) : (back ? '#181d29' : C.plate2);
    ctx.lineWidth = 11 * s;
    ctx.beginPath(); ctx.moveTo(ikRes.x, ikRes.y); ctx.lineTo(foot.x, foot.y - 5 * s); ctx.stroke();
    // knee bone disc
    ctx.fillStyle = flash ? mixHex(C.bone, '#fff6ee', 0.55) : C.bone;
    ctx.beginPath(); ctx.arc(ikRes.x, ikRes.y, 4.6 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(30,22,20,0.5)';
    ctx.beginPath(); ctx.arc(ikRes.x, ikRes.y, 2 * s, 0, TAU); ctx.fill();
    // hoof / foot
    ctx.fillStyle = flash ? '#e0c8c4' : '#1b1520';
    ctx.beginPath();
    ctx.ellipse(foot.x + this.facing * 5 * s, foot.y, 11 * s, 4.6 * s, 0, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = flash ? mixHex(C.thread, '#ffe8dc', 0.55) : C.thread;
    ctx.globalAlpha = 0.7;
    ctx.lineWidth = 1.4 * s;
    ctx.beginPath();
    ctx.moveTo(foot.x - this.facing * 2 * s, foot.y - 3 * s);
    ctx.lineTo(foot.x + this.facing * 10 * s, foot.y - 3 * s);
    ctx.stroke();
    ctx.restore();
  }

  drawWeapon(ctx, sk) {
    const C = this.cfg.colors;
    if (this.type === 'colossus') {
      // giant cleaver
      const b = this.getBladeWorld();
      const dx = b.tip.x - b.base.x, dy = b.tip.y - b.base.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len, uy = dy / len;
      const px = -uy, py = ux;
      const s = this.scale;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = this.state === 'windup' ? 'rgba(255,140,60,0.5)' : 'rgba(255,180,90,0.25)';
      ctx.lineWidth = 10 * s;
      ctx.beginPath(); ctx.moveTo(b.base.x, b.base.y); ctx.lineTo(b.tip.x, b.tip.y); ctx.stroke();
      ctx.globalCompositeOperation = 'source-over';
      ctx.beginPath();
      ctx.moveTo(b.base.x + px * 10 * s, b.base.y + py * 10 * s);
      ctx.lineTo(b.tip.x + px * 4 * s, b.tip.y + py * 4 * s);
      ctx.lineTo(b.tip.x - px * 4 * s, b.tip.y - py * 4 * s);
      ctx.lineTo(b.base.x - px * 8 * s, b.base.y - py * 8 * s);
      ctx.closePath();
      ctx.fillStyle = this.hitFlash > 0 ? '#ffd9c6' : '#5b6070';
      ctx.fill();
      ctx.strokeStyle = 'rgba(230,220,200,0.75)';
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (this.type === 'chorus') {
      // chakram in hand
      const b = this.getBladeWorld();
      ctx.save();
      ctx.translate(b.base.x, b.base.y);
      ctx.rotate(performance.now() * 0.006);
      ctx.strokeStyle = this.state === 'windup' ? '#bfffff' : '#5ee7ff';
      ctx.lineWidth = 3 * this.scale;
      ctx.globalCompositeOperation = 'lighter';
      ctx.beginPath(); ctx.arc(0, 0, 11 * this.scale, 0, TAU); ctx.stroke();
      ctx.restore();
      return;
    }
    // cutter: single edged scythe-blade
    const b = this.getBladeWorld();
    const dx = b.tip.x - b.base.x, dy = b.tip.y - b.base.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const px = -uy, py = ux;
    const s = this.scale;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flapCol = this.state === 'windup' ? 'rgba(255,70,80,0.5)' : 'rgba(255,90,110,0.22)';
    ctx.strokeStyle = flapCol;
    ctx.lineWidth = 7 * s;
    ctx.beginPath(); ctx.moveTo(b.base.x, b.base.y); ctx.lineTo(b.tip.x, b.tip.y); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.beginPath();
    ctx.moveTo(b.base.x + px * 4 * s, b.base.y + py * 4 * s);
    ctx.quadraticCurveTo(b.tip.x + px * 10 * s, b.tip.y + py * 2 * s, b.tip.x, b.tip.y);
    ctx.lineTo(b.base.x - px * 2 * s, b.base.y - py * 2 * s);
    ctx.closePath();
    ctx.fillStyle = this.hitFlash > 0 ? '#ffd9c6' : '#aab4c4';
    ctx.fill();
    ctx.strokeStyle = C.thread;
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(b.base.x, b.base.y); ctx.lineTo(b.tip.x, b.tip.y); ctx.stroke();
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Flying severed limbs + projectile blades
// ---------------------------------------------------------------------------
class Debris {
  constructor(game, kind, x, y, vx, vy, opts = {}) {
    this.game = game;
    this.kind = kind;           // 'arm' | 'leg' | 'head' | 'shard'
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.rot = opts.rot ?? rand(0, TAU);
    this.vr = opts.vr ?? rand(-14, 14);
    this.col = opts.col || '#242838';
    this.col2 = opts.col2 || '#e8dfcf';
    this.thread = opts.thread || '#d2455c';
    this.scale = opts.scale || 1;
    this.life = opts.life ?? 4;
    this.maxLife = this.life;
    this.grounded = false;
    this.bounces = 0;
    this.type = opts.type || 'enemy';
    this.bloodCol = opts.bloodCol || '#e8dfcf';
    this.trail = [];
  }
  update(dt) {
    this.life -= dt;
    this.vy += 1800 * dt;
    this.vx *= Math.exp(-0.5 * dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.vr * dt;
    const gy = this.game.groundY;
    if (this.y > gy) {
      this.y = gy;
      if (this.bounces < 2 && Math.abs(this.vy) > 200) {
        this.vy *= -0.42;
        this.vx *= 0.7;
        this.vr *= 0.6;
        this.bounces++;
        Sound.SFX.land(0.4, clamp((this.x - this.game.camera.x) / 600, -1, 1) * 0.7);
        for (let i = 0; i < 4; i++) {
          this.game.particles.add({
            type: 'dust', x: this.x, y: gy, vx: rand(-110, 110), vy: rand(-80, -10),
            size: rand(2, 5), life: rand(0.2, 0.4), col: 'rgba(180,175,165,0.3)', drag: 3,
          });
        }
      } else {
        this.vy = 0; this.vx *= 0.82; this.vr *= 0.85;
        if (this.vr !== 0) this.vr = damp(this.vr, 0, 6, dt);
      }
    }
    // drip
    if (this.kind !== 'shard' && Math.random() < dt * 8 && this.life > 0.8) {
      this.game.particles.add({
        type: 'dot', x: this.x + rand(-4, 4), y: this.y + rand(-4, 4), vx: rand(-10, 10), vy: rand(20, 60),
        size: rand(1, 2.4), life: rand(0.2, 0.4), col: this.bloodCol, grav: 900, floor: gy, add: true,
      });
    }
    this.alpha = clamp(this.life, 0, 1);
  }
  draw(ctx) {
    const t = clamp(this.life, 0, 1);
    ctx.save();
    ctx.globalAlpha = clamp(this.life * 2, 0, 1);
    ctx.translate(this.x, this.y - this.rotateOffset());
    ctx.rotate(this.rot);
    ctx.scale(this.scale, this.scale);
    ctx.lineCap = 'round';
    if (this.kind === 'arm' || this.kind === 'leg') {
      const long = this.kind === 'leg' ? 34 : 30;
      ctx.strokeStyle = this.col;
      ctx.lineWidth = this.kind === 'leg' ? 10.5 : 8.5;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(long, 0); ctx.stroke();
      ctx.strokeStyle = this.col2;
      ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(long, 0, 3.4, 0, TAU); ctx.stroke();
      // torn end
      ctx.fillStyle = this.bloodCol;
      ctx.beginPath(); ctx.arc(0, 0, this.kind === 'leg' ? 5.5 : 4.5, 0, TAU); ctx.fill();
      ctx.strokeStyle = this.thread;
      ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(long * 0.6, 0); ctx.stroke();
    } else if (this.kind === 'head') {
      // mask
      ctx.fillStyle = this.col2;
      ctx.beginPath(); ctx.ellipse(0, 0, 11, 12.5, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = this.thread;
      ctx.beginPath(); ctx.ellipse(4, -2, 4, 1.7, 0.2, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(50,40,32,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-3, -8); ctx.lineTo(0, -3); ctx.stroke();
      // trailing threads
      ctx.strokeStyle = this.thread;
      ctx.globalAlpha *= 0.7;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-6 - i * 2, 8 + i * 2);
        ctx.quadraticCurveTo(-16 - i * 4, 14 + i * 3, -22 - i * 4, 8 + i * 4);
        ctx.stroke();
      }
    } else {
      // shard
      ctx.fillStyle = this.col;
      ctx.beginPath();
      ctx.moveTo(-4, -5); ctx.lineTo(7, 0); ctx.lineTo(-4, 5);
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
  rotateOffset() { return this.grounded ? 0 : 0; }
}

class Projectile {
  constructor(game, owner, x, y, vx, vy, opts = {}) {
    this.game = game;
    this.owner = owner;
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.life = opts.life ?? 2.4;
    this.rot = 0;
    this.dmg = opts.dmg ?? 7;
    this.dead = false;
    this.radius = opts.radius ?? 12;
    this.type = opts.type || 'chakram';
    this.hitPlayer = false;
    this.spin = opts.spin ?? 18;
    this.trailT = 0;
    this.parryable = true;
  }
  update(dt) {
    this.life -= dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += this.spin * dt;
    if (this.life <= 0) this.dead = true;
    if (this.x < this.game.arenaMinX || this.x > this.game.arenaMaxX || this.y > this.game.groundY) this.dead = true;
    // trail
    this.trailT += dt;
    if (this.trailT > 0.02) {
      this.trailT = 0;
      this.game.particles.add({
        type: 'dot', x: this.x + rand(-4, 4), y: this.y + rand(-4, 4), vx: rand(-20, 20), vy: rand(-20, 20),
        size: rand(1.4, 3), life: rand(0.15, 0.3), col: 'rgba(94,231,255,0.55)', add: true,
      });
    }
    // collide with player
    const p = this.game.player;
    if (p.alive && !this.hitPlayer) {
      const px = p.x, py = p.y - 82;
      const d = Math.hypot(this.x - px, (this.y - py) * 1.15);
      if (d < this.radius + 30) {
        if (p.state === 'onslaught' && p.riftGuard > 0 && !p.riftCountered) {
          p.riposteRift();
          this.dead = true;
          return;
        }
        const r = p.takeDamage(this.dmg, sign(this.vx), { parryable: true });
        if (r === 'parried') {
          this.dead = true;
          this.game.onProjectileParried(this);
          return;
        }
        if (r) {
          this.hitPlayer = true;
          this.dead = true;
          this.game.hitFeedback(this.x, this.y, { heavy: false, kill: false });
        }
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(94,231,255,0.85)';
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, this.radius, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = '#bffaff';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(0, 0, this.radius * 0.55, 0, TAU); ctx.stroke();
    ctx.restore();
  }
}
