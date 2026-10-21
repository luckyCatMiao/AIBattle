/* =========================================================
   enemy.js — limb-based foes with telegraphed attacks
   Types:
     gnawer  — 碎骨鬼: fast quadruped-ish brawler, swipes in 3-hit chains
     samurai — 铁面武士: armoured, guards frontally, slow heavy chop
     puppet  — 红玉傀儡: hovering caster, throws reflectable orbs
   ========================================================= */

const ENEMY_TYPES = {
  gnawer: {
    name: '碎骨鬼', hp: 84, w: 34, h: 58, speed: 235, air: false,
    bodyColor: '#4c3a44', bodyDark: '#241a22', accent: '#c9553f',
    poise: 7, mass: 1,
    limbs: [
      { id: 'head', label: '头', hp: 58, r: 11, vital: true, ox: 5, oy: -50 },
      { id: 'armL', label: '左爪', hp: 20, r: 9, ox: -8, oy: -34, func: 'claw' },
      { id: 'armR', label: '右爪', hp: 20, r: 9, ox: 9, oy: -34, func: 'claw' },
      { id: 'legs', label: '下肢', hp: 26, r: 13, ox: 0, oy: -14, func: 'legs' }
    ]
  },
  samurai: {
    name: '铁面武士', hp: 205, w: 40, h: 82, speed: 132, air: false,
    bodyColor: '#3a3f52', bodyDark: '#171a26', accent: '#d8a638',
    poise: 30, mass: 2.1, guard: true,
    limbs: [
      { id: 'head', label: '头盔', hp: 108, r: 14, vital: true, ox: 4, oy: -74 },
      { id: 'armL', label: '左臂', hp: 38, r: 11, ox: -14, oy: -54 },
      { id: 'armR', label: '持刀臂', hp: 54, r: 12, ox: 16, oy: -54, func: 'weapon' },
      { id: 'legs', label: '下肢', hp: 62, r: 15, ox: 0, oy: -20, func: 'legs' }
    ]
  },
  puppet: {
    name: '红玉傀儡', hp: 116, w: 34, h: 74, speed: 152, air: true, hover: 132,
    bodyColor: '#6b2b3c', bodyDark: '#2a0f18', accent: '#ff6b8a',
    poise: 12, mass: 1.3,
    limbs: [
      { id: 'head', label: '玉冠', hp: 72, r: 12, vital: true, ox: 4, oy: -66 },
      { id: 'armL', label: '左臂', hp: 28, r: 10, ox: -15, oy: -46, func: 'cast' },
      { id: 'armR', label: '右臂', hp: 28, r: 10, ox: 16, oy: -46, func: 'cast' },
      { id: 'legs', label: '垂足', hp: 32, r: 12, ox: 0, oy: -12, func: 'legs' }
    ]
  }
};

class Enemy {
  constructor(world, typeKey, x, y) {
    this.world = world;
    this.typeKey = typeKey;
    this.def = ENEMY_TYPES[typeKey];
    this.x = x; this.y = y === undefined ? GROUND_Y : y;
    this.spawnX = x; this.spawnY = this.y;
    this.reset();
  }
  reset() {
    const d = this.def;
    this.maxHp = d.hp;
    this.hp = d.hp;
    this.vx = 0; this.vy = 0;
    this.w = d.w; this.h = d.h;
    this.facing = -1;
    this.dead = false;
    this.deathT = 0;
    this.state = 'spawn';
    this.stateT = 0;
    this.spawnT = 0.45;
    this.anim = { armA: 0.2, armB: 0.2, legA: 0, legB: 0, lean: 0, bob: 0, weaponA: 0.6 };
    this.tellT = 0;
    this.tellTotal = 0;
    this.attackT = 0;
    this.attackKey = null;
    this.attackHitDone = false;
    this.cooldown = rand(0.3, 0.9);
    this.stunT = 0;
    this.knockT = 0;
    this.guardBrokenT = 0;
    this.flash = 0;
    this.hurtFlashT = 0;
    this.limbs = d.limbs.map((L) => ({
      id: L.id, label: L.label, hp: L.hp, maxHp: L.hp, r: L.r,
      vital: !!L.vital, func: L.func || null, ox: L.ox, oy: L.oy,
      severed: false, x: 0, y: 0, hitFlash: 0, wobble: 0
    }));
    this.orbitT = rand(0, 6);
    this.fireCd = rand(1.0, 2.0);
    this.circleDir = Math.random() < 0.5 ? 1 : -1;
    this.mode = 'approach';
    this.modeT = 0;
    this.jumps = 0;
    this.legsImpaired = false;
    this.onGround = true;
    this.hitCount = 0;
    this.lastAttackerX = this.x;
    this.contactCd = 0;
    this.aggro = true;
    this.telegraphSoundPlayed = false;
    this.gnawChain = 0;
    this.lungeDir = 1;
  }

  /* ---------- limb helpers ---------- */
  getLimb(id) { for (const l of this.limbs) if (l.id === id) return l; return null; }
  hasFunc(f) { for (const l of this.limbs) if (l.func === f && !l.severed) return true; return false; }
  armsLive() { return this.limbs.filter((l) => l.func && l.func !== 'legs' && !l.severed).length; }
  get coreLimb() { return this.getLimb('legs') || null; }

  armCount() { return this.hasFunc('claw') || this.hasFunc('weapon') || this.hasFunc('cast'); }

  capability() {
    // returns 0..1 combat capability used by AI decisions
    let alive = 0, total = 0;
    for (const l of this.limbs) { total++; if (!l.severed) alive++; }
    return alive / total;
  }

  updateLimbPositions() {
    const f = this.facing;
    const a = this.anim;
    const bobY = a.bob;
    for (const l of this.limbs) {
      if (l.severed) continue;
      let ox = l.ox * f, oy = l.oy + bobY;
      if (l.func === 'claw' || l.func === 'cast') {
        const ang = (l.id === 'armL' ? a.armB : a.armA);
        ox = l.ox * f + Math.cos(ang - Math.PI / 2) * 16 * f;
        oy = l.oy + bobY + Math.sin(ang - Math.PI / 2) * 16;
      } else if (l.func === 'weapon') {
        const ang = a.weaponA;
        ox = l.ox * f + Math.cos(ang - Math.PI / 2) * 20 * f;
        oy = l.oy + bobY + Math.sin(ang - Math.PI / 2) * 20;
      } else if (l.func === 'legs' && this.onGround) {
        ox = l.ox * f + Math.sin(a.legA) * 6 * f;
        oy = l.oy + bobY + Math.abs(Math.cos(a.legA)) * 2;
      }
      l.x = this.x + ox;
      l.y = this.y + oy;
    }
  }

  /* ---------- hit testing ---------- */
  // returns best limb to hit for a given box, or null => core body
  hitTest(box) {
    const bx1 = box.x, by1 = box.y, bx2 = box.x + box.w, by2 = box.y + box.h;
    let best = null, bestScore = 1e9;
    for (const l of this.limbs) {
      if (l.severed) continue;
      const cx = clamp(l.x, bx1, bx2);
      const cy = clamp(l.y, by1, by2);
      const d = dist(l.x, l.y, cx, cy);
      if (d <= l.r + 7) {
        const score = d
          - (l.func && l.func !== 'legs' ? 12 : 0)
          - (l.vital ? 7 : 0);
        if (score < bestScore) { bestScore = score; best = l; }
      }
    }
    if (best) return best;
    if (rectsOverlap(box, this.hurtbox())) return null;
    return undefined;
  }

  hurtbox() { return { x: this.x - this.w / 2, y: this.y - this.h, w: this.w, h: this.h }; }

  /* ---------- damage ---------- */
  // opts: {dmg, dir, kb, lift, hitstop, heavy, x, y, source}
  takeHit(limb, o) {
    if (this.dead) return { hit: false };
    const w = this.world;
    let dmg = o.dmg;
    let guarded = false;
    // frontal guard for armoured types
    if (this.def.guard && this.guardBrokenT <= 0 && this.state !== 'attack' && this.hasFunc('weapon') && o.dir === -this.facing) {
      if (!o.heavy && !o.unguardable) { dmg *= 0.34; guarded = true; }
    }
    this.hp -= dmg;
    this.hitCount++;
    this.hurtFlashT = 0.14;
    this.lastAttackerX = o.x !== undefined ? o.x : this.x - o.dir * 40;
    // knockback
    const massK = 1 / this.def.mass;
    const kbScale = guarded ? 0.25 : 1;
    const kbAmt = o.kb === undefined ? 120 : o.kb;
    this.vx += o.dir * kbAmt * massK * kbScale;
    let lifted = false;
    if (o.lift && !guarded) {
      this.vy = Math.min(this.vy, -Math.abs(o.lift) * massK * 0.85);
      if (o.lift > 120 || o.lift < -60) lifted = true;
      if (o.lift < -80) { this.vy = Math.min(this.vy, o.lift * massK * 1.2); } // spike
    }
    if (this.def.air && !this.def.hover) { /* n/a */ }
    let broke = null;
    // limb damage
    if (limb) {
      limb.hp -= dmg * (o.limbMul || 1) * (guarded ? 0.3 : 1);
      limb.hitFlash = 0.18;
      limb.wobble = 1;
      if (limb.hp <= 0 && !limb.severed) {
        limb.severed = true;
        broke = limb;
        this.onLimbSevered(limb, o);
      }
    }
    // poise / stagger
    const poiseDmg = o.heavy ? 26 : 8;
    if (!guarded) {
      this.poiseStagger = (this.poiseStagger || 0) + poiseDmg;
      if (broke || o.heavy || this.poiseStagger > this.def.poise) {
        this.poiseStagger = 0;
        if (broke || o.heavy || this.isLightEnemy()) {
          this.stunT = Math.max(this.stunT, o.heavy ? 0.34 : 0.18);
          this.state = 'hurt';
          this.stateT = 0;
        }
      }
    } else {
      this.poiseStagger = 0;
    }
    if (o.heavy) this.guardBrokenT = Math.max(this.guardBrokenT, 1.0);

    // airborne / launched tracking
    if (this.vy < -30 || this.y < GROUND_Y - 1) { this.airborne = true; }

    this.flash = 1;
    this.reactT = o.heavy ? 0.22 : 0.12;
    this.reactMax = this.reactT;
    this.reactDir = o.dir;
    if (this.hp <= 0) this.die(o);

    // if a vital limb was destroyed, die
    if (limb && limb.vital && limb.severed) this.die(o);

    return { hit: true, broke, killed: this.dead, guarded };
  }

  isLightEnemy() { return this.def.mass <= 1.4; }

  onLimbSevered(limb, o) {
    const w = this.world;
    w.stats.limbBreakCount++;
    w.hitstop(o.heavy ? 0.14 : 0.09, false);
    w.cam.shake(o.heavy ? 5.5 : 3.6, 0.22);
    Sfx.sever();
    const dir = o.dir || 1;
    // severed piece flies off
    w.spawnSevered(this, limb, dir, o);
    w.fx.burst(limb.x, limb.y, '#ff4b5c', 16, 420, 3.4, 0.5, 620);
    w.fx.ring(limb.x, limb.y, 6, 54, 'rgba(255,120,120,0.85)', 0.3, 3);
    for (let i = 0; i < 12; i++) {
      w.fx.addPart({ kind: 'shard', x: limb.x, y: limb.y, vx: rand(-260, 260) + dir * 120, vy: rand(-320, -40), life: rand(0.4, 0.8), max: 0.8, size: rand(2, 5), rot: rand(0, TAU), vr: rand(-9, 9), grav: 1300, drag: 0.6, color: '#c9553f' });
    }
    const nm = limb.label || '肢体';
    const enName = { head: 'HEAD', armL: 'LEFT ARM', armR: 'RIGHT ARM', legs: 'LEGS' }[limb.id] || 'LIMB';
    w.fx.word2(limb.x, limb.y - 16, nm + '断裂!', 'SEVERED · ' + enName, '#ff8f7a', 19, 1.05);
    // functional consequences
    if (limb.id === 'legs') {
      this.legsImpaired = true;
      this.def = Object.assign({}, this.def);
      w.fx.word2(this.x, this.y - this.h - 26, '下肢崩毁', 'LEGS CRIPPLED', '#ffb27a', 15, 1.1);
    }
    if (limb.func === 'weapon') {
      w.fx.word2(this.x, this.y - this.h - 24, '失去兵刃', 'DISARMED', '#ffd88a', 17, 1.0);
    }
    if (limb.func === 'claw' || limb.func === 'cast') {
      if (this.armsLive() <= 0) {
        w.fx.word2(this.x, this.y - this.h - 24, '攻击尽失', 'HELPLESS', '#ff9a7a', 15, 1.1);
      }
    }
  }

  die(o) {
    if (this.dead) return;
    this.dead = true;
    this.deathT = 0;
    this.state = 'dead';
    const w = this.world;
    w.stats.killCount++;
    Sfx.kill();
    w.cam.shake(5, 0.24);
    w.hitstop(0.1, false);
    w.fx.word2(this.x, this.y - this.h - 10, '斩!', 'KILL', '#ffe9a8', 22, 0.85);
    w.fx.burst(this.x, this.y - this.h * 0.5, '#ff6a4a', 26, 480, 3.6, 0.7, 800);
    w.fx.ring(this.x, GROUND_Y - 1, 10, 96, 'rgba(255,150,110,0.75)', 0.36, 3);
    // leftover limbs peel off
    for (const l of this.limbs) {
      if (!l.severed) {
        const dir = Math.random() < 0.5 ? -1 : 1;
        l.severed = true;
        w.spawnSevered(this, l, dir, { dir, x: o ? o.x : this.x });
      }
    }
    w.onEnemyKilled(this);
  }

  /* ---------- AI ---------- */
  update(dt) {
    const w = this.world;
    const p = w.player;
    this.flash = Math.max(0, this.flash - dt * 5);
    if (this.reactT > 0) this.reactT = Math.max(0, this.reactT - dt);
    this.hurtFlashT = Math.max(0, this.hurtFlashT - dt);
    this.guardBrokenT = Math.max(0, this.guardBrokenT - dt);
    this.contactCd = Math.max(0, this.contactCd - dt);
    for (const l of this.limbs) { l.hitFlash = Math.max(0, l.hitFlash - dt * 4); l.wobble = Math.max(0, l.wobble - dt * 2.4); }

    if (this.state === 'spawn') {
      this.spawnT -= dt;
      this.anim.bob = Math.sin(w.time * 12) * 2 * this.spawnT;
      if (this.spawnT <= 0) { this.state = 'idle'; }
      this.updateLimbPositions();
      return;
    }
    if (this.dead) {
      this.deathT += dt;
      this.vy += GRAVITY * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.vx *= Math.pow(0.02, dt);
      if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; if (!this.groundHit) { this.groundHit = true; w.fx.dust(this.x, GROUND_Y, 8, 0); } }
      this.anim.lean = lerp(this.anim.lean, -1.3, Math.min(1, dt * 6));
      this.anim.weaponA = lerp(this.anim.weaponA, 0.2, Math.min(1, dt * 4));
      this.updateLimbPositions();
      return;
    }

    const dx = p.x - this.x;
    const dy = (p.y - p.h * 0.5) - (this.y - this.h * 0.5);
    const adx = Math.abs(dx);
    if (p.state !== 'dead') this.facing = (dx === 0 ? this.facing : sign(dx)) * (this.def.air ? this.facing : 1);
    // ground types always face the player unless attacking mid-swing
    if (!this.def.air || this.state !== 'attack') {
      if (p.state !== 'dead') this.facing = dx === 0 ? this.facing : sign(dx);
    }
    this.distToPlayer = adx;

    this.cooldown -= dt;
    this.fireCd -= dt;
    this.modeT -= dt;
    if (this.modeT <= 0) {
      this.modeT = rand(0.5, 1.3);
      if (Math.random() < 0.28) this.circleDir *= -1;
    }

    // stun handling
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.state = 'hurt';
      this.airborne = !this.onGround;
    } else if (this.state === 'hurt') {
      this.state = this.onGround ? 'idle' : 'air';
    }

    const canAct = this.stunT <= 0 && this.state !== 'attack' && p.state !== 'dead';

    if (p.state === 'dead') {
      // idle prowl
      this.vx = approach(this.vx, 0, 900 * dt);
      this.physics(dt);
      this.animUpdate(dt);
      return;
    }

    switch (this.typeKey) {
      case 'gnawer': this.aiGnawer(dt, canAct, dx, adx); break;
      case 'samurai': this.aiSamurai(dt, canAct, dx, adx); break;
      case 'puppet': this.aiPuppet(dt, canAct, dx, adx); break;
    }

    // active attack window resolution
    if (this.state === 'attack') this.resolveAttack(dt);

    this.physics(dt);
    this.animUpdate(dt);
    this.updateLimbPositions();

    // contact damage / soft separation from other enemies
    for (const e of w.enemies) {
      if (e === this || e.dead) continue;
      const d = this.x - e.x;
      const minD = (this.w + e.w) * 0.42;
      if (Math.abs(d) < minD && Math.abs(this.y - e.y) < 40) {
        const push = (minD - Math.abs(d)) * 4 * (d === 0 ? 1 : sign(d));
        this.x += push * dt * 4;
      }
    }
  }

  physics(dt) {
    const d = this.def;
    const hovering = this.def.air && this.def.hover && !this.legsImpaired && !this.dead && this.armsLive() > 0;
    this.vy += (hovering ? 0 : GRAVITY) * dt;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.x = clamp(this.x, ARENA.x1 + 14, ARENA.x2 - 14);
    const floor = GROUND_Y;
    if (this.y >= floor) {
      if (!this.onGround) {
        const impact = this.vy;
        this.onGround = true;
        if (impact > 260) {
          Sfx.land();
          this.world.fx.dust(this.x, floor, Math.min(14, 4 + impact / 140), 0);
          this.world.fx.ring(this.x, floor - 1, 8, 40 + Math.min(70, impact / 16), 'rgba(220,200,180,0.5)', 0.28, 2);
          if (impact > 900) {
            this.world.cam.shake(2.4, 0.14);
            if (this.airborne) {
              // landing damage from being launched
              this.hp -= 8;
              this.world.fx.damage(this.x, this.y - this.h * 0.5, 8, '#ffbf8a');
              if (this.hp <= 0) this.die({ dir: 0, x: this.x });
            }
          }
          this.vx *= 0.5;
        }
      }
      this.y = floor;
      this.vy = 0;
      this.airborne = false;
    } else {
      this.onGround = false;
    }
    // ground friction
    const fr = this.onGround ? (this.state === 'attack' ? 6 : 4.2) : 0.7;
    this.vx *= Math.pow(1 - Math.min(0.9, fr * 0.24), dt * 60 / 60 * 1);
    if (this.def.hover) {
      // hard altitude band so retreat impulses can never float it out of reach;
      // it dives to a hittable height for the duration of its cast (risk/reward window)
      if (!this.legsImpaired && !this.dead && (this.armsLive() > 0 || this.state === 'attack')) {
        const diving = this.state === 'attack' && this.attackKey === 'puppetCast';
        const target = GROUND_Y - (diving ? 34 : this.def.hover);
        const band = 26;
        if (this.y < target - band) this.y = target - band;
        if (this.y > target + band) this.y = target + band;
        if (this.y < target - 2) this.vy = Math.max(this.vy, 90);
        else if (this.y > target + 2) this.vy = Math.min(this.vy, -90);
        else this.vy *= 0.6;
        this.vx *= Math.pow(0.02, dt);
      }
    }
  }

  moveToward(tx, speed, dt, keepDist) {
    const dx = tx - this.x;
    const desired = keepDist ? clamp(dx - sign(dx) * keepDist, -1, 1) : clamp(dx, -1, 1);
    const spd = speed * (this.legsImpaired ? 0.42 : 1);
    if (Math.abs(dx) > 6 || !keepDist) {
      this.vx = approach(this.vx, sign(desired === 0 ? dx : desired) * spd, 2400 * dt);
    } else {
      this.vx = approach(this.vx, 0, 2400 * dt);
    }
  }

  startAttack(key) {
    if (this.armsLive() <= 0) return false;
    this.state = 'attack';
    this.attackKey = key;
    this.attackT = 0;
    this.attackHitDone = false;
    this.leapDone = false;
    this.telegraphSoundPlayed = false;
    const a = ATTACKS_ENEMY[key];
    this.tellT = a.tell;
    this.tellTotal = a.tell;
    this.vx *= 0.3;
    return true;
  }

  resolveAttack(dt) {
    const a = ATTACKS_ENEMY[this.attackKey];
    if (!a) { this.state = 'idle'; return; }
    this.attackT += dt;
    // telegraph phase
    if (this.attackT < a.tell) {
      if (!this.telegraphSoundPlayed && this.attackT > a.tell - 0.22) {
        this.telegraphSoundPlayed = true;
        Sfx.charge(this.typeKey === 'samurai' ? 1 : 0);
      }
      // aim during windup (ground types only turn slowly)
      const p = this.world.player;
      if (a.track && this.attackT < a.tell * 0.7) {
        this.facing = p.x === this.x ? this.facing : sign(p.x - this.x);
      }
      if (a.advance) this.vx = approach(this.vx, this.facing * a.advance * 0.4 * (this.legsImpaired ? 0.35 : 1), 2000 * dt);
      return;
    }
    if (this.attackT < a.tell + a.active) {
      if (a.advance && !this.attackHitDone) {
        this.vx = approach(this.vx, this.facing * a.advance * (this.legsImpaired ? 0.35 : 1), 5200 * dt);
      }
      if (a.leap && this.onGround && !this.leapDone) {
        this.leapDone = true;
        this.vy = this.legsImpaired ? -260 : -560;
        this.onGround = false;
        this.world.fx.dust(this.x, GROUND_Y, 5, -this.facing);
      }
      if (a.spawnOrb && !this.attackHitDone) {
        this.attackHitDone = true;
        this.world.spawnOrb(this, this.facing);
      }
      if (!a.spawnOrb && !this.attackHitDone) {
        const box = this.attackBox(a);
        const dmgMul = (this.typeKey === 'samurai' && a.weaponWind !== undefined) ? 0.6 : 1;
        const p = this.world.player;
        if (p.state !== 'dead' && rectsOverlap(box, p.hitbox())) {
          this.attackHitDone = true;
          this.world.enemyHitsPlayer(this, Math.round(a.damage * dmgMul), a);
        }
      }
      if (a.multi && this.attackT > a.tell + a.active * 0.5 && !this.multi2) {
        this.multi2 = true;
        const box = this.attackBox(a);
        const p = this.world.player;
        if (p.state !== 'dead' && rectsOverlap(box, p.hitbox())) this.world.enemyHitsPlayer(this, a.damage * 0.8, a);
      }
      return;
    }
    if (this.attackT >= a.tell + a.active + a.recover) {
      this.state = 'idle';
      this.cooldown = a.cd * rand(0.8, 1.3);
      this.multi2 = false;
      this.gnawChain = (this.gnawChain || 0);
    }
  }

  attackBox(a) {
    const f = this.facing;
    return {
      x: this.x + (f > 0 ? a.box.ox : -a.box.ox - a.box.w),
      y: this.y + a.box.oy,
      w: a.box.w, h: a.box.h
    };
  }

  /* ---------- per-type AI ---------- */
  aiGnawer(dt, canAct, dx, adx) {
    const a = ATTACKS_ENEMY.gnawClaw;
    if (!canAct) return;
    if (this.armsLive() <= 0) {
      // helpless: hold its ground so the player can finish it (no endless chase)
      const dxp = this.world.player.x - this.x;
      if (Math.abs(dxp) < 46) this.vx = approach(this.vx, -sign(dxp) * this.def.speed * 0.22, 900 * dt);
      else this.vx = approach(this.vx, 0, 900 * dt);
      return;
    }
    this.gnawChain = this.gnawChain || 0;
    const reach = 62;
    if (adx > reach && this.cooldown <= 0) {
      this.moveToward(this.world.player.x + this.circleDir * 10, this.def.speed, dt);
      // occasional pounce
      if (!this.legsImpaired && adx > 190 && adx < 400 && this.onGround && Math.random() < dt * 0.55) {
        this.vx = sign(dx) * this.def.speed * 2.1;
        this.vy = -430;
      }
    } else if (adx > reach) {
      this.moveToward(this.world.player.x + this.circleDir * 46, this.def.speed * 0.8, dt, 40);
    } else {
      if (this.cooldown <= 0) {
        const chainKeys = ['gnawClaw', 'gnawClaw2', 'gnawLeap'];
        const key = chainKeys[this.gnawChain % 3];
        if (this.startAttack(key)) {
          this.gnawChain = (this.gnawChain + 1) % 3;
          if (key !== 'gnawClaw') this.cooldown = 0.02;
        }
      } else {
        this.vx = approach(this.vx, 0, 1400 * dt);
      }
    }
  }

  aiSamurai(dt, canAct, dx, adx) {
    if (!canAct) return;
    if (this.armsLive() <= 0) {
      // helpless: hold its ground so the player can finish it (no endless chase)
      const dxp = this.world.player.x - this.x;
      if (Math.abs(dxp) < 46) this.vx = approach(this.vx, -sign(dxp) * this.def.speed * 0.22, 900 * dt);
      else this.vx = approach(this.vx, 0, 900 * dt);
      return;
    }
    const reach = 78;
    const p = this.world.player;
    if (this.guardBrokenT > 0) {
      // reeling: back off a step
      this.moveToward(p.x - this.facing * 60, this.def.speed * 0.6, dt, 0);
      return;
    }
    if (adx > reach) {
      const spd = this.legsImpaired ? this.def.speed * 0.4 : this.def.speed;
      this.moveToward(p.x, spd * (adx > 300 ? 1 : 0.78), dt);
      if (this.cooldown <= 0 && adx > 150 && adx < 330 && Math.random() < dt * 0.5) {
        this.startAttack('samuraiLunge');
      }
    } else if (this.cooldown <= 0) {
      if (Math.random() < 0.6) this.startAttack('samuraiChop');
      else this.startAttack('samuraiLunge');
    } else {
      this.vx = approach(this.vx, 0, 900 * dt);
      if (adx < 46) this.vx = approach(this.vx, -this.facing * 60, 900 * dt);
      else this.moveToward(p.x, this.def.speed * 0.5, dt, 60);
    }
  }

  aiPuppet(dt, canAct, dx, adx) {
    const p = this.world.player;
    this.orbitT += dt;
    if (this.legsImpaired) {
      // grounded crawler: lobs short-range orbs
      if (!canAct) return;
      if (this.fireCd <= 0 && adx < 420 && this.armsLive() > 0) { this.startAttack('puppetCast'); }
      else this.moveToward(p.x, this.def.speed * 0.35, dt, 190);
      return;
    }
    if (!canAct) return;
    if (this.armsLive() <= 0) {
      // helpless: drifts and tries to ram
      this.moveToward(p.x, this.def.speed * 0.5, dt, 0);
      return;
    }
    if (adx < 220 && Math.random() < dt * 0.9) {
      // retreat: teleport-drift away
      this.vx = -sign(dx) * this.def.speed * 1.5 * (this.legsImpaired ? 0.4 : 1);
      if (this.y > GROUND_Y - this.def.hover - 10) this.vy = -120;
      this.world.fx.burst(this.x, this.y - this.h * 0.5, '#ff6b8a', 10, 240, 2.4, 0.4, 120);
    } else {
      this.moveToward(p.x + Math.sin(this.orbitT * 1.2) * 60, this.def.speed * 0.7, dt, 250);
    }
    if (this.fireCd <= 0 && adx < 620) {
      this.startAttack('puppetCast');
      this.fireCd = rand(1.5, 2.4);
    }
  }

  /* ---------- animation ---------- */
  animUpdate(dt) {
    const a = this.anim;
    const t = this.world.time;
    let tArmA = 0.4, tArmB = 0.4, tLegA = 0, tLegB = 0, tLean = 0, tWeapon = 0.9;
    const spdK = clamp(Math.abs(this.vx) / this.def.speed, 0, 1.4);
    if (this.state === 'attack') {
      const A = ATTACKS_ENEMY[this.attackKey];
      if (A) {
        const k = clamp(this.attackT / A.tell, 0, 1);
        const hitK = clamp((this.attackT - A.tell) / A.active, 0, 1);
        const recK = clamp((this.attackT - A.tell - A.active) / A.recover, 0, 1);
        const W = A.wind || -2.2, F = A.follow || 2.1;
        if (this.attackT < A.tell) {
          tArmA = lerp(0.4, W, easeOutQuad(k));
          tArmB = lerp(0.4, W * 0.5, easeOutQuad(k));
          tLean = -0.22 - k * 0.1;
          tWeapon = A.weaponWind === undefined ? W : A.weaponWind;
        } else if (this.attackT < A.tell + A.active + A.recover * 0.2) {
          const kk = easeOutCubic(Math.min(1, hitK * 1.7));
          tArmA = lerp(W, F, kk);
          tArmB = lerp(W * 0.5, F * 0.8, kk);
          tLean = 0.24;
          tWeapon = A.weaponFollow === undefined ? F : A.weaponFollow;
        } else {
          tArmA = lerp(F, 0.4, easeOutQuad(recK));
          tArmB = lerp(F * 0.8, 0.4, easeOutQuad(recK));
          tLean = lerp(0.2, 0.02, recK);
          tWeapon = lerp(F, 0.9, easeOutQuad(recK));
        }
      }
    } else if (this.state === 'hurt') {
      tLean = -0.4; tArmA = -0.9; tArmB = -0.7; tWeapon = -0.4;
    } else if (this.dead) {
      tLean = -1.3; tArmA = -1.5; tArmB = -1.2; tWeapon = 0.2;
    } else {
      tLegA = Math.sin(t * 11 + this.spawnX * 0.1) * 0.7 * spdK;
      tLegB = -tLegA;
      tArmA = 0.4 + Math.sin(t * 9) * 0.25 * spdK;
      tArmB = 0.4 - Math.sin(t * 9) * 0.25 * spdK;
      tLean = 0.1 * spdK * sign(this.vx || 1) * (this.facing > 0 ? 1 : -1);
      tWeapon = 0.9 + Math.sin(t * 7) * 0.1;
    }
    const sp = Math.min(1, dt * 16);
    a.armA = lerp(a.armA, tArmA, sp);
    a.armB = lerp(a.armB, tArmB, sp);
    a.legA = lerp(a.legA, tLegA, sp);
    a.legB = lerp(a.legB, tLegB, sp);
    a.lean = lerp(a.lean, tLean, sp);
    a.weaponA = lerp(a.weaponA, tWeapon, Math.min(1, dt * 18));
    const bobTarget = this.def.air ? Math.sin(t * 3.2 + this.spawnX) * 5 : (this.state === 'idle' ? Math.sin(t * 3 + this.spawnX) * 1.6 : 0);
    a.bob = lerp(a.bob, bobTarget, Math.min(1, dt * 6));
    if (this.reactT > 0) {
      const k = this.reactT / (this.reactMax || 0.1);
      a.lean -= this.reactDir * this.facing * 0.42 * k;
      a.bob += Math.sin(k * Math.PI) * 3;
    }
  }

  /* ---------- draw ---------- */
  draw(ctx) {
    const d = this.def, a = this.anim;
    const f = this.facing;
    if (this.dead && this.deathT > 2.2) return;
    ctx.save();
    ctx.translate(this.x, this.y);
    // shadow
    const shScale = this.def.air ? clamp(1 - (GROUND_Y - this.y) / 400, 0.35, 1) : 1;
    ctx.globalAlpha = 0.32 * shScale;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(0, GROUND_Y - this.y, this.w * 0.62 * shScale, 5.5 * shScale, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.scale(f, 1);
    ctx.save();
    ctx.rotate(a.lean * 0.45);
    const tintK = this.hurtFlashT > 0 ? Math.min(1, this.hurtFlashT / 0.14) : 0;
    const dark = d.bodyDark;
    const body = tintK > 0.5 ? '#c98f92' : d.bodyColor;

    // legs
    const legL = this.getLimb('legs');
    if (!legL.severed) {
      const swing = this.legsImpaired ? 0.1 : Math.sin(a.legA) * 13;
      capsule(ctx, -5, -24, -5 + swing, -2, 7, 5, true);
      ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 1.3; ctx.stroke();
      capsule(ctx, 5, -24, 5 - swing, -2, 7, 5, true);
      ctx.fillStyle = body; ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 1.3; ctx.stroke();
    } else {
      // stumps
      ctx.fillStyle = '#5a1f22';
      ctx.beginPath(); ctx.ellipse(-5, -20, 5, 7, 0, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.ellipse(5, -20, 5, 7, 0, 0, TAU); ctx.fill();
    }

    // torso
    poly(ctx, [[-11, -54], [12, -54], [14, -24], [-13, -24]]);
    ctx.fillStyle = body; ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 1.6; ctx.stroke();
    if (this.typeKey === 'samurai') {
      poly(ctx, [[-12, -50], [13, -50], [14, -38], [-13, -38]]);
      ctx.fillStyle = this.guardBrokenT > 0 ? '#8a6b2a' : '#4a5068';
      ctx.fill(); ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.strokeStyle = d.accent; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(-12, -44); ctx.lineTo(13, -44); ctx.stroke();
    }
    if (this.typeKey === 'puppet') {
      // jade core
      const pulse = 0.6 + Math.sin(this.world.time * 6) * 0.4;
      glowCircle(ctx, 0, -40, 14, 'rgba(255,90,130,' + (0.35 * pulse) + ')', 1);
      ctx.beginPath(); ctx.arc(0, -40, this.armsLive() > 0 ? 5.5 : 2.5, 0, TAU);
      ctx.fillStyle = '#ff9ab0'; ctx.fill();
    }

    // arms
    const drawArm = (limbId, ang, len, col, withWeapon) => {
      const l = this.getLimb(limbId);
      const shoulderY = -52;
      if (!l.severed) {
        const ex = Math.sin(ang) * len;
        const ey = shoulderY + Math.cos(ang) * len;
        capsule(ctx, 0, shoulderY, ex, ey, 6, 5);
        ctx.fillStyle = col; ctx.fill();
        ctx.strokeStyle = dark; ctx.lineWidth = 1.2; ctx.stroke();
        if (withWeapon && this.typeKey === 'samurai') {
          const wa = a.weaponA;
          const hx = ex, hy = ey;
          const tx = hx + Math.sin(wa) * 58;
          const ty = hy + Math.cos(wa) * 58;
          ctx.strokeStyle = '#b9c6d2'; ctx.lineWidth = 5;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
          ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.8;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(tx, ty); ctx.stroke();
        }
        if (l.hitFlash > 0) { ctx.globalAlpha = l.hitFlash * 3; ctx.fillStyle = '#fff'; ctx.fill(); ctx.globalAlpha = 1; }
      } else {
        ctx.fillStyle = '#5a1f22';
        ctx.beginPath(); ctx.arc(0, shoulderY, 5.5, 0, TAU); ctx.fill();
      }
    };
    drawArm('armB' === 'x' ? 'armL' : 'armL', a.armB * 1.15 + 0.15, 17, dark, false);
    drawArm('armR', a.armA, 18, body, true);

    // head
    const hl = this.getLimb('head');
    if (!hl.severed) {
      const hy = this.typeKey === 'gnawer' ? -62 : -66;
      ctx.save();
      ctx.translate(2, hy + a.bob * 0.3);
      ctx.rotate(a.lean * 0.2);
      ctx.beginPath(); ctx.arc(0, 0, this.typeKey === 'samurai' ? 11 : 9.5, 0, TAU);
      ctx.fillStyle = body; ctx.fill();
      ctx.strokeStyle = dark; ctx.lineWidth = 1.4; ctx.stroke();
      // eyes / mask
      ctx.fillStyle = this.state === 'attack' && this.attackT < (ATTACKS_ENEMY[this.attackKey] || {}).tell ? '#fff04a' : d.accent;
      if (this.typeKey === 'samurai') {
        poly(ctx, [[-9, -3], [9, -3], [7, 7], [-7, 7]]);
        ctx.fillStyle = '#8e2b2b'; ctx.fill();
        ctx.strokeStyle = '#d8a638'; ctx.lineWidth = 1.1; ctx.stroke();
        ctx.fillStyle = '#ffdc5a';
        ctx.fillRect(-6, -1, 4, 2);
        ctx.fillRect(2, -1, 4, 2);
        // horns
        poly(ctx, [[-8, -8], [-13, -20], [-4, -9]]); ctx.fillStyle = '#c8b06a'; ctx.fill();
        poly(ctx, [[8, -8], [13, -20], [4, -9]]); ctx.fillStyle = '#c8b06a'; ctx.fill();
      } else if (this.typeKey === 'puppet') {
        poly(ctx, [[-8, -4], [8, -4], [5, 6], [-5, 6]]);
        ctx.fillStyle = '#f4dfe4'; ctx.fill();
        ctx.strokeStyle = '#a8455e'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#ff3b6b';
        ctx.beginPath(); ctx.arc(-3.5, 0, 1.7, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(3.5, 0, 1.7, 0, TAU); ctx.fill();
        // crown
        poly(ctx, [[-7, -8], [0, -18], [7, -8]]);
        ctx.fillStyle = '#e8477a'; ctx.fill();
      } else {
        // gnawer: jagged maw
        poly(ctx, [[-8, -3], [9, 1], [3, 8], [-7, 5]]);
        ctx.fillStyle = '#e8e2cf'; ctx.fill();
        ctx.strokeStyle = '#6b5f4a'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = '#ff3b2f';
        ctx.beginPath(); ctx.arc(-2, -1, 2.1, 0, TAU); ctx.fill();
        ctx.beginPath(); ctx.arc(4, 0, 2.1, 0, TAU); ctx.fill();
        // spikes
        poly(ctx, [[-8, -6], [-3, -15], [0, -6]]); ctx.fillStyle = '#8a7a63'; ctx.fill();
      }
      if (hl.hitFlash > 0) { ctx.globalAlpha = hl.hitFlash * 3; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, 0, 11, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.restore();
    } else {
      ctx.fillStyle = '#5a1f22';
      ctx.beginPath(); ctx.arc(2, -60, 6, 0, TAU); ctx.fill();
    }

    ctx.restore(); // lean
    ctx.restore(); // facing

    // --- telegraph & state overlays (world space, unmirrored) ---
    if (this.state === 'attack') {
      const A = ATTACKS_ENEMY[this.attackKey];
      if (A) {
        if (this.attackT < A.tell) {
          const k = this.attackT / A.tell;
          const f2 = this.facing;
          // ground reach marker
          ctx.save();
          ctx.globalAlpha = 0.18 + k * 0.32;
          ctx.strokeStyle = this.typeKey === 'samurai' ? 'rgba(255,90,70,0.95)' : 'rgba(255,170,80,0.9)';
          ctx.lineWidth = 2 + k * 2;
          const bx = this.x + (f2 > 0 ? A.box.ox : -A.box.ox - A.box.w);
          const by = this.y + A.box.oy;
          roundRect(ctx, bx, by, A.box.w, A.box.h, 6);
          ctx.stroke();
          // fill sweep showing timing
          ctx.globalAlpha = 0.08 + k * 0.14;
          ctx.fillStyle = this.typeKey === 'samurai' ? 'rgba(255,80,60,0.7)' : 'rgba(255,170,80,0.6)';
          const w2 = A.box.w * k;
          roundRect(ctx, f2 > 0 ? bx : bx + A.box.w - w2, by, w2, A.box.h, 6);
          ctx.fill();
          ctx.restore();
          // warning mark
          if (k > 0.55) {
            ctx.save();
            ctx.globalAlpha = (k - 0.55) / 0.45;
            ctx.fillStyle = '#ff4a3a';
            ctx.font = '900 22px "Trebuchet MS",sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('!', this.x, this.y - this.h - 14);
            ctx.restore();
          }
        } else if (this.attackT < A.tell + A.active) {
          const k = (this.attackT - A.tell) / A.active;
          ctx.save();
          ctx.globalAlpha = (1 - k) * 0.9;
          ctx.globalCompositeOperation = 'lighter';
          ctx.strokeStyle = A.slashColor || 'rgba(255,220,180,0.9)';
          ctx.lineWidth = 12 * (1 - k) + 3;
          const cx2 = this.x + this.facing * 26;
          const cy2 = this.y - this.h * 0.5;
          ctx.beginPath();
          ctx.arc(cx2, cy2, A.slashR || 72, (this.facing > 0 ? -1.1 : Math.PI + 1.1), (this.facing > 0 ? 1.1 : Math.PI - 1.1), this.facing < 0);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
    if (this.guardBrokenT > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(this.guardBrokenT, 0, 1) * 0.8;
      ctx.strokeStyle = '#ffd76a';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(this.x, this.y - this.h * 0.5, this.w * 0.9, 0, TAU * clamp(this.guardBrokenT, 0, 1)); ctx.stroke();
      ctx.restore();
    }
    if (this.flash > 0.02) {
      ctx.save();
      ctx.globalAlpha = this.flash * 0.16;
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = '#ffd9c0';
      roundRect(ctx, this.x - this.w * 0.5, this.y - this.h - 2, this.w, this.h + 2, 8);
      ctx.fill();
      ctx.restore();
    }
  }
}

/* ---------- enemy attack table ---------- */
const ATTACKS_ENEMY = {
  gnawClaw: {
    tell: 0.34, active: 0.09, recover: 0.24, damage: 6, cd: 0.62,
    box: { ox: 8, oy: -48, w: 62, h: 50 },
    wind: -1.5, follow: 1.9, advance: 190, track: true, multi: true,
    slashColor: 'rgba(255,180,140,0.9)', slashR: 54
  },
  gnawClaw2: {
    tell: 0.3, active: 0.09, recover: 0.26, damage: 8, cd: 0.5,
    box: { ox: 6, oy: -56, w: 66, h: 56 },
    wind: 1.6, follow: -1.8, advance: 200, track: true,
    slashColor: 'rgba(255,160,120,0.9)', slashR: 58
  },
  gnawLeap: {
    tell: 0.44, active: 0.14, recover: 0.34, damage: 11, cd: 0.9,
    box: { ox: 2, oy: -58, w: 74, h: 66 },
    wind: -2.1, follow: 2.2, advance: 520, track: true,
    slashColor: 'rgba(255,120,90,0.95)', slashR: 66, leap: true
  },
  samuraiChop: {
    tell: 0.72, active: 0.13, recover: 0.42, damage: 21, cd: 1.1,
    box: { ox: 12, oy: -84, w: 96, h: 96 },
    wind: -2.6, follow: 2.3, weaponWind: -2.9, weaponFollow: 2.0,
    advance: 260, track: true,
    slashColor: 'rgba(255,120,90,0.95)', slashR: 92, parryable: true
  },
  samuraiLunge: {
    tell: 0.5, active: 0.16, recover: 0.46, damage: 15, cd: 1.2,
    box: { ox: 10, oy: -62, w: 104, h: 62 },
    wind: -0.9, follow: 1.4, weaponWind: 0.2, weaponFollow: 1.5,
    advance: 620, track: true,
    slashColor: 'rgba(200,230,255,0.9)', slashR: 84, parryable: true
  },
  puppetCast: {
    tell: 0.55, active: 0.1, recover: 0.4, damage: 0, cd: 0.5,
    box: { ox: 0, oy: -70, w: 10, h: 10 },
    wind: -2.0, follow: 1.0, spawnOrb: true, track: true,
    slashColor: 'rgba(255,110,150,0.9)', slashR: 60
  }
};
