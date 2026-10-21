// ---- game orchestration: world, waves, camera, HUD ----
'use strict';

const CFG = {
  groundY: 620,
  arenaW: 3400,
  viewH: 640,
  minViewW: 960,
};

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.groundY = CFG.groundY;
    this.arenaW = CFG.arenaW;
    this.ready = false;
    this.view = { w: 1280, h: 720, s: 1 };
    // ambient embers
    this.embers = [];
    this.reset();
    this.state = 'title';
    this.titleT = 0;
    this.ready = true;
  }
  reset() {
    this.player = new Player();
    this.player.reset(this.arenaW / 2, this.groundY);
    this.enemies = [];
    this.bolts = [];
    this.portals = [];
    this.fx = new FX();
    this.afterimages = new Afterimages();
    this.cam = { x: this.arenaW / 2, y: 0 };
    this.shakeT = 0; this.shakeMag = 0; this.shakePh = 0;
    this.hitStopT = 0; this.ts = 1;
    this.slowmoT = 0;
    this.kills = 0; this.limbBreaks = 0; this.hitCount = 0;
    this.combo = { n: 0, t: 0, max: 0, pop: 0 };
    this.time = 0;
    this.spawnT = 0.8;
    this.swingCounter = 0;
    this.frame = 0;
    this.dieT = 0;
    this.hintT = 30;
    // seed a few embers
    for (let i = 0; i < 24; i++) this.embers.push({ x: rand(0, this.arenaW), y: rand(200, this.groundY), s: rand(0.5, 1.6), ph: rand(0, 9) });
  }
  start() {
    this.reset();
    this.state = 'playing';
    AUDIO.ensure();
    AUDIO.uiConfirm();
    // immediate first wave so combat starts within seconds
    for (let i = 0; i < 2; i++) this.queuePortal(this.player.x + (i === 0 ? -420 : 460), i === 0 ? 'blade' : 'blade');
  }
  addShake(m) { this.shakeMag = Math.max(this.shakeMag, m); this.shakeT = 0.32; }
  hitStop(d) { this.hitStopT = Math.max(this.hitStopT, d); }

  // ---------- spawning ----------
  queuePortal(x, type) {
    x = clamp(x, 90, this.arenaW - 90);
    this.portals.push({ x, t: 0.65, type, dur: 0.65 });
  }
  pickType() {
    const k = this.kills;
    const wB = 0.5 - Math.min(0.22, k * 0.004);
    const wH = 0.2 + Math.min(0.28, k * 0.005);
    const r = Math.random();
    if (r < wB) return 'blade';
    if (r < wB + wH) return 'hammer';
    return 'gunner';
  }
  updateSpawns(dt) {
    const cap = Math.min(3 + Math.floor(this.kills / 8), 6);
    const alive = this.enemies.filter(e => e.state !== 'dead').length + this.portals.length;
    this.spawnT -= dt;
    if (alive < cap && this.spawnT <= 0) {
      this.spawnT = Math.max(1.25, 2.7 - this.kills * 0.025);
      let x = this.player.x + rand(1, 1) * (Math.random() < 0.5 ? -1 : 1) * rand(380, 640);
      x = clamp(x, 100, this.arenaW - 100);
      if (Math.abs(x - this.player.x) < 340) x = clamp(this.player.x + (x > this.player.x ? 420 : -420), 100, this.arenaW - 100);
      this.queuePortal(x, this.pickType());
    }
    for (let i = this.portals.length - 1; i >= 0; i--) {
      const p = this.portals[i];
      p.t -= dt;
      if (p.t <= 0) {
        this.enemies.push(new Enemy(p.type, p.x, this));
        this.portals.splice(i, 1);
      }
    }
  }

  onEnemyKilled(e) {
    this.kills++;
    this.fx.floaters.spawn(e.x, e.y - 110 * e.scale, '击破', '#ffd76a', 21);
    this.addShake(0.3);
  }
  onPlayerDeath() {
    this.slowmoT = 1.5;
    this.dieT = 0;
    this.addShake(0.8);
    this.fx.shocks.spawn(this.player.x, this.player.y - 40, { r0: 8, r1: 180, life: 0.5, color: '#ff5f4a', width: 6 });
  }

  // ---------- combat resolution ----------
  playerAttackBox() {
    const pl = this.player, A = pl.attack;
    if (!A) return null;
    const t = pl.stateT;
    if (t < A.hs || t > A.he) return null;
    const reach = A.reach, f = pl.facing;
    return {
      x: f > 0 ? pl.x + 6 : pl.x - 6 - reach,
      y: pl.y - A.hh - 8,
      w: reach, h: A.hh,
      A, f,
    };
  }
  resolvePlayerHits() {
    const pl = this.player;
    if (!pl.attack || pl.attackKind === null) return;
    const box = this.playerAttackBox();
    if (!box) return;
    const A = box.A;
    const swingId = pl.swingId;
    let landedAny = false;
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      if (e.lastSwingId === swingId) continue;
      const hb = e.hurtBox;
      if (box.x < hb.x + hb.w && box.x + box.w > hb.x && box.y < hb.y + hb.h && box.y + box.h > hb.y) {
        e.lastSwingId = swingId;
        const hit = {
          dmg: A.dmg, poise: A.poise, kx: A.kx, ky: A.ky,
          dirX: box.f, launch: A.launch, heavy: !!A.heavy,
          breakPart: !!A.heavy, forceBreak: !!A.full,
        };
        const res = e.takeHit(hit, this);
        if (!res.landed) continue;
        landedAny = true;
        this.hitCount++;
        this.combo.n++; this.combo.t = 2.4; this.combo.pop = 1;
        this.combo.max = Math.max(this.combo.max, this.combo.n);
        const cx = clamp(e.x, box.x, box.x + box.w), cy = clamp(e.y - 55 * e.scale, box.y, box.y + box.h);
        if (res.clang) {
          this.fx.clangSpark(cx, cy);
          AUDIO.clang();
          this.hitStop(0.02); this.addShake(0.08);
          this.fx.floaters.spawn(cx, cy - 20, '弹开', '#9fb6d8', 14);
        } else {
          this.fx.hitSpark(cx, cy, A.heavy, box.f);
          this.fx.bloodOil(cx, cy, box.f, A.heavy ? 12 : 6);
          if (A.heavy) AUDIO.hitHeavy(); else AUDIO.hitLight();
          this.hitStop(A.stop);
          this.addShake(A.shake);
          this.fx.floaters.spawn(cx, cy - 16, String(Math.round(hit.dmg * (res.clang ? 0.35 : 1))), A.heavy ? '#ffd76a' : '#fff', A.heavy ? 20 : 15);
        }
        if (pl.attackKind === 'launcher' && !res.killed) pl.vy = Math.min(pl.vy, -10.5);
        if (res.killed) this.hitStop(Math.max(A.stop, 0.1));
      }
    }
    // slash bullets out of the air
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      if (b.x > box.x && b.x < box.x + box.w && b.y > box.y && b.y < box.y + box.h) {
        this.bolts.splice(i, 1);
        this.fx.clangSpark(b.x, b.y);
        AUDIO.boltBreak();
        this.hitCount++; this.combo.n++; this.combo.t = 2.4; this.combo.pop = 1;
        this.fx.floaters.spawn(b.x, b.y - 14, '弹反!', '#8be9ff', 16);
      }
    }
    if (landedAny && A.full) {
      this.fx.shocks.spawn(pl.x + box.f * 60, pl.y - 40, { r0: 10, r1: 190, life: 0.35, color: '#ffd76a', width: 7 });
    }
  }
  onSlamImpact(pl) {
    AUDIO.slam();
    this.addShake(0.6);
    this.hitStop(0.09);
    this.fx.shocks.spawn(pl.x, this.groundY, { r0: 12, r1: 210, life: 0.4, color: '#9fe8ff', width: 8 });
    this.fx.shocks.spawn(pl.x, this.groundY, { r0: 6, r1: 150, life: 0.3, color: '#fff', width: 4, ring: false });
    this.fx.dust(pl.x, this.groundY, 16);
    for (const e of this.enemies) {
      if (e.state === 'dead' || e.state === 'spawn') continue;
      if (Math.abs(e.x - pl.x) < 165 && this.groundY - e.y < 130) {
        const res = e.takeHit({ dmg: 20, poise: 34, kx: sign(e.x - pl.x) * 7, ky: 0, dirX: sign(e.x - pl.x), launch: -13, breakPart: false }, this);
        if (res.landed) {
          this.hitCount++; this.combo.n++; this.combo.t = 2.4; this.combo.pop = 1;
          this.fx.hitSpark(e.x, e.y - 50 * e.scale, true, sign(e.x - pl.x));
        }
      }
    }
  }

  // ---------- update ----------
  update(rawDt) {
    this.frame++;
    // time scale: hit stop then ease back
    if (this.hitStopT > 0) { this.hitStopT -= rawDt; this.ts = 0.05; }
    else this.ts = approach(this.ts, 1, rawDt * 7);
    let slow = 1;
    if (this.state === 'dying') {
      this.dieT += rawDt;
      slow = 0.22;
      if (this.dieT > 1.6) { this.state = 'over'; }
    }
    const dt = rawDt * this.ts * slow;

    if (this.state === 'title') { this.titleT += rawDt; return; }
    if (this.state === 'over') return;

    this.time += dt;
    this.hintT = Math.max(0, this.hintT - rawDt);
    // combo timer
    this.combo.t -= dt;
    this.combo.pop = Math.max(0, this.combo.pop - rawDt * 4);
    if (this.combo.t <= 0) this.combo.n = 0;

    this.updateSpawns(dt);
    this.player.update(dt, this);
    this.resolvePlayerHits();
    for (const e of this.enemies) e.update(dt, this);
    // enemy separation
    const alive = this.enemies.filter(e => e.state !== 'dead');
    for (let i = 0; i < alive.length; i++) for (let j = i + 1; j < alive.length; j++) {
      const a = alive[i], b = alive[j];
      const dx = b.x - a.x;
      const min = 34 * (a.scale + b.scale) * 0.5;
      if (Math.abs(dx) < min && Math.abs(a.y - b.y) < 80) {
        const push = (min - Math.abs(dx)) * 0.5 * sign(dx || 1);
        a.x -= push; b.x += push;
      }
    }
    // bolts
    const bdf = dt * 60; // bolt speed is px/frame
    for (let i = this.bolts.length - 1; i >= 0; i--) {
      const b = this.bolts[i];
      b.age += dt;
      b.x += b.vx * bdf; b.y += b.vy * bdf;
      if (b.age > 4 || b.x < 0 || b.x > this.arenaW || b.y > this.groundY) {
        if (b.y > this.groundY) this.fx.dust(b.x, this.groundY, 3);
        this.bolts.splice(i, 1); continue;
      }
      const pb = this.player.hurtBox;
      if (this.player.state !== 'dead' && b.x > pb.x && b.x < pb.x + pb.w && b.y > pb.y && b.y < pb.y + pb.h) {
        if (this.player.takeHit(b.dmg, sign(b.vx), this)) this.bolts.splice(i, 1);
        else this.bolts.splice(i, 1);
      }
    }
    // fx
    this.fx.update(dt, this.groundY);
    this.afterimages.update(dt);
    // player trail
    const pl = this.player;
    if (pl.skel && pl.trailActive()) {
      pl.trail.push(pl.skel.bladeBase.x, pl.skel.bladeBase.y, pl.skel.bladeTip.x, pl.skel.bladeTip.y);
    }
    // camera
    const vw = this.view.w, vh = this.view.h;
    const tx = pl.x + pl.facing * 110;
    this.cam.x += (tx - this.cam.x) * Math.min(1, rawDt * 6);
    const minCx = vw / 2, maxCx = this.arenaW - vw / 2;
    this.cam.x = maxCx > minCx ? clamp(this.cam.x, minCx, maxCx) : this.arenaW / 2;
    const baseY = this.groundY + 60 - vh / 2;
    const ty2 = baseY + clamp((pl.y - this.groundY) * 0.3, -120, 20);
    this.cam.y += (ty2 - this.cam.y) * Math.min(1, rawDt * 4);
    // shake decay
    this.shakeT = Math.max(0, this.shakeT - rawDt);
    // embers drift
    for (const em of this.embers) {
      em.x += Math.sin(this.time * 0.4 + em.ph) * 12 * dt - 8 * dt;
      em.y -= (6 + em.s * 8) * dt;
      if (em.y < 140) { em.y = this.groundY - rand(0, 60); em.x = this.cam.x + rand(-vw, vw); }
    }
    // death transition
    if (pl.state === 'dead' && this.state === 'playing') this.state = 'dying';
    // cleanup dead enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].state === 'dead') this.enemies.splice(i, 1);
    }
  }

  // ---------- render ----------
  resize(cssW, cssH, dpr) {
    this.canvas.width = Math.round(cssW * dpr);
    this.canvas.height = Math.round(cssH * dpr);
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    const s = Math.max(cssH / CFG.viewH, cssW / CFG.minViewW);
    this.view = { w: cssW / s, h: cssH / s, s };
  }
  render() {
    const ctx = this.ctx;
    const { w: vw, h: vh, s } = this.view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, this.cssH);
    sky.addColorStop(0, '#0a0d1f');
    sky.addColorStop(0.55, '#141a36');
    sky.addColorStop(1, '#241f3d');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
    // stars + moon (screen space, mild parallax)
    ctx.save();
    const camX = this.cam.x;
    for (let i = 0; i < 60; i++) {
      const sx = ((i * 733.7 + 100 - camX * 0.05) % (vw + 200)) - 100;
      const sy = (i * 271.3) % (vh * 0.6);
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.8 + i));
      ctx.fillStyle = `rgba(255,255,255,${0.25 * tw})`;
      ctx.fillRect(sx * s, sy * s, 2, 2);
    }
    const mx = vw * 0.78, my = vh * 0.2;
    const mg = ctx.createRadialGradient(mx * s, my * s, 10, mx * s, my * s, 130 * s);
    mg.addColorStop(0, 'rgba(240,240,255,0.9)');
    mg.addColorStop(0.18, 'rgba(220,225,255,0.55)');
    mg.addColorStop(1, 'rgba(180,190,255,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx * s, my * s, 130 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = '#eef0ff';
    ctx.beginPath(); ctx.arc(mx * s, my * s, 34 * s, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(190,195,230,0.5)';
    ctx.beginPath(); ctx.arc(mx * s - 10 * s, my * s - 6 * s, 6 * s, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx * s + 8 * s, my * s + 9 * s, 4 * s, 0, TAU); ctx.fill();
    ctx.restore();

    // ---- world transform ----
    let shX = 0, shY = 0;
    if (this.shakeT > 0) {
      const k = (this.shakeT / 0.32);
      const m = this.shakeMag * k * k;
      this.shakePh += 0.9;
      shX = Math.sin(this.shakePh * 2.17) * m * 14;
      shY = Math.cos(this.shakePh * 1.73) * m * 10;
    }
    ctx.setTransform(this.dpr * s, 0, 0, this.dpr * s, (-this.cam.x + vw / 2 + shX) * this.dpr * s, (-this.cam.y + vh / 2 + shY) * this.dpr * s);

    this.drawParallax(ctx, vw, vh);
    this.drawGround(ctx, vw, vh);

    // portals
    for (const p of this.portals) {
      const t = 1 - p.t / p.dur;
      ctx.strokeStyle = `rgba(255,150,80,${0.4 + 0.5 * t})`;
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.ellipse(p.x, this.groundY - 4, 26 + 14 * t, 8 + 4 * t, 0, 0, TAU); ctx.stroke();
      ctx.fillStyle = `rgba(255,120,60,${0.25 * t})`;
      ctx.beginPath(); ctx.ellipse(p.x, this.groundY - 30 * t, 14 + 10 * t, 30 * t, 0, 0, TAU); ctx.fill();
    }
    // embers
    for (const em of this.embers) {
      ctx.fillStyle = `rgba(255,170,90,${0.12 + em.s * 0.1})`;
      ctx.beginPath(); ctx.arc(em.x, em.y, em.s * 2.2, 0, TAU); ctx.fill();
    }
    // bolts
    for (const b of this.bolts) {
      ctx.save();
      ctx.shadowColor = '#a8ff6a'; ctx.shadowBlur = 10;
      ctx.strokeStyle = '#d8ffb0';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x + b.vx * 0.012, b.y + b.vy * 0.012);
      ctx.stroke();
      ctx.restore();
    }
    // entities (sorted by y)
    const ents = [];
    for (const e of this.enemies) if (e.state !== 'dead') ents.push({ y: e.y, e });
    if (this.player.state !== 'dead' || this.state !== 'over') ents.push({ y: this.player.y, p: this.player });
    ents.sort((a, b) => a.y - b.y);
    // afterimages under
    this.afterimages.draw(ctx);
    for (const it of ents) {
      if (it.p) this.drawPlayerEntity(ctx, it.p);
      else this.drawEnemyEntity(ctx, it.e);
    }
    // player blade trail on top
    const pl = this.player;
    if (pl.trail.pts.length > 1) {
      pl.trail.draw(ctx, pl.attack && pl.attack.full ? '#ffd76a' : '#9fe8ff', pl.attack && pl.attack.heavy ? 14 : 9);
    }
    this.fx.drawWorld(ctx);
    // ground-level fx already drawn; now HUD
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawHUD(ctx);
    if (this.state === 'title') this.drawTitle(ctx);
    else if (this.state === 'over') this.drawOver(ctx);
    else if (this.state === 'dying') this.drawDying(ctx);
  }

  drawParallax(ctx, vw, vh) {
    const camX = this.cam.x;
    const horizon = this.groundY - 40;
    // far mountains
    ctx.fillStyle = '#171c33';
    ctx.beginPath();
    ctx.moveTo(camX - vw, horizon + 40);
    for (let i = -1; i < 12; i++) {
      const bx = camX - vw + i * 320 - (camX * 0.15 % 320);
      const h = 120 + ((i * 137 + 71) % 160);
      ctx.lineTo(bx + 160, horizon - h);
      ctx.lineTo(bx + 320, horizon + 40);
    }
    ctx.lineTo(camX + vw * 2, horizon + 40);
    ctx.closePath(); ctx.fill();
    // mid skyline: ruined towers
    ctx.fillStyle = '#1f2542';
    for (let i = -1; i < 10; i++) {
      const span = 420;
      const bx = camX - vw + i * span - (camX * 0.35 % span);
      const h = 160 + ((i * 211 + 37) % 220);
      const w = 90 + ((i * 97) % 70);
      ctx.fillRect(bx, horizon - h, w, h + 40);
      // broken top
      ctx.beginPath();
      ctx.moveTo(bx, horizon - h);
      ctx.lineTo(bx + w * 0.4, horizon - h - 18 - (i % 3) * 10);
      ctx.lineTo(bx + w, horizon - h);
      ctx.closePath(); ctx.fill();
      // windows
      ctx.fillStyle = 'rgba(255,190,110,0.16)';
      for (let wy = 0; wy < 5; wy++) for (let wx = 0; wx < 2; wx++) {
        if ((i * 7 + wy * 3 + wx) % 3 === 0) ctx.fillRect(bx + 14 + wx * 34, horizon - h + 18 + wy * 36, 12, 16);
      }
      ctx.fillStyle = '#1f2542';
    }
    // near layer: broken torii / pillars
    ctx.fillStyle = '#2b2140';
    const span2 = 560;
    for (let i = -1; i < 8; i++) {
      const bx = camX - vw + i * span2 - (camX * 0.6 % span2) + 120;
      const broken = (i % 2) === 0;
      ctx.fillRect(bx, horizon - 130, 16, 170);
      ctx.fillRect(bx + 120, horizon - (broken ? 90 : 130), 16, 170);
      ctx.save();
      ctx.translate(bx + 68, horizon - 126);
      if (broken) ctx.rotate(-0.12);
      ctx.fillRect(-84, 0, 190, 13);
      ctx.restore();
      ctx.fillRect(bx - 6, horizon - 112, 150, 9);
    }
  }
  drawGround(ctx, vw, vh) {
    const gy = this.groundY;
    const x0 = this.cam.x - vw, x1 = this.cam.x + vw;
    const g = ctx.createLinearGradient(0, gy, 0, gy + 260);
    g.addColorStop(0, '#2c2b44');
    g.addColorStop(0.12, '#232238');
    g.addColorStop(1, '#12121f');
    ctx.fillStyle = g;
    ctx.fillRect(x0, gy, x1 - x0, 400);
    // top edge glow line
    ctx.strokeStyle = 'rgba(140,190,255,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(x0, gy); ctx.lineTo(x1, gy); ctx.stroke();
    // seams
    ctx.strokeStyle = 'rgba(90,110,180,0.14)';
    ctx.lineWidth = 1.5;
    for (let x = Math.floor(x0 / 130) * 130; x < x1; x += 130) {
      ctx.beginPath(); ctx.moveTo(x, gy + 4); ctx.lineTo(x - 30, gy + 130); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(90,110,180,0.08)';
    for (let x = Math.floor(x0 / 47) * 47; x < x1; x += 47) {
      ctx.beginPath(); ctx.moveTo(x, gy + 4); ctx.lineTo(x, gy + 34); ctx.stroke();
    }
    // arena boundary pillars
    for (const bx of [26, this.arenaW - 26]) {
      ctx.fillStyle = '#33284f';
      ctx.fillRect(bx - 18, gy - 220, 36, 220);
      ctx.fillStyle = '#4a3a72';
      ctx.fillRect(bx - 24, gy - 236, 48, 20);
      ctx.fillStyle = 'rgba(140,190,255,0.5)';
      ctx.fillRect(bx - 18, gy - 130, 36, 3);
      // energy shimmer
      const eg = ctx.createLinearGradient(bx - 30, 0, bx + 30, 0);
      eg.addColorStop(0, 'rgba(120,180,255,0)');
      eg.addColorStop(0.5, `rgba(120,180,255,${0.1 + 0.05 * Math.sin(this.time * 3)})`);
      eg.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = eg;
      ctx.fillRect(bx - 30, gy - 220, 60, 220);
    }
  }
  drawPlayerEntity(ctx, pl) {
    const sk = pl.computeSkel();
    if (this.state === 'dying' || this.state === 'over') {
      ctx.globalAlpha = 0.95;
    }
    drawPlayer(ctx, pl, sk);
    ctx.globalAlpha = 1;
  }
  drawEnemyEntity(ctx, e) {
    const sk = e.computeSkel();
    // spawn materialize
    if (e.state === 'spawn') {
      const k = clamp(e.stateT / 0.7, 0, 1);
      ctx.globalAlpha = k * 0.9;
    }
    drawEnemy(ctx, e, sk);
    ctx.globalAlpha = 1;
    // laser sight
    if (e.laser) {
      ctx.strokeStyle = `rgba(168,255,106,${0.25 + e.laser.a * 0.45})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(e.laser.x1, e.laser.y1); ctx.lineTo(e.laser.x2, e.laser.y2); ctx.stroke();
    }
    // overhead bars
    if (e.hp < e.maxHp || e.staggerT > 0) {
      const s = e.scale;
      const bw = 46 * s, bx = e.x - bw / 2, by = e.y - 112 * s;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx - 1, by - 1, bw + 2, 5);
      ctx.fillStyle = e.staggerT > 0 ? '#ffe9a8' : '#ff5f4a';
      ctx.fillRect(bx, by, bw * clamp(e.hp / e.maxHp, 0, 1), 3);
      // poise
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(bx - 1, by + 4, bw + 2, 4);
      ctx.fillStyle = '#ffd76a';
      ctx.fillRect(bx, by + 5, bw * clamp(e.poise / e.maxPoise, 0, 1), 2);
    }
    if (e.state === 'telegraph' && e.telegraphGlow > 0.4) {
      ctx.fillStyle = `rgba(255,60,40,${e.telegraphGlow})`;
      ctx.font = `bold ${Math.round(26 + e.telegraphGlow * 8)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('!', e.x, e.y - 118 * e.scale);
    }
  }

  // ---------- HUD ----------
  drawHUD(ctx) {
    const cw = this.cssW, ch = this.cssH;
    const pl = this.player;
    // HP
    const hx = 20, hy = 18, hw = Math.min(280, cw * 0.3), hh = 15;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(hx - 2, hy - 2, hw + 4, hh + 4);
    const hpFrac = clamp(pl.hp / pl.maxHp, 0, 1);
    const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    hg.addColorStop(0, '#ff4a3d'); hg.addColorStop(1, '#ff8a5f');
    ctx.fillStyle = hg;
    ctx.fillRect(hx, hy, hw * hpFrac, hh);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let i = 1; i < 4; i++) ctx.fillRect(hx + hw * i / 4, hy, 1, hh);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(hx - 0.5, hy - 0.5, hw + 1, hh + 1);
    ctx.fillStyle = '#ffd9d0';
    ctx.font = 'bold 11px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('体力', hx + 4, hy + hh + 13);
    // dash cooldown pip
    const dx2 = hx, dy2 = hy + hh + 20;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(dx2 - 2, dy2 - 2, 104, 10);
    const dFrac = pl.dashCD > 0 ? 1 - pl.dashCD / 0.4 : 1;
    ctx.fillStyle = dFrac >= 1 ? '#8be9ff' : '#3a6d84';
    ctx.fillRect(dx2, dy2, 100 * clamp(dFrac, 0, 1), 6);
    ctx.fillStyle = '#bfe9ff';
    ctx.fillText('闪避', dx2 + 106, dy2 + 8);
    // charge bar
    if (pl.state === 'charge') {
      const cw2 = 130, cx = cw / 2 - cw2 / 2, cy = ch - 120;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(cx - 2, cy - 2, cw2 + 4, 13);
      const full = pl.charge >= 0.95;
      ctx.fillStyle = full ? (Math.sin(this.time * 30) > 0 ? '#ffd76a' : '#fff') : '#e8a33d';
      ctx.fillRect(cx, cy, cw2 * pl.charge, 9);
      ctx.strokeStyle = '#ffd76a'; ctx.lineWidth = 1;
      ctx.strokeRect(cx - 0.5, cy - 0.5, cw2 + 1, 12);
      ctx.fillStyle = '#ffe9c8'; ctx.textAlign = 'center';
      ctx.font = 'bold 12px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillText(full ? '满蓄力!' : '蓄力中…', cw / 2, cy - 6);
    }
    // combo
    if (this.combo.n >= 2) {
      const pop = 1 + this.combo.pop * 0.5;
      ctx.save();
      ctx.translate(cw / 2, 74);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      ctx.font = 'italic 900 40px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 6;
      ctx.strokeText(String(this.combo.n), 0, 0);
      const cg = ctx.createLinearGradient(0, -36, 0, 6);
      cg.addColorStop(0, '#fff'); cg.addColorStop(1, '#ffb347');
      ctx.fillStyle = cg;
      ctx.fillText(String(this.combo.n), 0, 0);
      ctx.font = 'bold 14px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffd9a8';
      ctx.fillText('HITS', 0, 18);
      ctx.restore();
      // combo timer bar
      ctx.fillStyle = 'rgba(255,255,255,0.2)';
      ctx.fillRect(cw / 2 - 40, 100, 80, 3);
      ctx.fillStyle = '#ffb347';
      ctx.fillRect(cw / 2 - 40, 100, 80 * clamp(this.combo.t / 2.4, 0, 1), 3);
    }
    // kills / time top-right (left of mute button)
    ctx.textAlign = 'right';
    ctx.font = 'bold 14px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(255,235,200,0.85)';
    const mm = Math.floor(this.time / 60), ss = Math.floor(this.time % 60);
    ctx.fillText(`击破 ${this.kills}   断肢 ${this.limbBreaks}   ${mm}:${String(ss).padStart(2, '0')}`, cw - 64, 30);
    // control hints bottom
    const hints = [
      ['A/D', '移动'], ['Space', '跳跃'], ['J', '连斩'], ['K', '蓄力重斩'],
      ['L', '闪避'], ['I', '挑空/下砸'], ['R', '重开'], ['M', '静音'],
    ];
    const alpha = this.hintT > 0 ? 0.85 : 0.3;
    ctx.textAlign = 'center';
    let cx2 = cw / 2 - (hints.length * 92) / 2 + 46;
    const cy2 = ch - 26;
    ctx.font = '12px "Segoe UI","Microsoft YaHei",sans-serif';
    for (const [k, v] of hints) {
      ctx.globalAlpha = alpha;
      const kw = ctx.measureText(k).width + 12;
      ctx.fillStyle = 'rgba(10,12,24,0.7)';
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx2 - kw / 2, cy2 - 11, kw, 17, 4); ctx.fill(); }
      else ctx.fillRect(cx2 - kw / 2, cy2 - 11, kw, 17);
      ctx.strokeStyle = 'rgba(160,200,255,0.4)';
      ctx.lineWidth = 1;
      if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(cx2 - kw / 2, cy2 - 11, kw, 17, 4); ctx.stroke(); }
      ctx.fillStyle = '#cfe4ff';
      ctx.fillText(k, cx2, cy2 + 1);
      ctx.fillStyle = 'rgba(220,230,255,0.75)';
      ctx.fillText(v, cx2, cy2 + 20);
      cx2 += 92;
    }
    ctx.globalAlpha = 1;
  }
  drawTitle(ctx) {
    const cw = this.cssW, ch = this.cssH;
    ctx.fillStyle = 'rgba(5,6,14,0.6)';
    ctx.fillRect(0, 0, cw, ch);
    const t = this.titleT;
    const fl = 0.85 + Math.sin(t * 2) * 0.08;
    ctx.textAlign = 'center';
    ctx.save();
    ctx.translate(cw / 2, ch * 0.3);
    ctx.scale(fl, fl);
    ctx.font = '900 72px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.strokeStyle = 'rgba(120,200,255,0.35)';
    ctx.lineWidth = 10;
    ctx.strokeText('断 傀 夜 行', 0, 0);
    const g = ctx.createLinearGradient(0, -60, 0, 20);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.6, '#9fd8ff'); g.addColorStop(1, '#3d7dc8');
    ctx.fillStyle = g;
    ctx.fillText('断 傀 夜 行', 0, 0);
    ctx.restore();
    ctx.font = 'italic bold 16px "Segoe UI",sans-serif';
    ctx.fillStyle = 'rgba(180,210,255,0.7)';
    ctx.fillText('D I S M A N T L E   T H E   P U P P E T S', cw / 2, ch * 0.3 + 34);
    // description
    ctx.font = '14px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(230,238,255,0.85)';
    ctx.fillText('连斩积攒气绝 → 重斩断其手足 → 断手的傀兵会拉着你自爆', cw / 2, ch * 0.3 + 72);
    ctx.fillStyle = 'rgba(255,200,140,0.9)';
    ctx.fillText('刃傀突刺 · 锤傀震地 · 铳傀远射 —— 看清前兆，闪避回击', cw / 2, ch * 0.3 + 96);
    // controls
    const rows = [
      ['A / D', '移动'], ['Space', '跳跃(二段)'], ['J', '三段连斩'], ['K', '蓄力重斩·断肢'],
      ['L', '无敌闪避'], ['I', '挑空 → 空中I下砸'], ['R', '重开'], ['M', '静音'],
    ];
    ctx.font = '13px "Segoe UI","Microsoft YaHei",sans-serif';
    let y = ch * 0.56;
    for (let i = 0; i < rows.length; i += 2) {
      const x1 = cw / 2 - 190, x2 = cw / 2 + 40;
      ctx.textAlign = 'right';
      ctx.fillStyle = '#8be9ff';
      ctx.fillText(rows[i][0], x1, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(230,238,255,0.85)';
      ctx.fillText(rows[i][1], x1 + 12, y);
      if (rows[i + 1]) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#8be9ff';
        ctx.fillText(rows[i + 1][0], x2, y);
        ctx.textAlign = 'left';
        ctx.fillStyle = 'rgba(230,238,255,0.85)';
        ctx.fillText(rows[i + 1][1], x2 + 12, y);
      }
      y += 26;
    }
    const blink = Math.sin(t * 4) > -0.3;
    if (blink) {
      ctx.textAlign = 'center';
      ctx.font = 'bold 20px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('按 Enter 或点击屏幕 开始', cw / 2, ch * 0.88);
    }
  }
  drawDying(ctx) {
    const k = clamp(this.dieT / 1.5, 0, 1);
    ctx.fillStyle = `rgba(120,10,10,${k * 0.25})`;
    ctx.fillRect(0, 0, this.cssW, this.cssH);
  }
  drawOver(ctx) {
    const cw = this.cssW, ch = this.cssH;
    ctx.fillStyle = 'rgba(5,6,14,0.68)';
    ctx.fillRect(0, 0, cw, ch);
    ctx.textAlign = 'center';
    ctx.font = '900 64px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.strokeStyle = 'rgba(255,80,60,0.4)'; ctx.lineWidth = 8;
    ctx.strokeText('刀 折', cw / 2, ch * 0.36);
    ctx.fillStyle = '#ff6a55';
    ctx.fillText('刀 折', cw / 2, ch * 0.36);
    ctx.font = '15px "Segoe UI","Microsoft YaHei",sans-serif';
    ctx.fillStyle = 'rgba(235,240,255,0.85)';
    ctx.fillText(`击破 ${this.kills} 具傀兵 · 斩断 ${this.limbBreaks} 肢 · 最大连击 ${this.combo.max} · 存活 ${Math.floor(this.time / 60)}:${String(Math.floor(this.time % 60)).padStart(2, '0')}`,
      cw / 2, ch * 0.36 + 40);
    if (Math.sin(performance.now() * 0.004) > -0.3) {
      ctx.font = 'bold 19px "Segoe UI","Microsoft YaHei",sans-serif';
      ctx.fillStyle = '#ffe9a8';
      ctx.fillText('按 R 或 Enter 重开', cw / 2, ch * 0.62);
    }
  }
}
