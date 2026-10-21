/* =========================================================
   Enemies — 傀儡 (puppets) with severable rig segments
   Segments: head, armF, armB, legF, legB
   ========================================================= */

const RIG = {
  armU: 22, armL: 21, thigh: 27, shin: 27, spine: 32, neck: 12,
};

// floating debris pieces spawned on sever
function spawnFlyingLimb(seg, world, opt = {}) {
  const piece = {
    kind: 'limb',
    seg: seg.name,
    x: seg.x, y: seg.y,
    vx: seg.vx * 0.4 + rnd(240, -60) + (opt.dirX || 0) * 220,
    vy: rnd(-380, -120),
    rot: seg.ang || 0,
    vrot: rnd(16, -16),
    w: seg.w || 12, len: seg.len || 28,
    color: seg.color || '#3a2a22',
    accent: seg.accent || '#8a3020',
    t: 0, life: 2.0, grounded: false, bounces: 0,
  };
  Debris.add(piece);
  return piece;
}

const Debris = {
  list: [],
  reset() { this.list.length = 0; },
  add(p) { p.id = ++Debris.uid; this.list.push(p); if (this.list.length > 40) this.list.shift(); },
  uid: 0,
  update(dt) {
    for (const p of this.list) {
      p.t += dt;
      p.vy += WORLD.gravity * 0.9 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      const gy = WORLD.groundY;
      if (p.y > gy - 6 && p.vy > 0) {
        p.y = gy - 6;
        p.vy *= -0.35;
        p.vx *= 0.65;
        p.vrot *= 0.5;
        p.bounces++;
        if (p.bounces === 1) {
          FX.dust(p.x, gy, 3, 0.5);
          FX.blood(p.x, gy - 4, sign(p.vx), 3, 0.6);
        }
        if (Math.abs(p.vy) < 40) { p.vy = 0; p.vx *= 0.8; p.vrot *= 0.7; }
      }
      if (p.x < WORLD.left - 40 || p.x > WORLD.right + 40) p.vx *= -0.5;
    }
    this.list = this.list.filter(p => p.t < 8);
  },
  draw(ctx) {
    for (const p of this.list) {
      const a = p.t > 7 ? 1 - (p.t - 7) : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      drawLimbShape(ctx, p.seg, p.w, p.len, p.color, p.accent, 1);
      ctx.restore();
    }
  },
};

function drawLimbShape(ctx, seg, w, len, color, accent, k) {
  ctx.lineCap = 'round';
  if (seg === 'head') {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(0, 0, w * 0.62, w * 0.72, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = accent;
    ctx.beginPath(); ctx.arc(-w * 0.18, -w * 0.12, w * 0.11, 0, TAU); ctx.fill();
    // mask
    ctx.fillStyle = '#d9cdb6';
    ctx.beginPath(); ctx.ellipse(w * 0.22, w * 0.02, w * 0.42, w * 0.55, 0, 0, TAU); ctx.fill();
    return;
  }
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.roundRect ? ctx.roundRect(-len / 2, -w / 2, len, w, w * 0.45) : ctx.rect(-len / 2, -w / 2, len, w);
  ctx.fill();
  // joint cap at -len/2
  ctx.fillStyle = accent;
  ctx.beginPath(); ctx.arc(-len / 2 + w * 0.25, 0, w * 0.55, 0, TAU); ctx.fill();
  // string marks
  ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(-len / 4, -w / 2); ctx.lineTo(-len / 4, w / 2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(len / 4, -w / 2); ctx.lineTo(len / 4, w / 2); ctx.stroke();
}

// ---------------------------------------------------------
class Enemy {
  constructor(type, x, y) {
    this.id = ++Enemy.uid;
    this.type = type;
    this.x = x; this.y = y;
    this.vx = 0; this.vy = 0; this.kvx = 0;
    this.facing = 1;
    this.dead = false; this.dying = false;
    this.hitFlash = 0; this.white = 0;
    this.t = rnd(10);
    this.state = 'idle'; this.stateT = 0;
    this.attackCd = rnd(1.6, 0.4);
    this.stagger = 0;
    this.kbRes = 1;
    this.ground = true;
    this.seed = rnd(100);
    this.lastHitDir = 1;
    this.hpFlash = 0;
    this.stunAccum = 0;
    this.spawnT = 0.5;
    this.animPhase = rnd(TAU);
    this.deathT = 0;
    this.alpha = 1;
    this.broken = 0;        // how many limbs lost
    this.aggression = 0.5 + Math.random() * 0.5;
    this.canAct = true;
    this.poiseBroken = 0;
    this.chainCount = 0;
    this.legBleed = 0;

    this.segs = {};
    this.setupType(type);
  }

  setupType(type) {
    const T = this.type;
    if (T === 'husk') {
      this.maxHp = 46; this.hp = 46;
      this.walkSpd = 130; this.scale = 0.92;
      this.hgt = 120; this.bodyW = 40; this.halfW = 26;
      this.attackName = '挥斩';
      this.color = '#4a3830'; this.accent = '#c0562c'; this.cloth = '#5a3a2c';
      this.limbColors = ['#5a4032', '#86603f', '#2e211a'];
      this.segSeq = ['legB', 'legF', 'armB', 'armF', 'head'];
      this.baseDmg = 9;
      this.speed = 1.0;
    } else if (T === 'spinner') {
      this.maxHp = 78; this.hp = 78;
      this.walkSpd = 95; this.scale = 1.14;
      this.hgt = 146; this.bodyW = 52; this.halfW = 32;
      this.attackName = '旋回斩';
      this.color = '#3a3946'; this.accent = '#93b0c6'; this.cloth = '#4a2b3c';
      this.limbColors = ['#4a4656', '#78839a', '#25242c'];
      this.segSeq = ['legB', 'legF', 'armB', 'armF', 'head'];
      this.baseDmg = 12;
      this.speed = 0.8;
    } else { // 'slammer'
      this.maxHp = 170; this.hp = 170;
      this.walkSpd = 72; this.scale = 1.42;
      this.hgt = 176; this.bodyW = 66; this.halfW = 40;
      this.attackName = '重锤';
      this.color = '#4a3728'; this.accent = '#c86a28'; this.cloth = '#54381f';
      this.limbColors = ['#5a4532', '#94683f', '#2a1e16'];
      this.segSeq = ['legB', 'legF', 'armB', 'armF', 'head'];
      this.baseDmg = 18;
      this.speed = 0.6;
      this.kbRes = 0.55;
    }

    const S = this.scale;
    const segs = {
      head: { name: 'head', hp: 34, lost: false, x: this.x, y: this.y - this.hgt + 10, ang: 0, w: 26 * S, len: 22 * S, color: this.limbColors[0], accent: this.accent, vx: 0, vy: 0 },
      armF: { name: 'armF', hp: 46, lost: false, x: this.x, y: this.y - this.hgt * 0.62, ang: 1.2, w: 13 * S, len: 26 * S, color: this.limbColors[1], accent: this.accent, vx: 0, vy: 0 },
      armB: { name: 'armB', hp: 46, lost: false, x: this.x, y: this.y - this.hgt * 0.62, ang: 1.6, w: 12 * S, len: 26 * S, color: this.limbColors[1], accent: this.accent, vx: 0, vy: 0 },
      legF: { name: 'legF', hp: 42, lost: false, x: this.x, y: this.y - this.hgt * 0.28, ang: 1.5, w: 15 * S, len: 32 * S, color: this.limbColors[0], accent: this.accent, vx: 0, vy: 0 },
      legB: { name: 'legB', hp: 42, lost: false, x: this.x, y: this.y - this.hgt * 0.28, ang: 1.6, w: 14 * S, len: 32 * S, color: this.limbColors[0], accent: this.accent, vx: 0, vy: 0 },
    };
    if (T === 'slammer') { segs.armF.hp = 70; segs.armB.hp = 70; segs.head.hp = 52; }
    this.segs = segs;
    this.totalSegHp = Object.values(segs).reduce((a, s) => a + s.hp, 0);
  }

  get headLost() { return this.segs.head.lost; }
  get armFLost() { return this.segs.armF.lost; }
  get armBLost() { return this.segs.armB.lost; }
  get legFLost() { return this.segs.legF.lost; }
  get legBLost() { return this.segs.legB.lost; }
  get legsLost() { return (this.segs.legF.lost ? 1 : 0) + (this.segs.legB.lost ? 1 : 0); }
  get armsLost() { return (this.segs.armF.lost ? 1 : 0) + (this.segs.armB.lost ? 1 : 0); }
  get alive() { return !this.dead && !this.dying; }

  bodyRect() {
    const h = this.hgt * (this.crouchPose ? 0.72 : 1);
    return {
      x: this.x - this.halfW, y: this.y - h,
      w: this.halfW * 2, h: h,
    };
  }

  hitTest(hb, player) {
    if (this.dying) return false;
    // capsule style test against body + head
    const cx = clamp(hb.x, this.x - this.halfW, this.x + this.halfW);
    const top = this.y - this.hgt;
    const cy = clamp(hb.y, top + 6, this.y - 6);
    const dx = hb.x - cx, dy = hb.y - cy;
    // generous arc
    if (dx * dx + dy * dy < (hb.r * 0.9) * (hb.r * 0.9)) return true;
    // extended body check
    const bx = Math.abs(hb.x - this.x), by = Math.abs(hb.y - (this.y - this.hgt * 0.5));
    return bx < this.halfW + hb.r * 0.72 && by < this.hgt * 0.5 + hb.r * 0.4;
  }

  // choose which segment the hit lands on (spatial)
  pickSegment(hb) {
    const S = this.scale;
    const relY = hb.y - (this.y - this.hgt);
    const yNorm = relY / this.hgt;
    const sideFront = (hb.x - this.x) * this.facing > 0;
    if (yNorm < 0.2) return 'head';
    if (yNorm < 0.65) return sideFront ? 'armF' : 'armB';
    return sideFront ? 'legF' : 'legB';
  }

  takeHit(hit, game) {
    if (this.dying || this.dead) return null;
    const dmgMul = this.hitFlash > 0 ? 0.6 : 1;
    let dmg = hit.dmg * dmgMul;
    this.hp -= dmg;
    this.hitFlash = 0.09;
    this.animPhase = 0;
    const dirX = hit.dirX || sign(this.x - hit.px || 1);
    this.lastHitDir = dirX;
    this.lastHitPos = { x: hit.px, y: hit.py };

    const segName = this.pickSegment({ x: hit.px, y: hit.py, r: 40 });
    const seg = this.segs[segName];
    let severed = false;

    if (!seg.lost && seg) {
      seg.hp -= hit.dmg * (hit.heavy ? 1.5 : 1) * (0.85 + Math.random() * 0.3);
      if (seg.hp <= 0) {
        severed = this.severSegment(seg, dirX, game, hit);
      }
    }

    // stagger / knockback
    const kbAmount = hit.kb * this.kbRes / (1 + this.armsLost * 0.25);
    const wasStaggered = this.stagger > 0;
    if (!this.dead) {
      this.kvx += dirX * kbAmount * 0.62;
      if (hit.up) { this.vy = Math.min(this.vy, hit.up * this.kbRes * 0.9); this.ground = false; }
      this.stagger = Math.max(this.stagger, hit.heavy ? 0.3 : 0.14);
      // interrupt attacks on heavy hit or sever
      if ((hit.heavy || severed || Math.random() < 0.3) && this.state !== 'stagger') {
        this.state = 'stagger'; this.stateT = 0; this.stunAccum = 0;
        this.telegraphDone = false;
      }
    }

    // impact FX
    const power = hit.heavy ? 1.5 : 1;
    FX.sparks(hit.px, hit.py, dirX, power * (severed ? 1.6 : 1));
    FX.blood(hit.px, hit.py, dirX, severed ? 10 : 5, 0.8 + power * 0.3);

    if (severed) {
      game.limbBreakCount++;
      game.severCount = (game.severCount || 0) + 1;
      FX.threadBurst(hit.px, hit.py, 14, 1.3);
      FX.debris(hit.px, hit.py, 8, dirX, ['#3a2a22', '#8d3a22', '#e8dcc4']);
      FX.ring(hit.px, hit.py, 6, 210, '#fff1cc', 0.24, 2.4);
      Sfx.sever();
      Sfx.echo();
      const label = { head: '斩首', armF: '断臂', armB: '断臂', legF: '断腿', legB: '断腿' }[segName];
      FX.text(this.x, this.y - this.hgt - 16, label + '!', {
        size: 26, color: '#fff0cc', glow: 'rgba(255,80,30,.95)', life: 0.7, vy: -50,
      });
      game.comboBonus = Math.min(1.4, (game.comboBonus || 0) + 0.12);
    }

    if (this.hp <= 0 && !this.dying) this.die(game, dirX);

    return { severed, dmg };
  }

  severSegment(seg, dirX, game, hit) {
    seg.lost = true;
    this.broken++;
    const piece = spawnFlyingLimb(seg, this, { dirX });
    // extra gore burst
    FX.threadBurst(seg.x, seg.y, 8, 0.8);
    FX.add({ kind: 'flash', x: seg.x, y: seg.y, life: 0.12, size: 34, color: '#ffe6c0' });
    return true;
  }

  die(game, dirX) {
    this.dying = true;
    this.deathT = 0;
    this.vx = dirX * 240;
    this.vy = -260;
    Sfx.kill();
    game.kills++;
    game.comboBonus = Math.min(1.5, (game.comboBonus || 0) + 0.25);
    FX.ring(this.x, this.y - this.hgt * 0.5, 10, 300, '#ffd9a0', 0.4, 2.5);
    // shred into threads
    FX.threadBurst(this.x, this.y - this.hgt * 0.5, 14, 1.2);
    // encore: surviving limbs fly off
    for (const s of Object.values(this.segs)) {
      if (!s.lost && Math.random() < 0.6) {
        s.lost = true;
        spawnFlyingLimb(s, this, { dirX: dirX * 0.7 });
      }
    }
    if (this.type === 'slammer') Camera.addShake(5);
  }

  update(dt, game) {
    this.t += dt;
    this.hitFlash = Math.max(0, this.hitFlash - dt);
    this.white = Math.max(0, this.white - dt * 4);
    this.hpFlash = Math.max(0, this.hpFlash - dt);

    if (this.dying) {
      this.deathT += dt;
      this.vy += WORLD.gravity * dt;
      this.x += this.vx * dt; this.y += this.vy * dt;
      if (this.y > WORLD.groundY) { this.y = WORLD.groundY; this.vy = 0; this.vx *= 0.85; }
      this.alpha = clamp(1 - (this.deathT - 0.5) / 0.6, 0, 1);
      if (this.deathT > 1.2) this.dead = true;
      return;
    }

    if (this.spawnT > 0) { this.spawnT -= dt; return; }

    const P = game.player;
    const dx = P.x - this.x;
    const dist = Math.abs(dx);
    const dirToP = sign(dx || 1);

    this.stagger = Math.max(0, this.stagger - dt);
    this.attackCd = Math.max(0, this.attackCd - dt);
    this.stateT += dt;

    // hidden per-enemy AI tuning
    const hpFrac = this.hp / this.maxHp;
    const enraged = hpFrac < 0.4;

    // ---- state machine ----
    if (this.state === 'stagger') {
      if (this.stateT > 0.3) { this.state = 'recover'; this.stateT = 0; }
      this.vx *= Math.pow(0.02, dt);
    } else if (this.state === 'recover') {
      if (this.stateT > 0.25) { this.state = 'chase'; this.stateT = 0; }
      this.vx *= Math.pow(0.05, dt);
    } else if (this.state === 'telegraph') {
      const teleDur = this.teleDur;
      this.vx *= Math.pow(0.02, dt);
      this.kvx *= Math.pow(0.05, dt);
      if (this.stateT >= teleDur) {
        this.state = 'attack'; this.stateT = 0;
        this.didAttack = false;
        this.facing = dirToP;
        Sfx.swing(this.type === 'slammer' ? 'heavy' : 'light');
      }
    } else if (this.state === 'attack') {
      this.updateAttackState(dt, game, P, dist);
    } else if (this.state === 'chase' || this.state === 'idle') {
      this.updateChase(dt, game, P, dist, dirToP, enraged);
    }

    // physics
    this.vy += WORLD.gravity * dt;
    this.kvx *= Math.pow(0.008, dt * 3);
    if (Math.abs(this.kvx) < 2) this.kvx = 0;
    this.x += (this.vx + this.kvx) * dt;
    this.y += this.vy * dt;
    if (this.y >= WORLD.groundY) {
      if (!this.ground) { this.y = WORLD.groundY; this.vy = 0; this.ground = true; this.vx *= 0.4; FX.dust(this.x, WORLD.groundY, 5, 0.7); }
      else { this.y = WORLD.groundY; this.vy = 0; }
    } else {
      this.ground = false;
    }
    const hw = this.halfW;
    if (this.x < WORLD.left + hw) this.x = WORLD.left + hw;
    if (this.x > WORLD.right - hw) this.x = WORLD.right - hw;

    // pose / animation
    this.updatePose(dt);
    // update segment world positions for FX targeting
    const headY = this.y - this.hgt + 16 * this.scale;
    this.segs.head.x = this.x + this.facing * 4; this.segs.head.y = headY;
    this.segs.armF.x = this.x + this.facing * 18 * this.scale; this.segs.armF.y = this.y - this.hgt * 0.6;
    this.segs.armB.x = this.x - this.facing * 8; this.segs.armB.y = this.y - this.hgt * 0.6;
    this.segs.legF.x = this.x + this.facing * 8; this.segs.legF.y = this.y - 22;
    this.segs.legB.x = this.x - this.facing * 8; this.segs.legB.y = this.y - 22;
  }

  updateChase(dt, game, P, dist, dirToP, enraged) {
    this.state = 'chase';
    const legs = this.legsLost;
    const mySpd = this.walkSpd * (legs >= 2 ? 0.22 : legs === 1 ? 0.55 : 1) * (enraged ? 1.22 : 1) * this.speed;
    if (this.headLost) this.wobbleSpeed = 1;
    if (this.headLost) {
      // headless: wanders and flails, slower at turning
      this.facing = Math.abs(P.x - this.x) > 30 ? dirToP : this.facing;
    } else {
      this.facing = dirToP;
    }
    const reach = this.attackRange();
    const wantApproach = dist > reach * 0.72;
    if (!this.canAct) { this.vx *= 0.9; return; }
    if (wantApproach) {
      // slight per-enemy lateral preference so the pack doesn't stack into one pixel
      const side = (this.id % 3 - 1) * 14;
      const targetV = dirToP * mySpd;
      this.vx += (targetV - this.vx) * Math.min(1, dt * 9);
      if (dist < 220) this.vx = targetV * 0.9;
      this.state = 'chase';
    } else {
      this.vx *= Math.pow(0.02, dt);
      // in range: attack if ready
      if (this.attackCd <= 0 && this.ground && this.stagger <= 0 && !P.dead) {
        this.startTelegraph(game, dist);
      }
    }
    // sometimes circle / back off to make pockets
    if (dist < reach * 0.52 && this.attackCd > 0.3 && Math.random() < 0.006) {
      this.vx = -dirToP * mySpd * 1.2;
    }
    // stacked enemies push apart (simple)
    for (const o of game.enemies) {
      if (o === this || o.dead || o.dying) continue;
      const od = this.x - o.x;
      if (Math.abs(od) < this.halfW + o.halfW) {
        this.vx += sign(od || 1) * 40 * dt * 60 * 0.016;
      }
    }
  }

  attackRange() {
    if (this.type === 'slammer') return 128;
    if (this.type === 'spinner') return 96;
    return 82;
  }

  startTelegraph(game, dist) {
    this.state = 'telegraph'; this.stateT = 0;
    this.telegraphDone = false;
    this.teleDur = this.type === 'slammer' ? 0.62 : this.type === 'spinner' ? 0.42 : 0.34;
    if (this.headLost) this.teleDur *= 1.35;
    this.attackDir = this.facing;
    this.telegraphX = this.x;
    Sfx.telegraph();
    if (this.type === 'slammer') {
      FX.text(this.x, this.y - this.hgt - 20, '!', { size: 30, color: '#ffb35c', glow: 'rgba(255,120,40,1)', life: 0.5 });
    }
  }

  updateAttackState(dt, game, P, dist) {
    const spdFactor = this.legsLost >= 2 ? 0.55 : 1;
    if (this.type === 'husk') {
      const dur = 0.34 / spdFactor;
      if (this.stateT < dur) {
        this.vx = this.facing * 210;
      } else {
        this.state = 'recover'; this.stateT = 0;
        this.attackCd = rnd(2.1, 1.1) * this.aggression;
        this.vx *= 0.2;
      }
      if (!this.didAttack && this.stateT > 0.06 && this.stateT < 0.2) {
        this.didAttack = true;
        this.performAttack(game, P, 92, 26);
      }
    } else if (this.type === 'spinner') {
      const dur = 0.5 / spdFactor;
      if (this.stateT < dur) {
        this.vx = this.facing * 150;
        // multi hit spin: 3 ticks
        if (!this.spinTicks) this.spinTicks = 0;
        if (this.spinTicks < 3 && this.stateT > 0.06 + this.spinTicks * 0.11) {
          this.spinTicks++;
          this.performAttack(game, P, 100, 22, true);
        }
      } else {
        this.spinTicks = 0;
        this.state = 'recover'; this.stateT = 0;
        this.attackCd = rnd(1.8, 0.9) * this.aggression;
        this.vx *= 0.15;
      }
    } else { // slammer
      const dur = 0.72 / spdFactor;
      if (this.stateT < dur * 0.42) {
        // raise arms
        this.vx *= 0.9;
      } else if (this.stateT < dur * 0.62) {
        this.vx = this.facing * 190;
      } else if (!this.didAttack) {
        this.didAttack = true;
        this.performAttack(game, P, 132, 34, false, true);
        FX.shock(this.x + this.facing * 56, WORLD.groundY, this.facing, 1.2);
        FX.dust(this.x + this.facing * 56, WORLD.groundY, 14, 1.2);
        Camera.addShake(6.5);
        Sfx.slam();
      }
      if (this.stateT >= dur) {
        this.state = 'recover'; this.stateT = 0;
        this.attackCd = rnd(2.4, 1.4) * this.aggression;
      }
    }
  }

  performAttack(game, P, reach, dmg, spin, slam) {
    const px = this.x + this.facing * reach * 0.5;
    const py = this.y - this.hgt * 0.45;
    const hb = { x: px, y: py, r: reach * 0.55 };
    const dx = P.x - px, dy = P.y - 40 - py;
    // visual slash
    FX.slashFx(px, py, (spin ? 0.0 : 0.55) * this.facing, reach * 0.9, this.facing,
      { color: this.type === 'slammer' ? '#ffd0a0' : '#cdb4ff', tint: '#ffffff', life: 0.18, w: 1.1 });
    if (Math.abs(P.x - px) < reach * 0.62 + 18 && Math.abs((P.y - 50) - py) < this.hgt * 0.6 + 40) {
      if (this.armFLost && this.armBLost) {
        // headless flailing doesn't damage
      } else {
        let out = dmg * (this.armsLost ? 0.55 : 1);
        if (this.segs.armF.lost) out *= 0.8;
        const dealt = P.takeDamage(out, this.facing, game);
        if (dealt) game.enemyHitCount++;
      }
    }
  }

  // ---------------- pose / drawing ----------------
  updatePose(dt) {
    const s = this.segs;
    const T = this.t;
    this.animPhase += dt * (this.state === 'chase' ? 6 * this.speed : 2);
    if (this.headLost) {
      // twitchy, erratic motion
      this.wobble = Math.sin(T * 17) * 0.16 + Math.sin(T * 7.3) * 0.24;
    } else {
      this.wobble = Math.sin(T * 2.2 + this.seed) * 0.03;
    }
  }

  draw(ctx, game) {
    if (this.alpha <= 0) return;
    // hit flash: temporarily brighten the palette so the whole body pops white-hot
    let savedColors = null;
    if (this.hitFlash > 0) {
      savedColors = { color: this.color, accent: this.accent, limbColors: this.limbColors.slice() };
      const k = clamp(this.hitFlash / 0.09, 0, 1);
      const mix = (hex, t) => {
        const h = hex.replace('#', '');
        if (h.length < 6) return '#ffffff';
        const r = parseInt(h.substr(0, 2), 16), gg = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
        const m = (v) => Math.round(v + (255 - v) * t);
        return `rgb(${m(r)},${m(gg)},${m(b)})`;
      };
      this.color = mix(savedColors.color, 0.8 * k);
      this.limbColors = savedColors.limbColors.map(c => mix(c, 0.85 * k));
      this.accent = mix(savedColors.accent, 0.6 * k);
    }
    const S = this.scale;
    const H = this.hgt;
    const d = this.facing;
    const isHusk = this.type === 'husk';
    const isSpin = this.type === 'spinner';
    const isSlam = this.type === 'slammer';

    ctx.save();
    ctx.globalAlpha = this.alpha;
    ctx.translate(this.x, this.y);

    // shadow
    const airH = clamp((WORLD.groundY - this.y) / 200, 0, 1);
    ctx.save(); ctx.globalAlpha = 0.42 * this.alpha * (1 - airH * 0.5);
    ctx.fillStyle = '#000';
    ctx.beginPath(); ctx.ellipse(0, WORLD.groundY - this.y + 2, this.halfW * 1.3, 8, 0, 0, TAU); ctx.fill();
    ctx.restore();

    ctx.scale(S * d, S);

    // ---- assemble limb pose (local, facing right) ----
    const stag = this.stagger > 0 ? this.stagger : 0;
    const atkPhase = this.state === 'attack' ? this.stateT : -1;
    const tele = this.state === 'telegraph';
    const teleK = tele ? clamp(this.stateT / this.teleDur, 0, 1) : 0;
    const legOffF = Math.sin(this.animPhase) * 10;
    const legOffB = -Math.sin(this.animPhase) * 10;
    let lean = this.headLost ? -0.25 + this.wobble : 0.06 + (this.state === 'chase' ? 0.06 : 0);
    if (stag > 0) lean -= 0.35;
    if (tele) lean += 0.12 + teleK * 0.12;
    let crouch = stag > 0 ? 6 : 0;
    if (this.legsLost >= 1) crouch += 10;
    if (this.legsLost >= 2) crouch += 22;
    if (isSlam) crouch += 4;

    const hipY = -62 + crouch;
    const hip = { x: 0, y: hipY };
    const spineAng = -Math.PI / 2 + lean;
    const chest = { x: hip.x + Math.cos(spineAng) * RIG.spine * (isSlam ? 1.15 : isHusk ? 0.95 : 1), y: hip.y + Math.sin(spineAng) * RIG.spine * (isSlam ? 1.15 : isHusk ? 0.95 : 1) };
    const neck = { x: chest.x + Math.cos(spineAng) * 10, y: chest.y + Math.sin(spineAng) * 10 };

    // base angles
    let armF = 1.35, armB = 1.65;
    let legF = 1.5 + (this.legFLost ? 0.4 : 0) + legOffF * 0.03;
    let legB = 1.6 + (this.legBLost ? 0.4 : 0) + legOffB * 0.03;
    let kneeFAng = 1.62, kneeBAng = 1.68;
    let shF = 1.35, elF = 1.55, shB = 1.65, elB = 1.8;

    if (tele) {
      shF = lerp(2.4, 2.9, teleK); elF = lerp(2.7, 3.2, teleK);
      shB = lerp(1.1, 0.9, teleK); elB = lerp(0.9, 0.7, teleK);
    } else if (atkPhase >= 0) {
      const k = clamp(atkPhase / (this.type === 'slammer' ? 0.45 : 0.3), 0, 1);
      if (isSlam) {
        shF = lerp(-2.5, 0.7, Ease.inCubic(k)); elF = lerp(-2.2, 0.3, Ease.inCubic(k));
        shB = lerp(-2.3, 0.55, Ease.inCubic(k)); elB = lerp(-2.0, 0.45, Ease.inCubic(k));
      } else if (isSpin) {
        shF = lerp(2.9, 0.2, Ease.inOutQuad(k)); elF = lerp(3.2, 0.1, Ease.inOutQuad(k));
        shB = lerp(0.5, 2.6, Ease.inOutQuad(k)); elB = lerp(0.3, 3.0, Ease.inOutQuad(k));
      } else {
        shF = lerp(2.7, 0.3, Ease.inCubic(k)); elF = lerp(3.0, 0.1, Ease.inCubic(k));
        shB = lerp(1.0, 2.3, Ease.inCubic(k)); elB = lerp(0.8, 2.6, Ease.inCubic(k));
      }
    } else if (this.state === 'chase') {
      shF = 1.5 + Math.sin(this.animPhase) * 0.5;
      elF = 1.7 + Math.sin(this.animPhase) * 0.4;
      shB = 1.5 - Math.sin(this.animPhase) * 0.5;
      elB = 1.7 - Math.sin(this.animPhase) * 0.4;
      if (this.headLost) { shF = 2.2 + this.wobble; elF = 2.6; shB = 0.6 - this.wobble; elB = 0.4; }
    } else if (this.headLost) {
      shF = 2.4 + this.wobble * 2; elF = 2.8; shB = 0.5 - this.wobble * 2; elB = 0.3;
    }

    const shFp = { x: chest.x + 4, y: chest.y + 4 };
    const shBp = { x: chest.x - 4, y: chest.y + 5 };
    const elbF = { x: shFp.x + Math.cos(shF) * RIG.armU * S / this.scale, y: shFp.y + Math.sin(shF) * RIG.armU * S / this.scale };
    const handF = { x: elbF.x + Math.cos(elF) * RIG.armL, y: elbF.y + Math.sin(elF) * RIG.armL };
    const elbB = { x: shBp.x + Math.cos(shB) * RIG.armU, y: shBp.y + Math.sin(shB) * RIG.armU };
    const handB = { x: elbB.x + Math.cos(elB) * RIG.armL, y: elbB.y + Math.sin(elB) * RIG.armL };

    const hipFp = { x: 3, y: hip.y + 2 };
    const hipBp = { x: -4, y: hip.y + 2 };
    const kneeFJ = { x: hipFp.x + Math.cos(legF) * RIG.thigh, y: hipFp.y + Math.sin(legF) * RIG.thigh };
    const footFJ = { x: kneeFJ.x + Math.cos(kneeFAng) * RIG.shin, y: kneeFJ.y + Math.sin(kneeFAng) * RIG.shin };
    const kneeBJ = { x: hipBp.x + Math.cos(legB) * RIG.thigh, y: hipBp.y + Math.sin(legB) * RIG.thigh };
    const footBJ = { x: kneeBJ.x + Math.cos(kneeBAng) * RIG.shin, y: kneeBJ.y + Math.sin(kneeBAng) * RIG.shin };

    // -------- draw back limbs --------
    if (!this.segs.legB.lost) {
      this.limb(ctx, hipBp, kneeBJ, 17, 13, this.limbColors[0], true);
      this.limb(ctx, kneeBJ, footBJ, 13, 9, this.limbColors[2] !== undefined ? this.limbColors[0] : this.limbColors[0], true);
    }
    if (!this.segs.armB.lost) {
      this.limb(ctx, shBp, elbB, 14, 11, this.limbColors[0], true);
      this.limb(ctx, elbB, handB, 11, 8, this.limbColors[1], true);
    }

    // -------- torso --------
    this.drawTorso(ctx, hip, chest, neck, lean, isSlam);

    // joint rings (glowing sockets) make the segmented build obvious
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const jc = this.type === 'slammer' ? 'rgba(255,140,60,' : this.type === 'spinner' ? 'rgba(160,220,255,' : 'rgba(255,110,80,';
    for (const [pt, rr] of [[shFp, 6.5], [shBp, 5.5], [hipFp, 7], [hipBp, 6], [elbF, 5], [kneeFJ, 5.5]]) {
      ctx.fillStyle = jc + (0.12 + Math.sin(this.t * 5 + pt.x) * 0.05) + ')';
      ctx.beginPath(); ctx.arc(pt.x, pt.y, rr * 1.9, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // -------- front limbs --------
    if (!this.segs.legF.lost) {
      this.limb(ctx, hipFp, kneeFJ, 18, 14, this.limbColors[0], false);
      this.limb(ctx, kneeFJ, footFJ, 14, 10, this.limbColors[0], false);
      ctx.fillStyle = this.limbColors[2];
      ctx.beginPath(); ctx.ellipse(footFJ.x + 3, footFJ.y + 3, 13, 5.5, 0, 0, TAU); ctx.fill();
    } else {
      // stump
      ctx.fillStyle = this.accent;
      ctx.beginPath(); ctx.arc(hipFp.x, hipFp.y + 6, 6, 0, TAU); ctx.fill();
    }
    if (!this.segs.armF.lost) {
      this.limb(ctx, shFp, elbF, 15, 12, this.limbColors[0], false);
      this.limb(ctx, elbF, handF, 12, 9, this.limbColors[1], false);
      // weapon
      this.drawWeapon(ctx, handF, elF, isSlam, isSpin, tele, teleK);
    } else {
      ctx.fillStyle = this.accent;
      ctx.beginPath(); ctx.arc(shFp.x, shFp.y + 4, 7, 0, TAU); ctx.fill();
    }

    // -------- head --------
    if (!this.headLost) {
      this.drawHead(ctx, neck, spineAng, isSlam, isHusk, stag);
    } else {
      ctx.fillStyle = '#2a1a14';
      ctx.beginPath(); ctx.ellipse(neck.x, neck.y - 2, 9, 4, 0, 0, TAU); ctx.fill();
      // dangling threads from neck
      ctx.strokeStyle = 'rgba(190,50,40,.8)'; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(neck.x + i * 3 - 3, neck.y - 2);
        ctx.quadraticCurveTo(neck.x + i * 5 - 5 + Math.sin(this.t * 6 + i) * 4, neck.y + 12, neck.x + i * 4 - 6, neck.y + 26);
        ctx.stroke();
      }
    }

    // -------- telegraph glow --------
    if (tele) {
      const a = 0.35 + Math.sin(this.t * 40) * 0.15;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const cx = chest.x, cy = chest.y - 10;
      const rr = 26 + teleK * 16;
      ctx.strokeStyle = this.type === 'slammer' ? `rgba(255,110,40,${a})` : `rgba(190,120,255,${a})`;
      ctx.lineWidth = 2 + teleK * 2;
      ctx.beginPath(); ctx.arc(cx + 14, cy, rr, 0, TAU); ctx.stroke();
      ctx.globalAlpha = a * 0.4;
      ctx.fillStyle = this.type === 'slammer' ? '#ff7a30' : '#b060ff';
      ctx.beginPath(); ctx.arc(cx + 14, cy, rr * 0.7, 0, TAU); ctx.fill();
      ctx.restore();
    }

    ctx.restore();

    // crisp white flash at the contact point only
    if (this.hitFlash > 0) {
      const k = this.hitFlash / 0.09;
      const hit = this.lastHitPos || { x: this.x, y: this.y - this.hgt * 0.5 };
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5 * k;
      const g2 = ctx.createRadialGradient(hit.x, hit.y, 0, hit.x, hit.y, 34);
      g2.addColorStop(0, 'rgba(255,255,240,0.95)');
      g2.addColorStop(0.45, 'rgba(255,220,170,0.35)');
      g2.addColorStop(1, 'rgba(255,180,120,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(hit.x, hit.y, 34, 0, TAU); ctx.fill();
      ctx.restore();
    }

    if (savedColors) {
      this.color = savedColors.color;
      this.accent = savedColors.accent;
      this.limbColors = savedColors.limbColors;
    }

    // -------- health & hit flash overlays (world space) --------
    this.drawOverlayHp(ctx);
  }

  limb(ctx, a, b, w1, w2, col, back) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    ctx.beginPath();
    ctx.moveTo(a.x + nx * w1 / 2, a.y + ny * w1 / 2);
    ctx.lineTo(b.x + nx * w2 / 2, b.y + ny * w2 / 2);
    ctx.lineTo(b.x - nx * w2 / 2, b.y - ny * w2 / 2);
    ctx.lineTo(a.x - nx * w1 / 2, a.y - ny * w1 / 2);
    ctx.closePath();
    ctx.fillStyle = back ? this.shade(col, -18) : col;
    ctx.fill();
    if (!back) {
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  shade(hex, amt) {
    const h = hex.replace('#', '');
    let r = parseInt(h.substr(0, 2), 16), g = parseInt(h.substr(2, 2), 16), b = parseInt(h.substr(4, 2), 16);
    r = clamp(r + amt, 0, 255); g = clamp(g + amt, 0, 255); b = clamp(b + amt, 0, 255);
    return `rgb(${r|0},${g|0},${b|0})`;
  }

  drawTorso(ctx, hip, chest, neck, lean, isSlam) {
    const nx = -Math.cos(lean), ny = -Math.sin(lean);
    const topW = isSlam ? 26 : this.type === 'spinner' ? 19 : 15;
    const waistW = isSlam ? 20 : this.type === 'spinner' ? 14 : 11;
    ctx.beginPath();
    ctx.moveTo(chest.x - nx * topW, chest.y - ny * topW);
    ctx.quadraticCurveTo(hip.x - nx * waistW - 6, hip.y - 6, hip.x - nx * (waistW + 6), hip.y + 22);
    ctx.lineTo(hip.x - nx * (waistW + 10), hip.y + 46);
    ctx.lineTo(hip.x + nx * (waistW + 6), hip.y + 44);
    ctx.lineTo(hip.x + nx * (waistW + 2), hip.y + 20);
    ctx.quadraticCurveTo(hip.x + nx * waistW + 8, hip.y - 8, chest.x + nx * topW, chest.y);
    ctx.closePath();
    const g = ctx.createLinearGradient(chest.x - 24, chest.y - 20, hip.x + 24, hip.y + 46);
    g.addColorStop(0, this.color);
    g.addColorStop(1, this.shade(this.color, -24));
    ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 1.6; ctx.stroke();

    // ribs / stitching
    ctx.strokeStyle = 'rgba(230,210,180,.14)'; ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const yy = chest.y + 8 + i * 11;
      ctx.beginPath(); ctx.moveTo(-topW * 0.7, yy); ctx.quadraticCurveTo(0, yy + 3, topW * 0.7, yy); ctx.stroke();
    }
    // collar / rope wraps
    ctx.strokeStyle = this.accent; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(chest.x - nx * topW, chest.y - ny * topW + 2);
    ctx.quadraticCurveTo(neck.x, chest.y - 4, chest.x + nx * topW, chest.y + 4); ctx.stroke();

    // exposed core (damage state)
    const frac = this.hp / this.maxHp;
    if (frac < 0.5) {
      const pul = 0.5 + Math.sin(this.t * 6) * 0.25;
      ctx.fillStyle = `rgba(255,90,40,${0.25 + (0.5 - frac) * 0.9 * pul})`;
      ctx.beginPath(); ctx.arc(chest.x + nx * 6, chest.y + 14, 5 + (0.5 - frac) * 6, 0, TAU); ctx.fill();
      ctx.strokeStyle = 'rgba(255,150,90,.5)'; ctx.lineWidth = 1;
      ctx.stroke();
    }
    // blood streaks
    if (this.broken > 0) {
      ctx.fillStyle = 'rgba(120,20,14,.5)';
      ctx.beginPath(); ctx.ellipse(chest.x + nx * 8, chest.y + 22, 4, 12, 0.2, 0, TAU); ctx.fill();
    }
  }

  drawHead(ctx, neck, spineAng, isSlam, isHusk, stag) {
    const hx = neck.x + Math.cos(spineAng) * 12;
    const hy = neck.y + Math.sin(spineAng) * 12;
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(spineAng + Math.PI / 2 + (this.headLost ? this.wobble : 0) + (stag > 0 ? -0.3 : 0));
    const s = isSlam ? 1.32 : this.type === 'spinner' ? 1.12 : 1;
    // skull / hood
    ctx.fillStyle = this.shade(this.color, 12);
    ctx.beginPath(); ctx.ellipse(0, 0, 11 * s, 13 * s, 0, 0, TAU); ctx.fill();
    // wooden mask
    ctx.fillStyle = '#d6c6a6';
    ctx.beginPath();
    ctx.moveTo(0, -12 * s);
    ctx.quadraticCurveTo(10 * s, -8 * s, 8.5 * s, 2 * s);
    ctx.quadraticCurveTo(6 * s, 12 * s, 0, 13 * s);
    ctx.quadraticCurveTo(-6 * s, 12 * s, -8.5 * s, 2 * s);
    ctx.quadraticCurveTo(-10 * s, -8 * s, 0, -12 * s);
    ctx.closePath(); ctx.fill();
    // crack line depending on hp
    const frac = Math.max(0, this.hp / this.maxHp);
    ctx.strokeStyle = 'rgba(60,40,30,.7)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(-3, -10 * s);
    ctx.lineTo(-1, -4 * s); ctx.lineTo(3, -1 * s); ctx.lineTo(1, 6 * s);
    ctx.stroke();
    if (frac < 0.5) {
      ctx.beginPath(); ctx.moveTo(5, -8 * s); ctx.lineTo(3, -2 * s); ctx.lineTo(7, 2 * s); ctx.stroke();
    }
    // eyes
    const eyeCol = this.state === 'telegraph' ? '#ff6a30' : this.type === 'slammer' ? '#ff8a40' : '#c98aff';
    ctx.fillStyle = eyeCol;
    ctx.shadowColor = eyeCol; ctx.shadowBlur = this.state === 'telegraph' ? 16 : 8;
    ctx.beginPath(); ctx.ellipse(-3.2 * s, -2 * s, 2.2 * s, 1.3 * s, -0.2, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(3.2 * s, -2 * s, 2.2 * s, 1.3 * s, 0.2, 0, TAU); ctx.fill();
    ctx.shadowBlur = 0;
    // mouth stitches
    ctx.strokeStyle = '#6a4a34'; ctx.lineWidth = 1.1;
    ctx.beginPath(); ctx.moveTo(-4 * s, 6 * s); ctx.lineTo(4 * s, 6 * s); ctx.stroke();
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(i * 2.6 * s, 5 * s); ctx.lineTo(i * 2.6 * s, 7.4 * s); ctx.stroke();
    }
    // straw / horn details
    ctx.strokeStyle = 'rgba(20,15,12,.8)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(-9 * s, -6 * s); ctx.quadraticCurveTo(-15 * s, -16 * s, -11 * s, -20 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(9 * s, -6 * s); ctx.quadraticCurveTo(15 * s, -16 * s, 11 * s, -20 * s); ctx.stroke();
    ctx.restore();
  }

  drawWeapon(ctx, hand, elbAng, isSlam, isSpin, tele, teleK) {
    const ang = elbAng + (this.state === 'attack' ? 0 : -0.25);
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(ang);
    if (isSlam) {
      // big hammer/cleaver
      ctx.fillStyle = '#2a2018';
      ctx.fillRect(-6, -3, 20, 6);
      ctx.fillStyle = '#6a5236';
      ctx.beginPath(); ctx.moveTo(12, -18); ctx.lineTo(34, -14); ctx.lineTo(34, 14); ctx.lineTo(12, 18); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#241a12'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = 'rgba(255,140,60,.35)';
      ctx.beginPath(); ctx.moveTo(28, -12); ctx.lineTo(34, -10); ctx.lineTo(34, 10); ctx.lineTo(28, 12); ctx.closePath(); ctx.fill();
    } else if (isSpin) {
      // twin blades
      ctx.fillStyle = '#3a3a44';
      ctx.fillRect(-6, -2.5, 14, 5);
      const g = ctx.createLinearGradient(8, 0, 46, 0);
      g.addColorStop(0, '#8a9ab0'); g.addColorStop(0.6, '#e6eef8'); g.addColorStop(1, '#9ab0c8');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(8, -4); ctx.lineTo(44, -1.5); ctx.lineTo(48, 0); ctx.lineTo(44, 1.5); ctx.lineTo(8, 4); ctx.closePath(); ctx.fill();
    } else {
      // rusted short sword
      ctx.fillStyle = '#2a1e18';
      ctx.fillRect(-6, -2.5, 12, 5);
      const g = ctx.createLinearGradient(6, 0, 40, 0);
      g.addColorStop(0, '#8a7a60'); g.addColorStop(0.5, '#cfc0a0'); g.addColorStop(1, '#9a8668');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(6, -3.4); ctx.lineTo(36, -2.6); ctx.lineTo(42, 0); ctx.lineTo(36, 2.4); ctx.lineTo(6, 3.2); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(160,40,30,.6)';
      ctx.beginPath(); ctx.moveTo(14, 0.6); ctx.lineTo(30, 0.4); ctx.lineTo(34, 1.8); ctx.lineTo(14, 2.2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
    if (tele) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.35 + Math.sin(this.t * 34) * 0.2;
      const col = this.type === 'slammer' ? '255,120,40' : '190,120,255';
      ctx.strokeStyle = `rgba(${col},0.9)`;
      ctx.lineWidth = 2;
      const r = 34 + teleK * 26;
      ctx.beginPath(); ctx.arc(hand.x, hand.y, r, 0, TAU); ctx.stroke();
      ctx.restore();
    }
  }

  drawOverlayHp(ctx) {
    // floating hp bar above enemy when damaged
    if (this.dying || this.hp >= this.maxHp) return;
    const w = 46 * this.scale;
    const x = this.x - w / 2;
    const y = this.y - this.hgt - 24;
    const frac = clamp(this.hp / this.maxHp, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.82 * this.alpha;
    ctx.fillStyle = 'rgba(8,6,8,.75)';
    ctx.fillRect(x - 1, y - 1, w + 2, 5);
    ctx.fillStyle = this.hpFlash > 0 ? '#fff' : '#d33a24';
    ctx.fillRect(x, y, w * frac, 3);
    ctx.fillStyle = 'rgba(255,200,150,.6)';
    ctx.fillRect(x, y, w * frac, 1);
    ctx.restore();
  }
}

Enemy.uid = 0;
