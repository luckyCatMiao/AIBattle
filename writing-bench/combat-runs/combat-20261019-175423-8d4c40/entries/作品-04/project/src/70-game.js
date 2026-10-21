'use strict';
/* ============================================================
   Game — loop, combat resolution, waves, HUD, state API
   ============================================================ */
const WORLD = { w: 1920 };

const Game = {
  time: 0, realTime: 0, last: 0,
  ready: false, playing: false, started: false,
  hitstop: 0, slowmo: 0, slowmoT: 0,
  flash: 0, flashColor: '255,60,80',
  player: null, enemies: [], orbs: [], limbs: [],
  hitCount: 0, limbBreakCount: 0, killCount: 0,
  wave: 0, waveT: 0, waveState: 'idle', spawnQueue: [],
  banner: null, bannerT: 0,
  deathT: 0,
  comboTimer: 0,
  firstKill: false,
  canvas: null, ctx: null,
  dpr: 1,

  init(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.resize();
    window.addEventListener('resize', () => this.resize());
    Input.init();
    Background.init();
    this.player = new Player(300, GROUND_Y);
    this.reset();
    this.ready = true;
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
  },

  resize() {
    const c = this.canvas;
    const vw = window.innerWidth, vh = window.innerHeight;
    const scale = Math.min(vw / W, vh / H);
    const cw = Math.floor(W * scale), ch = Math.floor(H * scale);
    c.style.width = cw + 'px';
    c.style.height = ch + 'px';
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    c.width = Math.floor(W * this.dpr);
    c.height = Math.floor(H * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.viewScale = scale;
    this.offsetX = (vw - cw) / 2;
    this.offsetY = (vh - ch) / 2;
  },

  reset() {
    this.player = new Player(320, GROUND_Y);
    this.enemies.length = 0;
    this.orbs.length = 0;
    this.limbs.length = 0;
    FX.clear();
    Camera.init();
    Camera.x = clamp(this.player.x - W / Camera.zoom / 2, 0, WORLD.w - W / Camera.zoom);
    this.hitCount = 0; this.limbBreakCount = 0; this.killCount = 0;
    this.wave = 0; this.waveT = 0; this.waveState = 'idle';
    this.spawnQueue = [];
    this.hitstop = 0; this.slowmo = 0; this.slowmoT = 0; this.flash = 0;
    this.deathT = 0;
    this.playing = false;
    this.banner = null; this.bannerT = 0;
    this.pendingWave = false;
    TOKEN.holders.clear();
  },

  startGame() {
    if (this.playing) return;
    this.reset();
    this.playing = true;
    this.started = true;
    Audio_.unlock();
    Audio_.wave();
    this.startWave();
  },

  startWave() {
    this.wave++;
    this.waveState = 'active';
    const n = Math.min(2 + Math.floor(this.wave * 0.8), 6);
    this.spawnQueue = [];
    for (let i = 0; i < n; i++) {
      let type = 'warden';
      const r = Math.random();
      if (this.wave >= 2 && r < 0.34) type = 'thrower';
      if (this.wave >= 3 && r > 0.80) type = 'brute';
      this.spawnQueue.push({ type, delay: 0.15 + i * 0.55 + Math.random() * 0.25 });
    }
    this.maxAlive = Math.min(2 + Math.floor(this.wave / 2), 5);
    this.showBanner('第 ' + this.wave + ' 波', 'WAVE ' + this.wave, 1.1);
    Audio_.wave();
  },

  spawnEnemy(type) {
    const p = this.player;
    let x;
    /* spawn offscreen-ish but nearby; alternate sides */
    const side = Math.random() < 0.5 ? -1 : 1;
    x = clamp(p.x + side * rand(300, 430), 60, WORLD.w - 60);
    if (Math.abs(x - p.x) < 250) x = clamp(p.x - side * rand(280, 390), 60, WORLD.w - 60);
    const e = new Puppet(type, x, sign(p.x - x) || 1);
    this.enemies.push(e);
    Audio_.spawn();
    FX.ring(x, GROUND_Y - 40, 6, 70, 0.5, 'rgba(255,90,90,', 3);
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * TAU;
      FX.parts.push({ type: 'spark', x, y: GROUND_Y - 50 + Math.sin(a) * 30, vx: Math.cos(a) * rand(40, 160), vy: Math.sin(a) * rand(40, 160) - 60, life: rand(0.3, 0.6), max: 0.6, w: 2, color: '#ff8a7a', grav: 200, drag: 2 });
    }
    return e;
  },

  showBanner(txt, sub, dur = 1.2) { this.banner = { txt, sub }; this.bannerT = dur; this.bannerMax = dur; },

  /* ---------------- combat ---------------- */
  playerHitsEnemy(enemy, player, def) {
    const px = clamp(player.x + player.facing * def.reach * 0.55, enemy.x - 20, enemy.x + 20);
    const targetY = enemy.y - 96 * enemy.scale * (def.hitH ?? 0.55);
    const py = targetY + rand(-6, 6);
    const dir = player.facing;
    const dmg = def.dmg;
    const opts = {
      dir, heavy: !!def.heavy, kb: def.kb, kbY: def.kbY,
      limbDmg: def.limbDmg, hitDef: def, hitY: py
    };
    const wasAlive = enemy.alive;
    const res = enemy.applyDamage(dmg, opts, this);
    if (!res) return;
    this.hitCount++;
    this.comboHits = (this.comboHits || 0) + 1;
    this.comboTimer = 2.2;

    /* hit stop by power */
    const freeze = def.hitstop * (res.broke.length ? 1.5 : 1);
    this.hitstop = Math.max(this.hitstop, Math.min(0.24, freeze));
    this.flash = Math.max(this.flash, 0.12);
    this.flashColor = '255,80,100';
    Camera.kick(def.shake * 0.55 + (res.broke.length ? 0.22 : 0));
    player.bladeGlow = 1;

    /* impact fx */
    const sparkDir = dir > 0 ? 0 : Math.PI;
    FX.spark(px, py, sparkDir, def.heavy ? 1.5 : 1.0, '#ffe7ad', def.heavy ? 16 : 10);
    FX.ring(px, py, 4, def.heavy ? 58 : 34, 0.26, 'rgba(255,225,160,', 2.4);
    if (def.heavy) {
      FX.crack(px, py, sparkDir, 1);
      FX.blood(px, py, sparkDir, 0.7);
    }
    /* slash vfx at hit point */
    if (def.slash && !this._lastSlashT) {
      this._lastSlashT = 1;
    }
    Audio_.hit(def.heavy ? 1.5 : 1.0);
    Game.shakeHit = 1;

    /* combo counter on hud */
    if (this.comboHits > 1 && (this.comboHits % 5 === 0 || this.comboHits === 3)) {
      FX.text(px + rand(-8, 8), py - 78, this.comboHits + ' 斩', this.comboHits > 6 ? '#ffcf6e' : '#bff4ff', 18 + Math.min(this.comboHits, 8) * 1.4);
    }
    if (def.counter) FX.text(px, py - 62, '反 击', '#9ff6ff', 26);

    /* broken limbs fx handled in onLimbBreak */
    if (res.died) this.onKill(enemy);
  },

  onLimbBreak(enemy, key, anchor, dir, opts, kind) {
    this.limbBreakCount++;
    const T = enemy.T;
    const s = enemy.scale;
    /* spawn physical debris */
    const vel = kind === 'head' ? 520 : 400;
    this.limbs.push(new SeveredLimb(
      anchor.x, anchor.y,
      dir * rand(150, 300) * (kind === 'head' ? 1.7 : 1) + enemy.vx * 0.3,
      -rand(200, 430) * (kind === 'head' ? 1.4 : 1),
      kind, T.color, T.trim, s, dir * rand(6, 13), enemy.type
    ));
    /* extra splinter */
    for (let i = 0; i < 2; i++) {
      this.limbs.push(new SeveredLimb(anchor.x, anchor.y, dir * rand(80, 240), -rand(150, 330), 'shard', T.color2, T.trim, s * 0.35, rand(-16, 16), enemy.type, T.mask));
    }
    FX.crack(anchor.x, anchor.y, dir > 0 ? 0 : Math.PI, 1.6);
    FX.blood(anchor.x, anchor.y, dir > 0 ? 0 : Math.PI, 1.6);
    FX.ring(anchor.x, anchor.y, 8, 82, 0.4, 'rgba(255,190,120,', 4);
    FX.text(anchor.x, anchor.y - 52, kind === 'head' ? '断 首!' : kind === 'leg' ? '断 腿!' : '断 臂!', '#ffd98a', kind === 'head' ? 32 : 26);
    Audio_.break_();
    this.hitstop = Math.max(this.hitstop, kind === 'head' ? 0.2 : 0.14);
    this.hitstop += 0.06;
    Camera.kick(kind === 'head' ? 0.65 : 0.5);
    this.slowmoT = kind === 'head' ? 0.3 : 0.18;
    this.slowmo = 0.35;
    this.flash = Math.max(this.flash, 0.16);
  },

  onKill(enemy) {
    this.killCount++;
    this.hitstop = Math.max(this.hitstop, 0.12);
    Camera.kick(0.4);
    FX.blood(enemy.x, enemy.y - 60 * enemy.scale, 0, 1);
    Audio_.break_();
    /* kill shatter: spawn a couple extra shards */
    for (let i = 0; i < 3; i++) {
      const k = pick(['arm', 'leg', 'shard']);
      this.limbs.push(new SeveredLimb(enemy.x + rand(-16, 16), enemy.y - rand(20, 80), rand(-220, 220), -rand(180, 380), k, enemy.T.color, enemy.T.trim, enemy.scale, rand(-12, 12), enemy.type, enemy.T.mask));
    }
  },

  onParry(enemy) {
    const pl = this.player;
    pl.parrySuccess = 0.55;
    pl.invuln = Math.max(pl.invuln, 0.5);
    this.hitCount++;
    Audio_.parry();
    this.hitstop = Math.max(this.hitstop, 0.14);
    this.slowmoT = 0.16; this.slowmo = 0.3;
    Camera.kick(0.5);
    this.flash = Math.max(this.flash, 0.2); this.flashColor = '150,245,255';
    FX.ring(pl.x + pl.facing * 26, pl.y - 54, 10, 110, 0.42, 'rgba(150,245,255,', 4);
    FX.spark(pl.x + pl.facing * 26, pl.y - 54, pl.facing > 0 ? 0 : Math.PI, 1.8, '#d8feff', 22);
    FX.text(pl.x, pl.y - 120, '弹 返', '#9ff6ff', 30);
    /* knock attacking enemy back */
    enemy.state = 'stagger'; enemy.staggerT = 0.85; enemy.attack = null;
    enemy.atkCd = 1.0;
    enemy.vx = -enemy.facing * 240;
    enemy.vy = -220; enemy.onGround = false;
    Game.comboHits = (Game.comboHits || 0) + 2;
    this.comboTimer = 2.2;
  },

  onPlayerDeath() {
    this.deathT = 0;
    this.playing = false;
    this.hitstop = Math.max(this.hitstop, 0.2);
    Camera.kick(0.8);
    this.slowmoT = 0.6; this.slowmo = 0.25;
  },

  /* ---------------- frame ---------------- */
  frame(now) {
    let dt = (now - this.last) / 1000;
    this.last = now;
    dt = Math.min(dt, 1 / 20);
    this.realTime += dt;

    /* global start key */
    if (Input.anyPressed) Audio_.unlock();

    if (!this.playing && !this.started) {
      if (Input.hit('start') || Input.hit('atk') || Input.hit('jump')) this.startGame();
    } else if (!this.playing && this.deathT > 0 && (Input.hit('start') || Input.hit('restart'))) {
      this.startGame();
    }
    if (this.playing && Input.hit('restart')) this.startGame();

    Audio_.muted; // no-op

    let scale = 1;
    if (this.hitstop > 0) {
      scale = 0;
      /* keep FX breathing during freeze */
      FX.update(dt * 0.22);
    } else if (this.slowmoT > 0) {
      this.slowmoT -= dt;
      scale = this.slowmo;
    }

    if (this.playing) {
      this.update(dt * scale, dt);
    } else {
      if (this.started) this.deathT += dt;
      /* idle background still alive */
      Background.update(dt);
      FX.update(dt);
      this.updateWorldDressing(dt);
      this.player && this.player.dead && this.player.update(dt * 0.6);
    }
    this.time += dt * (scale || 0.0001);
    this.render();
    if (this.hitstop <= 0) Input.endFrame();
    else this.hitstop = Math.max(0, this.hitstop - dt);
    requestAnimationFrame(t => this.frame(t));
  },

  updateWorldDressing(dt) {
    for (let i = this.limbs.length - 1; i >= 0; i--) { this.limbs[i].update(dt); if (this.limbs[i].life <= 0) this.limbs.splice(i, 1); }
  },

  update(dt, rawDt) {
    this.time += 0; /* time advanced in frame */
    Background.update(dt);
    this.player.update(dt);
    /* spawn queue */
    if (this.spawnQueue.length) {
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        this.spawnQueue[i].delay -= dt;
        if (this.spawnQueue[i].delay <= 0) {
          const alive = this.enemies.filter(e => e.alive || e.dead === false).length;
          if (alive < this.maxAlive) {
            this.spawnEnemy(this.spawnQueue[i].type);
            this.spawnQueue.splice(i, 1);
          }
        }
      }
    }
    for (const e of this.enemies) e.update(dt);
    for (const o of this.orbs) o.update(dt);
    for (const l of this.limbs) l.update(dt);

    /* player attack hits */
    if (this.player.state === 'attack' && this.player.act) {
      this.player.currentFrameHits(this.enemies, this);
      /* combo scaling: build combo damage bonus, but keep it modest */
      const def = this.player.act.def;
      const P = this.player.currentSkel;
      if (P && this.player.act.t >= def.active[0] - 0.03 && this.player.act.t <= def.active[1] && def.heavy) {
        if (!this._ghostT) this._ghostT = 0;
        this._ghostT += rawDt;
        if (this._ghostT > 0.035) {
          this._ghostT = 0;
          FX.afterimage(this.player.makeSnapshot(), 0.24, 'rgba(255,170,90,');
        }
      }
      if (P && this.player.act.t <= def.active[1] + 0.06) {
        const prev = this.player._lastTip;
        const col = def.slash ? def.slash.color.slice(5, -1) : '200,240,255';
        const w = def.heavy ? 1.9 : 1.2;
        const steps = prev ? 5 : 1;
        for (let i = 0; i < steps; i++) {
          const u = (i + 1) / steps;
          const tx = prev ? lerp(prev.x, P.swordTip.x, u) : P.swordTip.x;
          const ty = prev ? lerp(prev.y, P.swordTip.y, u) : P.swordTip.y;
          const bx = lerp(P.swordBase.x, tx, 0.28), by = lerp(P.swordBase.y, ty, 0.28);
          FX.addTrail(bx, by, tx, ty, col, w);
        }
        this.player._lastTip = { x: P.swordTip.x, y: P.swordTip.y };
      } else {
        this.player._lastTip = null;
      }
    }

    /* orb vs player */
    for (const o of this.orbs) {
      if (o.dead) continue;
      const pl = this.player;
      if (!pl.dead && overlap(o.hb, pl.hurtBox())) {
        if (pl.state === 'parry' && pl.parryT > 0) {
          o.burst();
          this.onParry(o.owner);
          this.hitCount++;
        } else {
          if (pl.takeDamage(o.dmg, sign(pl.x - o.x || 1))) { o.burst(); }
        }
      }
    }

    /* body collision push apart */
    this.separate();

    /* cleanup */
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.dead && e.deadT > 2.4) this.enemies.splice(i, 1);
    }
    for (let i = this.orbs.length - 1; i >= 0; i--) if (this.orbs[i].dead) this.orbs.splice(i, 1);
    for (let i = this.limbs.length - 1; i >= 0; i--) if (this.limbs[i].life <= 0) this.limbs.splice(i, 1);

    /* combo timer */
    if (this.comboTimer > 0) { this.comboTimer -= dt; if (this.comboTimer <= 0) this.comboHits = 0; }
    if (this.bannerT > 0) this.bannerT -= dt;

    /* wave management */
    if (this.waveState === 'active') {
      const alive = this.enemies.filter(e => !e.dead && e.state !== 'dying').length;
      if (!this.spawnQueue.length && alive === 0) {
        this.waveState = 'clear';
        this.waveT = 1.15;
        this.showBanner('波次肃清', 'WAVE CLEAR', 1.0);
        this.player.hp = Math.min(this.player.maxHp, this.player.hp + 12);
      }
    } else if (this.waveState === 'clear') {
      this.waveT -= dt;
      if (this.waveT <= 0) this.startWave();
    }

    /* camera */
    Camera.update(dt, this.player);
    FX.update(dt);
    this.flash = Math.max(0, this.flash - rawDt * 0.9);
  },

  separate() {
    const p = this.player;
    const live = this.enemies.filter(e => !e.dead && e.state !== 'dying');
    for (const e of live) {
      if (e.state === 'launched') continue;
      const d = e.x - p.x;
      if (Math.abs(d) < 58 && Math.abs(e.y - p.y) < 80) {
        const push = (58 - Math.abs(d)) * sign(d || 1) * 0.5;
        if (e.state !== 'attack') e.x += push * 0.7;
        p.x -= push * 0.35;
      }
    }
    /* keep puppets from stacking on each other */
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) {
        const a = live[i], b = live[j];
        if (a.state === 'launched' || b.state === 'launched') continue;
        const d = b.x - a.x;
        const min = 74;
        if (Math.abs(d) < min) {
          const push = (min - Math.abs(d)) * 0.5 * sign(d || 1);
          if (a.state !== 'attack') a.x -= push * 0.6;
          if (b.state !== 'attack') b.x += push * 0.6;
        }
      }
    }
    for (const e of live) e.x = clamp(e.x, 30, WORLD.w - 30);
  },

  /* ---------------- render ---------------- */
  render() {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    Background.draw(ctx);

    beginWorld(ctx);
    Background.drawGround(ctx);
    /* ground glow near player */
    Background.drawPetals(ctx);

    /* severed limbs (behind characters) */
    for (const l of this.limbs) l.draw(ctx);

    /* enemies behind player by depth order */
    const sorted = this.enemies.slice().sort((a, b) => a.y - b.y);
    for (const e of sorted) e.draw(ctx);

    /* orbs */
    for (const o of this.orbs) o.draw(ctx);

    /* player (hidden behind the title card until the run begins) */
    if (this.player && this.started) this.player.draw(ctx);

    /* attack trails for player */
    this.drawPlayerAttackFX(ctx);

    FX.draw(ctx);
    endWorld(ctx);

    /* screen-space overlays */
    this.drawVignette(ctx);
    if (this.flash > 0.005) {
      ctx.fillStyle = 'rgba(' + this.flashColor + ',' + (this.flash * 0.30) + ')';
      ctx.fillRect(0, 0, W, H);
    }
    this.drawHUD(ctx);
    this.drawBanner(ctx);
    if (!this.started) this.drawTitle(ctx);
    else if (!this.playing && this.deathT > 0) this.drawDeath(ctx);
    ctx.restore();
  },

  drawPlayerAttackFX(ctx) {
    const pl = this.player;
    if (!pl || pl.state !== 'attack' || !pl.act) return;
    const def = pl.act.def;
    const t = pl.act.t;
    const P = pl.pose();
    const s = def.slash;
    if (t >= def.active[0] - 0.02 && t <= def.active[1] + 0.08 && !pl.act.slashed) {
      pl.act.slashed = true;
      const prog = clamp((t - def.active[0] + 0.02) / 0.1, 0, 1);
      FX.slash(pl.x + pl.facing * 16, pl.y - 52,
        (pl.facing > 0 ? s.ang : Math.PI - s.ang), s.r, s.arc, 0.17, s.color, 3.0);
      if (def.shock) {
        FX.ring(pl.x + pl.facing * 40, pl.y - 40, 10, 130, 0.4, 'rgba(255,150,100,', 4);
      }
    }
    /* charge aura while winding big attack */
    if (pl.act.name === 'charge1' || pl.act.name === 'charge2') {
      ctx.save(); ctx.globalCompositeOperation = 'lighter';
      glowCircle(ctx, P.swordTip.x, P.swordTip.y, 40, 'rgba(255,150,90,0.6)', 0.8);
      ctx.restore();
    }
  },

  drawVignette(ctx) {
    /* subtle darkened edges — no full-screen white */
    const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.42, W / 2, H / 2, H * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(4,4,10,0.55)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    /* low-health red edge pulse */
    const pl = this.player;
    if (pl && pl.alive && pl.hp < pl.maxHp * 0.3 && this.playing) {
      const a = 0.12 + Math.sin(this.realTime * 6) * 0.08;
      const rg = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
      rg.addColorStop(0, 'rgba(255,0,40,0)');
      rg.addColorStop(1, 'rgba(255,20,50,' + a + ')');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
  },

  drawHUD(ctx) {
    const pl = this.player;
    if (!pl) return;
    if (!this.started) {
      /* only the control strip is shown on the title card */
      this.drawControls(ctx);
      return;
    }
    /* player health */
    const hx = 24, hy = 24, hw = 250, hh = 13;
    ctx.save();
    ctx.fillStyle = 'rgba(6,7,14,0.72)';
    roundRect(ctx, hx - 4, hy - 4, hw + 8, hh + 8, 5); ctx.fill();
    ctx.strokeStyle = 'rgba(190,210,255,0.25)'; ctx.lineWidth = 1; ctx.stroke();
    const k = clamp(pl.hp / pl.maxHp, 0, 1);
    const hg = ctx.createLinearGradient(hx, 0, hx + hw, 0);
    hg.addColorStop(0, '#e8324f'); hg.addColorStop(1, '#ff8a6a');
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, hx, hy, hw, hh, 3); ctx.fill();
    ctx.fillStyle = k > 0.3 ? hg : '#ff3b52';
    roundRect(ctx, hx, hy, hw * k, hh, 3); ctx.fill();
    /* hp ticks */
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let i = 1; i < 6; i++) ctx.fillRect(hx + hw * i / 6, hy, 1, hh);
    ctx.font = '700 12px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = '#f0e9ff'; ctx.textAlign = 'left';
    ctx.fillText('绯  HP ' + Math.ceil(pl.hp) + ' / ' + pl.maxHp, hx, hy - 9);
    /* state tags */
    const tags = [];
    if (pl.parrySuccess > 0) tags.push({ t: '弹返!', c: '#9ff6ff' });
    if (pl.state === 'charge') tags.push({ t: pl.charge >= 0.99 ? '蓄力·满' : '蓄力', c: pl.charge >= 0.99 ? '#ff9a5c' : '#ffd76e' });
    if (pl.state === 'dash') tags.push({ t: '疾影', c: '#9fe8ff' });
    ctx.font = '800 13px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    let tx = hx + 2, ty = hy + 44;
    for (const t of tags) { ctx.fillStyle = t.c; ctx.fillText(t.t, tx, ty); tx += ctx.measureText(t.t).width + 14; }

    /* combo */
    if (this.comboHits > 1 && this.comboTimer > 0) {
      const n = this.comboHits;
      const scale = 1 + Math.min(0.35, n * 0.012);
      ctx.save();
      ctx.translate(W - 96, 150);
      ctx.rotate(-0.05);
      ctx.scale(scale, scale);
      ctx.textAlign = 'center';
      ctx.font = '900 54px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
      ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(5,6,12,0.85)';
      ctx.strokeText(String(n), 0, 0);
      const cg = ctx.createLinearGradient(0, -40, 0, 10);
      cg.addColorStop(0, '#fff3cf'); cg.addColorStop(1, '#ffb54a');
      ctx.fillStyle = cg; ctx.fillText(String(n), 0, 0);
      ctx.font = '800 15px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
      ctx.fillStyle = '#ffd98a';
      ctx.fillText('连 斩', 0, 20);
      /* combo timer bar */
      ctx.fillStyle = 'rgba(255,220,140,0.5)';
      ctx.fillRect(-42, 28, 84 * clamp(this.comboTimer / 2.2, 0, 1), 2);
      ctx.restore();
    }

    /* wave + stats top right — offset for mute button */
    ctx.textAlign = 'right';
    ctx.font = '800 14px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(230,235,255,0.85)';
    ctx.fillText('WAVE ' + Math.max(1, this.wave), W - 24, 76);
    ctx.font = '600 11px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(190,200,235,0.65)';
    ctx.fillText('斩击 ' + this.hitCount + '   断肢 ' + this.limbBreakCount + '   击破 ' + this.killCount, W - 24, 94);

    /* controls strip */
    this.drawControls(ctx);
    ctx.restore();
  },

  drawControls(ctx) {
    const items = [
      { k: 'A D / ← →', t: '移动' }, { k: 'Space', t: '跳跃·二段' },
      { k: 'J', t: '连斩' }, { k: 'K', t: '蓄力重斩' },
      { k: 'L', t: '瞬步·无敌' }, { k: 'I', t: '架势·弹反' },
      { k: 'R', t: '重开' }
    ];
    ctx.save();
    ctx.font = '700 11px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.textAlign = 'left';
    let total = 0;
    const pads = items.map(it => {
      const w = ctx.measureText(it.k).width + ctx.measureText(it.t).width + 30;
      total += w + 7; return w;
    });
    const startX = W / 2 - total / 2;
    const baseY = H - 14;
    ctx.fillStyle = 'rgba(5,6,14,0.55)';
    roundRect(ctx, startX - 10, baseY - 20, total + 12, 27, 7); ctx.fill();
    let x = startX;
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      const kw = ctx.measureText(it.k).width;
      ctx.fillStyle = 'rgba(220,230,255,0.92)';
      ctx.fillText(it.k, x, baseY);
      x += kw + 5;
      ctx.fillStyle = 'rgba(150,165,205,0.8)';
      ctx.font = '600 10px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
      ctx.fillText(it.t, x, baseY);
      x += ctx.measureText(it.t).width + 7 + 12;
      ctx.font = '700 11px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    }
    ctx.restore();
  },

  drawBanner(ctx) {
    if (!this.banner || this.bannerT <= 0) return;
    const t = 1 - this.bannerT / this.bannerMax;
    const a = Math.min(clamp(t / 0.14, 0, 1), clamp(this.bannerT / 0.22, 0, 1));
    const slide = (1 - easeOutCubic(clamp(t / 0.2, 0, 1))) * -18;
    ctx.save();
    ctx.translate(0, slide);
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.font = '900 40px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(6,7,14,0.85)';
    ctx.strokeText(this.banner.txt, W / 2, 132);
    const g = ctx.createLinearGradient(0, 92, 0, 142);
    g.addColorStop(0, '#fff2d0'); g.addColorStop(1, '#e8324f');
    ctx.fillStyle = g;
    ctx.fillText(this.banner.txt, W / 2, 132);
    /* thin rule under the banner */
    ctx.strokeStyle = 'rgba(255,190,130,0.55)'; ctx.lineWidth = 1.4;
    const bw = 120;
    ctx.beginPath(); ctx.moveTo(W / 2 - bw, 146); ctx.lineTo(W / 2 + bw, 146); ctx.stroke();
    ctx.font = '700 12px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(255,210,150,0.75)';
    ctx.fillText(this.banner.sub, W / 2, 162);
    ctx.restore();
  },

  drawTitle(ctx) {
    /* hide the in-game HUD behind the title card */
    this._titleMode = true;
    ctx.save();
    ctx.fillStyle = 'rgba(4,5,12,0.58)';
    ctx.fillRect(0, 0, W, H);
    /* ink brush banner */
    ctx.textAlign = 'center';
    const g = ctx.createLinearGradient(0, 150, 0, 250);
    g.addColorStop(0, '#fff4dc'); g.addColorStop(0.55, '#ffd08a'); g.addColorStop(1, '#e8324f');
    ctx.font = '900 74px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 10; ctx.strokeStyle = 'rgba(5,6,12,0.9)';
    ctx.strokeText('绯 刃 试 炼', W / 2, 196);
    ctx.fillStyle = g; ctx.fillText('绯 刃 试 炼', W / 2, 196);
    ctx.font = '700 16px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(230,235,255,0.85)';
    ctx.fillText('CRIMSON EDGE — 缚偶斩', W / 2, 230);
    ctx.font = '600 13.5px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(205,215,245,0.75)';
    ctx.fillText('斩断傀儡的四肢：断腿则跪地爬行，断臂则无力挥刀，断首则当场崩解。', W / 2, 268);
    ctx.fillText('K 蓄力，J 连斩接挑空，I 在刀刃贴身的瞬间弹反，L 瞬步无敌穿身。', W / 2, 290);
    const a = 0.55 + Math.sin(this.realTime * 4) * 0.35;
    ctx.globalAlpha = a;
    ctx.font = '800 20px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText('按 Enter / J 开始', W / 2, 400);
    ctx.globalAlpha = 1;
    ctx.font = '600 12px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(180,190,225,0.6)';
    ctx.fillText('M 静音　·　R 重开　·　鼠标仅用于按钮', W / 2, 424);
    ctx.restore();
  },

  drawDeath(ctx) {
    ctx.save();
    const a = clamp(this.deathT / 0.6, 0, 1);
    ctx.fillStyle = 'rgba(10,2,8,' + (0.55 * a) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.textAlign = 'center';
    ctx.globalAlpha = a;
    ctx.font = '900 62px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.lineWidth = 9; ctx.strokeStyle = 'rgba(5,6,12,0.9)';
    ctx.strokeText('刃 折', W / 2, 232);
    ctx.fillStyle = '#e8324f'; ctx.fillText('刃 折', W / 2, 232);
    ctx.font = '700 17px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = 'rgba(235,235,255,0.85)';
    ctx.fillText('坚持到第 ' + this.wave + ' 波　·　斩击 ' + this.hitCount + ' 次　·　断肢 ' + this.limbBreakCount + ' 处', W / 2, 280);
    const p = 0.6 + Math.sin(this.realTime * 4) * 0.35;
    ctx.globalAlpha = a * p;
    ctx.font = '800 19px "Crimson SC", "Trebuchet MS", system-ui, sans-serif';
    ctx.fillStyle = '#ffe9b0';
    ctx.fillText('按 R 或 Enter 再战', W / 2, 350);
    ctx.restore();
  }
};
