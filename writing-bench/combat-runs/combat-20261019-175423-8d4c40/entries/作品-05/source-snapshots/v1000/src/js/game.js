/* =========================================================
   Game loop, HUD, waves, state API
   ========================================================= */
const Game = {
  state: 'title',      // title | playing | dead | paused
  player: null,
  enemies: [],
  wave: 1,
  kills: 0,
  hitCount: 0,
  enemyHitCount: 0,
  limbBreakCount: 0,
  maxCombo: 0,
  combo: 0,
  comboTimer: 0,
  hitStop: 0,
  hitStopScale: 1,
  slowT: 0,
  time: 0,
  spawnQueue: [],
  spawnTimer: 0,
  betweenWaves: 0,
  echo: 0,
  parryCount: 0,
  started: false,
  paused: false,
  comboBonus: 0,
  playerHitThisFrame: false,
  lastDt: 1 / 60,
  fpsAcc: 0, fpsFrames: 0, fps: 60,
  canvas: null, ctx: null,
  timeScale: 1,

  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.player = Player;
    Input.init();
    this.bindUI();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    FX.reset();
    World.reset();
    Debris.reset();
    Player.reset();
    this.loop(performance.now());
    // idle attract enemies so title bg feels alive? keep clean.
  },

  bindUI() {
    const mute = document.getElementById('muteBtn');
    mute.addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMute();
    });
    const title = document.getElementById('title');
    title.addEventListener('click', () => this.startGame());
    const death = document.getElementById('death');
    death.addEventListener('click', () => this.startGame());
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyM') this.toggleMute();
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.state === 'playing') this.togglePause();
        else if (this.state === 'paused') this.togglePause();
      }
      if (e.code === 'Enter' || e.code === 'KeyR') {
        if (this.state === 'title') this.startGame();
        else if (this.state === 'dead') this.startGame();
      }
      if (e.code === 'KeyR' && (this.state === 'playing' || this.state === 'paused')) {
        this.startGame();
      }
    });
    // pointer support for buttons only
    document.getElementById('stage').addEventListener('mousedown', () => {
      Sfx.unlock();
    }, { once: false });
  },

  toggleMute() {
    const m = !Sfx.isMuted();
    Sfx.setMuted(m);
    const btn = document.getElementById('muteBtn');
    btn.classList.toggle('muted', m);
    document.getElementById('muteTxt').textContent = m ? '静音' : '音效';
    document.getElementById('wave1').style.display = m ? 'none' : '';
    document.getElementById('wave2').style.display = m ? 'none' : '';
    if (!m && this.state === 'playing') Sfx.droneStart();
  },

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.round(rect.width * dpr), h = Math.round(rect.height * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w; this.canvas.height = h;
    }
    this.dpr = dpr;
  },

  startGame() {
    Sfx.unlock();
    this.state = 'playing';
    this.paused = false;
    this.wave = 1; this.kills = 0; this.hitCount = 0; this.enemyHitCount = 0;
    this.limbBreakCount = 0; this.maxCombo = 0; this.combo = 0; this.comboTimer = 0;
    this.hitStop = 0; this.slowT = 0; this.echo = 0; this.parryCount = 0;
    this.comboBonus = 0;
    this.spawnQueue = []; this.spawnTimer = 0; this.betweenWaves = 0;
    this.enemies = [];
    FX.reset(); FX.trailReset(); Debris.reset(); World.reset(); Player.reset();
    Camera.reset();
    document.getElementById('title').classList.add('hidden');
    document.getElementById('death').classList.add('hidden');
    document.getElementById('paused').classList.add('hidden');
    document.getElementById('hud').classList.remove('hidden');
    this.started = true;
    this.waveIntro(1);
    this.spawnWave(1);
    UI.setWave(1);
    Sfx.droneStart();
  },

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      document.getElementById('paused').classList.remove('hidden');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      document.getElementById('paused').classList.add('hidden');
    }
  },

  onPlayerDeath() {
    this.state = 'dead';
    this.deathTimer = 0;
    Sfx.droneStop();
    Camera.targetZoom = 1.18;
    setTimeout(() => {
      if (this.state !== 'dead') return;
      document.getElementById('dWave').textContent = this.wave;
      document.getElementById('dHits').textContent = this.hitCount;
      document.getElementById('dLimbs').textContent = this.limbBreakCount;
      document.getElementById('dCombo').textContent = this.maxCombo;
      document.getElementById('death').classList.remove('hidden');
    }, 1100);
  },

  waveIntro(n) {
    UI.toast(`第 ${n} 波`);
  },

  spawnWave(n) {
    this.spawnQueue.length = 0;
    const plan = [];
    if (n === 1) plan.push('husk', 'husk');
    else if (n === 2) plan.push('husk', 'spinner');
    else if (n === 3) plan.push('husk', 'husk', 'spinner');
    else if (n === 4) plan.push('spinner', 'spinner', 'husk', 'husk');
    else if (n === 5) plan.push('slammer', 'husk');
    else {
      const count = Math.min(3 + Math.floor(n * 0.8), 8);
      for (let i = 0; i < count; i++) {
        const r = Math.random();
        if (n >= 7 && r < 0.22) plan.push('slammer');
        else if (r < 0.55) plan.push('spinner');
        else plan.push('husk');
      }
      if (n % 5 === 0) plan.push('slammer');
    }
    // stagger spawns so they don't all pop at once
    let delay = 0.15;
    for (const t of plan) {
      this.spawnQueue.push({ type: t, at: delay });
      delay += 0.55;
    }
    this.spawnTimer = 0;
    this.waveActive = true;
    this.waveStartKills = this.kills;
  },

  updateSpawning(dt) {
    if (!this.waveActive) return;
    this.spawnTimer += dt;
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.spawnTimer) {
      const s = this.spawnQueue.shift();
      this.spawnEnemy(s.type);
    }
    if (!this.spawnQueue.length && this.enemies.filter(e => !e.dead && !e.dying).length === 0) {
      this.waveActive = false;
      this.nextWaveTimer = 1.15;
    }
    if (!this.waveActive && this.nextWaveTimer != null) {
      this.nextWaveTimer -= dt;
      if (this.nextWaveTimer <= 0) {
        this.nextWaveTimer = null;
        this.wave++;
        UI.setWave(this.wave);
        UI.toast(`第 ${this.wave} 波`);
        if (this.wave > 1) {
          this.player.heal(12);
          Sfx.echo();
        }
        this.spawnWave(this.wave);
        Sfx.wave();
      }
    }
  },

  spawnEnemy(type) {
    const px = this.player.x;
    // spawn at a distance, prefer offscreen-ish but within playfield
    let x;
    const side = Math.random() < 0.5 ? -1 : 1;
    if (side < 0) x = Math.min(WORLD.left + 90, Math.max(px - 420, WORLD.left + 60));
    else x = Math.max(WORLD.right - 90, Math.min(px + 420, WORLD.right - 60));
    if (Math.abs(x - px) < 260) x = px + side * 320;
    x = clamp(x, WORLD.left + 70, WORLD.right - 70);
    const e = new Enemy(type, x, WORLD.groundY);
    e.spawnT = 0.15;
    this.enemies.push(e);
    // spawn flourish: thread pillar
    FX.threadBurst(x, WORLD.groundY - 80, 10, 0.7);
    FX.ring(x, WORLD.groundY, 6, 120, '#b060ff', 0.4, 2);
    FX.dust(x, WORLD.groundY, 8, 1.0);
    return e;
  },

  addCombo() {
    this.combo++;
    this.comboTimer = 1.9;
    if (this.combo > this.maxCombo) this.maxCombo = this.combo;
    UI.setCombo(this.combo);
  },

  update(dt) {
    this.time += dt;
    if (this.state !== 'playing' && this.state !== 'dead') {
      World.update(dt);
      FX.update(dt);
      return;
    }
    // hitstop / slowmo
    let gdt = dt;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      gdt = 0;
    } else if (this.slowT > 0) {
      this.slowT -= dt;
      this.timeScale = 0.22;
      gdt = dt * this.timeScale;
    } else {
      this.timeScale = 1;
    }

    if (this.state === 'dead') {
      // keep world alive for the death animation
      this.player.update(gdt, this.enemies, this);
      for (const e of this.enemies) e.update(gdt, this);
      FX.update(dt);
      Debris.update(dt);
      World.update(dt);
      Camera.update(dt, this.player);
      return;
    }

    // combo timer
    if (this.combo > 0) {
      this.comboTimer -= gdt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        UI.setCombo(0);
      }
    }
    this.comboBonus = Math.max(0, this.comboBonus - gdt * 0.25);

    this.playerHitThisFrame = false;
    const prevHits = this.hitCount;
    this.player.update(gdt, this.enemies, this);

    for (const e of this.enemies) {
      e.update(gdt, this);
    }
    if (this.hitCount > prevHits) {
      this.addCombo();
      // echo points
      this.echo += 1;
      UI.setEcho(this.echo);
    }
    // cleanup
    this.enemies = this.enemies.filter(e => !e.dead);
    // enemy attack telegraphs happen inside update

    this.updateSpawning(gdt);
    FX.trailUpdate(gdt);
    FX.update(gdt);
    Debris.update(dt);
    World.update(dt);
    Camera.update(gdt, this.player);
    UI.update(gdt);
    UI.setEnemyCount(this.enemies.filter(e => !e.dead && !e.dying).length);
  },

  render() {
    const ctx = this.ctx;
    const c = this.canvas;
    if (!ctx || !c) return;
    const dpr = this.dpr || 1;
    const cw = c.width / dpr, ch = c.height / dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const sx = cw / WORLD.W, sy = ch / WORLD.H;
    ctx.save();
    ctx.scale(sx, sy);

    // background (its own parallax)
    World.drawBg(ctx);

    // ---- scene camera: focus on the action band, subtle zoom, capped shake ----
    const [shx, shy, shrot] = Camera.shakeOffset();
    const focusX = Camera.x;
    const focusY = 470 + Camera.y;
    const z = Camera.zoom;
    ctx.save();
    ctx.translate(WORLD.W / 2 + shx, WORLD.H / 2 + shy);
    if (shrot) ctx.rotate(shrot);
    ctx.scale(z, z);
    ctx.translate(-focusX, -focusY);

    FX.drawDecals(ctx);
    Debris.draw(ctx);

    const sorted = this.enemies.slice().sort((a, b) => a.y - b.y || a.x - b.x);
    for (const e of sorted) e.draw(ctx, this);

    FX.drawGhosts(ctx);
    this.player.draw(ctx, this);
    FX.trailDraw(ctx);
    FX.draw(ctx);
    this.player.drawOverlays(ctx, this);

    ctx.restore();
    World.drawFg(ctx);
    ctx.restore();

    // screen-space flashes
    this.drawScreenFx(ctx, cw, ch);
  },

  drawScreenFx(ctx, cw, ch) {
    if (this.player.perfectFlash > 0) {
      ctx.save();
      ctx.globalAlpha = this.player.perfectFlash * 1.2;
      ctx.fillStyle = 'rgba(200,255,255,0.18)';
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
    if (this.state === 'dead') {
      const k = clamp(this.deathFade || 0, 0, 1);
      ctx.save();
      ctx.fillStyle = `rgba(40,0,0,${0.45 * k})`;
      ctx.fillRect(0, 0, cw, ch);
      ctx.restore();
    }
    // low hp vignette
    if (this.state === 'playing' && this.player.hp < 30 && !this.player.dead) {
      const p = (1 - this.player.hp / 30) * (0.5 + Math.sin(this.time * 5) * 0.2);
      const g = ctx.createRadialGradient(cw / 2, ch / 2, ch * 0.25, cw / 2, ch / 2, ch * 0.7);
      g.addColorStop(0, 'rgba(120,0,0,0)');
      g.addColorStop(1, `rgba(120,0,0,${0.35 * p})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);
    }
  },

  loop(now) {
    const dtRaw = Math.min(0.05, (now - (this.lastNow || now)) / 1000);
    this.lastNow = now;
    this.lastDt = dtRaw;
    this.fpsAcc += dtRaw; this.fpsFrames++;
    if (this.fpsAcc > 0.5) { this.fps = this.fpsFrames / this.fpsAcc; this.fpsAcc = 0; this.fpsFrames = 0; }
    if (this.state === 'paused') {
      Input.endFrame();
      requestAnimationFrame(t => this.loop(t));
      return;
    }
    this.update(dtRaw);
    this.render();
    Input.endFrame();
    requestAnimationFrame(t => this.loop(t));
  },
};

// ---------------------------------------------------------
// HUD binding
// ---------------------------------------------------------
const UI = {
  hp: 1, ghost: 1, ghostHold: 0,
  comboTarget: 0, comboT: 0,
  els: {},
  init() {
    this.els = {
      hpFill: document.getElementById('hpFill'),
      hpGhost: document.getElementById('hpGhost'),
      hpText: document.getElementById('hpText'),
      hpWrap: document.getElementById('hpWrap'),
      stamFill: document.getElementById('stamFill'),
      stamWrap: document.getElementById('stamWrap'),
      comboWrap: document.getElementById('comboWrap'),
      comboNum: document.getElementById('comboNum'),
      comboBar: document.querySelector('#comboBar i'),
      wave: document.getElementById('waveNum'),
      echo: document.getElementById('echoNum'),
      enemy: document.getElementById('enemyNum'),
      toast: document.getElementById('toast'),
    };
  },
  setWave(n) { if (this.els.wave) this.els.wave.textContent = n; },
  setEcho(n) { if (this.els.echo) this.els.echo.textContent = n; },
  setEnemyCount(n) { if (this.els.enemy) this.els.enemy.textContent = n; },
  setCombo(n) {
    this.comboTarget = n;
    if (!this.els.comboWrap) return;
    if (n <= 0) {
      this.els.comboWrap.classList.remove('on');
      this.els.comboNum.textContent = '0';
    } else {
      this.els.comboWrap.classList.add('on');
      this.els.comboWrap.classList.toggle('hot', n >= 12);
      this.els.comboNum.textContent = n;
      this.els.comboNum.style.transform = 'scale(1.22)';
      setTimeout(() => { if (this.els.comboNum) this.els.comboNum.style.transform = ''; }, 70);
    }
  },
  toastTimer: 0,
  toast(msg) {
    const el = this.els.toast;
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('on'), 1400);
  },
  update(dt) {
    const p = Game.player;
    if (!p) return;
    const hpFrac = clamp(p.hp / PL.maxHp, 0, 1);
    if (hpFrac < this.hp) this.ghostHold = 0.45;
    this.hp = hpFrac;
    if (this.ghostHold > 0) this.ghostHold -= dt;
    else this.ghost = lerp(this.ghost, hpFrac, Math.min(1, dt * 6));
    if (this.ghost < hpFrac) this.ghost = hpFrac;
    this.els.hpFill.style.transform = `scaleX(${hpFrac})`;
    this.els.hpGhost.style.transform = `scaleX(${this.ghost})`;
    this.els.hpText.textContent = `${Math.ceil(p.hp)} / ${PL.maxHp}`;
    this.els.hpWrap.classList.toggle('low', hpFrac < 0.3);
    this.els.stamFill.style.transform = `scaleX(${clamp(p.stam / PL.maxStam, 0, 1)})`;
    if (Game.combo > 0) {
      this.els.comboBar.style.transform = `scaleX(${clamp(Game.comboTimer / 1.9, 0, 1)})`;
    }
  },
};

// ---------------------------------------------------------
// Boot
// ---------------------------------------------------------
window.addEventListener('load', () => {
  UI.init();
  Game.init();
  // any first key unlocks audio
  const unlock = () => { Sfx.unlock(); };
  window.addEventListener('keydown', unlock, { once: true });
  window.addEventListener('mousedown', unlock, { once: true });
});

// Read-only state API for automated checks
window.combatBenchState = function () {
  const p = Game.player;
  return {
    ready: !!Game.started && !!Game.ctx && Game.state === 'playing' || Game.state === 'dead',
    playerAlive: !!p && p.hp > 0 && !p.dead,
    enemyCount: Game.enemies.filter(e => !e.dead && !e.dying).length,
    hitCount: Game.hitCount | 0,
    limbBreakCount: Game.limbBreakCount | 0,
    playing: Game.state === 'playing',
  };
};

// debug hook (harmless in production)
window.__dbg = function () {
  return {
    p: { x: Math.round(Player.x), y: Math.round(Player.y), state: Player.state, hp: Player.hp },
    e: Game.enemies.map(e => ({ t: e.type, x: Math.round(e.x), state: e.state, hp: Math.round(e.hp), st: +e.stateT.toFixed(2), cd: +e.attackCd.toFixed(2), vx: +e.vx.toFixed(1), spawn: +e.spawnT.toFixed(2) })),
    wave: Game.wave,
  };
};
