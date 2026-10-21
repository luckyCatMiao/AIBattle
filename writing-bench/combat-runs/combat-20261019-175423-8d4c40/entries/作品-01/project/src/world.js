/* =========================================================
   world.js — simulation owner: hits, hitstop, waves, orbs,
   severed limbs, parry, stats, restart
   ========================================================= */
let NEXT_ENEMY_ID = 1;

class World {
  constructor() {
    this.arena = ARENA;
    this.cam = new Camera();
    this.fx = new FX();
    this.player = new Player(this);
    this.enemies = [];
    this.orbs = [];
    this.severed = [];
    this.stats = { hitCount: 0, limbBreakCount: 0, killCount: 0, parryCount: 0, wave: 0 };
    this.time = 0;
    this.realTime = 0;
    this.freeze = 0;
    this.ready = true;
    this.playing = false;
    this.deathT = 0;
    this.waveState = 'idle';
    this.waveTimer = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveBannerT = 0;
    this.waveBannerText = '';
    this.uiDamageFlash = 0;
    this.hintT = 0;
    this.slowmo = 0;
    this.slowmoT = 0;
    this.bladeRain = [];
    this.ultimate = null;
    this.enemyId = 0;
    this.ambientEmbers = [];
    for (let i = 0; i < 34; i++) {
      this.ambientEmbers.push({
        x: rand(ARENA.x1, ARENA.x2), y: rand(120, 470),
        vy: rand(-14, -4), vx: rand(-12, 12),
        ph: rand(0, TAU), r: rand(0.8, 2)
      });
    }
  }

  reset() {
    this.player.reset();
    this.enemies.length = 0;
    this.orbs.length = 0;
    this.severed.length = 0;
    this.fx.reset();
    this.stats = { hitCount: 0, limbBreakCount: 0, killCount: 0, parryCount: 0, wave: 0 };
    this.freeze = 0;
    this.deathT = 0;
    this.waveState = 'idle';
    this.waveTimer = 0.35;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveBannerT = 0;
    this.slowmoT = 0;
    this.bladeRain.length = 0;
    this.ultimate = null;
    this.uiDamageFlash = 0;
    this.playing = true;
    this.time = 0;
    this.cam.x = 0; this.cam.y = 300;
    this.cam.shakeMag = 0; this.cam.shakeT = 0;
    this.nextWave = 1;
  }

  start() {
    this.reset();
    this.cam.x = this.player.x + 150;
    this.cam.y = 340;
  }

  restart() {
    this.start();
    Sfx.select();
  }

  /* ---------------- core loop ---------------- */
  update(dt) {
    this.realTime += dt;
    this.uiDamageFlash = Math.max(0, this.uiDamageFlash - dt * 2.5);
    this.waveBannerT = Math.max(0, this.waveBannerT - dt);

    if (this.freeze > 0) {
      this.freeze = Math.max(0, this.freeze - dt);
      // frozen sim: only camera and a slowed trickle of particles keep moving
      this.cam.update(dt * 0.4, this);
      this.fx.update(dt * 0.22, true);
      return;
    }
    this.time += dt;

    const input = this.input;
    if (this.playing) {
      this.player.update(dt, input);
    }

    const eDt = dt * (this.slowmoT > 0 ? 0.35 : 1);
    if (this.slowmoT > 0) this.slowmoT = Math.max(0, this.slowmoT - dt);
    for (const e of this.enemies) {
      if (e._shadowMarked) e._shadowMarked = Math.max(0, e._shadowMarked - eDt * 2);
      e.update(eDt);
    }
    this.updateOrbs(eDt);
    this.updateSevered(eDt);
    this.updateBladeRain(dt);
    if (this.ultimate) this.updateUltimateTick(dt);
    this.fx.update(dt, false);
    this.updateWaves(dt);
    this.cam.update(dt, this);

    // cull dead enemies after fade
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead && e.deathT > 2.4) this.enemies.splice(i, 1);
    }

    if (this.player.state === 'dead') {
      this.deathT += dt;
      if (this.deathT > 1.0) this.playing = false;
    }
  }

  hitstop(dur, playerHurt) {
    this.freeze = Math.max(this.freeze, dur);
    if (!playerHurt) this.cam.punch(0.6);
  }

  /* ---------------- player attack resolution ---------------- */
  resolvePlayerAttack(player, def) {
    const f = player.facing;
    const b = def.box;
    const box = {
      x: f > 0 ? player.x + b.ox : player.x - b.ox - b.w,
      y: player.y + b.oy,
      w: b.w, h: b.h
    };
    this._lastAttackBox = box;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const key = 'e' + e.uid;
      if (player.attackHits.has(key)) continue;
      const limb = e.hitTest(box);
      if (limb === undefined) continue;
      player.attackHits.add(key);
      this.landPlayerHit(player, e, limb, def, box);
    }
    // reflect / cut orbs
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (!o.reflected && rectsOverlap(box, { x: o.x - o.r - 4, y: o.y - o.r - 4, w: (o.r + 4) * 2, h: (o.r + 4) * 2 })) {
        this.reflectOrb(o, player);
      }
    }
  }

  landPlayerHit(player, e, limb, def, box) {
    const dir = player.facing;
    const heavy = !!def.heavy;
    const lvl = heavy ? (this.player.lastChargeLevel || 1) : 0;
    const dmgMul = heavy && lvl > 1 ? 1 + (lvl - 1) * 0.22 : 1;
    const dmg = Math.round(def.damage * dmgMul * rand(0.95, 1.05));
    const contactX = limb ? limb.x : (box.x + box.w * 0.5);
    const contactY = limb ? limb.y : (box.y + box.h * 0.5);

    const res = e.takeHit(limb, {
      dmg, dir, kb: def.kb, lift: def.lift, heavy,
      x: player.x, y: contactY, limbMul: heavy ? 2.2 : 1
    });
    if (!res.hit) return;

    // combo bookkeeping
    player.combo++;
    player.comboTimer = 2.2;
    player.comboBest = Math.max(player.comboBest, player.combo);
    player.focus = Math.min(1, player.focus + 0.055);
    this.stats.hitCount++;

    // ---- impact feel ----
    const hs = def.hitstop + (res.broke ? 0.035 : 0);
    this.hitstop(hs, false);
    this.cam.shake(def.hitstop * (heavy ? 48 : 40), 0.16 + hs);
    const dirA = dir > 0 ? 0 : Math.PI;
    const sparkCount = heavy ? 16 : 8;
    this.fx.spark(contactX, contactY, {
      count: sparkCount, speed: heavy ? 780 : 520, size: heavy ? 3.4 : 2.4,
      life: 0.24, color: heavy ? '#ffd09a' : '#fff1cf', dir: dirA,
      spread: 1.5, lift: 60, grav: 700
    });
    this.fx.spark(contactX, contactY, {
      count: heavy ? 10 : 4, speed: 200, size: 2.2, life: 0.5,
      color: '#ff7a5a', dir: dirA + Math.PI, spread: 1.2, lift: 140, grav: 300
    });
    this.fx.streak(contactX, contactY, dirA, heavy ? 120 : 70, heavy ? 7 : 4, 'rgba(255,240,210,0.95)', 0.16);
    this.fx.ring(contactX, contactY, 4, heavy ? 78 : 42, heavy ? 'rgba(255,170,110,0.95)' : 'rgba(255,240,210,0.8)', 0.22, heavy ? 5 : 2.5);
    this.fx.damage(contactX, contactY - 24, dmg, res.guarded ? '#b8c8d8' : heavy ? '#ffe08a' : '#fff6df', heavy);
    if (res.guarded) this.fx.word(e.x, e.top - 20, '格挡', '#b8c8d8', 15, 0.6);
    if (res.broke) {
      // extra juice on break handled in onLimbSevered
      this.fx.spark(contactX, contactY, { count: 18, speed: 900, size: 3, life: 0.45, color: '#ff9a7a', spread: TAU, grav: 900 });
    }

    // audio
    if (heavy) Sfx.heavyHit(); else Sfx.hit(clamp(def.damage / 30, 0.2, 1));

    // hit effects on the player: brief recoil
    if (this.player.onGround) this.player.vx -= dir * 40;

    // blade trail flash
    player.anim.bladeGlow = 1;
    this.lastHitLimb = limb;

    // parryable counter? no.
  }

  damageArea(x, y, w, h, dmg, kb, lift) {
    const box = { x: x - w / 2, y: y - h / 2, w, h };
    for (const e of this.enemies) {
      if (e.dead) continue;
      const limb = e.hitTest(box);
      if (limb === undefined) continue;
      const res = e.takeHit(limb, { dmg, dir: 0, kb, lift, heavy: true, x, y, limbMul: 1.2 });
      if (res.hit) {
        this.stats.hitCount++;
        this.fx.damage(e.x, e.y - e.h, dmg, '#ffd28a', true);
        this.fx.burst(e.x, e.y - e.h * 0.5, '#ffd28a', 10, 300, 2.5, 0.4, 500);
      }
    }
  }

  enemyHitsPlayer(enemy, dmg, a) {
    const p = this.player;
    if (p.state === 'dead') return;
    if (p.iframe > 0) return;
    // parry check gives the player agency
    if (p.state === 'parry' && p.parryT > 0) {
      this.onParry(p, enemy, null);
      return;
    }
    const hit = p.takeHit(dmg, enemy.x, { source: enemy });
    if (hit === true) {
      this.fx.spark(p.x, p.cy, { count: 12, speed: 460, size: 3, life: 0.35, color: '#ff6a6a', spread: TAU, grav: 800 });
    }
  }

  onParry(p, source, projectile) {
    this.stats.parryCount++;
    p.parrySuccess = 0.5;
    p.parryT = 0;
    p.state = p.onGround ? 'idle' : 'air';
    p.iframe = Math.max(p.iframe, 0.22);
    p.parryCd = Math.min(p.parryCd, 0.25);
    p.focus = Math.min(1, p.focus + 0.3);
    this.hitstop(0.19, false);
    this.cam.shake(5, 0.24);
    this.cam.punch(1.4);
    Sfx.parry();
    const bx = p.x + p.facing * 34, by = p.cy - 8;
    this.fx.slashLight(bx, by, p.facing > 0 ? 0 : Math.PI, Math.PI * 1.4, 64, 'rgba(190,240,255,1)', 0.3, 12);
    this.fx.ring(bx, by, 6, 92, 'rgba(170,230,255,0.95)', 0.3, 4);
    this.fx.spark(bx, by, { count: 22, speed: 760, size: 3, life: 0.4, color: '#cfeeff', spread: TAU, grav: 300 });
    this.fx.word2(p.x, p.cy - 58, '弹反!', 'PARRY!', '#bff0ff', 26, 0.85);
    for (let i = 0; i < 4; i++) {
      this.fx.addPart({ kind: 'spark', x: bx, y: by, vx: rand(-200, 200), vy: rand(-300, 100), life: 0.5, max: 0.5, size: 2.5, color: '#e8fbff', grav: 100, drag: 3 });
    }
    if (projectile) {
      this.reflectOrb(projectile, p);
    }
    if (source && !source.dead) {
      // perfect parry staggers and opens guards; damages a bit
      source.takeHit(null, { dmg: 9, dir: p.facing, kb: 300, lift: 0, heavy: true, x: p.x, unguardable: true });
      source.stunT = Math.max(source.stunT, 0.55);
      source.guardBrokenT = Math.max(source.guardBrokenT, 1.4);
      const lb = source.hitTest({ x: bx - 20, y: by - 20, w: 40, h: 40 });
      if (lb) lb.hp -= 8;
    }
  }

  /* ---------------- projectiles ---------------- */
  spawnOrb(enemy, dir) {
    const p = this.player;
    const ox = enemy.x + dir * 22, oy = enemy.y - enemy.h * 0.6;
    const ang = Math.atan2((p.cy) - oy, p.x - ox);
    this.orbs.push({
      x: ox, y: oy, vx: Math.cos(ang) * 300, vy: Math.sin(ang) * 300,
      r: 10, owner: enemy, reflected: false, life: 4.5, t: 0,
      homing: 0.9, dmg: 10, col: '#ff5b86'
    });
    this.fx.ring(ox, oy, 2, 26, 'rgba(255,120,160,0.8)', 0.2, 2);
    Sfx.orb();
  }

  reflectOrb(o, player) {
    if (o.reflected) return;
    o.reflected = true;
    o.owner = player;
    const p = this.player;
    let target = null, best = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist2(o.x, o.y, e.x, e.y - e.h * 0.5);
      if (d < best) { best = d; target = e; }
    }
    let ang;
    if (target) ang = Math.atan2((target.y - target.h * 0.5) - o.y, target.x - o.x);
    else ang = player.facing > 0 ? 0 : Math.PI;
    o.vx = Math.cos(ang) * 780;
    o.vy = Math.sin(ang) * 780;
    o.homing = 3.2;
    o.col = '#ffd76a';
    o.dmg = 26;
    o.life = 2.2;
    Sfx.reflect();
    this.fx.burst(o.x, o.y, '#ffd76a', 8, 300, 2.5, 0.3, 100);
  }

  updateOrbs(dt) {
    const p = this.player;
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      o.life -= dt; o.t += dt;
      if (!o.reflected) {
        // gentle homing toward the player
        const ang = Math.atan2(p.cy - o.y, p.x - o.x);
        const cur = Math.atan2(o.vy, o.vx);
        let diff = ang - cur;
        while (diff > Math.PI) diff -= TAU;
        while (diff < -Math.PI) diff += TAU;
        const na = cur + clamp(diff, -o.homing * dt, o.homing * dt);
        const spd = 280;
        o.vx = Math.cos(na) * spd;
        o.vy = Math.sin(na) * spd;
        if (p.state !== 'dead' && dist2(o.x, o.y, p.x, p.cy) < (o.r + 14) * (o.r + 14)) {
          if (p.state === 'parry' && p.parryT > 0) { this.onParry(p, o.owner, o); continue; }
          if (p.iframe > 0) { /* pass through */ }
          else {
            this.enemyHitsPlayer(o.owner || this, o.dmg, {});
            this.fx.burst(o.x, o.y, '#ff6a8a', 12, 320, 2.6, 0.4, 300);
            this.orbs.splice(i, 1);
            continue;
          }
        }
      } else {
        // reflected: seek nearest enemy
        let target = null, best = 1e9;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const d = dist2(o.x, o.y, e.x, e.y - e.h * 0.5);
          if (d < best) { best = d; target = e; }
        }
        if (target) {
          const ang = Math.atan2((target.y - target.h * 0.5) - o.y, target.x - o.x);
          const cur = Math.atan2(o.vy, o.vx);
          let diff = ang - cur;
          while (diff > Math.PI) diff -= TAU;
          while (diff < -Math.PI) diff += TAU;
          const na = cur + clamp(diff, -6 * dt, 6 * dt);
          const spd = 860;
          o.vx = Math.cos(na) * spd;
          o.vy = Math.sin(na) * spd;
        }
        for (const e of this.enemies) {
          if (e.dead) continue;
          const hb = { x: e.x - e.w * 0.6, y: e.y - e.h - 8, w: e.w * 1.2, h: e.h + 8 };
          if (rectsOverlap({ x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 }, hb)) {
            const limb = e.hitTest({ x: o.x - 16, y: o.y - 16, w: 32, h: 32 });
            const res = e.takeHit(limb || null, { dmg: o.dmg, dir: sign(o.vx), kb: 260, lift: 170, heavy: true, x: o.x, y: o.y, limbMul: 1.4 });
            if (res.hit) {
              this.stats.hitCount++;
              this.hitstop(0.09, false);
              this.fx.damage(o.x, o.y - 10, o.dmg, '#ffd76a', true);
              this.fx.burst(o.x, o.y, '#ffd76a', 16, 420, 3, 0.45, 500);
            }
            this.orbs.splice(i, 1);
            break;
          }
        }
      }
      if (!this.orbs[i]) continue;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      if (o.t > o.life || o.y > GROUND_Y + 20 || o.x < ARENA.x1 - 60 || o.x > ARENA.x2 + 60) {
        this.fx.burst(o.x, o.y, o.reflected ? '#ffd76a' : '#ff5b86', 6, 180, 2, 0.25, 200);
        this.orbs.splice(i, 1);
      }
    }
  }

  /* ---------------- severed limbs ---------------- */
  spawnSevered(enemy, limb, dir, o) {
    const col = enemy.def.bodyColor;
    const piece = {
      x: limb.x, y: limb.y,
      vx: dir * rand(150, 320) + rand(-60, 60),
      vy: rand(-420, -180),
      rot: rand(0, TAU), vr: rand(-12, 12),
      life: 8, max: 8,
      floor: GROUND_Y - rand(2, 6),
      bounces: 0, rest: false,
      size: limb.id === 'legs' ? 1.55 : limb.id === 'head' ? 1.2 : 1.5,
      color: col,
      darker: enemy.def.bodyDark,
      accent: enemy.def.accent,
      label: limb.label,
      type: enemy.typeKey,
      id: limb.id,
      // settle upright instead of snapping to an arbitrary quarter turn
      restRot: limb.id === 'head' ? 0 : (Math.random() < 0.5 ? 0 : Math.PI)
    };
    this.severed.push(piece);
  }

  updateSevered(dt) {
    for (const s of this.severed) {
      if (s.rest) { s.life -= dt * 0.6; continue; }
      s.vy += 1500 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vr * dt;
      if (s.y >= s.floor) {
        s.y = s.floor;
        if (Math.abs(s.vy) > 90) {
          s.vy *= -0.34; s.vx *= 0.62; s.vr *= 0.55;
          s.bounces++;
          this.fx.dust(s.x, s.floor, 2, 0);
        } else {
          s.vy = 0; s.vx *= 0.5; s.vr *= 0.5;
          if (Math.abs(s.vx) < 8) {
            s.rest = true;
            s.rot = s.restRot !== undefined ? s.restRot : Math.round(s.rot / (Math.PI / 2)) * (Math.PI / 2);
          }
        }
      }
      if (s.x < ARENA.x1) { s.x = ARENA.x1; s.vx *= -0.5; }
      if (s.x > ARENA.x2) { s.x = ARENA.x2; s.vx *= -0.5; }
    }
    for (let i = this.severed.length - 1; i >= 0; i--) {
      if (this.severed[i].life <= 0) this.severed.splice(i, 1);
    }
  }

  /* ---------------- waves ---------------- */
  updateWaves(dt) {
    if (!this.playing || this.player.state === 'dead') return;
    for (const e of this.enemies) if (!e.dead) {
      // spawn remaining queue regardless
    }
    const alive = this.enemies.filter((e) => !e.dead).length;
    if (this.spawnQueue.length > 0) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0 && alive < 4) {
        const entry = this.spawnQueue.shift();
        this.spawnEnemy(entry.type, entry.side, entry.hpMul || 1);
        this.spawnTimer = 0.55;
      }
    } else if (alive === 0) {
      if (this.waveState !== 'cleared') {
        this.waveState = 'cleared';
        this.waveTimer = (this.stats.wave === 0 ? 0.35 : 1.15);
        if (this.stats.wave > 0) {
          this.waveBannerT = 0.9;
          this.waveBannerText = '清除 · CLEARED';
        }
      } else {
        this.waveTimer -= dt;
        if (this.waveTimer <= 0) this.beginWave(this.stats.wave + 1);
      }
    }
  }

  beginWave(n) {
    this.stats.wave = n;
    this.waveState = 'active';
    this.waveBannerT = 1.5;
    this.waveBannerText = '第 ' + n + ' 波  ·  WAVE ' + n;
    Sfx.wave();
    const list = this.waveList(n);
    this.spawnQueue = list.map((t, i) => ({ type: t, side: i % 2 === 0 ? 1 : -1, hpMul: 1 + Math.min(0.65, Math.max(0, n - 4) * 0.08) }));
    this.spawnTimer = 0.15;
    // heal a sliver between waves for pacing
    const p = this.player;
    if (p.hp > 0) p.hp = Math.min(p.maxHp, p.hp + (n > 1 ? 8 : 0));
  }

  waveList(n) {
    const pattern = [
      ['gnawer', 'gnawer'],
      ['gnawer', 'samurai'],
      ['gnawer', 'puppet', 'gnawer'],
      ['samurai', 'samurai'],
      ['gnawer', 'samurai', 'puppet'],
      ['samurai', 'gnawer', 'gnawer', 'samurai']
    ];
    if (n <= pattern.length) return pattern[n - 1].slice();
    // loop with a scaled mix
    const extra = Math.min(2, Math.floor((n - pattern.length) / 3));
    return ['samurai', 'gnawer', 'puppet'].slice(0, 2 + extra);
  }

  spawnEnemy(type, side, hpMul) {
    const p = this.player;
    let x = side > 0 ? p.x + rand(420, 620) : p.x - rand(420, 620);
    if (x < ARENA.x1 + 60) x = ARENA.x1 + rand(60, 140);
    if (x > ARENA.x2 - 60) x = ARENA.x2 - rand(60, 140);
    const e = new Enemy(this, type, x);
    e.uid = NEXT_ENEMY_ID++;
    if (hpMul && hpMul !== 1) {
      e.maxHp = Math.round(e.maxHp * hpMul);
      e.hp = e.maxHp;
    }
    if (type === 'puppet') e.y = GROUND_Y - 60;
    this.enemies.push(e);
    this.fx.ring(x, GROUND_Y - 1, 4, 50, 'rgba(120,200,255,0.7)', 0.4, 2);
    this.fx.dust(x, GROUND_Y, 8, 0);
    if (Math.random() < 0.8) this.fx.ember(x, GROUND_Y - 30, 4);
    return e;
  }

  onEnemyKilled(e) {
    this.player.focus = Math.min(1, this.player.focus + 0.16);
    this.cam.punch(1.2);
  }

  onPlayerDeath() {
    this.deathT = 0;
    this.cam.shake(7, 0.5);
    this.fx.word(this.player.x, this.player.cy - 60, '败', '#ff6a5a', 34, 1.4);
    this.player.combo = 0;
  }

  /* ---------------- skills ---------------- */
  skillHit(e, dmg, opts) {
    if (e.dead) return { hit: false };
    const o = opts || {};
    const box = { x: e.x - e.w * 0.75, y: e.y - e.h - 12, w: e.w * 1.5, h: e.h + 14 };
    const limb = e.hitTest(box);
    const dir = o.dir === undefined ? (sign(e.x - this.player.x) || 1) : o.dir;
    const res = e.takeHit(limb === undefined ? null : limb, {
      dmg, dir,
      kb: o.kb === undefined ? 220 : o.kb,
      lift: o.lift === undefined ? 0 : o.lift,
      heavy: o.heavy === undefined ? true : o.heavy,
      x: this.player.x, y: e.y - e.h * 0.5,
      limbMul: o.limbMul === undefined ? 1.6 : o.limbMul
    });
    if (res.hit) {
      this.stats.hitCount++;
      this.fx.damage(e.x, e.y - e.h - 10, dmg, o.color || '#ffd0e0', true);
      if (res.broke) this.cam.punch(1.4);
    }
    return res;
  }

  doMoonWheel(p) {
    this.hitstop(0.105, false);
    this.cam.shake(5.5, 0.24);
    this.cam.punch(1.6);
    const cx = p.x, cy = p.cy;
    this.fx.slashLight(cx, cy, 0, Math.PI * 1.55, 120, 'rgba(255,120,200,0.95)', 0.32, 17);
    this.fx.slashLight(cx, cy, Math.PI * 0.8, Math.PI * 1.5, 96, 'rgba(255,190,230,0.9)', 0.28, 9);
    this.fx.ring(cx, cy, 20, 175, 'rgba(255,110,190,0.9)', 0.42, 5);
    this.fx.spark(cx, cy, { count: 30, speed: 720, size: 3.2, life: 0.45, color: '#ffb0d8', spread: Math.PI * 2, grav: 200 });
    this.hitstop(0.06, false);
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(cx, cy, e.x, e.y - e.h * 0.5);
      if (d < 138) {
        this.skillHit(e, 26, { dir: sign(e.x - cx) || 1, kb: 480, lift: -300, limbMul: 2.0, color: '#ffc0e0' });
        e.stunT = Math.max(e.stunT, 0.28);
      }
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) {
      const o = this.orbs[i];
      if (!o.reflected && dist(o.x, o.y, cx, cy) < 165) this.reflectOrb(o, p);
    }
  }

  markShadow(p) {
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.abs(e.x - p.x) < 78 && Math.abs(e.y - p.y) < 130) e._shadowMarked = 0.55;
    }
  }

  detonateShadow(p) {
    let n = 0;
    for (const e of this.enemies) {
      if (e.dead || !e._shadowMarked) continue;
      e._shadowMarked = 0;
      this.cam.shake(4.5, 0.2);
      this.fx.slashLight(e.x, e.y - e.h * 0.5, rand(-0.7, 0.7), 2.4, 74, 'rgba(255,80,90,0.95)', 0.34, 14);
      this.fx.ring(e.x, e.y - e.h * 0.5, 8, 92, 'rgba(255,80,90,0.9)', 0.34, 4);
      this.skillHit(e, 48, { dir: p.facing, kb: 360, lift: -380, limbMul: 2.8, color: '#ff9a9a' });
      n++;
    }
    if (n) {
      this.hitstop(0.12, false);
      this.cam.punch(1.8);
      Sfx.heavyHit();
    }
  }

  startBladeRain(p) {
    const targets = this.enemies.filter((e) => !e.dead);
    this.bladeRain = [];
    for (let i = 0; i < 6; i++) {
      let tx;
      if (targets.length) {
        const e = targets[i % targets.length];
        tx = e.x + rand(-44, 44);
      } else {
        tx = p.x + rand(-200, 200);
      }
      tx = clamp(tx, ARENA.x1 + 40, ARENA.x2 - 40);
      this.bladeRain.push({ x: tx, y: -80 - i * 34, delay: 0.22 + i * 0.12, vy: 0, done: false });
    }
    Sfx.skill(2);
  }

  updateBladeRain(dt) {
    if (!this.bladeRain.length) return;
    let allDone = true;
    for (const b of this.bladeRain) {
      if (b.done) continue;
      b.delay -= dt;
      if (b.delay > 0) { allDone = false; continue; }
      b.vy += 3800 * dt;
      b.y += b.vy * dt;
      if (Math.random() < dt * 30) this.fx.streak(b.x, b.y, Math.PI / 2, 30, 2, 'rgba(200,230,255,0.75)', 0.1);
      if (b.y >= GROUND_Y - 8) {
        b.done = true;
        this.cam.shake(2.6, 0.12);
        this.fx.ring(b.x, GROUND_Y - 1, 6, 62, 'rgba(190,225,255,0.85)', 0.3, 3);
        this.fx.spark(b.x, GROUND_Y - 12, { count: 12, speed: 340, size: 2.6, life: 0.32, color: '#d8ecff', spread: Math.PI, dir: -Math.PI / 2, grav: 700 });
        Sfx.hit(0.45);
        const bladeBox = { x: b.x - 44, y: GROUND_Y - 150, w: 88, h: 155 };
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (rectsOverlap(bladeBox, e.hurtbox())) {
            this.skillHit(e, 19, { dir: sign(e.x - b.x) || 1, kb: 180, lift: -150, limbMul: 1.5, color: '#cfe8ff' });
          }
        }
      } else allDone = false;
    }
    if (allDone) {
      this.bladeRainTimer = (this.bladeRainTimer || 0) + dt;
      if (this.bladeRainTimer > 0.5) { this.bladeRain.length = 0; this.bladeRainTimer = 0; }
    } else this.bladeRainTimer = 0;
  }

  startUltimate(p) {
    this.ultimate = { t: 0, pulses: [0.2, 0.42, 0.64, 0.86, 1.08], pi: 0, final: false, end: 1.72 };
    this.slowmoT = 1.9;
    this.cam.punch(2.2);
    this.cam.shake(5, 0.3);
    this.fx.ring(p.x, p.cy, 20, 240, 'rgba(255,60,60,0.9)', 0.55, 7);
    this.fx.word2(p.x, p.cy - 74, '绯月·千刃一闪', 'CRIMSON MOON', '#ff6a6a', 24, 1.3);
  }

  updateUltimateTick(dt) {
    const u = this.ultimate;
    if (!u) return;
    u.t += dt;
    while (u.pi < u.pulses.length && u.t >= u.pulses[u.pi]) {
      u.pi++;
      this.ultimatePulse(u.pi);
    }
    if (!u.final && u.t >= 1.34) { u.final = true; this.ultimateFinal(); }
    if (u.t >= u.end) this.ultimate = null;
  }

  ultimatePulse(n) {
    const p = this.player;
    const targets = this.enemies.filter((e) => !e.dead)
      .sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, 3);
    this.cam.shake(3.4, 0.15);
    for (const e of targets) {
      this.fx.slashLight(e.x, e.y - e.h * 0.5, rand(-1.3, 1.3), 2.2, 84, 'rgba(255,90,90,0.95)', 0.28, 12);
      this.fx.ring(e.x, e.y - e.h * 0.5, 6, 78, 'rgba(255,80,80,0.9)', 0.3, 3);
      this.skillHit(e, 17, { dir: p.facing, kb: 90, lift: -110, limbMul: 4.6, color: '#ffb0b0' });
    }
    if (targets.length) Sfx.hit(0.9);
  }

  ultimateFinal() {
    const p = this.player;
    this.cam.shake(10, 0.45);
    this.cam.punch(2.4);
    this.hitstop(0.17, false);
    Sfx.heavyHit();
    this.fx.slashLight(p.x + p.facing * 70, p.y - 92, p.facing > 0 ? 0 : Math.PI, 2.3, 430, 'rgba(255,70,70,1)', 0.5, 28);
    this.fx.ring(p.x, GROUND_Y - 1, 20, 460, 'rgba(255,90,90,0.8)', 0.5, 8);
    for (const e of this.enemies) {
      if (e.dead) continue;
      if (Math.abs(e.x - p.x) < 580) {
        this.skillHit(e, 56, { dir: p.facing, kb: 950, lift: -440, limbMul: 4.2, color: '#ff8a8a' });
        e.stunT = Math.max(e.stunT, 0.5);
      }
    }
    for (const o of this.orbs) this.reflectOrb(o, p);
  }

  /* ---------------- public state API ---------------- */
  state() {
    return {
      ready: !!this.ready,
      playerAlive: this.player.state !== 'dead' && this.player.hp > 0,
      enemyCount: this.enemies.filter((e) => !e.dead).length,
      hitCount: this.stats.hitCount,
      limbBreakCount: this.stats.limbBreakCount,
      playing: !!this.playing && this.waveState !== 'idle'
    };
  }
}
