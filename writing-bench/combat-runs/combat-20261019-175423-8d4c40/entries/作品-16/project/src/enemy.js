// ---- enemies: mechanical puppets with breakable limbs ----
'use strict';

const E_DIMS = { torsoLen: 30, headR: 9, upperArm: 19, foreArm: 18, upperLeg: 22, lowerLeg: 22, hipW: 15, shoulderW: 27 };
const E_TYPES = {
  blade: {
    name: '刃傀', hp: 55, poise: 60, speed: 5.6, scale: 1.0, weapon: 'blade',
    color: { armor: '#8a5233', dark: '#40291c', glow: '#ffb347' }, dmg: 10,
  },
  hammer: {
    name: '锤傀', hp: 120, poise: 115, speed: 2.3, scale: 1.32, weapon: 'hammer', armored: true,
    color: { armor: '#565c6e', dark: '#282c38', glow: '#8be9ff' }, dmg: 18,
  },
  gunner: {
    name: '铳傀', hp: 45, poise: 50, speed: 3.4, scale: 0.95, weapon: 'gun',
    color: { armor: '#41604a', dark: '#24331f', glow: '#a8ff6a' }, dmg: 9,
  },
};

class Enemy {
  constructor(type, x, game) {
    const T = E_TYPES[type];
    this.type = type; this.T = T;
    this.x = x; this.y = game.groundY;
    this.vx = 0; this.vy = 0;
    this.facing = x < game.player.x ? 1 : -1;
    this.hp = T.hp; this.maxHp = T.hp;
    this.poise = T.poise; this.maxPoise = T.poise;
    this.state = 'spawn'; this.stateT = 0;
    this.staggerT = 0;
    this.flashT = 0; this.animT = rand(0, 9);
    this.telegraphGlow = 0;
    this.cooldown = rand(0.6, 1.4);
    this.aimDx = this.facing; this.aimX = 0; this.aimY = 0;
    this.broken = { head: false, armL: false, armR: false, legL: false, legR: false };
    this.dmgVis = 0;
    this.scale = T.scale;
    this.dims = {};
    for (const k in E_DIMS) this.dims[k] = E_DIMS[k] * this.scale;
    this.weapon = T.weapon;
    this.hammerUp = false;
    this.sdDur = 2.3;
    this.didHit = false;
    this.laser = null;
    this.hopCD = 0;
    this.deadT = 0;
    this.runAmt = 0;
    this.poseCache = null;
    this.skel = null;
  }
  get speedMult() {
    const bl = (this.broken.legL ? 1 : 0) + (this.broken.legR ? 1 : 0);
    return bl === 0 ? 1 : bl === 1 ? 0.45 : 0.22;
  }
  get headless() { return this.broken.head; }
  get armsGone() { return this.broken.armL && this.broken.armR; }
  get hurtBox() {
    const s = this.scale;
    return { x: this.x - 16 * s, y: this.y - 92 * s, w: 32 * s, h: 92 * s };
  }
  pelvisY() { return this.y - (this.dims.upperLeg + this.dims.lowerLeg) + (this.poseCache ? this.poseCache.crouch * 14 * this.scale : 0); }

  breakLimb(part, game, silent) {
    if (this.broken[part] || this.state === 'dead') return false;
    this.broken[part] = true;
    const s = this.scale;
    const sk = this.skel;
    const names = { armL: '断臂!', armR: '断臂!', legL: '断腿!', legR: '断腿!', head: '断头!' };
    if (!silent) {
      game.limbBreaks++;
      game.fx.floaters.spawn(this.x, this.y - 110 * s, names[part], '#ff6a4d', 22);
      AUDIO.limbBreak();
      game.addShake(0.5);
      game.hitStop(0.09);
    }
    // debris
    let dx = this.x, dy = this.y - 60 * s, kind = 'limb', len = 30 * s, th = 10 * s;
    if (sk) {
      if (part === 'armL' || part === 'armR') { dx = sk[part].el.x; dy = sk[part].el.y; len = 34 * s; }
      else if (part === 'legL' || part === 'legR') { dx = sk[part].kn.x; dy = sk[part].kn.y; len = 38 * s; }
      else { dx = sk.head.x; dy = sk.head.y; kind = 'head'; len = 16 * s; th = 15 * s; }
    }
    if (part === 'armR') {
      if (this.weapon === 'hammer') kind = 'hammer';
      else if (this.weapon === 'gun') kind = 'gun';
    }
    game.fx.debris.spawn(dx, dy, {
      kind, len, thick: th, metal: this.T.color.armor,
      vx: rand(120, 430) * -this.facing + this.vx * 0.4,
      vy: rand(-620, -260), vr: rand(-16, 16),
    });
    if (!silent) {
      game.fx.hitSpark(dx, dy, true, -this.facing);
      game.fx.bloodOil(dx, dy, -this.facing, 10);
    }
    if (this.armsGone && this.state !== 'dead' && this.state !== 'selfdestruct') this.startSelfDestruct(game);
    return true;
  }

  startSelfDestruct(game) {
    this.state = 'selfdestruct'; this.stateT = 0;
    this.sdDur = 2.3;
    this.vx = 0;
  }

  explode(game) {
    const s = this.scale;
    game.fx.particles.burst(this.x, this.y - 50 * s, 40, {
      spMin: 100, spMax: 620, color: ['#fff6d8', '#ffd76a', '#ff9a3d', '#ff5f4a', '#888'],
      lifeMin: 0.3, lifeMax: 0.9, sizeMin: 2, sizeMax: 6,
    });
    game.fx.shocks.spawn(this.x, this.y - 40 * s, { r0: 10, r1: 230 * s, life: 0.4, color: '#ff9a3d', width: 8 });
    game.fx.shocks.spawn(this.x, this.y, { r0: 6, r1: 170 * s, life: 0.35, color: '#ff5f4a', width: 6 });
    game.fx.debris.spawn(this.x, this.y - 60 * s, { kind: 'limb', len: 40 * s, thick: 16 * s, metal: this.T.color.armor, vy: -460, vx: rand(-160, 160) });
    AUDIO.explosion();
    game.addShake(0.9);
    game.hitStop(0.06);
    const pd = Math.abs(game.player.x - this.x);
    if (pd < 200 * s && game.player.y > this.y - 120 * s) {
      game.player.takeHit(24, sign(game.player.x - this.x), game);
    }
    // remaining limbs scatter
    for (const p of ['armL', 'armR', 'legL', 'legR', 'head']) {
      if (!this.broken[p] && Math.random() < 0.8) {
        this.broken[p] = true;
        game.fx.debris.spawn(this.x + rand(-20, 20), this.y - rand(30, 90) * s, {
          kind: p === 'head' ? 'head' : this.weapon !== 'blade' && p === 'armR' ? (this.weapon === 'hammer' ? 'hammer' : 'gun') : 'limb',
          len: rand(20, 38) * s, thick: rand(8, 14) * s, metal: this.T.color.armor,
          vx: rand(-320, 320), vy: rand(-520, -200),
        });
      }
    }
    this.die(game, true);
  }

  die(game, silent) {
    if (this.state === 'dead') return;
    this.state = 'dead'; this.deadT = 0;
    const s = this.scale;
    if (!silent) {
      game.fx.hitSpark(this.x, this.y - 50 * s, true, -this.facing);
      game.fx.bloodOil(this.x, this.y - 50 * s, -this.facing, 14);
      game.fx.shocks.spawn(this.x, this.y - 40 * s, { r0: 8, r1: 140 * s, life: 0.3, color: this.T.color.glow, width: 5 });
      AUDIO.limbBreak();
    }
    // torso chunk + remaining limbs fly
    game.fx.debris.spawn(this.x, this.y - 55 * s, { kind: 'limb', len: 42 * s, thick: 22 * s, metal: this.T.color.armor, vy: rand(-420, -260), vx: rand(-200, 200) });
    for (const p of ['armL', 'armR', 'legL', 'legR', 'head']) {
      if (!this.broken[p]) {
        let kind = 'limb';
        if (p === 'head') kind = 'head';
        else if (p === 'armR') kind = this.weapon === 'hammer' ? 'hammer' : this.weapon === 'gun' ? 'gun' : 'limb';
        game.fx.debris.spawn(this.x + rand(-14, 14), this.y - rand(25, 85) * s, {
          kind, len: rand(22, 40) * s, thick: rand(8, 14) * s, metal: this.T.color.armor,
          vx: rand(-300, 300) + this.vx * 0.5, vy: rand(-500, -180), vr: rand(-16, 16),
        });
      }
    }
    game.onEnemyKilled(this);
  }

  takeHit(hit, game) {
    if (this.state === 'dead' || this.state === 'spawn') return { landed: false };
    let dmg = hit.dmg, poiseDmg = hit.poise, clang = false;
    if (this.T.armored && !hit.heavy && !hit.launch) {
      dmg *= 0.35; poiseDmg *= 0.3; clang = true;
    }
    this.hp -= dmg;
    this.dmgVis = clamp(1 - this.hp / this.maxHp, 0, 1);
    this.flashT = 0.1;
    const kbMul = this.staggerT > 0 ? 1.7 : this.state === 'selfdestruct' ? 0.3 : 1;
    this.vx += hit.kx * kbMul * (hit.dirX || 1);
    if (hit.launch) {
      this.vy = hit.launch;
      this.state = 'juggle'; this.stateT = 0;
      this.staggerT = Math.max(this.staggerT, 0.5);
    } else if (!clang) {
      this.vy = Math.min(this.vy, hit.ky * kbMul);
    }
    this.poise -= poiseDmg;
    let staggeredNow = false;
    if (this.poise <= 0 && this.staggerT <= 0 && this.state !== 'juggle') {
      this.staggerT = 1.4;
      this.poise = this.maxPoise * 0.45;
      staggeredNow = true;
      AUDIO.stagger();
      game.fx.floaters.spawn(this.x, this.y - 105 * this.scale, '气绝!', '#ffe9a8', 19);
    }
    // limb sever: heavy hits on staggered targets, full charge always
    let broke = false;
    if (hit.breakPart && (this.staggerT > 0 || hit.forceBreak)) {
      const order = ['armR', 'armL', 'legR', 'legL', 'head'];
      for (const p of order) if (!this.broken[p]) { broke = this.breakLimb(p, game); break; }
    }
    if (this.hp <= 0) { this.die(game); return { landed: true, clang, killed: true, broke }; }
    return { landed: true, clang, killed: false, broke, staggeredNow };
  }

  update(dt, game) {
    this.animT += dt;
    this.stateT += dt;
    this.flashT = Math.max(0, this.flashT - dt);
    this.telegraphGlow = 0;
    this.laser = null;
    if (this.state === 'dead') return;
    // gravity
    const dtf = dt * 60; // velocities are px/frame @60fps
    this.vy = Math.min(this.vy + 44 * dtf, 28);
    this.x += this.vx * dtf;
    this.y += this.vy * dtf;
    if (this.y >= game.groundY) {
      if (this.state === 'juggle' && this.vy > 6) {
        game.fx.dust(this.x, game.groundY, 8);
        game.fx.shocks.spawn(this.x, game.groundY, { r0: 4, r1: 70, life: 0.25, color: '#aab', width: 3 });
        this.staggerT = Math.max(this.staggerT, 0.9);
        AUDIO.land();
      }
      this.y = game.groundY; this.vy = 0;
      if (this.state === 'juggle') { this.state = 'chase'; this.stateT = 0; this.vx *= 0.3; }
    }
    this.x = clamp(this.x, 40, game.arenaW - 40);
    if (this.staggerT > 0 && this.state !== 'selfdestruct') {
      this.staggerT -= dt;
      this.vx *= (1 - 6 * dt);
      if (this.staggerT <= 0) { this.state = 'chase'; this.stateT = 0; }
      return;
    }
    switch (this.state) {
      case 'spawn': if (this.stateT > 0.7) { this.state = 'chase'; this.stateT = 0; } break;
      case 'chase': this.aiChase(dt, game); break;
      case 'telegraph': this.aiTelegraph(dt, game); break;
      case 'attack': this.aiAttack(dt, game); break;
      case 'recover': if (this.stateT > this.recoverDur) { this.state = 'chase'; this.stateT = 0; } break;
      case 'selfdestruct': this.aiSelfDestruct(dt, game); break;
    }
    // target run amount
    const tr = (this.state === 'chase' && Math.abs(this.vx) > 0.6) ? 1 : 0;
    this.runAmt = approach(this.runAmt, tr, dt * 7);
  }

  facePlayer(game) { this.facing = game.player.x >= this.x ? 1 : -1; }
  // aim with error if headless
  aimAt(game) {
    const p = game.player;
    if (this.headless) {
      if (Math.random() < 0.3) this.aimDx = -this.aimDx;
      this.aimX = p.x + rand(-160, 160);
      this.aimY = p.y - 40 + rand(-60, 60);
    } else {
      this.aimDx = p.x >= this.x ? 1 : -1;
      this.aimX = p.x; this.aimY = p.y - 34;
    }
  }

  aiChase(dt, game) {
    this.cooldown -= dt;
    this.hopCD -= dt;
    const p = game.player;
    const dx = p.x - this.x;
    const adx = Math.abs(dx);
    this.facePlayer(game);
    if (this.type === 'gunner') {
      // keep distance
      let want = 0;
      if (adx < 240) want = -this.facing;
      else if (adx > 430) want = this.facing;
      else want = Math.sin(this.animT * 0.7) > 0 ? this.facing : -this.facing;
      // don't back into walls
      if ((this.x < 120 && want < 0) || (this.x > game.arenaW - 120 && want > 0)) want = -want;
      this.vx = approach(this.vx, want * this.T.speed * this.speedMult, 1800 * dt);
      // panic hop
      if (adx < 130 && this.hopCD <= 0 && this.y >= game.groundY - 1) {
        this.hopCD = 2.2;
        this.vx = -this.facing * 9; this.vy = -8;
      }
      if (this.cooldown <= 0 && adx < 620) this.startTelegraph(game, this.broken.armR ? 1.35 : 0.7);
      return;
    }
    const stop = this.type === 'hammer' ? 150 : 110;
    if (adx > stop) {
      const sp = this.T.speed * this.speedMult;
      this.vx = approach(this.vx, this.facing * sp, 1600 * dt);
    } else {
      this.vx *= (1 - 8 * dt);
      if (this.cooldown <= 0 && p.state !== 'dead') this.startTelegraph(game, this.telegraphTime());
    }
  }
  telegraphTime() {
    if (this.type === 'blade') return this.broken.armR ? 0.75 : 0.45;
    if (this.type === 'hammer') return 0.9;
    return 0.7;
  }
  startTelegraph(game, dur) {
    if (this.armsGone) { this.startSelfDestruct(game); return; }
    this.state = 'telegraph'; this.stateT = 0;
    this.teleDur = dur;
    this.aimAt(game);
    this.facing = this.aimDx;
    this.vx = 0;
    AUDIO.telegraph();
  }
  aiTelegraph(dt, game) {
    this.telegraphGlow = clamp(this.stateT / this.teleDur, 0, 1);
    this.vx *= (1 - 10 * dt);
    if (this.type === 'gunner') {
      // track laser toward locked aim (drifts if headless)
      const sk = this.skel;
      const gx = sk ? sk.armR.ha.x : this.x, gy = sk ? sk.armR.ha.y : this.y - 60;
      const tx = this.aimX, ty = this.aimY;
      this.laser = { x1: gx, y1: gy, x2: lerp(gx, tx, this.telegraphGlow), y2: lerp(gy, ty, this.telegraphGlow), a: this.telegraphGlow };
      this.facing = tx >= this.x ? 1 : -1;
    }
    if (this.stateT >= this.teleDur) {
      this.state = 'attack'; this.stateT = 0;
      this.didHit = false;
      if (this.type === 'blade') {
        this.vx = this.aimDx * (this.broken.armR ? 9 : 16);
        AUDIO.swing(0.4);
      } else if (this.type === 'hammer') {
        AUDIO.swing(0.9);
      } else {
        this.fireBolt(game);
      }
    }
  }
  fireBolt(game) {
    const sk = this.skel;
    const gx = sk ? sk.armR.ha.x : this.x, gy = sk ? sk.armR.ha.y : this.y - 60 * this.scale;
    const a = Math.atan2(this.aimY - gy, this.aimX - gx);
    game.bolts.push({ x: gx, y: gy, vx: Math.cos(a) * 17, vy: Math.sin(a) * 17, dmg: this.broken.armR ? 6 : 9, age: 0 });
    AUDIO.shot();
    game.fx.particles.burst(gx, gy, 5, { spMin: 60, spMax: 200, color: [this.T.color.glow, '#fff'], lifeMax: 0.2, g: 0 });
  }
  aiAttack(dt, game) {
    const p = game.player;
    if (this.type === 'blade') {
      // active lunge window
      if (this.stateT < 0.3) {
        const s = this.scale;
        const hx = this.x + this.aimDx * 30 * s;
        if (!this.didHit && Math.abs(p.x - hx) < 42 * s && p.y > this.y - 70 * s && p.y < this.y + 10) {
          this.didHit = true;
          p.takeHit(this.broken.armR ? 6 : 10, this.aimDx, game);
        }
      } else {
        this.vx *= (1 - 5 * dt);
      }
      if (this.stateT > 0.55) this.endAttack(0.55);
    } else if (this.type === 'hammer') {
      // slam lands at 0.14
      if (!this.didHit && this.stateT >= 0.14) {
        this.didHit = true;
        const brokenArm = this.broken.armR;
        const reach = brokenArm ? 95 : 150;
        const dmg = brokenArm ? 12 : 18;
        const sx = this.x + this.facing * reach * 0.55;
        game.fx.shocks.spawn(sx, game.groundY, { r0: 10, r1: reach * 1.6, life: 0.4, color: '#cfe8ff', width: 7 });
        game.fx.dust(sx, game.groundY, 12);
        game.fx.particles.burst(sx, game.groundY - 6, 14, { angle: -Math.PI / 2, spread: 1.3, spMin: 120, spMax: 420, color: ['#cfe8ff', '#8be9ff', '#fff'], lifeMax: 0.4 });
        AUDIO.slam();
        game.addShake(0.45);
        // ground shock: hits grounded player in front
        const pd = (p.x - this.x) * this.facing;
        if (pd > -20 && pd < reach && p.y > game.groundY - 24 && p.state !== 'dead') {
          p.takeHit(dmg, this.facing, game);
        }
      }
      if (this.stateT < 0.1) this.vx = this.facing * 3;
      else this.vx *= (1 - 6 * dt);
      if (this.stateT > 0.75) this.endAttack(0.8);
    } else { // gunner recover
      this.endAttack(0.5);
    }
  }
  endAttack(recoverDur) {
    this.state = 'recover'; this.stateT = 0;
    this.recoverDur = recoverDur;
    this.cooldown = this.type === 'blade' ? rand(0.9, 1.8) : this.type === 'hammer' ? rand(1.4, 2.2) : rand(1.6, 2.5);
    this.hammerUp = false;
  }
  aiSelfDestruct(dt, game) {
    this.vx *= (1 - 4 * dt);
    this.telegraphGlow = 1;
    const left = this.sdDur - this.stateT;
    const beepEvery = clamp(left * 0.28, 0.07, 0.5);
    this._beepT = (this._beepT || 0) - dt;
    if (this._beepT <= 0) { this._beepT = beepEvery; AUDIO.beep(); }
    if (Math.random() < dt * 20) {
      game.fx.particles.spawn({ x: this.x + rand(-16, 16), y: this.y - rand(10, 80) * this.scale, vx: rand(-40, 40), vy: -rand(60, 160), type: 'dot', size: 2.5, color: '#ff5f4a', life: 0.4, g: 0 });
    }
    // stagger can interrupt countdown (hitting poise break resets a bit)
    if (this.stateT >= this.sdDur) this.explode(game);
  }

  buildPose() {
    const p = basePose();
    const t = this.animT;
    const s = this.scale;
    if (this.state === 'spawn') {
      const k = easeOutCubic(clamp(this.stateT / 0.7, 0, 1));
      p.crouch = 1 - k; p.lean = 0.3;
      return p;
    }
    if (this.state === 'selfdestruct') {
      const shake = Math.sin(t * 40) * 0.06;
      p.crouch = 0.3; p.lean = shake;
      p.armL = { a: -2.6 + shake, b: 0.4 }; p.armR = { a: -2.9 - shake, b: 0.4 };
      p.legL = { a: Math.PI / 2 + 0.3, b: 0.5 }; p.legR = { a: Math.PI / 2 - 0.3, b: 0.5 };
      p.blade.on = false;
      return p;
    }
    if (this.staggerT > 0 || this.state === 'juggle') {
      const flail = this.state === 'juggle' ? Math.sin(t * 30) * 0.5 : 0;
      p.crouch = 0.85; p.lean = 0.55;
      p.armL = { a: 0.9 + flail, b: 0.5 }; p.armR = { a: 2.2 - flail, b: 0.5 };
      p.legL = { a: Math.PI / 2 + 0.7, b: 1.6 }; p.legR = { a: Math.PI / 2 - 0.5, b: 1.4 };
      p.headTilt = 0.4;
      p.blade.a = 1.4;
      if (this.state === 'juggle') { p.crouch = 0.2; p.lean = -0.4; }
      return p;
    }
    if (this.state === 'telegraph') {
      const k = clamp(this.stateT / this.teleDur, 0, 1);
      const crouch = 0.55 * k;
      p.crouch = crouch;
      p.lean = -0.25 * k;
      if (this.type === 'blade') {
        p.armR = { a: lerp(0.4, -2.6, k), b: lerp(0.4, 1.1, k) };
        p.armL = { a: lerp(1.2, 0.6, k), b: 0.8 };
        p.blade.a = lerp(0.4, -2.6, k);
        p.legL = { a: Math.PI / 2 + 0.5 * k, b: 1.0 * k }; p.legR = { a: Math.PI / 2 - 0.6 * k, b: 1.1 * k };
      } else if (this.type === 'hammer') {
        this.hammerUp = true;
        p.armR = { a: lerp(0.8, -1.9, k), b: lerp(0.5, 0.35, k) };
        p.armL = { a: lerp(1.0, -1.6, k), b: 0.6 };
        p.blade.a = lerp(0.8, -1.9, k);
        p.legL = { a: Math.PI / 2 + 0.4 * k, b: 0.8 * k }; p.legR = { a: Math.PI / 2 - 0.4 * k, b: 0.8 * k };
      } else { // gunner aims
        const a = Math.atan2(this.aimY - (this.y - 62 * s), this.aimX - this.x);
        p.armR = { a, b: 0.08 };
        p.armL = { a: a - 0.5, b: 0.7 };
        p.blade.a = a; p.blade.len = 24 * s;
        p.lean = 0.1;
      }
      return p;
    }
    if (this.state === 'attack') {
      const t2 = this.stateT;
      if (this.type === 'blade') {
        const k = easeOutQuart(clamp(t2 / 0.18, 0, 1));
        p.lean = 0.55; p.crouch = 0.3;
        p.armR = { a: lerp(-2.6, 1.1, k), b: 0.1 };
        p.armL = { a: 0.5, b: 0.6 };
        p.blade.a = lerp(-2.6, 1.1, k);
        p.legL = { a: Math.PI / 2 + 0.9, b: 0.4 }; p.legR = { a: Math.PI / 2 - 1.0, b: 0.3 };
      } else if (this.type === 'hammer') {
        if (t2 < 0.14) {
          const k = easeInQuad(clamp(t2 / 0.14, 0, 1));
          p.armR = { a: lerp(-1.9, 1.5, k), b: 0.2 };
          p.armL = { a: lerp(-1.6, 1.3, k), b: 0.4 };
          p.blade.a = lerp(-1.9, 1.5, k);
          p.lean = lerp(-0.25, 0.6, k);
          p.crouch = lerp(0.35, 0.7, k);
          this.hammerUp = false;
        } else {
          p.armR = { a: 1.5, b: 0.2 }; p.armL = { a: 1.3, b: 0.4 };
          p.blade.a = 1.5; p.lean = 0.6; p.crouch = 0.7;
        }
        p.legL = { a: Math.PI / 2 + 0.6, b: 0.9 }; p.legR = { a: Math.PI / 2 - 0.5, b: 0.9 };
      } else {
        p.armR = { a: Math.atan2(this.aimY - (this.y - 62 * s), this.aimX - this.x), b: 0.1 };
        p.blade.a = p.armR.a; p.blade.len = 24 * s;
        p.lean = 0.2;
      }
      return p;
    }
    // chase / recover: walk cycle
    const r = this.runAmt;
    const spd = this.type === 'hammer' ? 6 : 10;
    const sw = Math.sin(t * spd) * 0.7 * r;
    p.crouch = 0.1 * r;
    p.lean = 0.15 * r;
    p.legL = { a: Math.PI / 2 + sw, b: Math.max(0, -sw) * 1.0 + 0.1 };
    p.legR = { a: Math.PI / 2 - sw, b: Math.max(0, sw) * 1.0 + 0.1 };
    p.armL = { a: Math.PI / 2 - sw * 0.6 + 0.1, b: 0.4 };
    if (this.type === 'blade') {
      p.armR = { a: 0.5, b: 0.25 }; // blade arm held ready
      p.blade.a = 0.35; p.blade.len = 30 * s;
    } else if (this.type === 'hammer') {
      p.armR = { a: 0.8, b: 0.4 }; p.blade.a = 0.8; p.blade.len = 30 * s;
      this.hammerUp = this.hammerUp && this.state !== 'recover' ? true : this.state === 'telegraph';
    } else {
      p.armR = { a: Math.PI / 2 + sw * 0.5, b: 0.3 };
      p.blade.a = p.armR.a; p.blade.len = 24 * s;
    }
    return p;
  }

  computeSkel() {
    const pose = this.buildPose();
    this.poseCache = pose;
    const p2 = this.facing < 0 ? mirrorPose(pose) : pose;
    const sk = computeSkeleton(p2, this.dims, 1, this.x, this.pelvisY());
    sk.f = this.facing;
    this.skel = sk;
    return sk;
  }
}
