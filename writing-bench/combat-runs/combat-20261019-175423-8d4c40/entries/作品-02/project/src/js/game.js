'use strict';
// ---------------------------------------------------------------------------
// GAME — orchestration, combat resolution, camera, HUD, world rendering
// ---------------------------------------------------------------------------

class Camera {
  constructor() {
    this.x = 0; this.y = 0;
    this.shakeX = 0; this.shakeY = 0;
    this.trauma = 0;
    this.zoom = 1;
    this.targetZoom = 1;
    this.lookX = 0;
    this.lookY = 0;
  }
  update(dt, player, enemies, groundY) {
    // horizontal: biased toward player facing and midpoint of nearby enemies
    const p = player;
    let tx = p.x + p.facing * 46;
    // soft bias toward nearest enemy in front
    let nearest = null, nd = 1e9;
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.abs(e.x - p.x);
      if (d < nd) { nd = d; nearest = e; }
    }
    if (nearest && nd < 340 && Math.abs(nearest.y - p.y) < 200) {
      tx = lerp(tx, (p.x + nearest.x) / 2 + p.facing * 30, 0.45);
    }
    // vertical follows if player airborne high
    const baseY = groundY - 220;
    let ty = baseY;
    if (p.y < groundY - 60) ty = baseY + (p.y - groundY) * 0.34;
    ty = clamp(ty, baseY - 130, baseY + 40);
    // smooth
    this.x = damp(this.x, tx, 6.5, dt);
    this.y = damp(this.y, ty, 5.5, dt);
    // clamp
    const halfW = this.viewW / 2 / (this.zoom || 1);
    const minX = this.arenaMinX + halfW * 0.55;
    const maxX = this.arenaMaxX - halfW * 0.55;
    this.x = clamp(this.x, minX, maxX);
    // trauma shake (decay quadratically)
    this.trauma = Math.max(0, this.trauma - dt * 1.9);
    const sh = this.trauma * this.trauma;
    const fq = 26;
    this.shakeX = (noise2(this.time * fq, 1.3) - 0.5) * 2 * sh * 34;
    this.shakeY = (noise2(this.time * fq + 50, 4.1) - 0.5) * 2 * sh * 24;
    // zoom punch (relative to base framing)
    this.zoom = damp(this.zoom, this.targetZoom * (this.baseZoom || 1), 8, dt);
    this.targetZoom = damp(this.targetZoom, 1, 5, dt);
  }
  addTrauma(v) { this.trauma = Math.min(1, this.trauma + v); }
}

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false });
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.viewW = 960; this.viewH = 540;
    this.arenaMinX = -520;
    this.arenaMaxX = 520;
    this.groundY = 0;
    this.state = 'title';
    this.time = 0;
    this.accum = 0;
    this.hitstop = 0;
    this.freeze = 0;
    this.slowmo = 0;
    this.screenFlash = 0;
    this.chargeFlash = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.hitCount = 0;
    this.limbBreakCount = 0;
    this.killCount = 0;
    this.wave = 0;
    this.waveT = 0;
    this.waveState = 'idle';
    this.spawnQueue = [];
    this.enemies = [];
    this.debris = [];
    this.projectiles = [];
    this.particles = new Particles();
    this.slashes = new Slashes();
    this.popups = new Popups();
    this.decals = new Decals();
    this.camera = new Camera();
    this.camera.arenaMinX = this.arenaMinX;
    this.camera.arenaMaxX = this.arenaMaxX;
    this.camera.viewW = this.viewW;
    this.camera.time = 0;
    this.player = new Player(this);
    this.enemySerial = 0;
    this.wind = 0;
    this.titleT = 0;
    this.startPrompt = 0;
    this.bestCombo = 0;
    this.bestWave = 0;
    this.timeLeftPulse = 0;
    this.overlay = null;
    this.paused = false;
    this.lastPlayerHitTime = -10;
    this.screenShakeOffset = { x: 0, y: 0 };
    this.flashList = [];
    this.ghosts = [];
    this.waves = [];
    this.cuts = [];
    this.riftLines = [];
    this.cuts = [];
    this.riftLines = [];
    this.spawnPortalT = 0;
    this.banner = null;
    this.bannerT = 0;
    this.hintT = 0;
    this.hintStage = 0;
    this.damageDealt = 0;
    this.timeScale = 1;
    this.inputFlash = 0;
    this.postFlash = 0;
    this.enemyKillFlash = 0;
    this.killStreak = 0;
    this.killStreakT = 0;
    this.overT = 0;
    this.readyFrame = 0;
    this.performanceMode = 0;
    this.fpsSamples = [];
    this.lowFps = false;
    this.slowmoT = 0;
    this.frameSerial = 0;
    this.parryCount = 0;
    this.hitContact = null;
  }

  // ======================================================================
  // setup / reset
  // ======================================================================
  reset() {
    this.time = 0;
    this.hitstop = 0;
    this.freeze = 0;
    this.slowmo = 0;
    this.screenFlash = 0;
    this.chargeFlash = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.hitCount = 0;
    this.limbBreakCount = 0;
    this.killCount = 0;
    this.wave = 0;
    this.waveT = 0;
    this.waveState = 'idle';
    this.spawnQueue = [];
    this.enemies = [];
    this.debris = [];
    this.projectiles = [];
    this.particles.list.length = 0;
    this.slashes.list.length = 0;
    this.popups.list.length = 0;
    this.decals.list.length = 0;
    this.player = new Player(this);
    this.player.x = -120;
    this.player.y = this.groundY;
    this.player.facing = 1;
    this.camera.x = this.player.x;
    this.camera.y = this.groundY - 220;
    this.camera.trauma = 0;
    this.camera.zoom = 1;
    this.camera.targetZoom = 1;
    this.lastPlayerHitTime = -10;
    this.damageDealt = 0;
    this.juggleTarget = null;
    this.juggleT = 0;
    this.killFocusT = 0;
    this.overlay = null;
    this.paused = false;
    this.banner = null;
    this.killStreak = 0;
    this.overT = 0;
    this.bestCombo = 0;
    this.bestWave = 0;
    this.hintT = 0;
    this.hintStage = 0;
    this.timeScale = 1;
    Input.clearAll();
    this.startWave(1);
  }

  startGame() {
    Sound.resume();
    Sound.SFX.start();
    this.reset();
    this.state = 'playing';
    this.banner = { title: '第一波', sub: '斩断所有傀儡', t: 0, life: 1.8, col: '#ffe6c0' };
    this.bannerT = 0;
  }

  startWave(n) {
    this.wave = n;
    this.waveState = 'fighting';
    this.waveT = 0;
    this.spawnQueue = [];
    const p = this.player;
    const playerSide = p.x;
    let count, comp;
    if (n === 1) {
      count = 2; comp = ['cutter', 'cutter'];
    } else if (n === 2) {
      count = 3; comp = ['cutter', 'chorus', 'cutter'];
    } else if (n === 3) {
      count = 4; comp = ['cutter', 'colossus', 'chorus', 'cutter'];
    } else {
      const tier = Math.min(8, n);
      count = Math.min(6, 2 + Math.floor(n / 2));
      comp = [];
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        if (n >= 3 && r < 0.22) comp.push('colossus');
        else if (r < 0.55) comp.push('chorus');
        else comp.push('cutter');
      }
      if (n >= 6 && !comp.includes('colossus')) comp[0] = 'colossus';
    }
    // spawn spread across arena, biased away from player
    const spread = 860;
    for (let i = 0; i < comp.length; i++) {
      const t = (i + 0.5) / comp.length;
      let x = -spread / 2 + spread * t + rand(-40, 40);
      if (Math.abs(x - playerSide) < 130) x += sign(x - playerSide || 1) * 160;
      const type = comp[i];
      this.spawnQueue.push({ type, x: clamp(x, this.arenaMinX + 90, this.arenaMaxX - 90), delay: 0.15 + i * 0.18 });
    }
    this.queueLen = this.spawnQueue.length;
    Sound.SFX.wave();
  }

  spawnEnemy(type, x) {
    const hpMul = 1 + Math.max(0, this.wave - 1) * 0.07;
    const e = new Enemy(this, type, x, { hpMul });
    e.facing = sign(this.player.x - x) || 1;
    this.enemies.push(e);
    // spawn portal effect
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'spark', x: x + Math.cos(a) * rand(10, 40), y: this.groundY - rand(0, 30),
        vx: Math.cos(a) * rand(20, 140), vy: -rand(100, 380), size: rand(1.4, 3.4),
        life: rand(0.25, 0.5), col: type === 'chorus' ? '#5ee7ff' : '#ff6b7a', add: true, drag: 3,
      });
    }
    this.particles.add({ type: 'ring', x, y: this.groundY, size: 40, life: 0.35, col: 'rgba(255,110,120,0.6)', add: true });
    return e;
  }

  addTrauma(v) { this.camera.addTrauma(v); }

  // ======================================================================
  // combat helpers
  // ======================================================================
  playerHitbox(d) {
    const p = this.player;
    const f = p.facing;
    const x0 = f > 0 ? p.x + 8 : p.x - d.reachFront;
    const x1 = f > 0 ? p.x + d.reachFront : p.x - 8;
    return { x0, x1, y0: p.y - d.yBot, y1: p.y - d.yTop };
  }

  checkPlayerHit(player, def, hitSet) {
    const hb = this.playerHitbox(def);
    let hitAny = false;
    const blade = player.getBladeWorld();
    const sweeping = def.power > 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (hitSet.has(e.id)) continue;
      const s = e.scale;
      const ex0 = e.x - 26 * s, ex1 = e.x + 26 * s;
      const ey0 = e.y - e.cfg.bodyH * s, ey1 = e.y;
      if (hb.x1 < ex0 || hb.x0 > ex1) continue;
      if (hb.y1 < ey0 || hb.y0 > ey1) continue;
      // ignore if fully behind the player
      if ((e.x - player.x) * player.facing < -34) continue;
      hitSet.add(e.id);

      // --- contact-based limb targeting: does the blade actually cross a limb? ---
      let contact = e.partFromBlade(sweeping ? blade : null);
      let part = contact ? contact.part : undefined;
      let hx, hy;
      if (contact) { hx = contact.x; hy = contact.y; }
      else {
        // fall back to the nearest point of the enemy silhouette to the blade
        const best = pointSegDist(e.x, e.y - e.cfg.bodyH * s * 0.58, blade.base.x, blade.base.y, blade.tip.x, blade.tip.y);
        hx = best.x; hy = best.y;
        if (best.d > 96 * s) { hitSet.delete(e.id); continue; }
      }
      this.resolvePlayerHit(e, def, hx, hy, player, part);
      hitAny = true;
    }
    return hitAny;
  }

  resolvePlayerHit(e, def, hx, hy, player, part) {
    const dir = sign(e.x - player.x) || player.facing;
    const isHeavy = def.power >= 1.35;
    const res = e.takeHit(def.dmg, hx, hy, {
      limbMul: def.limbMul, heavy: isHeavy || def.heavyKill, charged: def.power >= 2,
      knock: def.knock, lift: def.lift, dir,
      poiseDmg: def.power, interrupt: def.dmg >= 11, guardBreak: def.guardBreak,
      staggerTime: def.dmg >= 20 ? 0.6 : 0.4, part,
    });
    if (!res) return;
    this.hitCount++;
    this.damageDealt += res.dmg;
    this.addEnergy((res.broke ? 7 : 2.6) * (res.killed ? 2 : 1));
    this.comboCount++;
    this.comboTimer = 1.7;
    this.maxCombo = Math.max(this.maxCombo, this.comboCount);
    this.hitFeedback(hx, hy, {
      heavy: isHeavy || def.dmg >= 15,
      crit: res.part === 'head' || !!res.broke,
      kill: res.killed,
      dmg: res.dmg,
      dir,
      part: res.part,
      broke: res.broke,
      power: def.power,
      noHitstop: false,
    });
    // killing blow gets a short, capped slow-motion flourish (never longer than 0.35s)
    if (res.killed) {
      this.slowmoT = Math.max(this.slowmoT, 0.30);
      this.camera.targetZoom = Math.max(0.25, this.camera.targetZoom - 0.05);
      this.killFocusT = 0.30;
    }
    // hit stop based on weight
    const stop = def.stop * (res.broke ? 1.5 : 1) * (res.killed ? 1.25 : 1);
    this.hitstop = Math.max(this.hitstop, Math.min(0.19, stop));
    this.freeze = Math.max(this.freeze, 0.012);
    // camera trauma
    this.addTrauma(def.shake * (res.broke ? 1.5 : 1) * (res.killed ? 1.2 : 1));
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - def.shake * 0.10);

    // mark the juggle target so air attacks can home in briefly
    if (res && (def.lift < -80 || (e.vy < -200 && !e.dead))) {
      this.juggleTarget = e;
      this.juggleT = 0.45;
    }

    // combo popup cadence
    if (this.comboCount >= 2 && this.comboCount % 5 === 0) {
      this.popups.add(`${this.comboCount} HIT`, player.x, player.y - 190, {
        size: 20, col: '#ffd166', life: 0.65, vy: -60, shake: 1,
      });
    }

    // ---- directional impact burst ----
    const cont = this.particles;
    const power = def.power;
    const heavy = isHeavy;
    // cone of sparks spraying along the strike direction
    const sparkN = heavy ? 22 : 13;
    for (let i = 0; i < sparkN; i++) {
      const spreadA = rand(-0.75, 0.75);
      const baseAng = dir > 0 ? 0 : Math.PI;
      const ang = baseAng + spreadA + (def.lift < -80 ? -0.5 : 0);
      const sp = rand(160, 620) * (0.6 + power * 0.4);
      cont.add({
        type: 'spark', x: hx + rand(-3, 3), y: hy + rand(-3, 3),
        vx: Math.cos(ang) * sp + dir * rand(60, 220),
        vy: Math.sin(ang) * sp + rand(-120, 60),
        size: rand(1.3, heavy ? 4.2 : 3),
        life: rand(0.10, heavy ? 0.34 : 0.24),
        col: pick(['#fffdf2', '#fff0c0', '#ffc98a', '#ff8a5c', '#dff5ff']),
        add: true, drag: 2.8, grav: 420,
      });
    }
    // white-hot core flash
    cont.add({
      type: 'ring', x: hx, y: hy, size: heavy ? 26 : 15, life: heavy ? 0.13 : 0.09,
      col: 'rgba(255,255,245,0.95)', add: true,
    });
    // expanding shock rings
    cont.add({
      type: 'ring', x: hx, y: hy, size: heavy ? 48 : 28, life: heavy ? 0.26 : 0.17,
      col: heavy ? 'rgba(255,214,140,0.75)' : 'rgba(225,248,255,0.6)', add: true,
    });
    if (heavy || res.broke) {
      cont.add({ type: 'ring', x: hx, y: hy, size: 92, life: 0.36, col: 'rgba(255,120,100,0.4)', add: true });
      // radial blood/metal mist
      for (let i = 0; i < 10; i++) {
        const ang = rand(0, TAU);
        cont.add({
          type: 'dust', x: hx, y: hy, vx: Math.cos(ang) * rand(60, 260), vy: Math.sin(ang) * rand(60, 220) - 40,
          size: rand(3, 8), life: rand(0.25, 0.6), col: 'rgba(255,180,150,0.10)', drag: 2.2,
        });
      }
    }
    // crackle lines radiating from the hit point
    for (let i = 0; i < (heavy ? 5 : 3); i++) {
      const ang = rand(0, TAU);
      const len = rand(22, heavy ? 74 : 44);
      this.flashList.push({
        x: hx, y: hy, t: 0, life: 0.08 + rand(0, 0.07),
        size: len, dir, ang, type: 'crackle',
      });
    }
    // impact cross flash
    this.flashList.push({ x: hx, y: hy, t: 0, life: isHeavy ? 0.16 : 0.10, size: isHeavy ? 46 : 26, dir, type: 'cross' });

    // afterimage ghost of the strike pose (player) for weight
    if (def.power >= 1.1 || res.broke) {
      this.ghosts.push({
        x: player.x, y: player.y, facing: player.facing,
        pose: poseCopy(player.pose), t: 0, life: 0.22, col: '#bff0ff', alpha: 0.22,
      });
    }
  }

  hitFeedback(x, y, opts) {
    const pan = clamp((x - this.camera.x) / 640, -1, 1) * 0.8;
    if (opts.heavy) Sound.SFX.hitHeavy(pan);
    else if (opts.crit) Sound.SFX.hitCrit(pan);
    else Sound.SFX.hitLight(pan);
    Sound.duck(0.55, 0.25);
    if (opts.dmg !== undefined) {
      const txt = Math.round(opts.dmg).toString();
      this.popups.add(txt, x + rand(-14, 14), y - 18, {
        size: opts.heavy ? 30 : 22, col: opts.heavy ? '#ffe9b0' : '#ffffff',
        crit: !!opts.crit, life: 0.6, vy: -140, vx: rand(-40, 40) + (opts.dir || 0) * 40,
      });
    }
    this.screenFlash = Math.max(this.screenFlash, opts.kill ? 0.10 : opts.heavy ? 0.055 : 0.018);
  }

  checkEnemyAttack(e, a, dt) {
    const p = this.player;
    if (!p.alive) return;
    if (a.hit) return;
    if (a.projectile) return;
    const s = e.scale;
    const f = e.facing;
    const fx = e.x;
    const px = p.x, py = p.y;
    const dx = (px - fx) * f;
    const reach = a.reach * 0.95;
    const height = (e.y - py);
    if (dx < -26 || dx > reach) return;
    // vertical band
    const cy = e.y - 70 * s;
    const top = e.y - a.arcBot, bot = e.y - a.arcTop;
    if (py - 150 > bot || py < top - 20) return;
    // hit!
    a.hit = true;
    // 断界一闪: a trained guard turns any blow into a screen-wide counter
    if (p.state === 'onslaught' && p.riftGuard > 0 && !p.riftCountered) {
      p.riposteRift();
      e.staggerT = 0;
      e.attack = null;
      e.attackingNow = false;
      e.setState('stagger');
      e.staggerT = 0.5;
      return;
    }
    const result = p.takeDamage(a.dmg, sign(px - fx) || f, { parryable: true });
    if (result === 'parried') {
      e.staggerT = 0;
      e.attack = null;
      e.attackingNow = false;
      e.setState('stagger');
      e.staggerT = 1.0;
      e.vx = sign(e.x - p.x) * 320;
      e.vy = -160;
      e.poise = 0;
      this.onParry(p, e);
      this.hitstop = Math.max(this.hitstop, 0.14);
    }
  }

  onParry(player, enemy) {
    Sound.SFX.parry(0);
    Sound.duck(0.4, 0.4);
    this.addTrauma(0.42);
    this.screenFlash = Math.max(this.screenFlash, 0.13);
    this.hitstop = Math.max(this.hitstop, 0.15);
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.06);
    this.parryCount = (this.parryCount || 0) + 1;
    this.player.deadParryWindow = 0.6;
    this.bannerSub = 'PARRY';
    // radial burst
    const cx = player.x, cy = player.y - 90;
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'spark', x: cx, y: cy,
        vx: Math.cos(a) * rand(160, 520), vy: Math.sin(a) * rand(160, 520),
        size: rand(1.6, 4), life: rand(0.2, 0.5), col: pick(['#e8fbff', '#9fe9ff', '#ffffff', '#ffd7c4']),
        add: true, drag: 2.2,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.particles.add({
        type: 'ring', x: cx, y: cy, size: 40 + i * 26, life: 0.3 + i * 0.1,
        col: 'rgba(200,245,255,0.7)', add: true,
      });
    }
    this.popups.add('PARRY', cx, cy - 70, { size: 34, col: '#bff8ff', life: 0.8, vy: -60 });
    // free hit: player gains brief invulnerability and a free "counter" buff
    player.iFrames = Math.max(player.iFrames, 0.45);
    this.comboTimer = Math.max(this.comboTimer, 1.2);
    this.comboCount += 2;
    this.freeze = Math.max(this.freeze, 0.02);
  }

  onProjectileParried(pr) {
    Sound.SFX.parry(0);
    this.addTrauma(0.25);
    this.screenFlash = Math.max(this.screenFlash, 0.08);
    this.hitstop = Math.max(this.hitstop, 0.1);
    for (let i = 0; i < 16; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'spark', x: pr.x, y: pr.y, vx: Math.cos(a) * rand(120, 380), vy: Math.sin(a) * rand(120, 380),
        size: rand(1.5, 3.2), life: rand(0.15, 0.4), col: pick(['#bff8ff', '#ffffff']), add: true, drag: 2.4,
      });
    }
    this.popups.add('DEFLECT', pr.x, pr.y - 24, { size: 22, col: '#bff8ff', life: 0.6 });
  }

  shockwave(x, y, radius, dmg, source, owner) {
    // radial damage, source 'player' or 'enemy'
    const p = this.player;
    if (source === 'player') {
      for (const e of this.enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.x - x, e.y - y);
        if (d < radius) {
          const dir = sign(e.x - x) || 1;
          const falloff = 1 - (d / radius) * 0.6;
          const res = e.takeHit(dmg * falloff, e.x - dir * 10, e.y - e.cfg.bodyH * 0.35, {
            limbMul: 1.1, heavy: true, charged: true, knock: 260, lift: -260, dir,
            poiseDmg: 2.4, interrupt: true, guardBreak: true, staggerTime: 0.7,
          });
          if (!res) continue;
          this.hitCount++;
          this.comboCount++;
          this.comboTimer = 1.7;
          this.maxCombo = Math.max(this.maxCombo, this.comboCount);
          this.hitFeedback(e.x, e.y - 60, { heavy: true, dmg: res.dmg, dir, kill: res.killed, broke: res.broke });
        }
      }
    } else {
      if (p.alive) {
        const d = Math.hypot(p.x - x, p.y - y);
        if (d < radius) {
          p.takeDamage(dmg, sign(p.x - x) || 1, {});
        }
      }
    }
    // ground dust ring
    for (let i = 0; i < 22; i++) {
      const a = (i / 22) * TAU;
      const sp = rand(160, 460);
      this.particles.add({
        type: 'dust', x: x + Math.cos(a) * 20, y: y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.24 - rand(30, 120),
        size: rand(3, 8), life: rand(0.3, 0.6), col: 'rgba(200,190,175,0.35)', drag: 2.5, grav: 360,
      });
    }
    // flat, ground-hugging shockwave rings (drawn as squashed ellipses)
    for (let k = 0; k < 3; k++) {
      const sp = this.particles.add({
        type: 'dot', x, y: y - 2, vx: 0, vy: 0, size: 0.001, life: 0.26 + k * 0.08,
        col: 'transparent', add: false, fade: 0.6,
      });
      this.waves.push({ x, y: y - 2, t: 0, life: 0.30 + k * 0.09, maxR: radius * (0.62 + k * 0.22), col: source === 'player' ? '255,206,130' : '255,120,90', w: 5 - k });
    }
    this.decals.add({ x, y: y + 1, r: 26, col: 'rgba(20,14,10,0.45)', alpha: 0.5, life: 12, flat: 0.3 });
  }

  spawnProjectile(e, a) {
    const s = e.scale;
    const dir = e.facing;
    const proj = new Projectile(this, e, e.x + dir * 26, e.y - 104 * s, dir * 520, -90, {
      dmg: a.dmg, radius: 12 * s, life: 2.0,
    });
    this.projectiles.push(proj);
    Sound.SFX.slash(1.2, e.pan());
    for (let i = 0; i < 8; i++) {
      this.particles.add({
        type: 'spark', x: e.x + dir * 24, y: e.y - 104 * s,
        vx: dir * rand(60, 260), vy: rand(-160, 160), size: rand(1.2, 2.6),
        life: rand(0.1, 0.24), col: '#9ff4ff', add: true, drag: 2,
      });
    }
  }

  // ======================================================================
  // limb breaking
  // ======================================================================

  // ======================================================================
  // SKILL FX HOOKS
  // ======================================================================
  addEnergy(v) {
    const p = this.player;
    if (!p || !p.alive) return;
    p.energy = Math.min(p.maxEnergy, p.energy + v);
  }

  onSkillChargeFull(p) {
    this.addTrauma(0.10);
    this.particles.add({ type: 'ring', x: p.x, y: p.y - 90, size: 44, life: 0.22, col: 'rgba(255,225,160,0.8)', add: true });
    Sound.SFX.bell(3);
  }

  onBlinkStart(p, charge) {
    const cx = p.x, cy = p.y - 90;
    this.addTrauma(0.30 + charge * 0.15);
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.045);
    this.screenFlash = Math.max(this.screenFlash, 0.07);
    this.hitstop = Math.max(this.hitstop, 0.05);
    this.ghosts.push({ x: cx, y: p.y, facing: p.facing, pose: poseCopy(p.pose), t: 0, life: 0.42, col: '#9fe9ff', alpha: 0.30 });
    for (let i = 0; i < 30; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'spark', x: cx + Math.cos(a) * rand(6, 30), y: cy + Math.sin(a) * rand(10, 50),
        vx: Math.cos(a) * rand(140, 560), vy: Math.sin(a) * rand(140, 460),
        size: rand(1.4, 3.8), life: rand(0.16, 0.44),
        col: pick(['#eafcff', '#9fe9ff', '#ffffff', '#ffd6c4']), add: true, drag: 2.4,
      });
    }
    this.particles.add({ type: 'ring', x: cx, y: cy, size: 60, life: 0.3, col: 'rgba(160,235,255,0.75)', add: true });
    this.particles.add({ type: 'ring', x: cx, y: cy, size: 100, life: 0.42, col: 'rgba(255,120,150,0.35)', add: true });
    this.bannerSub = charge >= 0.85 ? '裂空·极' : '裂空斩';
  }

  onBlinkTrail(p, prevX) {
    const dir = sign(p.x - prevX) || p.facing;
    // long cutting streak behind the player
    this.slashes.add({
      life: 0.30, width: 26, col: '#e9fdff', col2: '#ff5a7a',
      follow: () => ({ x: p.x + dir * 10, y: p.y - 120, bx: p.x - dir * 60, by: p.y - 40 }),
    });
    // leave a row of horizontal cut lines in the air
    if (Math.random() < 0.85) {
      this.cuts.push({ x: p.x - dir * rand(0, 40), y: p.y - rand(20, 180), len: rand(30, 90), t: 0, life: 0.34, ang: rand(-0.25, 0.25), dir });
    }
    this.particles.add({
      type: 'dot', x: p.x - dir * rand(10, 60), y: p.y - rand(20, 170),
      vx: -dir * rand(80, 320), vy: rand(-40, 40), size: rand(1.6, 3.4),
      life: rand(0.2, 0.4), col: 'rgba(175,240,255,0.75)', add: true, drag: 2.2,
    });
  }

  onBlinkEnd(p) {
    this.addTrauma(0.22);
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.03);
    this.screenFlash = Math.max(this.screenFlash, 0.05);
    // exit burst: a big X slash at the landing point
    for (let k = 0; k < 2; k++) {
      const a = -0.6 + k * 1.2;
      for (let i = 0; i < 12; i++) {
        const d = (i / 12) * 90;
        this.particles.add({
          type: 'spark', x: p.x + Math.cos(a) * d, y: p.y - 90 + Math.sin(a) * d,
          vx: Math.cos(a) * rand(80, 260), vy: Math.sin(a) * rand(80, 260),
          size: rand(1.2, 2.8), life: rand(0.12, 0.3), col: '#eafcff', add: true, drag: 3,
        });
      }
    }
    this.particles.add({ type: 'ring', x: p.x, y: p.y - 90, size: 52, life: 0.26, col: 'rgba(255,190,180,0.6)', add: true });
  }

  onStormStart(p) {
    this.addTrauma(0.34);
    Sound.SFX.overdrive(p.pan());
    this.bannerSub = '千刃风暴';
    // ground shock ring + vertical wind column
    this.waves.push({ x: p.x, y: this.groundY - 2, t: 0, life: 0.5, maxR: 210, col: '255,180,120', w: 6 });
    for (let i = 0; i < 34; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'streak', x: p.x + Math.cos(a) * rand(10, 90), y: p.y - rand(0, 60),
        vx: Math.cos(a) * rand(120, 420), vy: -rand(100, 420),
        size: rand(2, 5), rot: a, life: rand(0.3, 0.7), col: pick(['#ffd9a0', '#fff0d0', '#9fe9ff']), add: true, drag: 1.4,
      });
    }
  }

  onStormTick(p, isLast) {
    const r = 130;
    // blade arcs orbiting the player
    const a0 = p.stormT * 26;
    this.slashes.add({
      life: isLast ? 0.32 : 0.14, width: isLast ? 40 : 20,
      col: isLast ? '#fffdf2' : '#dff8ff', col2: isLast ? '#ff4d6d' : '#ff9a7a',
      follow: () => {
        const ang = a0 + Math.random() * 0.4;
        return {
          x: p.x + Math.cos(ang) * r, y: p.y - 110 + Math.sin(ang) * r * 0.9,
          bx: p.x + Math.cos(ang) * 26, by: p.y - 110 + Math.sin(ang) * 26 * 0.9,
        };
      },
    });
    if (isLast) {
      this.addTrauma(0.46);
      this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.05);
      this.hitstop = Math.max(this.hitstop, 0.12);
      this.waves.push({ x: p.x, y: this.groundY - 2, t: 0, life: 0.42, maxR: 280, col: '255,214,140', w: 7 });
      for (let i = 0; i < 30; i++) {
        const a = (i / 30) * TAU;
        this.particles.add({
          type: 'spark', x: p.x, y: p.y - 60, vx: Math.cos(a) * rand(280, 700), vy: Math.sin(a) * rand(280, 700) - 120,
          size: rand(1.6, 4), life: rand(0.22, 0.5), col: pick(['#fff6dc', '#ffd58a', '#ffffff']), add: true, drag: 2.2,
        });
      }
    } else {
      this.particles.add({ type: 'ring', x: p.x, y: p.y - 110, size: 96, life: 0.1, col: 'rgba(200,240,255,0.35)', add: true });
    }
  }

  onStormEnd(p) {
    this.addTrauma(0.2);
    for (let i = 0; i < 18; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'ember', x: p.x + Math.cos(a) * rand(10, 80), y: p.y - rand(20, 180),
        vx: Math.cos(a) * rand(20, 120), vy: -rand(20, 100), size: rand(1.4, 3),
        life: rand(0.4, 0.9), col: '#ffe0b0', add: true,
      });
    }
  }

  onRiftStart(p) {
    this.addTrauma(0.08);
    this.bannerSub = '断界一闪';
    // blue guard field
    this.particles.add({ type: 'ring', x: p.x, y: p.y - 90, size: 54, life: 0.3, col: 'rgba(150,235,255,0.6)', add: true });
    Sound.SFX.bell(1);
  }

  onRiftMiss(p) {
    this.particles.add({ type: 'ring', x: p.x, y: p.y - 90, size: 30, life: 0.18, col: 'rgba(140,190,220,0.35)', add: true });
  }

  // The payoff: negate the incoming hit, then a screen-wide counter-cut.
  onRiftCounter(p) {
    this.bannerSub = '断界 · 反';
    this.hitstop = Math.max(this.hitstop, 0.16);
    this.addTrauma(0.55);
    this.screenFlash = Math.max(this.screenFlash, 0.10);
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.09);
    this.slowmoT = Math.max(this.slowmoT, 0.26);
    Sound.SFX.parry(0);
    Sound.SFX.hitCrit(0);
    // full-screen judgement line
    const cy = p.y - 100;
    this.riftLines.push({ y: cy, t: 0, life: 0.5, x: p.x, dir: p.facing });
    for (let i = 0; i < 40; i++) {
      const a = rand(-0.35, 0.35);
      this.particles.add({
        type: 'spark', x: p.x + rand(-30, 30), y: cy + rand(-40, 40),
        vx: Math.cos(a) * rand(300, 900) * p.facing, vy: Math.sin(a) * rand(100, 380),
        size: rand(1.4, 3.6), life: rand(0.2, 0.5), col: pick(['#eafcff', '#ffffff', '#9fe9ff']), add: true, drag: 1.9,
      });
    }
    this.particles.add({ type: 'ring', x: p.x, y: cy, size: 120, life: 0.34, col: 'rgba(190,245,255,0.7)', add: true });
    // damage + stagger everything nearby (radius 300) — this is a real counter, not just invuln
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.abs(e.x - p.x);
      if (d > 300) continue;
      const dir = sign(e.x - p.x) || p.facing;
      this.resolvePlayerHit(e, {
        name: 'rift', dmg: 26, limbMul: 2.4, knock: 460, lift: -300,
        stop: 0.06, shake: 0.2, power: 2.0, poiseDmg: 3,
        heavyKill: true, guardBreak: true,
      }, e.x - dir * 12, e.y - e.cfg.bodyH * e.scale * 0.5, p);
      n++;
    }
    // brief follow-up attack so the counter leads into offense
    if (n > 0) this.hitstop = Math.max(this.hitstop, 0.10);
    this.popups.add('断界', p.x, p.y - 190, { size: 34, col: '#bff8ff', life: 0.9, vy: -50 });
  }

  onFinaleStart(p) {
    this.bannerSub = '终式 · 万刃归一';
    this.finaleSlow = 1.0;
    this.slowmoT = Math.max(this.slowmoT, 1.05);
    this.addTrauma(0.35);
    this.screenFlash = Math.max(this.screenFlash, 0.10);
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.12);
    Sound.SFX.overdrive(0);
    Sound.SFX.bell(2);
    // rise burst
    for (let i = 0; i < 46; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'spark', x: p.x, y: p.y - 90, vx: Math.cos(a) * rand(200, 700), vy: Math.sin(a) * rand(200, 620),
        size: rand(1.4, 3.6), life: rand(0.3, 0.7), col: pick(['#ffffff', '#ffe1a8', '#9fe9ff']), add: true, drag: 1.7,
      });
    }
    for (let i = 0; i < 3; i++) {
      this.particles.add({ type: 'ring', x: p.x, y: p.y - 90, size: 60 + i * 60, life: 0.45 + i * 0.1, col: 'rgba(255,230,180,0.7)', add: true });
    }
    this.popups.add('终 式', p.x, p.y - 220, { size: 40, col: '#ffe9b0', life: 1.2, vy: -30 });
  }

  onFinaleTrail(p) {
    const a = rand(-0.5, 0.5);
    const len = rand(80, 190);
    this.cuts.push({ x: p.x, y: p.y - 100, len, t: 0, life: 0.5, ang: a, dir: p.facing });
    this.ghosts.push({ x: p.x + rand(-40, 40), y: p.y, facing: p.facing, pose: poseCopy(p.pose), t: 0, life: 0.3, col: '#ffe9b0', alpha: 0.26 });
  }

  onFinaleCut(p, e) {
    this.hitstop = Math.max(this.hitstop, 0.06);
    this.addTrauma(0.22);
    for (let i = 0; i < 28; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'shard', x: e.x, y: e.y - rand(20, 160), vx: Math.cos(a) * rand(100, 520),
        vy: Math.sin(a) * rand(100, 460) - 180, size: rand(2, 6), rot: rand(0, TAU), vr: rand(-20, 20),
        life: rand(0.4, 0.9), col: pick(['#ffe9b0', '#ffffff', e.cfg.colors.plate2]),
        grav: 1400, floor: this.groundY, bounce: 0.35,
      });
    }
    for (let k = 0; k < 3; k++) {
      this.cuts.push({ x: e.x, y: e.y - rand(40, 150), len: rand(70, 130), t: 0, life: 0.45, ang: rand(-0.7, 0.7), dir: p.facing });
    }
  }

  onFinaleFinish(p) {
    this.hitstop = Math.max(this.hitstop, 0.18);
    this.addTrauma(0.75);
    this.screenFlash = Math.max(this.screenFlash, 0.16);
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.16);
    this.waves.push({ x: p.x, y: this.groundY - 2, t: 0, life: 0.7, maxR: 620, col: '255,225,170', w: 9 });
    this.waves.push({ x: p.x, y: this.groundY - 2, t: 0, life: 0.55, maxR: 400, col: '255,140,150', w: 6 });
    // detonate every marked enemy with a burst
    for (const e of this.finalMarks || []) {
      if (e.dead) continue;
      e.takeHit(24, e.x, e.y - e.cfg.bodyH * e.scale * 0.5, {
        part: chance(0.6) ? pick(['armF', 'armB', 'legF', 'legB']) : undefined,
        limbMul: 3.4, heavy: true, charged: true, knock: 200, lift: -320,
        dir: sign(e.x - p.x) || 1, poiseDmg: 4, interrupt: true, guardBreak: true, forceBreak: true,
      });
      this.onFinaleCut(p, e);
    }
    Sound.SFX.hitHeavy(0);
    Sound.SFX.enemyDie(0);
    this.popups.add('斩 · 尽', p.x, p.y - 210, { size: 38, col: '#fff3cf', life: 1.1, vy: -40 });
  }

  onFinaleLand(p) {
    this.addTrauma(0.25);
    for (let i = 0; i < 20; i++) {
      this.particles.add({
        type: 'dust', x: p.x + rand(-30, 30), y: this.groundY, vx: rand(-260, 260), vy: rand(-120, -10),
        size: rand(3, 8), life: rand(0.25, 0.5), col: 'rgba(210,200,180,0.3)', drag: 3,
      });
    }
    Sound.SFX.land(1.1, p.pan());
  }

  onLimbBreak(e, part, hx, hy) {
    Sound.SFX.limbBreak(e.pan());
    Sound.duck(0.4, 0.45);
    this.addTrauma(0.52);
    this.screenFlash = Math.max(this.screenFlash, 0.06);
    this.hitstop = Math.max(this.hitstop, 0.13);
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.05);
    this.limbBreakCount++;
    const s = e.scale;
    const sk = e.skeleton();
    const C = e.cfg.colors;
    let spawnX, spawnY, kind;
    if (part === 'head') { spawnX = sk.head.x; spawnY = sk.head.y; kind = 'head'; }
    else if (part === 'armF') { spawnX = lerp(sk.shF.x, sk.handF.x, 0.6); spawnY = lerp(sk.shF.y, sk.handF.y, 0.6) - 40; kind = 'arm'; }
    else if (part === 'armB') { spawnX = lerp(sk.shB.x, sk.handB.x, 0.6); spawnY = lerp(sk.shB.y, sk.handB.y, 0.6) - 40; kind = 'arm'; }
    else if (part === 'legF') { spawnX = lerp(sk.hipF.x, sk.footF.x, 0.5); spawnY = lerp(sk.hipF.y, sk.footF.y, 0.5) - 60; kind = 'leg'; }
    else { spawnX = lerp(sk.hipB.x, sk.footB.x, 0.5); spawnY = lerp(sk.hipB.y, sk.footB.y, 0.5) - 60; kind = 'leg'; }

    const dir = sign(e.x - this.player.x) || 1;
    const d = new Debris(this, kind, spawnX, spawnY,
      dir * rand(180, 420) + this.player.facing * 160, rand(-680, -380),
      {
        col: C.plate, col2: C.bone, thread: C.thread, scale: s * rand(0.9, 1.05),
        life: 5.5, bloodCol: e.bloodCol, rot: rand(0, TAU), vr: rand(-18, 18),
      });
    this.debris.push(d);

    // lots of shards and gore sparks
    for (let i = 0; i < 26; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'shard', x: spawnX + rand(-10, 10), y: spawnY + rand(-10, 10),
        vx: Math.cos(a) * rand(60, 420) + dir * 100, vy: Math.sin(a) * rand(60, 380) - 240,
        size: rand(1.6, 4.8), rot: rand(0, TAU), vr: rand(-20, 20),
        life: rand(0.35, 0.9), col: pick([C.plate2, C.bone, C.bone2, '#ffffff']),
        grav: 1700, floor: this.groundY, bounce: 0.4,
      });
    }
    for (let i = 0; i < 12; i++) {
      this.particles.add({
        type: 'dot', x: spawnX, y: spawnY, vx: rand(-260, 260), vy: rand(-260, 120),
        size: rand(1.4, 3), life: rand(0.25, 0.6), col: e.bloodCol, add: true, drag: 1.8,
        grav: 900, floor: this.groundY,
      });
    }
    this.particles.add({ type: 'ring', x: spawnX, y: spawnY, size: 52 * s, life: 0.32, col: 'rgba(255,190,150,0.7)', add: true });
    this.particles.add({ type: 'ring', x: spawnX, y: spawnY, size: 90 * s, life: 0.42, col: 'rgba(255,80,80,0.35)', add: true });

    const label = part === 'head' ? 'HEAD BREAK' : part.startsWith('leg') ? 'LEG SEVERED' : 'ARM SEVERED';
    this.popups.add(label, e.x, e.y - e.cfg.bodyH * s - 30, {
      size: part === 'head' ? 28 : 22, col: '#ffd0a0', life: 1.0, vy: -40,
    });
    this.bannerSub = label;

    // sap splatter decal
    this.decals.add({ x: spawnX, y: this.groundY + 1, r: 20 + s * 12, col: e.type === 'chorus' ? 'rgba(30,80,95,0.45)' : 'rgba(60,12,18,0.5)', alpha: 0.55, life: 16 });
  }

  onEnemyDeath(e, opts) {
    this.killCount++;
    Sound.SFX.enemyDie(e.pan());
    Sound.duck(0.35, 0.5);
    this.addTrauma(0.3);
    this.screenFlash = Math.max(this.screenFlash, 0.05);
    this.hitstop = Math.max(this.hitstop, 0.09);
    this.camera.targetZoom = Math.max(0.3, this.camera.targetZoom - 0.03);
    this.freeze = Math.max(this.freeze, 0.03);
    this.killStreak++;
    this.killStreakT = 0.6;
    const s = e.scale;
    // burst shards
    for (let i = 0; i < 34; i++) {
      const a = rand(0, TAU);
      this.particles.add({
        type: 'shard', x: e.x + rand(-20, 20), y: e.y - rand(10, e.cfg.bodyH * s * 0.9),
        vx: Math.cos(a) * rand(80, 480), vy: Math.sin(a) * rand(100, 460) - 260,
        size: rand(2, 6), rot: rand(0, TAU), vr: rand(-24, 24),
        life: rand(0.4, 1.0), col: pick([e.cfg.colors.plate, e.cfg.colors.plate2, e.cfg.colors.bone, '#ffffff']),
        grav: 1600, floor: this.groundY, bounce: 0.42,
      });
    }
    for (let i = 0; i < 16; i++) {
      this.particles.add({
        type: 'dot', x: e.x, y: e.y - rand(30, 140) * s, vx: rand(-240, 240), vy: rand(-320, 100),
        size: rand(1.5, 3.4), life: rand(0.3, 0.7), col: e.bloodCol, add: true, drag: 1.5, grav: 700, floor: this.groundY,
      });
    }
    // remaining limbs pop off as debris for spectacle
    const sk = e.skeleton();
    const leftover = [];
    if (!e.parts.armF.broken) leftover.push(['arm', sk.handF.x, sk.handF.y - 30]);
    if (!e.parts.armB.broken) leftover.push(['arm', sk.handB.x, sk.handB.y - 30]);
    if (!e.parts.legF.broken) leftover.push(['leg', sk.footF.x, sk.footF.y - 30]);
    if (!e.parts.legB.broken) leftover.push(['leg', sk.footB.x, sk.footB.y - 30]);
    if (!e.parts.head.broken) leftover.push(['head', sk.head.x, sk.head.y]);
    for (const [kind, lx, ly] of leftover) {
      const dir = rand(-1, 1);
      this.debris.push(new Debris(this, kind, lx, ly, dir * rand(160, 420), rand(-560, -260), {
        col: e.cfg.colors.plate, col2: e.cfg.colors.bone, thread: e.cfg.colors.thread,
        scale: s, life: 5 + rand(0, 2), bloodCol: e.bloodCol,
        rot: rand(0, TAU), vr: rand(-16, 16),
      }));
    }
    // only shout BREAK if no limb label is already on screen for this husk
    const hasLimbLabel = this.popups.list.some(p => p.life > 0.5 && Math.abs(p.x - e.x) < 110 && /SEVERED|BREAK/.test(p.text));
    if (!hasLimbLabel) this.popups.add('BREAK', e.x, e.y - e.cfg.bodyH * s - 10, { size: 26, col: '#ffb37a', life: 0.9, vy: -70 });
  }

  onPlayerDeath() {
    this.state = 'over';
    this.overT = 0;
    this.slowmoT = 0.9;
    this.addTrauma(0.7);
    this.screenFlash = 0.2;
    Sound.SFX.hurt(0);
    Sound.SFX.enemyDie(0);
    this.bestCombo = Math.max(this.bestCombo, this.maxCombo);
    this.bestWave = Math.max(this.bestWave, this.wave);
  }

  // ======================================================================
  // update
  // ======================================================================
  update(dt) {
    this.frameSerial++;
    this.time += dt;
    this.camera.time = this.time;
    Input.update(dt);
    this.wind = Math.sin(this.time * 0.7) * 30 + Math.sin(this.time * 0.23 + 2) * 22;

    // decay visual timers regardless of pause
    this.screenFlash = Math.max(0, this.screenFlash - dt * 4.2);
    this.chargeFlash = Math.max(0, this.chargeFlash - dt * 5);
    this.inputFlash = Math.max(0, this.inputFlash - dt * 8);
    this.killStreakT = Math.max(0, this.killStreakT - dt);
    this.killFocusT = Math.max(0, (this.killFocusT || 0) - dt);
    this.hintT += dt;
    if (this.killStreakT <= 0) this.killStreak = 0;
    this.comboTimer = Math.max(0, this.comboTimer - dt);
    this.juggleT = Math.max(0, (this.juggleT || 0) - dt);
    if (this.juggleT <= 0) this.juggleTarget = null;
    if (this.comboTimer <= 0) { this.comboCount = 0; if (this.player) this.player.comboIndex = 0; }

    // banners
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.life) this.banner = null;
    }

    if (this.state === 'title') {
      this.titleT += dt;
      // staged hero pose at frame-right, camera pushed left so the title has clean space
      const px = this.camera.x + 300;
      this.player.x = damp(this.player.x, px, 3, dt);
      this.player.facing = -1;
      this.camera.y = damp(this.camera.y, this.groundY - 205, 3, dt);
      // idle cinematic: animate the player breathing, spawn ambient petals
      this.player.update(dt);
      this.updateAmbient(dt);
      this.camera.update(dt, this.player, [], this.groundY);
      if (Input.consume('confirm') || Input.consumeAny(['light', 'heavy', 'jump'])) this.onStartRequest && this.onStartRequest();
      return;
    }

    if (this.state === 'over') {
      this.overT += dt;
      this.slowmoT = Math.max(0, this.slowmoT - dt);
      this.player.update(dt);
      this.updateWorldObjects(dt);
      this.updateAmbient(dt);
      this.camera.update(dt, this.player, this.enemies, this.groundY);
      if (this.overT > 0.45 && (Input.consume('confirm') || Input.consume('restart'))) {
        this.onRestartRequest ? this.onRestartRequest() : this.startGame();
      }
      return;
    }

    // paused
    if (this.paused) {
      if (Input.consume('pause') || Input.consume('confirm')) {
        this.paused = false;
        Input.clearAll();
      }
      return;
    }
    if (Input.consume('pause')) { this.paused = true; return; }

    // restart
    if (Input.consume('restart')) { this.startGame(); return; }

    // ---- time dilation ----
    const frozen = this.hitstop > 0 || this.freeze > 0;
    let sdt = dt;
    if (this.hitstop > 0) { this.hitstop -= dt; sdt = 0; }
    else if (this.freeze > 0) { this.freeze -= dt; sdt = dt * 0.10; }
    if (this.slowmoT > 0) { this.slowmoT -= dt; sdt *= 0.32; }

    if (sdt <= 0) {
      // still update camera + particles at a crawl for hitstop punch
      this.camera.update(dt * 0.25, this.player, this.enemies, this.groundY);
      this.particles.update(dt * 0.2);
      this.updateFxOnly(dt);
      return;
    }

    // player
    this.player.update(sdt);
    // enemies
    if (!this.aiFrozen) {
      for (const e of this.enemies) {
        if (!e.dead) e.update(sdt);
      }
    }
    this.projectiles.forEach(p => p.update(sdt));
    this.enemies.forEach(e => { if (e.dead) e.update(sdt * 0.6); });
    this.updateWorldObjects(sdt);

    // spawn queue
    if (this.spawnQueue.length) {
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        const q = this.spawnQueue[i];
        q.delay -= sdt;
        if (q.delay <= 0) {
          this.spawnEnemy(q.type, q.x);
          this.spawnQueue.splice(i, 1);
        }
      }
    }

    // wave management
    const aliveEnemies = this.enemies.filter(e => !e.dead).length;
    const allGone = aliveEnemies === 0 && this.spawnQueue.length === 0 &&
      this.enemies.every(e => e.dead && e.deadT > 0.55);
    if (this.waveState === 'fighting') {
      if (allGone) {
        this.waveState = 'clear';
        this.waveT = 0;
        this.banner = { title: `第 ${this.wave} 波 清除`, sub: '整备 · 下一波即将到来', t: 0, life: 1.6, col: '#bff8ff' };
        Sound.SFX.bell(0);
        if (!this.player.alive) return;
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 14);
        this.player.healFlash = 0.6;
        for (let i = 0; i < 26; i++) {
          const a = rand(0, TAU);
          this.particles.add({
            type: 'ember', x: this.player.x + Math.cos(a) * rand(10, 60), y: this.player.y - rand(20, 160),
            vx: Math.cos(a) * rand(10, 70), vy: -rand(30, 110), size: rand(1.4, 3.2),
            life: rand(0.5, 1.1), col: '#c7ffe8', add: true,
          });
        }
      }
    } else if (this.waveState === 'clear') {
      this.waveT += sdt;
      if (this.waveT > 1.15) {
        this.startWave(this.wave + 1);
        this.banner = { title: `第 ${this.wave} 波`, sub: this.wave >= 3 ? '小心重甲与鸣弦' : this.wave >= 2 ? '新敌将至' : '傀儡苏醒', t: 0, life: 1.6, col: '#ffd9a0' };
      }
    }

    // ambient & particles
    this.updateAmbient(sdt);
    this.updateFxOnly(sdt);

    // camera
    this.camera.update(sdt, this.player, this.enemies, this.groundY);
  }

  updateWorldObjects(dt) {
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead && e.deadT > 3.2) this.enemies.splice(i, 1);
    }
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.update(dt);
      if (d.life <= 0) this.debris.splice(i, 1);
    }
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      p.update(dt);
      if (p.dead) this.projectiles.splice(i, 1);
    }
  }

  updateFxOnly(dt) {
    this.particles.update(dt);
    this.slashes.update(dt);
    this.popups.update(dt);
    this.decals.update(dt);
    for (let i = this.flashList.length - 1; i >= 0; i--) {
      const f = this.flashList[i];
      f.t += dt;
      if (f.t >= f.life) this.flashList.splice(i, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const g = this.ghosts[i];
      g.t += dt;
      if (g.t >= g.life) this.ghosts.splice(i, 1);
    }
    for (let i = this.waves.length - 1; i >= 0; i--) {
      const w = this.waves[i];
      w.t += dt;
      if (w.t >= w.life) this.waves.splice(i, 1);
    }
    for (let i = this.cuts.length - 1; i >= 0; i--) {
      const c = this.cuts[i];
      c.t += dt;
      if (c.t >= c.life) this.cuts.splice(i, 1);
    }
    for (let i = this.riftLines.length - 1; i >= 0; i--) {
      const r = this.riftLines[i];
      r.t += dt;
      if (r.t >= r.life) this.riftLines.splice(i, 1);
    }
  }

  updateAmbient(dt) {
    // drifting petals / embers
    if (Math.random() < dt * 16) {
      this.particles.add({
        type: chance(0.4) ? 'ember' : 'petal',
        x: this.camera.x + rand(-620, 620), y: this.camera.y - 300 + rand(-60, 60),
        vx: rand(-40, 40) + this.wind * 0.6, vy: rand(18, 60), size: rand(1.2, 2.8),
        rot: rand(0, TAU), vr: rand(-2, 2), life: rand(3, 6),
        col: chance(0.5) ? 'rgba(255,140,150,0.55)' : 'rgba(255,214,150,0.5)',
        add: true, drag: 0.1,
      });
    }
    // distant mist
    if (Math.random() < dt * 3) {
      this.particles.add({
        type: 'smoke', x: this.camera.x + rand(-700, 700), y: this.camera.y + rand(-40, 140),
        vx: rand(-14, 14) + this.wind * 0.2, vy: rand(-6, 4), size: rand(30, 80),
        life: rand(4, 8), col: 'rgba(120,130,160,0.035)', drag: 0.05, grow: 1.6,
      });
    }
  }

  // ======================================================================
  // render
  // ======================================================================
  resize() {
    const el = this.canvas;
    const rect = el.getBoundingClientRect();
    const w = Math.max(320, rect.width);
    const h = Math.max(180, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    el.width = Math.floor(w * this.dpr);
    el.height = Math.floor(h * this.dpr);
    this.viewW = w;
    this.viewH = h;
    // keep a stable dramatic framing: taller windows zoom in so the duel fills the frame
    this.baseZoom = clamp(h / 545, 0.9, 1.55);
    this.camera.viewW = w;
    this.camera.baseZoom = this.baseZoom;
    this.scale = this.dpr;
  }

  worldTransform(ctx) {
    // map world coords to screen: camera centred, with a base height mapping
    const c = this.camera;
    const cx = this.viewW / 2;
    const cy = this.viewH / 2;
    ctx.translate(cx + c.shakeX / this.dpr, cy + c.shakeY / this.dpr);
    ctx.scale(c.zoom, c.zoom);
    ctx.translate(-c.x, -c.y);
  }

  render(interp) {
    const ctx = this.ctx;
    const W = this.viewW, H = this.viewH;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    this.drawSky(ctx, W, H);

    ctx.save();
    this.worldTransform(ctx);
    this.drawBackground(ctx);
    this.drawGround(ctx);

    // decals under entities
    this.decals.draw(ctx);
    // particles sorted roughly (non-add behind)
    this.drawEntityShadows(ctx);

    // debris
    for (const d of this.debris) d.draw(ctx);
    // enemies
    const sorted = this.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of sorted) e.draw(ctx);
    // afterimage ghosts
    for (const g of this.ghosts) this.drawGhost(ctx, g);
    // player
    this.player.draw(ctx);
    // projectiles
    for (const p of this.projectiles) p.draw(ctx);

    // slashes (additive)
    this.slashes.draw(ctx);
    this.particles.draw(ctx);
    this.drawImpacts(ctx);
    this.popups.draw(ctx);

    this.drawForeground(ctx);

    ctx.restore();

    // screen-space effects
    this.drawScreenFx(ctx, W, H);
    if (this.state === 'playing' || this.state === 'over') this.drawHud(ctx, W, H);
    if (this.state === 'over') this.drawGameOver(ctx, W, H);
    if (this.paused) this.drawPause(ctx, W, H);
    this.drawVignette(ctx, W, H);
  }

  drawEntityShadows(ctx) {
    // handled per-entity
  }

  drawSky(ctx, W, H) {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#05060c');
    g.addColorStop(0.42, '#0b0e1a');
    g.addColorStop(0.74, '#161825');
    g.addColorStop(1, '#0a0b12');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  }

  drawBackground(ctx) {
    const c = this.camera;
    const W = this.viewW / c.zoom, H = this.viewH / c.zoom;
    const left = c.x - W / 2 - 120, right = c.x + W / 2 + 120;
    const gy = this.groundY;

    // ---- far mountains (parallax 0.25) ----
    ctx.save();
    ctx.translate(c.x * 0.75, 0); // counteract camera partially
    this.drawMountainLayer(ctx, left * 0.25 - 1200, right * 0.25 + 1200, gy - 40, 0.55, '#0c101c', '#111629');
    ctx.restore();

    // ---- moon / pale sun ----
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const moonX = c.x * 0.92 + 240;
    const moonY = c.y - 160;
    const mg = ctx.createRadialGradient(moonX, moonY, 4, moonX, moonY, 170);
    mg.addColorStop(0, 'rgba(255,226,190,0.26)');
    mg.addColorStop(0.2, 'rgba(255,200,160,0.10)');
    mg.addColorStop(1, 'rgba(255,180,140,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(moonX, moonY, 170, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(255,236,210,0.9)';
    ctx.beginPath(); ctx.arc(moonX, moonY, 34, 0, TAU); ctx.fill();
    ctx.restore();

    // ---- mid ground: torii / dead forest silhouettes ----
    ctx.save();
    const par = 0.55;
    const offX = c.x * (1 - par);
    this.drawMidGround(ctx, left, right, offX, gy);
    ctx.restore();

    // ---- hanging banners / paper lanterns near play area ----
    this.drawLanterns(ctx, left, right, gy);
  }

  drawMountainLayer(ctx, x0, x1, baseY, amp, colA, colB) {
    const g = ctx.createLinearGradient(0, baseY - 340, 0, baseY + 40);
    g.addColorStop(0, colB);
    g.addColorStop(1, colA);
    ctx.fillStyle = g;
    const step = 90;
    for (let layer = 0; layer < 2; layer++) {
      ctx.beginPath();
      ctx.moveTo(x0, baseY + 200);
      const ph = layer * 3.7;
      for (let x = x0; x <= x1; x += step) {
        const n = noise2(x * 0.0016 + ph, layer * 5 + 1);
        const n2 = noise2(x * 0.006 + ph, layer * 5 + 9);
        const y = baseY - (n * amp * 260 + n2 * amp * 60) - layer * 40;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(x1, baseY + 200);
      ctx.closePath();
      ctx.globalAlpha = layer === 0 ? 1 : 0.55;
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawMidGround(ctx, left, right, offX, gy) {
    // distant torii gates
    const gates = [-980, -300, 380, 1080, 1750];
    for (let i = 0; i < gates.length; i++) {
      const gx = gates[i] * 1 + offX * 0.55;
      this.drawTorii(ctx, gx, gy + 22, 1.25 - (i % 2) * 0.18, i % 2 === 0);
    }
    // dead trees
    for (let i = 0; i < 16; i++) {
      const tx = -2200 + i * 280 + hash1(i * 3.3) * 120 + offX * 0.5;
      if (tx < left - 400 || tx > right + 400) continue;
      this.drawDeadTree(ctx, tx, gy + 10, 0.7 + hash1(i * 7.1) * 0.6);
    }
    // rope fence / background railing at floor line
    ctx.save();
    ctx.strokeStyle = 'rgba(60,52,60,0.85)';
    ctx.lineWidth = 3;
    const y = gy + 6;
    ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    ctx.strokeStyle = 'rgba(40,36,44,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(left, y + 16); ctx.lineTo(right, y + 16); ctx.stroke();
    for (let x = Math.floor(left / 48) * 48; x < right; x += 48) {
      ctx.strokeStyle = 'rgba(52,46,54,0.8)';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x, y - 4); ctx.lineTo(x, y + 30); ctx.stroke();
    }
    ctx.restore();
  }

  drawTorii(ctx, x, y, scale, bright) {
    const s = scale * 1.0;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    const col = bright ? 'rgba(96,28,36,0.85)' : 'rgba(58,20,28,0.75)';
    ctx.fillStyle = col;
    // pillars
    ctx.fillRect(-58, -210, 16, 210);
    ctx.fillRect(42, -210, 16, 210);
    // top beam (kasagi) with upward sweep
    ctx.beginPath();
    ctx.moveTo(-88, -214);
    ctx.quadraticCurveTo(0, -232, 88, -214);
    ctx.lineTo(84, -198);
    ctx.quadraticCurveTo(0, -214, -84, -198);
    ctx.closePath();
    ctx.fill();
    // second beam
    ctx.fillRect(-72, -182, 144, 13);
    // center plaque
    ctx.fillStyle = bright ? 'rgba(150,120,80,0.5)' : 'rgba(80,64,48,0.4)';
    ctx.fillRect(-13, -180, 26, 34);
    // glow rim
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,120,80,0.10)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-58, -210); ctx.lineTo(-58, -4); ctx.stroke();
    ctx.restore();
  }

  drawDeadTree(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.strokeStyle = 'rgba(30,28,36,0.9)';
    ctx.lineCap = 'round';
    // trunk
    ctx.lineWidth = 9;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-6, -70, -16, -140);
    ctx.stroke();
    // branches
    ctx.lineWidth = 4;
    for (let i = 0; i < 4; i++) {
      const by = -60 - i * 24;
      const dir = i % 2 ? 1 : -1;
      ctx.beginPath();
      ctx.moveTo(-6 - i * 2, by);
      ctx.quadraticCurveTo(dir * 30, by - 22, dir * 52 + rand(-4, 4), by - 50);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawLanterns(ctx, left, right, gy) {
    // hanging paper lanterns from wires above the arena
    ctx.save();
    const y = gy - 300;
    ctx.strokeStyle = 'rgba(50,44,52,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(left, y);
    ctx.quadraticCurveTo((left + right) / 2, y + 26, right, y);
    ctx.stroke();
    for (let i = 0; i < 9; i++) {
      const t = (i + 0.5) / 9;
      const lx = lerp(left, right, t);
      const ly = y + Math.sin(t * Math.PI) * 24;
      const sway = Math.sin(this.time * 0.8 + i) * 2.5;
      this.drawLantern(ctx, lx + sway, ly + 20, 0.6 + hash1(i) * 0.25, i);
    }
    ctx.restore();
  }

  drawLantern(ctx, x, y, s, idx) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    // cord
    ctx.strokeStyle = 'rgba(60,50,50,0.7)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, -22); ctx.lineTo(0, 0); ctx.stroke();
    // body
    const flick = 0.85 + Math.sin(this.time * 3 + idx * 2) * 0.08;
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(0, 6, 2, 0, 6, 26);
    g.addColorStop(0, `rgba(255,170,110,${0.22 * flick})`);
    g.addColorStop(1, 'rgba(255,120,80,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 6, 26, 0, TAU); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(220,120,80,${0.55 * flick})`;
    ctx.beginPath();
    ctx.ellipse(0, 6, 8, 11, 0, 0, TAU);
    ctx.fill();
    ctx.fillStyle = 'rgba(30,22,24,0.8)';
    ctx.fillRect(-6, -4, 12, 3);
    ctx.fillRect(-6, 15, 12, 3);
    ctx.restore();
  }

  drawGround(ctx) {
    const c = this.camera;
    const W = this.viewW / c.zoom;
    const left = c.x - W / 2 - 300, right = c.x + W / 2 + 300;
    const gy = this.groundY;
    // stone platform
    const g = ctx.createLinearGradient(0, gy - 8, 0, gy + 120);
    g.addColorStop(0, '#2a2b33');
    g.addColorStop(0.12, '#1a1b22');
    g.addColorStop(1, '#0a0b10');
    ctx.fillStyle = g;
    ctx.fillRect(left, gy, right - left, 300);
    // lip highlight
    const lg = ctx.createLinearGradient(0, gy - 3, 0, gy + 6);
    lg.addColorStop(0, 'rgba(150,170,200,0.55)');
    lg.addColorStop(1, 'rgba(60,70,90,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(left, gy - 3, right - left, 9);

    // flagstones
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 1.2;
    const tileW = 92;
    for (let row = 0; row < 4; row++) {
      const yy = gy + 12 + row * 30;
      for (let x = Math.floor(left / tileW) * tileW + (row % 2) * tileW * 0.5; x < right; x += tileW) {
        ctx.strokeRect(x, yy, tileW, 30);
      }
    }
    // cracks
    ctx.strokeStyle = 'rgba(90,100,120,0.10)';
    for (let i = 0; i < 14; i++) {
      const bx = Math.floor(left / 60) * 60 + i * 173;
      if (bx < left || bx > right) continue;
      ctx.beginPath();
      ctx.moveTo(bx, gy + rand(0, 3));
      ctx.lineTo(bx + 18, gy + 30);
      ctx.lineTo(bx + 8, gy + 58);
      ctx.stroke();
    }
    ctx.restore();
    // arena bounds: glowing stakes
    for (const bx of [this.arenaMinX, this.arenaMaxX]) {
      if (bx < left - 80 || bx > right + 80) continue;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,150,90,0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(bx, gy); ctx.lineTo(bx, gy - 160); ctx.stroke();
      ctx.fillStyle = 'rgba(255,180,120,0.5)';
      ctx.beginPath(); ctx.arc(bx, gy - 160, 4, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  drawGhost(ctx, g) {
    const a = 1 - g.t / g.life;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = a * g.alpha;
    ctx.translate(g.x, g.y);
    ctx.scale(g.facing, 1);
    const p = g.pose;
    const hip = { x: p.hx, y: -p.hy };
    const leanRad = p.lean * Math.PI / 180;
    const tdx = Math.sin(leanRad), tdy = -Math.cos(leanRad);
    const neck = { x: hip.x + tdx * 50, y: hip.y + tdy * 50 };
    const handF = { x: p.hfx, y: -p.hfy };
    ctx.strokeStyle = g.col;
    ctx.lineCap = 'round';
    ctx.lineWidth = 13;
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(neck.x, neck.y); ctx.stroke();
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.moveTo(neck.x, neck.y - 4); ctx.lineTo(handF.x, handF.y); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(hip.x, hip.y); ctx.lineTo(p.ffx, -p.ffy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(neck.x, neck.y - 12); ctx.lineTo(neck.x + 10, neck.y - 24); ctx.stroke();
    // blade
    const ang = p.sw * Math.PI / 180;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(handF.x, handF.y);
    ctx.lineTo(handF.x + Math.cos(ang) * 100, handF.y + Math.sin(ang) * 100);
    ctx.stroke();
    ctx.restore();
  }

  drawImpacts(ctx) {
    // ---- skill cut lattice (blink / finale) ----
    for (const c of this.cuts) {
      const t = clamp(c.t / c.life, 0, 1);
      const a = Math.pow(1 - t, 1.6);
      const grow = ease.outQuart(Math.min(1, t / 0.35));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(c.x, c.y);
      ctx.rotate(c.ang);
      const L = c.len * grow;
      // white-hot core line
      ctx.strokeStyle = `rgba(255,255,250,${a})`;
      ctx.lineWidth = 3.4 * (1 - t) + 0.6;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-L, 0); ctx.lineTo(L, 0);
      ctx.stroke();
      // warm bleed
      ctx.strokeStyle = `rgba(255,190,140,${a * 0.5})`;
      ctx.lineWidth = 9 * (1 - t) + 1;
      ctx.beginPath();
      ctx.moveTo(-L * 0.94, 0); ctx.lineTo(L * 0.94, 0);
      ctx.stroke();
      // tips
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      for (const sg of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(sg * L, 0, 2.4 * (1 - t) + 0.5, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }
    // ---- 断界一闪 judgement line ----
    for (const r of this.riftLines) {
      const t = clamp(r.t / r.life, 0, 1);
      const a = Math.pow(1 - t, 1.2);
      const grow = ease.outExpo(Math.min(1, t / 0.28));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      // horizontal white seam across the arena
      const halfW = 900 * grow;
      const g = ctx.createLinearGradient(r.x - halfW, 0, r.x + halfW, 0);
      g.addColorStop(0, 'rgba(180,245,255,0)');
      g.addColorStop(0.18, `rgba(180,245,255,${a * 0.55})`);
      g.addColorStop(0.5, `rgba(255,255,255,${a})`);
      g.addColorStop(0.82, `rgba(180,245,255,${a * 0.55})`);
      g.addColorStop(1, 'rgba(180,245,255,0)');
      ctx.fillStyle = g;
      const hgt = 3.5 * (1 - t) + 1.2;
      ctx.fillRect(r.x - halfW, r.y - hgt / 2, halfW * 2, hgt);
      // rip in reality: two thin offset seams
      ctx.fillStyle = `rgba(255,120,150,${a * 0.5})`;
      ctx.fillRect(r.x - halfW * 0.8, r.y - hgt * 2.4, halfW * 1.6, 1.2);
      ctx.fillRect(r.x - halfW * 0.6, r.y + hgt * 2.0, halfW * 1.2, 1);
      ctx.restore();
    }
    // ground-hugging shockwave rings
    for (const w of this.waves) {
      const t = clamp(w.t / w.life, 0, 1);
      const r = w.maxR * ease.outQuart(t);
      const a = (1 - t) * 0.85;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = `rgba(${w.col},${a})`;
      ctx.lineWidth = w.w * (1 - t) + 0.6;
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, r, r * 0.22, 0, 0, TAU);
      ctx.stroke();
      // inner glare band
      ctx.strokeStyle = `rgba(255,255,240,${a * 0.6})`;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(w.x, w.y, r * 0.9, r * 0.9 * 0.22, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }
    // crackle lines
    for (const f of this.flashList) {
      if (f.type !== 'crackle') continue;
      const t = f.t / f.life;
      const a = 1 - t;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x, f.y);
      ctx.rotate(f.ang);
      ctx.strokeStyle = `rgba(255,248,225,${a * 0.9})`;
      ctx.lineWidth = 1.6 * a + 0.4;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(f.size * 0.4, (1 - t) * 4);
      ctx.lineTo(f.size * 0.7, -3);
      ctx.lineTo(f.size, 0);
      ctx.stroke();
      ctx.restore();
    }
    // cross-slash flashes
    for (const f of this.flashList) {
      if (f.type === 'crackle') continue;
      const t = f.t / f.life;
      const a = 1 - t;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(f.x, f.y);
      ctx.rotate(f.dir > 0 ? -0.35 : Math.PI + 0.35);
      ctx.scale(1 + t * 0.9, 1 + t * 0.5);
      const g = ctx.createLinearGradient(-f.size, 0, f.size, 0);
      g.addColorStop(0, 'rgba(255,255,255,0)');
      g.addColorStop(0.5, `rgba(255,250,230,${a})`);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(-f.size, -1.5 - a * 2.2, f.size * 2, 3 + a * 4.4);
      ctx.rotate(1.5);
      ctx.fillRect(-f.size * 0.7, -1 - a * 1.6, f.size * 1.4, 2 + a * 3.2);
      ctx.restore();
    }
  }

  drawForeground(ctx) {
    // drifting foreground dust/petals for depth (draw light haze at bottom)
    const c = this.camera;
    const W = this.viewW / c.zoom;
    const left = c.x - W / 2, right = c.x + W / 2;
    ctx.save();
    const g = ctx.createLinearGradient(0, this.groundY - 40, 0, this.groundY + 10);
    g.addColorStop(0, 'rgba(120,150,190,0)');
    g.addColorStop(1, 'rgba(120,150,190,0.045)');
    ctx.fillStyle = g;
    ctx.fillRect(left, this.groundY - 40, right - left, 50);
    ctx.restore();
  }

  drawScreenFx(ctx, W, H) {
    // screen flash
    if (this.screenFlash > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = `rgba(255,240,230,${this.screenFlash * 0.22})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    if (this.chargeFlash > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.1, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, `rgba(255,210,140,${this.chargeFlash * 0.30})`);
      g.addColorStop(1, 'rgba(255,120,80,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // low health pulse
    if (this.state === 'playing' && this.player.alive && this.player.hp < this.player.maxHp * 0.3) {
      const p = 0.5 + 0.5 * Math.sin(this.time * 6);
      const a = 0.06 + p * 0.10;
      ctx.save();
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.7);
      g.addColorStop(0, 'rgba(200,20,40,0)');
      g.addColorStop(1, `rgba(200,20,40,${a})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // kill focus: subtle radial darkening/zoom-in framing
    if ((this.killFocusT || 0) > 0) {
      const k = clamp(this.killFocusT / 0.30, 0, 1);
      ctx.save();
      const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.22, W / 2, H / 2, Math.max(W, H) * 0.66);
      g.addColorStop(0, 'rgba(0,0,0,0)');
      g.addColorStop(1, `rgba(24,4,10,${0.22 * k})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
    // slow-mo desaturation bars
    if (this.slowmoT > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(8,10,20,${0.25 * clamp(this.slowmoT, 0, 1)})`;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  }

  drawVignette(ctx, W, H) {
    ctx.save();
    const g = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // scanline / grain subtle
    if (!this.lowFps) {
      ctx.globalAlpha = 0.035;
      ctx.fillStyle = '#8fa6c8';
      for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 1);
    }
    ctx.restore();
  }

  // ======================================================================
  // HUD
  // ======================================================================
  drawHud(ctx, W, H) {
    const p = this.player;
    const pad = Math.max(18, Math.min(34, W * 0.025));
    const uiScale = clamp(Math.min(W / 1180, H / 680), 0.90, 1.45);
    ctx.save();
    ctx.scale(uiScale, uiScale);
    const w = W / uiScale, h = H / uiScale;
    const P = pad;

    // ---- player health ----
    const hpW = 270, hpH = 15;
    const hpPct = clamp(p.hp / p.maxHp, 0, 1);
    // frame
    ctx.fillStyle = 'rgba(8,10,18,0.62)';
    ctx.fillRect(P - 3, P - 3, hpW + 6, hpH + 6);
    const hg = ctx.createLinearGradient(P, P, P + hpW, P);
    hg.addColorStop(0, '#d63a52');
    hg.addColorStop(0.6, '#ff6a4d');
    hg.addColorStop(1, '#ffc066');
    ctx.fillStyle = 'rgba(40,16,24,0.9)';
    ctx.fillRect(P, P, hpW, hpH);
    ctx.fillStyle = hg;
    ctx.fillRect(P, P, hpW * hpPct, hpH);
    // damage ghost
    ctx.fillStyle = 'rgba(255,240,220,0.15)';
    ctx.fillRect(P, P, hpW * hpPct, hpH * 0.4);
    // notches
    ctx.strokeStyle = 'rgba(0,0,0,0.45)';
    ctx.lineWidth = 1;
    for (let i = 1; i < 5; i++) {
      ctx.beginPath(); ctx.moveTo(P + hpW * i / 5, P); ctx.lineTo(P + hpW * i / 5, P + hpH); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(230,220,210,0.5)';
    ctx.lineWidth = 1;
    ctx.strokeRect(P + 0.5, P + 0.5, hpW - 1, hpH - 1);
    // text
    ctx.font = '700 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(255,235,225,0.9)';
    ctx.fillText('LIFE', P + 4, P - 8);
    ctx.font = '700 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,240,230,0.85)';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, P + hpW, P - 7);
    // dash cooldown pip
    const dcx = P + hpW + 16, dcy = P + hpH / 2;
    const dReady = p.dashCD <= 0;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = dReady ? '#9fe9ff' : 'rgba(120,150,180,0.25)';
    ctx.beginPath(); ctx.arc(dcx, dcy + 1, 5.5, 0, TAU); ctx.fill();
    if (!dReady) {
      ctx.beginPath(); ctx.arc(dcx, dcy + 1, 5.5, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.dashCD / 0.4)); ctx.strokeStyle = '#bfeaff'; ctx.lineWidth = 2; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.font = '700 7.5px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(20,28,42,0.9)';
    ctx.fillText('DASH', dcx, dcy + 6.5);
    ctx.fillStyle = 'rgba(210,238,252,0.95)';
    ctx.fillText('DASH', dcx, dcy + 6);

    // ---- wave / enemies ----
    ctx.textAlign = 'right';
    ctx.font = '900 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(240,238,255,0.92)';
    ctx.fillText(`WAVE ${this.wave}`, w - P - 96, P + 13);
    ctx.font = '700 10px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(190,214,235,0.75)';
    const alive = this.enemies.filter(e => !e.dead).length + this.spawnQueue.length;
    ctx.fillText(`殘敵 ${alive}`, w - P - 96, P + 28);

    // ---- combo ----
    if (this.comboCount > 1) {
      const t = clamp(this.comboTimer / 1.7, 0, 1);
      const pop = this.comboTimer > 1.55 ? 1 + (this.comboTimer - 1.55) * 3 : 1;
      ctx.save();
      ctx.translate(w - P - 10, P + 88);
      ctx.scale(pop, pop);
      ctx.textAlign = 'right';
      ctx.font = '900 34px "Arial Black", "Segoe UI", sans-serif';
      const g = ctx.createLinearGradient(0, -26, 0, 10);
      g.addColorStop(0, '#fff7e0');
      g.addColorStop(0.55, '#ffd166');
      g.addColorStop(1, '#ff6a4d');
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,8,10,0.85)';
      ctx.strokeText(`${this.comboCount}`, 0, 0);
      ctx.fillStyle = g;
      ctx.fillText(`${this.comboCount}`, 0, 0);
      ctx.font = '900 12px "Segoe UI", system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(20,8,10,0.8)';
      ctx.strokeText('HIT COMBO', 0, 14);
      ctx.fillStyle = 'rgba(255,220,180,0.95)';
      ctx.fillText('HIT COMBO', 0, 14);
      ctx.restore();
    }

    // ---- early-play hint (fades after the first wave starts) ----
    if (this.state === 'playing' && this.wave === 1 && this.killCount === 0 && this.time < 14 && this.player.alive) {
      const a = clamp(Math.min(this.time / 0.6, (14 - this.time) / 2.5), 0, 1);
      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.textAlign = 'center';
      ctx.font = '700 12px "Segoe UI", "KirSans", sans-serif';
      ctx.fillStyle = 'rgba(225,238,252,0.9)';
      const hintX = Math.max(w / 2 + 40, P + 150 + 40);
      ctx.textAlign = 'center';
      ctx.fillText('J 斩击连段 · K 蓄力重击 · I 弹反/坠击 · S+J 扫腿断肢 · L 冲刺闪避', Math.min(w - 20, hintX + 90), h - 18);
      ctx.restore();
    }

    // ---- banner ----
    if (this.banner) {
      const b = this.banner;
      const t = b.t / b.life;
      const a = t < 0.15 ? ease.outCubic(t / 0.15) : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(a, 0, 1);
      ctx.textAlign = 'center';
      ctx.translate(w / 2, h * 0.19);
      ctx.font = '900 40px "KirSerif", serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(12,8,12,0.9)';
      ctx.strokeText(b.title, 0, 0);
      ctx.fillStyle = b.col || '#ffe6c0';
      ctx.fillText(b.title, 0, 0);
      ctx.font = '700 14px "Segoe UI", "KirSans", sans-serif';
      ctx.strokeStyle = 'rgba(12,8,12,0.85)';
      ctx.lineWidth = 4;
      ctx.strokeText(b.sub, 0, 26);
      ctx.fillStyle = 'rgba(235,240,255,0.92)';
      ctx.fillText(b.sub, 0, 26);
      // underline
      ctx.strokeStyle = 'rgba(255,180,120,0.6)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const uw = 170 * clamp(a, 0, 1);
      ctx.moveTo(-uw, 38); ctx.lineTo(uw, 38); ctx.stroke();
      ctx.restore();
    }

    // ---- controls (always visible, compact) ----
    this.drawControls(ctx, w, h, P);

    ctx.restore();
  }

  drawControls(ctx, w, h, P) {
    // compact control legend, bottom-left
    const rows = [
      ['A D', '移动'], ['SPACE', '跳跃'], ['J', '斩击'], ['K', '蓄力'],
      ['L', '冲刺'], ['I', '弹反/下劈'], ['S+J', '扫腿'], ['R', '重开'],
    ];
    const fs = 10;
    const boxW = 132, rowH = 15.5;
    const boxH = rows.length * rowH + 14;
    const x = P, y = h - P - boxH;
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,18,0.42)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = 'rgba(140,170,210,0.12)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
    ctx.font = `700 ${fs}px "Segoe UI", system-ui, sans-serif`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    rows.forEach((r, i) => {
      const ry = y + 10 + i * rowH;
      ctx.fillStyle = 'rgba(180,220,250,0.85)';
      ctx.fillText(r[0], x + 9, ry);
      ctx.fillStyle = 'rgba(225,232,245,0.8)';
      ctx.font = `600 ${fs}px "Segoe UI", "KirSans", sans-serif`;
      ctx.fillText(r[1], x + 58, ry);
      ctx.font = `700 ${fs}px "Segoe UI", system-ui, sans-serif`;
    });
    ctx.restore();
  }

  drawTitle(ctx, W, H) {
    const t = this.titleT;
    ctx.save();
    // dark scrim
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(5,6,12,0.55)');
    g.addColorStop(0.5, 'rgba(5,6,12,0.30)');
    g.addColorStop(1, 'rgba(5,6,12,0.75)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const cx = W / 2;
    const cy = H * 0.40;
    const inT = clamp(t / 0.8, 0, 1);
    ctx.globalAlpha = ease.outCubic(inT);

    // seal circle
    ctx.save();
    ctx.translate(cx, cy - 96);
    ctx.globalAlpha *= 0.9;
    ctx.strokeStyle = 'rgba(255,120,90,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(0, 0, 54 + Math.sin(t * 1.2) * 2, 0, TAU); ctx.stroke();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(255,180,120,0.25)';
    ctx.beginPath(); ctx.arc(0, 0, 62 + Math.sin(t * 1.2 + 1) * 3, 0, TAU); ctx.stroke();
    ctx.font = '900 46px "KirSerif", serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,210,170,0.92)';
    ctx.fillText('断', 0, 2);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    // title
    const titleY = cy + 10;
    ctx.font = '900 66px "KirSerif", serif';
    ctx.lineWidth = 9;
    ctx.strokeStyle = 'rgba(8,6,12,0.9)';
    const tg = ctx.createLinearGradient(0, titleY - 60, 0, titleY + 8);
    tg.addColorStop(0, '#fff9ec');
    tg.addColorStop(0.5, '#ffd9a0');
    tg.addColorStop(1, '#ff7a5c');
    ctx.strokeText('断 缘 傀 儡', cx, titleY);
    ctx.fillStyle = tg;
    ctx.fillText('断 缘 傀 儡', cx, titleY);

    // subtitle
    ctx.font = '700 15px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(190,215,240,0.82)';
    ctx.letterSpacing = '4px';
    ctx.fillText('K I R I  D O L L S  ·  B L A D E  T R I A L', cx, titleY + 32);
    ctx.letterSpacing = '0px';

    // start prompt
    const pulse = 0.55 + 0.45 * Math.sin(t * 3.2);
    ctx.globalAlpha = ease.outCubic(inT) * (0.5 + pulse * 0.5);
    ctx.font = '800 21px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,246,230,0.96)';
    ctx.fillText('按 ENTER 或 点击此处开始', cx, titleY + 96);
    ctx.globalAlpha = ease.outCubic(inT) * 0.7;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,215,235,0.7)';
    ctx.fillText('斩击 · 弹反 · 断肢   |   鼠标仅用于本按钮与静音', cx, titleY + 120);

    // control card
    ctx.globalAlpha = ease.outCubic(inT);
    this.drawTitleControls(ctx, cx, H - 74);

    ctx.restore();
  }

  drawTitleControls(ctx, cx, y) {
    const items = [
      ['A / D', '移动'], ['SPACE', '跳跃'], ['J', '斩击'], ['K', '蓄力'],
      ['L', '冲刺'], ['I', '弹反 / 下劈'], ['R', '重开'],
    ];
    const boxW = 74, gap = 8;
    const totalW = items.length * boxW + (items.length - 1) * gap;
    let x = cx - totalW / 2;
    ctx.textAlign = 'center';
    for (const [k, v] of items) {
      ctx.fillStyle = 'rgba(14,16,26,0.7)';
      ctx.fillRect(x, y, boxW, 42);
      ctx.strokeStyle = 'rgba(150,180,220,0.2)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, 41);
      ctx.fillStyle = 'rgba(180,225,255,0.92)';
      ctx.font = '800 12px "Segoe UI", system-ui, sans-serif';
      ctx.fillText(k, x + boxW / 2, y + 17);
      ctx.fillStyle = 'rgba(220,228,242,0.8)';
      ctx.font = '600 11px "Segoe UI", "KirSans", sans-serif';
      ctx.fillText(v, x + boxW / 2, y + 33);
      x += boxW + gap;
    }
  }

  drawGameOver(ctx, W, H) {
    const t = this.overT;
    const a = clamp((t - 0.25) / 0.5, 0, 1);
    ctx.save();
    ctx.globalAlpha = ease.outCubic(a);
    ctx.fillStyle = 'rgba(6,6,12,0.80)';
    ctx.fillRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    ctx.textAlign = 'center';
    ctx.font = '900 52px "KirSerif", serif';
    ctx.lineWidth = 7;
    ctx.strokeStyle = 'rgba(8,4,10,0.9)';
    ctx.strokeText('傀 儡 未 尽', cx, cy - 48);
    const g = ctx.createLinearGradient(0, cy - 90, 0, cy - 20);
    g.addColorStop(0, '#ffd9c0');
    g.addColorStop(1, '#d63a52');
    ctx.fillStyle = g;
    ctx.fillText('傀 儡 未 尽', cx, cy - 48);
    ctx.font = '700 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(200,210,235,0.75)';
    ctx.fillText('Y O U R   T H R E A D   I S   C U T', cx, cy - 22);
    // stats
    const stats = [
      ['到达波次', `${this.wave}`],
      ['最大连击', `${this.maxCombo}`],
      ['斩断肢体', `${this.limbBreakCount}`],
      ['击杀傀儡', `${this.killCount}`],
    ];
    ctx.font = '700 13px "Segoe UI", "KirSans", sans-serif';
    for (let i = 0; i < stats.length; i++) {
      const yy = cy + 18 + i * 24;
      ctx.textAlign = 'right';
      ctx.fillStyle = 'rgba(180,200,225,0.75)';
      ctx.fillText(stats[i][0], cx - 12, yy);
      ctx.textAlign = 'left';
      ctx.fillStyle = 'rgba(255,234,200,0.95)';
      ctx.fillText(stats[i][1], cx + 12, yy);
    }
    ctx.textAlign = 'center';
    const pulse = 0.6 + 0.4 * Math.sin(t * 4);
    ctx.globalAlpha = ease.outCubic(a) * pulse;
    ctx.font = '800 18px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,246,230,0.95)';
    ctx.fillText('按 ENTER 或 R 再战', cx, cy + 128);
    ctx.restore();
  }

  drawPause(ctx, W, H) {
    ctx.save();
    ctx.fillStyle = 'rgba(5,7,12,0.6)';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.font = '900 32px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(235,242,255,0.95)';
    ctx.fillText('暂停', W / 2, H / 2);
    ctx.font = '600 13px "Segoe UI", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(190,205,230,0.75)';
    ctx.fillText('按 ESC 或 ENTER 继续', W / 2, H / 2 + 28);
    ctx.restore();
  }
}
