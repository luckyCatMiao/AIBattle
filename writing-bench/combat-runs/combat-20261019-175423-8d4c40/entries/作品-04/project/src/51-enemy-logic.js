'use strict';
/* ============================================================
   Puppet AI, damage & limb severing
   ============================================================ */
/* Attack tokens keep the fight readable: one puppet commits at a time
   (two from wave 4). Others circle, feint and reposition. */
const TOKEN = { holders: new Set(), max: 1 };
const PUPPET_PROTO = {
  /* ---------- skeleton ---------- */
  solve(p, state) {
    const s = this.scale;
    const hipX = this.x, hipY = this.y + p.hipY * s;
    const lean = p.lean;
    const shoulderX = hipX + Math.sin(lean * 0.6) * SK.torso * s;
    const shoulderY = hipY - SK.torso * Math.cos(lean * 0.6) * s;
    const side = this.facing;
    const neckX = shoulderX + Math.sin(lean) * SK.neck * s * side;
    const neckY = shoulderY - SK.neck * Math.cos(lean) * s;
    const headX = neckX + side * Math.sin(lean + p.head) * 14 * s;
    const headY = neckY - Math.cos(lean + p.head) * 14 * s;

    const shF = { x: shoulderX + side * 3 * s, y: shoulderY + 2 * s };
    const shB = { x: shoulderX - side * 3 * s, y: shoulderY + 4 * s };
    const hipF = { x: hipX + side * 4 * s, y: hipY - 2 * s };
    const hipB = { x: hipX - side * 4 * s, y: hipY - 2 * s };
    const handF = { x: hipX + p.fh[0] * side * s, y: hipY + p.fh[1] * s };
    const handB = { x: hipX + p.bh[0] * side * s, y: hipY + p.bh[1] * s };
    const elbowF = ik2(shF.x, shF.y, handF.x, handF.y, SK.upperArm * s, SK.foreArm * s, p.elbowF);
    const elbowB = ik2(shB.x, shB.y, handB.x, handB.y, SK.upperArm * s, SK.foreArm * s, p.elbowB);
    const footF = { x: hipX + p.ff[0] * side * s, y: this.y + p.ff[1] * s };
    const footB = { x: hipX + p.bf[0] * side * s, y: this.y + p.bf[1] * s };
    const kneeF = ik2(hipF.x, hipF.y, footF.x, footF.y, SK.thigh * s, SK.shin * s, p.kneeF);
    const kneeB = ik2(hipB.x, hipB.y, footB.x, footB.y, SK.thigh * s, SK.shin * s, p.kneeB);

    /* damaged legs: drop the pelvis */
    if (!this.limbs.legL.attached && !this.limbs.legR.attached) { }
    const ang = p.sword;
    const swordBase = handF;
    const swordTip = { x: swordBase.x + Math.cos(ang) * SK.swordLen * s * side, y: swordBase.y + Math.sin(ang) * SK.swordLen * s };
    return { hipX, hipY, shoulderX, shoulderY, neckX, neckY, headX, headY, shF, shB, handF, handB, elbowF, elbowB, hipF, hipB, footF, footB, kneeF, kneeB, swordBase, swordTip, p };
  },

  currentPose() {
    const T = this.T;
    const t = Game.time;
    let p;
    if (this.dead || this.state === 'dying') p = ENEMY_POSE.down;
    else if (this.state === 'spawn') { p = clonePose(ENEMY_POSE.stand); p.hipY += Math.sin(t * 30) * 1.2; }
    else if (this.state === 'attack' && this.attack) {
      const def = this.attack.def;
      p = keyPose(def.keys, this.attack.t);
    }
    else if (this.state === 'hurt') p = ENEMY_POSE.hurt;
    else if (this.state === 'stagger') p = ENEMY_POSE.hurt;
    else if (!this.legsOk) p = ENEMY_POSE.crawl;
    else if (this.legsCount === 1) {
      p = clonePose(ENEMY_POSE.crawl);
      p.hipY = -40; p.lean = 0.34; p.fh = [16, -50]; p.bh = [-6, -48];
      p.ff = [10, 0]; p.bf = [-6, 0];
      p.hipY += Math.sin(this.walkPhase * 2) * 3;
    }
    else if (this.state === 'chase' || this.state === 'reposition') {
      const k = Math.abs(Math.sin(this.walkPhase));
      p = lerpPose(ENEMY_POSE.walkA, ENEMY_POSE.walkB, k);
    }
    else p = lerpPose(ENEMY_POSE.stand, ENEMY_POSE.stand, 0.5);
    /* broken arm pose */
    if (!this.limbs.armR.attached) { p.fh = [22, -52]; }
    if (!this.limbs.armL.attached) { p.bh = [-16, -50]; }
    return this.solve(p, this.state);
  },

  /* ---------- update ---------- */
  update(dt) {
    this.stateT -= dt;
    this.flash = Math.max(0, this.flash - dt * 6);
    this.spawnGlow = Math.max(0, this.spawnGlow - dt * 1.5);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.staggerT = Math.max(0, this.staggerT - dt);
    this.knockT = Math.max(0, this.knockT - dt);
    this.atkCd = Math.max(0, this.atkCd - dt);
    this.stunGlint = Math.max(0, this.stunGlint - dt);

    /* ribbons trail */
    const P = this.currentPose();
    for (let i = 0; i < this.ribbons.length; i++) {
      const rb = this.ribbons[i];
      const anchor = i === 0 ? { x: P.headX - this.facing * 6, y: P.headY + 3 }
        : i === 1 ? { x: P.handF.x, y: P.handF.y }
          : { x: P.hipX - this.facing * 10, y: P.hipY - 6 };
      if (i === 1 && !this.limbs.armR.attached) { rb.pts[0].x = anchor.x; rb.pts[0].y = anchor.y; continue; }
      this.updateRibbon(rb, anchor, dt);
    }

    if (this.dead) { this.deadT += dt; this.y += this.vy * dt; this.vy += GRAV * dt; if (this.y > GROUND_Y) { this.y = GROUND_Y; this.vy = 0; } this.x += this.vx * dt; this.vx *= 0.9; return; }
    if (this.state === 'dying') {
      this.y += this.vy * dt; this.vy += GRAV * dt;
      if (this.y >= GROUND_Y) { this.y = GROUND_Y; this.vy = 0; this.vx *= 0.82; }
      this.x += this.vx * dt;
      if (this.stateT <= 0) { this.dead = true; this.deadT = 0; }
      return;
    }
    if (this.state === 'spawn') {
      if (this.stateT <= 0) { this.state = 'chase'; this.stateT = 0; }
      return;
    }
    /* a decapitated puppet keeps flailing briefly, then folds */
    if (!this.limbs.head.attached && !this.dead && this.state !== 'dying') {
      this.headlessT = (this.headlessT ?? 2.6) - dt;
      if (this.headlessT <= 0) { this.collapse(); return; }
    }
    if (this.state === 'hurt' || this.state === 'stagger' || this.state === 'launched') {
      this.physics(dt);
      if (this.state === 'hurt' && this.hurtT <= 0) this.state = 'chase';
      if (this.state === 'stagger' && this.staggerT <= 0) this.state = 'chase';
      if (this.state === 'launched') {
        if (this.onGround && this.stateT <= 0 && Math.abs(this.vy) < 10) { this.state = 'downed'; this.stateT = 0.42; }
        else if (this.onGround && this.stateT <= 0) { this.state = 'downed'; this.stateT = 0.4; }
      }
      return;
    }
    if (this.state === 'downed') {
      this.physics(dt);
      this.vx *= 0.9;
      if (this.stateT <= 0) { this.state = 'chase'; this.atkCd = Math.max(this.atkCd, 0.25); }
      return;
    }
    if (this.state === 'attack') {
      this.updateAttack(dt);
      return;
    }

    /* --- chase / reposition --- */
    const pl = Game.player;
    const dx = pl.x - this.x;
    const dist = Math.abs(dx);
    const dir = sign(dx || 1);
    const intent = this.chooseIntent(dx, dist, dt);
    if (intent) return;

    const want = this.T.range;
    const tooClose = dist < want * 0.62;
    const waiting = this.atkCd <= 0 && !this.canAttack();
    let move = 0;
    const legFactor = this.legsCount === 2 ? 1 : this.legsCount === 1 ? 0.55 : 0.18;
    const speed = this.T.speed * legFactor;
    if (waiting) {
      /* circle at a respectful distance while another puppet attacks */
      const ring = this.T.ranged ? 270 : 185;
      if (dist > ring + 40) move = dir;
      else if (dist < ring - 40) move = -dir * 0.7;
      else move = Math.sin(Game.time * 1.6 + this.id) * 0.18;
      this.facing = dir;
    } else if (dist > want * 0.9) move = dir;
    else if (tooClose && !this.T.ranged) move = -dir * 0.45;
    else if (this.T.ranged && dist < 170) move = -dir * 0.8;
    else move = 0;
    this.facing = dist > 8 ? dir : this.facing;

    if (this.legsCount === 0) {
      /* crawl pitifully, very slowly */
      this.x += move * speed * 0.4 * dt;
      this.walkPhase += dt * 6;
    } else {
      this.vx = approach(this.vx, move * speed, 900 * dt);
      this.x += this.vx * dt;
      if (Math.abs(this.vx) > 20) this.walkPhase += dt * (5.5 + Math.abs(this.vx) * 0.02);
    }
    this.x = clamp(this.x, 30, WORLD.w - 30);
    this.y = GROUND_Y;
    this.onGround = true;
  },

  chooseIntent(dx, dist, dt) {
    if (this.atkCd > 0) return false;
    if (this.state === 'reposition') {
      if (this.stateT <= 0) this.state = 'chase';
      return false;
    }
    const pl = Game.player;
    if (pl.dead) return false;
    const rng = this.T.range;
    if (this.T.ranged) {
      if (dist > 130 && dist < 430 && Math.abs(pl.y - this.y) < 120 && this.armsOk) {
        this.beginAttack('throw'); return true;
      }
      if (dist <= 120 && this.armsOk) { this.beginAttack('swipe'); return true; }
      return false;
    }
    if (dist < rng + 16 && Math.abs(pl.y - this.y) < 100 && this.armsOk) {
      this.beginAttack('swipe'); return true;
    }
    return false;
  },

  canAttack() {
    TOKEN.max = Game.wave >= 4 ? 2 : 1;
    if (TOKEN.holders.has(this.id)) return true;
    return TOKEN.holders.size < TOKEN.max;
  },

  beginAttack(name) {
    const T = this.T;
    if (!this.canAttack()) { this.atkCd = rand(0.25, 0.55); this.state = 'reposition'; this.stateT = rand(0.35, 0.7); return; }
    TOKEN.holders.add(this.id);
    this.hasToken = true;
    let def;
    if (name === 'swipe') {
      def = {
        dur: T.windup + T.recover + 0.18, active: [T.windup, T.windup + 0.14],
        dmg: T.dmg, hitstop: 0.09, reach: T.range + 30, arc: 1.4, kb: 260, kbY: -160,
        keys: this.makeSwipeKeys(T.windup, T.recover), lunge: T.type === 'brute' ? 200 : 160,
        ranged: false
      };
      if (!this.limbs.armR.attached) { def.dmg *= 0.45; def.active = [T.windup * 1.25, T.windup * 1.25 + 0.14]; def.dur *= 1.25; }
    } else if (name === 'throw') {
      const totalDur = T.windup + T.recover + 0.25;
      def = {
        dur: T.windup + T.recover + 0.25, active: [T.windup + 0.05, T.windup + 0.2],
        dmg: T.dmg, hitstop: 0.05, reach: 0, ranged: true,
        keys: [{ t: 0, p: ENEMY_POSE.throwWind }, { t: T.windup * 0.7, p: ENEMY_POSE.throwWind }, { t: T.windup, p: ENEMY_POSE.throwOut, ease: easeOutCubic }, { t: T.windup + 0.16, p: ENEMY_POSE.throwOut }, { t: totalDur, p: ENEMY_POSE.stand, ease: easeOutQuad }]
      };
    } else if (name === 'slam') {
      def = {
        dur: T.windup + T.recover + 0.2, active: [T.windup, T.windup + 0.2],
        dmg: T.dmg * 1.4, hitstop: 0.12, reach: T.range + 46, arc: 1.8, kb: 420, kbY: -220,
        keys: this.makeSwipeKeys(T.windup, T.recover, true), lunge: 240, shockwave: true
      };
    }
    this.attack = { name, def, t: 0, fired: false, hit: false, lunged: false, trail: false };
    this.state = 'attack';
    this.stateT = 0;
    this.vx = 0;
    this.attack.t = 0;
    Audio_.enemyWarn();
    this.warnFlash = 0.35;
    /* telegraph ring */
    FX.ring(this.x, this.y - 50 * this.scale, 8, 30, 0.3, 'rgba(255,120,80,', 2);
  },

  makeSwipeKeys(wind, rec, slam) {
    const windPose = clonePose(ENEMY_POSE.windup);
    if (slam) { windPose.sword = 3.4; windPose.fh = [-6, -96]; windPose.hipY = -58; }
    const strike = clonePose(ENEMY_POSE.strike);
    return [
      { t: 0, p: windPose },
      { t: wind * 0.85, p: windPose, ease: easeOutQuad },
      { t: wind, p: strike, ease: easeOutCubic },
      { t: wind + 0.16, p: strike },
      { t: wind + 0.16 + rec, p: ENEMY_POSE.stand, ease: easeOutQuad }
    ];
  },

  updateAttack(dt) {
    const a = this.attack;
    const def = a.def;
    a.t += dt;
    const T = this.T;
    if (!a.lunged && a.t >= def.active[0]) {
      a.lunged = true;
      const pdx = Game.player.x - this.x;
      this.facing = sign(pdx || this.facing);
      if (!def.ranged) this.vx = this.facing * (def.lunge || 150);
      else this.spawnOrb();
    }
    if (def.ranged && a.t >= def.active[0] && !a.fired) { a.fired = true; }
    if (!def.ranged) {
      this.x += this.vx * dt;
      this.vx *= Math.pow(0.001, dt);
      this.x = clamp(this.x, 30, WORLD.w - 30);
    }
    /* hit player */
    if (!def.ranged && a.t >= def.active[0] && a.t <= def.active[1] && !a.hit) {
      const hb = this.attackBox();
      if (overlap(hb, Game.player.hurtBox())) {
        const dir = sign(Game.player.x - this.x || this.facing);
        if (Game.player.state === 'parry' && Game.player.parryT > 0) {
          Game.onParry(this);
          a.hit = true;
        } else {
          if (Game.player.takeDamage(def.dmg, dir, {})) a.hit = true;
        }
      }
    }
    /* shockwave */
    if (def.shockwave && !a.shock) {
      a.shock = true;
      setTimeout(() => { }, 0);
    }
    if (a.t >= def.dur) {
      this.state = 'chase';
      this.attack = null;
      TOKEN.holders.delete(this.id);
      this.hasToken = false;
      this.atkCd = rand(T.cooldown[0], T.cooldown[1]) * (Game.wave > 3 ? 0.82 : 1);
    }
  },

  attackBox() {
    const def = this.attack.def;
    const s = this.scale;
    const r = def.reach;
    if (this.facing > 0) return { x: this.x - 10, y: this.y - 100 * s, w: r + 10, h: 100 * s };
    return { x: this.x - r, y: this.y - 100 * s, w: r + 10, h: 100 * s };
  },

  spawnOrb() {
    const side = this.facing;
    const mx = this.x + side * 30 * this.scale, my = this.y - 62 * this.scale;
    Game.orbs.push(new Orb(mx, my, side, this));
    Audio_.swing(0.4);
  },

  updateRibbon(rb, anchor, dt) {
    const pts = rb.pts;
    pts[0].x = anchor.x; pts[0].y = anchor.y;
    for (let i = 1; i < pts.length; i++) {
      const q = pts[i];
      const vx = (q.x - q.px) * 0.84;
      const vy = (q.y - q.py) * 0.84;
      q.px = q.x; q.py = q.y;
      q.x += vx + Math.sin(Game.time * 3 + rb.ph + i) * 30 * dt;
      q.y += vy + 240 * dt * 0.25;
    }
    for (let k = 0; k < 3; k++) {
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        let dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.001;
        const diff = (d - rb.len) / d;
        b.x -= dx * diff; b.y -= dy * diff;
      }
    }
  },

  physics(dt) {
    this.vy += GRAV * dt;
    this.y += this.vy * dt;
    this.x += this.vx * dt;
    if (this.y >= GROUND_Y) {
      if (this.vy > 260) { Audio_.land(); FX.ring(this.x, GROUND_Y - 6, 6, 44, 0.3, 'rgba(210,190,160,', 2); }
      this.y = GROUND_Y; this.vy = 0; this.onGround = true;
    } else this.onGround = false;
    this.vx *= Math.pow(0.35, dt);
    this.x = clamp(this.x, 30, WORLD.w - 30);
  },

  /* ---------- damage ---------- */
  applyDamage(dmg, opts, game) {
    if (!this.alive || this.state === 'spawn') return null;
    const dir = opts.dir || 1;
    const heavy = opts.heavy;
    /* headless bodies take more damage */
    this.hp -= dmg;
    this.flash = 1;
    const result = { broke: [], died: false, limbHp: {} };
    /* choose a limb to damage */
    const target = this.pickLimb(opts.hitY, opts.dir);
    if (target && this.limbs[target].attached) {
      const lm = this.limbs[target];
      const armorMul = this.T.armor && opts.limbDmg < 40 ? 0.55 : 1;
      lm.hp -= opts.limbDmg * armorMul;
      result.limbHp[target] = lm.hp;
      if (lm.hp <= 0) {
        this.severLimb(target, opts, game);
        result.broke.push(target);
      }
    }
    if (this.hp <= 0) { this.die(opts, game); result.died = true; }
    else if (heavy) {
      TOKEN.holders.delete(this.id); this.hasToken = false;
      this.state = 'launched'; this.stateT = 0.3;
      this.vy = opts.kbY ?? -300; this.vx = dir * (opts.kb ?? 300);
      this.attack = null;
    } else {
      TOKEN.holders.delete(this.id); this.hasToken = false;
      this.state = 'hurt'; this.hurtT = clamp(0.10 + dmg * 0.004, 0.1, 0.24);
      this.vx = dir * (opts.kb ?? 120);
      if (this.attack) { this.attack = null; this.atkCd = Math.max(this.atkCd, 0.3); }
    }
    return result;
  },

  pickLimb(hitY, dir) {
    const s = this.scale;
    const rel = typeof hitY === 'number' ? hitY - this.y : -60 * s; /* negative = above ground */
    const weighted = [];
    for (const k of ['armR', 'armL', 'legR', 'legL', 'head']) {
      const lm = this.limbs[k];
      if (!lm.attached) continue;
      let w = 1;
      if (k === 'head') w = rel < -80 * s ? 1.3 : 0.26;
      else if (k === 'armR' || k === 'armL') w = rel < -42 * s ? 1.7 : 0.55;
      else w = rel < -42 * s ? 0.5 : 1.9;
      if (k === 'armR' || k === 'legR') w *= 1.5;
      if (k === 'armL' || k === 'legL') w *= 0.8;
      /* finish what's already wounded — reads as deliberate dismemberment */
      w *= 1 + 2.2 * (1 - clamp(lm.hp / lm.max, 0, 1));
      weighted.push({ k, w });
    }
    if (!weighted.length) return null;
    let total = weighted.reduce((a, b) => a + b.w, 0);
    let r = Math.random() * total;
    for (const it of weighted) { r -= it.w; if (r <= 0) return it.k; }
    return weighted[0].k;
  },

  severLimb(k, opts, game) {
    const lm = this.limbs[k];
    lm.attached = false;
    lm.hp = 0;
    const P = this.currentPose();
    const s = this.scale;
    let anchor, kind = 'arm';
    if (k === 'armR') { anchor = P.elbowF; kind = 'arm'; }
    else if (k === 'armL') { anchor = P.elbowB; kind = 'arm'; }
    else if (k === 'legR') { anchor = P.kneeF; kind = 'leg'; }
    else if (k === 'legL') { anchor = P.kneeB; kind = 'leg'; }
    else { anchor = { x: P.headX, y: P.headY + 6 * s }; kind = 'head'; }
    const dir = opts.dir || 1;
    Game.onLimbBreak(this, k, anchor, dir, opts, kind);
    /* gameplay consequences */
    if (k === 'head') {
      this.hp = Math.min(this.hp, this.maxHp * 0.35);
      this.state = 'stagger'; this.staggerT = 0.9;
      this.atkCd = 1.0;
    } else if (kind === 'leg') {
      if (!this.legsOk) { this.state = 'stagger'; this.staggerT = 1.1; }
      else { this.state = 'stagger'; this.staggerT = 0.5; }
      this.atkCd = Math.max(this.atkCd, 0.5);
      this.vy = Math.min(this.vy, -180);
    } else {
      /* arms: losing your weapon arm weakens attacks */
      this.state = 'stagger'; this.staggerT = 0.55;
      if (!this.armsOk) this.atkCd = 1.2;
    }
    this.attack = null;
  },

  collapse() {
    this.hp = 0;
    this.state = 'dying'; this.stateT = 0.55;
    this.vy = -140; this.vx = -this.facing * 60;
    TOKEN.holders.delete(this.id); this.hasToken = false;
    Audio_.break_();
    Game.hitstop = Math.max(Game.hitstop, 0.08);
    Camera.kick(0.2);
    for (let i = 0; i < 6; i++) FX.parts.push({ type: 'ink', x: this.x + rand(-14, 14), y: this.y - 40 + rand(-20, 20), vx: rand(-120, 120), vy: rand(-160, -40), life: 0.5, max: 0.5, r: rand(1.5, 3), color: '#e8324f', grav: 900, drag: 1 });
    if (!this.counted) { this.counted = true; Game.killCount++; }
  },

  die(opts, game) {
    TOKEN.holders.delete(this.id); this.hasToken = false;
    this.dead = false;
    this.state = 'dying'; this.stateT = 0.0;
    this.hp = 0;
    this.vy = opts?.kbY ?? -260;
    this.vx = (opts?.dir || 1) * (opts?.kb ?? 220);
    Audio_.break_();
  },

  draw(ctx) {
    if (this.dead && this.deadT > 2.0) return;
    const alpha = this.dead ? clamp(1 - (this.deadT - 1.4) / 0.6, 0, 1) : 1;
    if (alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    const P = this.currentPose();
    const T = this.T, s = this.scale, side = this.facing;

    /* spawn warp */
    if (this.state === 'spawn') {
      const t = 1 - this.stateT / 0.55;
      ctx.globalCompositeOperation = 'lighter';
      glowCircle(ctx, this.x, this.y - 50 * s, 80 * (1 - t) + 20, 'rgba(255,90,90,' + (0.5 * (1 - t)) + ')', 1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha * clamp(t * 1.4, 0, 1);
    }

    /* ground shadow */
    ctx.save(); ctx.globalAlpha *= clamp(1 - (GROUND_Y - this.y) / 260, 0.1, 0.45);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(this.x, GROUND_Y + 1, 26 * s, 6, 0, 0, TAU); ctx.fill();
    ctx.restore();

    /* marionette control bar + strings */
    if (!this.dead && this.state !== 'dying') {
      const barY = this.y - 138 * s;
      const barW = 54 * s;
      const barX = this.x + Math.sin(Game.time * 1.4 + this.id) * 3;
      ctx.save();
      /* strings */
      const anchors = [
        { x: P.headX, y: P.headY, a: 1 },
        { x: P.handF.x, y: P.handF.y, a: this.limbs.armR.attached ? 0.9 : 0 },
        { x: P.handB.x, y: P.handB.y, a: this.limbs.armL.attached ? 0.9 : 0 },
        { x: P.kneeF.x, y: P.kneeF.y, a: this.limbs.legR.attached ? 0.55 : 0 },
        { x: P.kneeB.x, y: P.kneeB.y, a: this.limbs.legL.attached ? 0.55 : 0 }
      ];
      const offs = [-barW * 0.8, barW * 0.55, -barW * 0.15, barW * 0.2, -barW * 0.45];
      for (let i = 0; i < anchors.length; i++) {
        const an = anchors[i];
        if (!an.a) continue;
        const sx = barX + offs[i], sy = barY + 3;
        const g = ctx.createLinearGradient(sx, sy, an.x, an.y);
        g.addColorStop(0, 'rgba(60,48,40,0.95)');
        g.addColorStop(0.35, 'rgba(200,190,170,' + (0.55 * an.a) + ')');
        g.addColorStop(1, 'rgba(230,220,200,' + (0.16 * an.a) + ')');
        ctx.strokeStyle = g; ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(an.x, an.y); ctx.stroke();
      }
      /* bar */
      ctx.strokeStyle = '#241a12'; ctx.lineWidth = 5.5 * s; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(barX - barW, barY); ctx.lineTo(barX + barW, barY); ctx.stroke();
      ctx.strokeStyle = '#7a5232'; ctx.lineWidth = 3.4 * s;
      ctx.beginPath(); ctx.moveTo(barX - barW, barY); ctx.lineTo(barX + barW, barY); ctx.stroke();
      /* hanging tassels */
      for (let i = -1; i <= 1; i += 2) {
        ctx.strokeStyle = T.ribbon; ctx.lineWidth = 1.6 * s;
        ctx.beginPath();
        ctx.moveTo(barX + i * barW, barY);
        ctx.quadraticCurveTo(barX + i * barW + Math.sin(Game.time * 3 + i) * 3, barY + 14 * s, barX + i * barW - 2 * i, barY + 26 * s);
        ctx.stroke();
      }
      ctx.restore();
    }

    /* back ribbon + back limbs */
    if (this.ribbonAlive(2)) this.drawRibbon(ctx, this.ribbons[2], T.trim, 0.8);
    if (this.limbs.legL.attached) {
      taperedLimb(ctx, P.hipB.x, P.hipB.y, P.kneeB.x, P.kneeB.y, 12 * s, 9 * s, T.color2);
      taperedLimb(ctx, P.kneeB.x, P.kneeB.y, P.footB.x, P.footB.y, 9 * s, 7 * s, T.color2);
      jointDot(ctx, P.kneeB.x, P.kneeB.y, 3 * s, '#2a2018');
      this.drawPuppetFoot(ctx, P.footB, T.color2, s);
    }
    if (this.limbs.armL.attached) {
      taperedLimb(ctx, P.shB.x, P.shB.y, P.elbowB.x, P.elbowB.y, 10 * s, 8 * s, T.color2);
      taperedLimb(ctx, P.elbowB.x, P.elbowB.y, P.handB.x, P.handB.y, 8 * s, 6 * s, T.color2);
      jointDot(ctx, P.elbowB.x, P.elbowB.y, 3 * s, '#2a2018');
    }

    /* torso */
    const tw = P.p.chestTwist || 0;
    taperedLimb(ctx, P.hipX, P.hipY - 4, P.shoulderX, P.shoulderY, 26 * s, 32 * s, T.color);
    ctx.save();
    /* wooden seam lines on torso */
    ctx.strokeStyle = 'rgba(40,26,16,0.45)'; ctx.lineWidth = 1.2 * s;
    for (let i = 0; i < 3; i++) {
      const k = (i + 1) / 4;
      const x0 = lerp(P.hipX, P.shoulderX, k), y0 = lerp(P.hipY - 4, P.shoulderY, k);
      ctx.beginPath(); ctx.arc(x0, y0 + 3 * s, 8 * s, -0.7, 0.7); ctx.stroke();
    }
    /* chest plate */
    ctx.beginPath();
    ctx.ellipse(lerp(P.hipX, P.shoulderX, 0.66) + side * tw * 4, lerp(P.hipY, P.shoulderY, 0.66), 12 * s, 10 * s, 0, 0, TAU);
    ctx.fillStyle = T.color2; ctx.fill();
    ctx.strokeStyle = T.trim; ctx.lineWidth = 2; ctx.stroke();
    /* waist joint */
    ctx.fillStyle = T.trim;
    ctx.beginPath(); ctx.arc(P.hipX, P.hipY - 2, 6 * s, 0, TAU); ctx.fill();
    ctx.restore();

    /* front leg */
    if (this.limbs.legR.attached) {
      taperedLimb(ctx, P.hipF.x, P.hipF.y, P.kneeF.x, P.kneeF.y, 13 * s, 10 * s, T.color);
      taperedLimb(ctx, P.kneeF.x, P.kneeF.y, P.footF.x, P.footF.y, 10 * s, 7 * s, T.color);
      jointDot(ctx, P.kneeF.x, P.kneeF.y, 3.4 * s, '#2a2018');
      this.drawPuppetFoot(ctx, P.footF, T.color, s);
    }

    /* head */
    if (this.limbs.head.attached) this.drawPuppetHead(ctx, P, side, s, T);
    else {
      /* neck stump with a dark socket and slow ink drip */
      ctx.fillStyle = '#241a12';
      ctx.beginPath(); ctx.ellipse(P.neckX, P.neckY - 2, 5 * s, 3.2 * s, 0, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#e8324f'; ctx.lineWidth = 1.4 * s;
      ctx.beginPath(); ctx.moveTo(P.neckX - 1.5 * s, P.neckY - 1); ctx.lineTo(P.neckX - 2.4 * s, P.neckY + 9 * s); ctx.stroke();
    }

    /* front arm */
    if (this.limbs.armR.attached) {
      taperedLimb(ctx, P.shF.x, P.shF.y, P.elbowF.x, P.elbowF.y, 11 * s, 9 * s, T.color);
      taperedLimb(ctx, P.elbowF.x, P.elbowF.y, P.handF.x, P.handF.y, 9 * s, 7 * s, T.color);
      jointDot(ctx, P.elbowF.x, P.elbowF.y, 3.2 * s, '#2a2018');
      /* blade */
      if (this.T.ranged) {
        ctx.fillStyle = '#ffb37a'; ctx.globalAlpha = alpha * 0.9;
        glowCircle(ctx, P.handF.x, P.handF.y, 16 * s, 'rgba(120,240,255,0.6)', 0.7);
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(P.handF.x, P.handF.y, 5 * s, 0, TAU); ctx.fillStyle = '#dffcff'; ctx.fill();
      } else {
        const sBase = P.swordBase, sTip = P.swordTip;
        ctx.save();
        ctx.strokeStyle = '#3a2a1c'; ctx.lineWidth = 5 * s; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(sBase.x - Math.cos(P.p.sword) * 8 * s * side, sBase.y - Math.sin(P.p.sword) * 8 * s); ctx.lineTo(sBase.x, sBase.y); ctx.stroke();
        blade(ctx, sBase.x, sBase.y, sTip.x, sTip.y, 2.4 * s, false);
        ctx.restore();
      }
    }
    if (this.limbs.armL.attached) {
      /* off-hand throwing coil */
      if (this.T.ranged) {
        ctx.save();
        ctx.strokeStyle = 'rgba(120,240,255,0.7)'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(P.handB.x, P.handB.y, 8 * s + Math.sin(Game.time * 6) * 2, 0, TAU); ctx.stroke();
        ctx.restore();
      }
    }

    /* front ribbons */
    for (let i = 0; i < 2; i++) if (this.ribbonAlive(i)) this.drawRibbon(ctx, this.ribbons[i], T.ribbon);

    /* telegraph flash on front limb during windup */
    if (this.state === 'attack' && this.attack) {
      const a = this.attack;
      const w0 = this.attack.def.active[0];
      if (a.t < w0 && this.limbs.armR.attached) {
        const k = a.t / w0;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        glowCircle(ctx, P.swordTip.x, P.swordTip.y, 18 + k * 26, 'rgba(255,110,70,' + (0.25 + k * 0.55) + ')', 1);
        ctx.restore();
        /* arc guide */
        ctx.save();
        ctx.strokeStyle = 'rgba(255,120,80,' + (0.18 + k * 0.35) + ')';
        ctx.lineWidth = 2 + k * 2;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        const r = this.attack.def.reach * 0.85;
        if (this.facing > 0) ctx.arc(this.x, this.y - 60 * s, r, -1.15, 0.65);
        else ctx.arc(this.x, this.y - 60 * s, r, Math.PI - 0.65, Math.PI + 1.15);
        ctx.stroke();
        ctx.restore();
      }
    }

    /* white hit flash */
    if (this.flash > 0.02) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      glowCircle(ctx, this.x, this.y - 55 * s, 34 * s, 'rgba(255,240,210,1)', this.flash * 0.5 * alpha);
      ctx.restore();
    }
    /* stun stars */
    if ((this.state === 'stagger' || this.state === 'downed') && this.staggerT > 0.25) {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < 3; i++) {
        const a = Game.time * 5 + i * TAU / 3;
        const xx = (this.limbs.head.attached ? P.headX : this.x) + Math.cos(a) * 22;
        const yy = (this.limbs.head.attached ? P.headY : this.y - 70 * s) - 20 + Math.sin(a) * 6;
        glowCircle(ctx, xx, yy, 7, 'rgba(255,220,120,1)', 0.8);
      }
      ctx.restore();
    }
    ctx.restore();

    /* health pip above */
    if (!this.dead && this.state !== 'dying') {
      const w = 54 * s, hpK = clamp(this.hp / this.maxHp, 0, 1);
      const by = this.y - 128 * s;
      ctx.save();
      ctx.fillStyle = 'rgba(8,6,14,0.78)';
      roundRect(ctx, this.x - w / 2 - 1, by - 1, w + 2, 7, 3); ctx.fill();
      ctx.fillStyle = hpK > 0.5 ? '#e7c07a' : hpK > 0.25 ? '#ff9a4a' : '#ff4a5e';
      roundRect(ctx, this.x - w / 2, by + 0.5, w * hpK, 4.5, 2); ctx.fill();
      /* limb damage pips */
      const keys = ['armR', 'armL', 'legR', 'legL', 'head'];
      for (let i = 0; i < keys.length; i++) {
        const lm = this.limbs[keys[i]];
        const px = this.x - 18 * s + i * 9 * s;
        ctx.fillStyle = lm.attached ? 'rgba(200,190,220,0.55)' : 'rgba(255,60,70,0.9)';
        ctx.beginPath(); ctx.arc(px, by - 5, 2 * s + 0.4, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }
  },

  ribbonAlive(i) {
    if (i === 0) return this.limbs.head.attached;
    if (i === 1) return this.limbs.armR.attached;
    return true;
  },
  drawRibbon(ctx, rb, color, widthMul = 1) {
    const pts = rb.pts;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < pts.length - 1; i++) {
        const w = lerp(3.4, 0.7, i / (pts.length - 1)) * widthMul * (pass === 0 ? 1.8 : 1);
        taperedLimb(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y, w, w * 0.8, pass === 0 ? '#1a0d12' : color, null);
      }
    }
  },
  drawPuppetFoot(ctx, f, color, s) {
    ctx.fillStyle = color;
    roundRect(ctx, f.x - 6 * s, f.y - 7 * s, 17 * s, 9 * s, 3 * s); ctx.fill();
    ctx.strokeStyle = '#1d1610'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.strokeStyle = 'rgba(40,26,16,0.6)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(f.x + 2 * s, f.y - 6 * s); ctx.lineTo(f.x + 2 * s, f.y + 1 * s); ctx.stroke();
  },
  drawPuppetHead(ctx, P, side, s, T) {
    const hx = P.headX, hy = P.headY;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(P.p.head * 0.35 * side + 0.06);
    /* head block */
    ctx.fillStyle = T.color;
    roundRect(ctx, -10 * s, -11 * s, 20 * s, 22 * s, 5 * s); ctx.fill();
    ctx.strokeStyle = '#1d1610'; ctx.lineWidth = 2; ctx.stroke();
    /* hair/rag */
    ctx.fillStyle = T.trim;
    ctx.beginPath();
    ctx.moveTo(-11 * s, -6 * s);
    ctx.quadraticCurveTo(0, -16 * s, 11 * s, -6 * s);
    ctx.lineTo(10 * s, -10 * s);
    ctx.quadraticCurveTo(0, -19 * s, -10 * s, -10 * s);
    ctx.fill();
    /* mask plate */
    ctx.fillStyle = T.mask;
    roundRect(ctx, -8 * s + side * 1.2 * s, -5 * s, 15 * s, 12 * s, 3 * s); ctx.fill();
    ctx.strokeStyle = 'rgba(40,30,20,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
    /* eyes */
    const eyeGlow = (this.state === 'attack' || this.state === 'spawn') ? 1 : 0.65;
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    glowCircle(ctx, side * 4.6 * s, 0.6 * s, 7 * s, 'rgba(255,80,60,' + (0.6 * eyeGlow) + ')', 1);
    ctx.restore();
    ctx.fillStyle = T.eye;
    ctx.beginPath(); ctx.ellipse(side * 4.2 * s, 0.2 * s, 2.4 * s, 1.8 * s, 0, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(side * -1.6 * s, 0.2 * s, 1.7 * s, 1.6 * s, 0, 0, TAU); ctx.fill();
    /* crack line */
    if (this.hp < this.maxHp * 0.5) {
      ctx.strokeStyle = 'rgba(30,20,14,0.8)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(-2 * s, -5 * s); ctx.lineTo(1 * s, -1 * s); ctx.lineTo(-1 * s, 3 * s); ctx.stroke();
    }
    /* neck peg */
    ctx.fillStyle = '#2a2018';
    ctx.beginPath(); ctx.arc(0, 11 * s, 3.4 * s, 0, TAU); ctx.fill();
    ctx.restore();
  }
};
Object.assign(Puppet.prototype, PUPPET_PROTO);
