'use strict';
/* ============================================================
   Game: orchestration, hitstop, spawning, HUD, loop, state API
   ============================================================ */

const Game = {
  canvas: null, ctx: null, dpr: 1,
  player: null, enemies: [], projectiles: [],
  state: 'title',          // title | playing | dead | paused
  playing: false,
  ready: false,
  paused: false,
  time: 0,
  slowT: 0, slowScale: 1,
  hitstopT: 0,
  hitCount: 0, limbBreakCount: 0, killCount: 0,
  wave: 0, waveT: 0, waveActive: false, spawnQueue: [],
  attackTokens: 0, MAX_TOKENS: 2,
  score: 0, displayScore: 0,
  comboCount: 0, comboDisplayT: 0, comboBest: 0,
  styleT: 0,
  banner: null, bannerT: 0,
  introT: 0,
  deathT: 0,
  pauseT: 0,
  frame: 0,
  seedRnd: rngSeed(1234),
  lastAttackKind: 'light',
  hitsSinceLimb: 0,
  splashT: 0,
  lastFrameTime: 0,

  /* ---------------- setup ---------------- */
  init() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    World.init();
    this.player = new Player();
    this.resize();
    addEventListener('resize', () => this.resize());
    Input.init();
    this.bindUI();
    this.ready = true;
    UI.setup(this);
    this.lastFrameTime = performance.now();
    requestAnimationFrame(t => this.frameLoop(t));
    // expose
    window.combatBenchState = () => this.getState();
  },

  bindUI() {
    const muteBtn = document.getElementById('btnMute');
    if (muteBtn) muteBtn.addEventListener('click', () => {
      Sfx.unlock();
      this.audioEnabled = !(this.audioEnabled !== false);
      UI.applyAudio(this);
    });
    const startBtn = document.getElementById('btnStart');
    if (startBtn) startBtn.addEventListener('click', () => {
      Sfx.unlock();
      this.begin();
    });
    const restartBtn = document.getElementById('btnRestart');
    if (restartBtn) restartBtn.addEventListener('click', () => {
      Sfx.unlock();
      this.restart();
    });
    this.canvas.addEventListener('pointerdown', () => {
      Sfx.unlock();
      if (this.state === 'title') this.begin();
      else if (this.state === 'dead' && this.deathT > 0.9) this.restart();
      else if (this.state === 'paused') this.resume();
    });
  },

  resize() {
    const w = Math.max(960, Math.min(innerWidth, 2400));
    const h = Math.max(540, innerHeight);
    // Canvas resolution follows the display area; design space maps 16:9-ish.
    const dpr = Math.min(devicePixelRatio || 1, 2);
    this.dpr = dpr;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.vw = w; this.vh = h;
    WORLD.viewW = w; WORLD.viewH = h;
  },

  /* ---------------- lifecycle ---------------- */
  begin() {
    if (this.state === 'playing') return;
    Sfx.unlock(); Sfx.uiStart();
    this.startRun();
  },

  startRun() {
    this.state = 'playing'; this.playing = true; this.paused = false;
    this.player.reset();
    this.enemies.length = 0; this.projectiles.length = 0;
    FX.reset();
    this.perfectDodgeCd = 0;
    this.hitCount = 0; this.limbBreakCount = 0; this.killCount = 0;
    this.score = 0; this.displayScore = 0; this.comboCount = 0; this.comboBest = 0;
    this.attackTokens = 0;
    this.wave = 0; this.waveT = 0.35; this.waveActive = false; this.spawnQueue.length = 0;
    this.hitstopT = 0; this.slowT = 0; this.slowScale = 1;
    this.timeFracture = 0; this.timeFractureMax = 1.85;
    this.deathT = 0; this.introT = 0;
    Skills.reset();
    this.banner = null; this.bannerT = 0;
    Camera.x = -120; Camera.y = 0; Camera.zoom = 1;
    UI.hideOverlay();
    UI.hudTick(this, 0);
    this.showBanner('第一波', '裂隙正在打开', 1.4);
  },

  restart() {
    Sfx.unlock();
    this.startRun();
  },

  autoPause() {
    if (this.state === 'playing') this.pause();
  },

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused'; this.playing = false;
    Input.clear();
    UI.showPause();
  },

  resume() {
    if (this.state !== 'paused') return;
    this.state = 'playing'; this.playing = true;
    Input.clear();
    UI.hideOverlay();
  },

  onPlayerDeath() {
    this.state = 'dead';
    this.playing = false;
    this.deathT = 0;
    this.slowT = 0.8; this.slowScale = 0.25;
    UI.showDeath(this);
  },

  playerHurt() {
    this.comboCount = 0;
    this.styleT = 0;
    UI.flashDamage();
  },

  /* ---------------- combat plumbing ---------------- */
  addHitstop(t, a, b) {
    this.hitstopT = Math.max(this.hitstopT, t);
    if (t > 0.07) this.impactFlash = 1;
    if (this.hitstopT > 0.09) Camera.shake(2.5, 0.12);
  },

  // Tokens are derived from live enemies, never a counter that can drift if an
  // enemy is removed mid-attack.
  liveTokenCount() {
    let n = 0;
    for (const e of this.enemies) if (!e.dead && (e.hasToken || e.attackToken)) n++;
    return n;
  },
  requestAttackToken(e) {
    if (this.liveTokenCount() >= this.MAX_TOKENS) return false;
    e.hasToken = true;
    return true;
  },
  releaseAttackToken(e) {
    e.hasToken = false;
    e.attackToken = false;
  },

  fxArmorClank(x, y) {
    Sfx.armorClank();
    FX.sparkBurst(x, y, 1, 0.5, '#cfe0ff', 4);
    FX.text(x, y - 26, '铛', '#cfe0ff', 18, { life: 0.4, vy: -40 });
  },

  onLimbBreak(enemy, id, dir) {
    this.limbBreakCount++;
    this.score += 60;
    this.splashT = 0.18;
  },

  onEnemyKilled(e, dir = 1) {
    this.killCount++;
    this.score += e.cfg.score + this.comboBest * 5;
    FX.text(e.x, e.y - e.h * 1.3, '斩', '#ffd99a', 34, { life: 0.9, weight: 900, italic: true });
    FX.ring(e.x, WORLD.ground, 10, 120, 0.42, 'rgba(255,170,110,0.6)', 3, 0.3);
    FX.impactLines(e.x, e.y - e.h * 0.55, 1, 1.2, '#ffd9b0');
    this.releaseAttackToken(e);
    const deadLimb = Object.keys(e.limbs).filter(k => !e.limbs[k].broken);
    // Sometimes limbs fall off on death for extra viscerality
    if (deadLimb.length && Math.random() < 0.6) {
      const id = pick(deadLimb.filter(k => k !== 'head'));
      if (id) {
        e.limbs[id].broken = true;
        const local = ENEMY_DRAW[e.kind].limbAnchor(id, e);
        FX.part({
          x: e.x + local.x * e.facing, y: e.y + local.y,
          vx: dir * rand(100, 300) + rand(-60, 60), vy: rand(-420, -180),
          g: 1700, drag: 0.35, life: rand(2.6, 3.8), size: 12 * e.scale,
          rot: rand(0, TAU), vr: rand(-12, 12), color: ENEMY_DRAW[e.kind].debrisColor(id, e),
          type: 'limb', limbKind: id, scale: e.scale, floor: 7
        });
      }
    }
    this.updateCombo();
  },

  updateCombo() {
    this.comboCount++;
    this.comboDisplayT = 2.6;
    if (this.comboCount > this.comboBest) this.comboBest = this.comboCount;
    this.styleT = 0.3;
  },

  registerHit(a, hx, hy, enemy) {
    this.hitCount++;
    this.score += Math.round(10 + (a.damage || 5));
    this.updateCombo();
    const kind = a.counter ? 'parry' : (a.heavy ? 'heavy' : 'normal');
    FX.hitBurst(hx, hy, a.dir || 1, a.heavy ? 1.6 : (a.counter ? 1.6 : 1.0), kind);
    FX.text(hx, hy - 34, String(Math.round((a.damage || 5) * 10)), kind === 'normal' ? '#fff0d0' : '#ffcf8f',
            kind === 'normal' ? 18 : 24, { life: 0.5, vy: -120, weight: 700, pop: true });
    Sfx.hit(a.heavy ? 1.7 : (a.counter ? 1.6 : 1));
    // camera kick away from the impact keeps the punch directional
    Camera.kick((a.dir || 1) * (a.heavy ? 4 : 2), -1.2);
    this.splashT = 0.06;
    // Blade glow trail flash
    this.player.bladeGlow = 1;
  },

  /* ---------------- parry ---------------- */
  onParry(enemy, attack) {
    const p = this.player;
    if (enemy.attack) {
      // cancel enemy attack and stagger
      enemy.cancelAttack();
      enemy.attack = null;
      enemy.state = 'stagger'; enemy.stateT = 0;
      enemy.staggerT = 0.75;
      enemy.hitstun = Math.max(enemy.hitstun, 0.5);
      enemy.flash = 1;
      enemy.takeHit(0, p.x, { noLimb: true, heavy: false });
    }
    this.addHitstop(0.14, p, enemy);
    const px = p.x + p.facing * 30, py = p.y - 58;
    FX.hitBurst(px, py, p.facing, 1.6, 'parry');
    Sfx.parry();
    Camera.shake(4.5, 0.24);
    this.slowT = 0.22; this.slowScale = 0.35;
    p.parrySuccessFlash = 1;
    p.invuln = Math.max(p.invuln, 0.45);
    p.bladeGlow = 1;
    // reward: instant charged follow-up available
    p.specialCd = 0;
    p.counterReady = 1.4;
    this.score += 40;
    this.showFloat(p.x, p.y - 150, '弹反', '#bfefff', 30);
    // release attack token so the enemy stops blocking others
    this.updateCombo();
    // instant auto counter: spin slash dealing damage
    this.doCounterSlash(enemy);
  },

  doCounterSlash(enemy) {
    const p = this.player;
    const dir = p.facing;
    FX.slash(p.x + dir * 40, p.y - 56, 100, dir > 0 ? -2.4 : Math.PI + 0.6, dir > 0 ? 1.0 : Math.PI - 1.0, dir, 0.3, 'rgba(170,230,255,0.95)', 18);
    FX.slash(p.x + dir * 36, p.y - 60, 80, dir > 0 ? 2.2 : -0.9, dir > 0 ? -0.4 : Math.PI + 0.4, dir, 0.26, 'rgba(230,250,255,0.9)', 12);
    Sfx.counter();
    const box = { x0: p.x - 130, x1: p.x + 130, y0: p.y - 130, y1: p.y + 10 };
    const targets = this.enemies.filter(e => !e.dead && e.x > box.x0 && e.x < box.x1 && e.y > box.y0 - e.h && e.y < WORLD.ground + 20);
    for (const e of targets) {
      const res = e.takeHit(30, p.x, { heavy: true, counter: true, knock: 380, lift: -260 });
      if (res.hit) {
        this.hitCount++;
        this.registerHit({ damage: 30, heavy: true, counter: true, dir: (e.x > p.x ? 1 : -1) }, e.x, e.y - e.h * 0.55, e);
        this.addHitstop(0.11, p, e);
      }
    }
    this.addHitstop(0.06, null, null);
    Camera.shake(6, 0.3);
    p.invuln = Math.max(p.invuln, 0.5);
  },

  onPerfectDodge(enemy, a) {
    const p = this.player;
    this.perfectDodgeCd = 1.2;
    this.slowT = 0.24; this.slowScale = 0.32;
    this.addHitstop(0.05, null, null);
    p.chargeHeld = false;
    p.specialReady = 2.2;
    this.score += 30;
    Camera.shake(2, 0.14);
    Sfx.dash();
    Sfx.tone(880, 0.45, { type: 'triangle', vol: 0.07, slide: 1.6 });
    FX.text(p.x, p.y - 150, '闪避', '#a8e4ff', 24, { life: 0.7 });
    FX.ring(p.x, p.y - 60, 8, 90, 0.3, 'rgba(150,220,255,0.6)', 3, 1);
    for (let i = 0; i < 10; i++) {
      FX.part({ x: p.x + rand(-20, 20), y: p.y - rand(20, 130),
        vx: rand(-140, 140), vy: rand(-160, 40), life: rand(0.2, 0.5), size: rand(1, 2.4),
        color: '#9fd8ff', type: 'dot', glow: 1 });
    }
  },

  onCounterHitVisual() {},

  /* ---------------- hit resolution from player ---------------- */
  nearestEnemyDist(x, dir, maxD) {
    let best = maxD;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = (e.x - x) * dir;
      if (d > -30 && d < best) best = Math.max(0, d);
    }
    return best;
  },

  hitEnemies(player, box, a) {
    let any = false;
    for (const e of this.enemies) {
      if (e.dead || e.removeMe) continue;
      const hb = e.hurtBox();
      if (box.x1 > hb.x0 && box.x0 < hb.x1 && box.y1 > hb.y0 && box.y0 < hb.y1) {
        if (player.hitIds && player.hitIds.has(e.id)) continue;
        if (player.hitIds) player.hitIds.add(e.id);
        const opts = {
          heavy: !!a.heavy, counter: false, lift: a.lift,
          knock: a.knock || 140, targetLimb: a.targetLimb,
          charged: a.lvl === 2
        };
        // air spike finisher slams airborne foes
        const res = e.takeHit(a.damage || 8, player.x, opts);
        if (res.hit) {
          any = true;
          const hx = clamp(player.x + (a.dir || 1) * (a.reach ? a.reach * 0.55 : 40), e.x - e.w, e.x + e.w);
          const hy = e.y - e.h * (0.58 + rand(-0.08, 0.08));
          player.onHitEnemy(e, a, hx, hy, res.broke.length > 0);
          if (a.spike && !e.dead) {
            // air finisher drives them to the ground
            e.vy = Math.max(e.vy, 900);
            e.launched = true;
            this.addHitstop(0.05, player, e);
          }
        }
      }
    }
    return any;
  },

  /* ---------------- shockwaves ---------------- */
  spawnShockwave(x, y, dir, damage, speed, range) {
    this.projectiles.push({
      kind: 'shock', x, y: WORLD.ground - 8, dir, damage, speed, range,
      traveled: 0, life: range / speed, t: 0
    });
    FX.dust(x, WORLD.ground, dir, 0.9, 8);
  },

  spawnRiftPillar(x) {
    // a slow, telegraphed AoE column from the ground
    this.projectiles.push({ kind: 'pillar', x, y: WORLD.ground, t: 0, life: 1.1, damage: 14, dir: 1, traveled: 0 });
  },

  updateProjectiles(dt) {
    this.perfectDodgeCd = Math.max(0, (this.perfectDodgeCd || 0) - dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const pr = this.projectiles[i];
      pr.t += dt;
      if (pr.kind === 'shock') {
        pr.x += pr.dir * pr.speed * dt;
        pr.traveled += pr.speed * dt;
        // ground sparks
        if (Math.random() < 0.55) {
          FX.part({ x: pr.x + rand(-14, 14), y: WORLD.ground - rand(0, 16),
            vx: pr.dir * rand(30, 160), vy: rand(-160, -30), g: 900, drag: 1.2,
            life: rand(0.2, 0.5), size: rand(1.5, 3.4), color: '#ffc07a', type: 'streak', glow: 1 });
        }
        const p = this.player;
        if (p.alive && !pr.hitPlayer) {
          const d = Math.abs(p.x - pr.x);
          if (d < 28 && p.y > WORLD.ground - 30) {
            pr.hitPlayer = true;
            if (p.parryT > 0) {
              this.onParry({ attack: null, cancelAttack(){}, state:'stagger', stateT:0, staggerT:0.6, hitstun:0.4, flash:1,
                             takeHit(){}, x: pr.x, id: -1 }, null);
            } else {
              p.takeDamage(pr.damage, pr.x - pr.dir, { knock: 320, launch: true });
            }
          }
        }
        if (pr.traveled >= pr.range) this.projectiles.splice(i, 1);
      } else if (pr.kind === 'pillar') {
        const k = pr.t / pr.life;
        if (k < 0.45) {
          // telegraph
        } else if (!pr.fired) {
          pr.fired = true;
          Sfx.breakLimb();
          Camera.shake(3, 0.2);
          FX.ring(pr.x, WORLD.ground, 10, 70, 0.35, 'rgba(255,120,60,0.8)', 4, 0.3);
        }
        if (pr.fired && !pr.hitDone) {
          const p = this.player;
          if (Math.abs(p.x - pr.x) < 44) {
            pr.hitDone = true;
            if (p.parryT > 0) this.onParry({ attack: null, cancelAttack(){}, state:'stagger', stateT:0, staggerT:0.6, hitstun:0.4, flash:1, takeHit(){}, x: pr.x, id: -3 }, null);
            else p.takeDamage(pr.damage, pr.x, { knock: 380, launch: true });
          }
        }
        if (pr.t > pr.life) this.projectiles.splice(i, 1);
      }
    }
  },

  drawProjectiles(ctx) {
    for (const pr of this.projectiles) {
      if (pr.kind === 'shock') {
        ctx.save();
        ctx.translate(pr.x, pr.y);
        ctx.globalCompositeOperation = 'lighter';
        const h = 26 + Math.sin(pr.t * 40) * 6;
        const g = ctx.createLinearGradient(0, -h, 0, 0);
        g.addColorStop(0, 'rgba(255,180,90,0)');
        g.addColorStop(0.5, 'rgba(255,170,80,0.5)');
        g.addColorStop(1, 'rgba(255,225,170,0.9)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.moveTo(-22, 0);
        ctx.quadraticCurveTo(0, -h * 1.6, 22, 0);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      } else if (pr.kind === 'pillar') {
        const k = pr.t / pr.life;
        ctx.save();
        ctx.translate(pr.x, WORLD.ground);
        if (k < 0.45) {
          ctx.strokeStyle = `rgba(255,110,60,${0.4 + Math.sin(k * 60) * 0.2})`;
          ctx.lineWidth = 2;
          ctx.beginPath(); ctx.ellipse(0, 0, 42, 9, 0, 0, TAU); ctx.stroke();
        } else {
          ctx.globalCompositeOperation = 'lighter';
          const hh = 200 * Math.sin(Math.min(1, (k - 0.45) * 4) * Math.PI * 0.5) * (1 - Math.max(0, (k - 0.7) / 0.3));
          const g = ctx.createLinearGradient(0, 0, 0, -hh);
          g.addColorStop(0, 'rgba(255,230,180,0.85)');
          g.addColorStop(0.4, 'rgba(255,150,70,0.4)');
          g.addColorStop(1, 'rgba(255,90,40,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.moveTo(-24, 0);
          ctx.quadraticCurveTo(-12, -hh * 0.6, -4, -hh);
          ctx.lineTo(4, -hh);
          ctx.quadraticCurveTo(12, -hh * 0.6, 24, 0);
          ctx.closePath(); ctx.fill();
        }
        ctx.restore();
      }
    }
  },

  /* ---------------- spawning / waves ---------------- */
  showBanner(main, sub, dur = 1.6) {
    this.banner = { main, sub };
    this.bannerT = dur;
  },

  showFloat(x, y, str, color, size) {
    FX.text(x, y, str, color, size, { life: 0.8, vy: -50 });
  },

  startWave() {
    this.wave++;
    this.waveActive = true;
    this.waveT = 0;
    const w = this.wave;
    this.spawnQueue.length = 0;

    const alivePlayers = 1;
    // Difficulty ramp. More archetypes unlock progressively.
    if (w === 1) {
      this.queueSpawn('husk', -520, 0.2);
      this.queueSpawn('husk', 520, 0.7);
    } else if (w === 2) {
      this.queueSpawn('husk', -430, 0.1);
      this.queueSpawn('stalker', 480, 0.5);
      this.queueSpawn('husk', 400, 1.2);
    } else if (w === 3) {
      this.queueSpawn('stalker', -400, 0.1);
      this.queueSpawn('stalker', 430, 0.4);
      this.queueSpawn('husk', 0, 1.0);
      this.queueSpawn('husk', 520, 1.5);
    } else {
      // Scale up indefinitely but with variety and caps
      const n = Math.min(3 + Math.floor(w / 2), 6);
      const kinds = ['husk', 'husk', 'stalker', 'stalker'];
      if (w >= 4) kinds.push('warden');
      if (w >= 6) kinds.push('warden');
      for (let i = 0; i < n; i++) {
        const kind = pick(kinds);
        const side = i % 2 === 0 ? -1 : 1;
        const x = side * rand(300, 600);
        this.queueSpawn(kind, x, 0.1 + i * 0.42);
      }
    }
    if (w === 4 && !this.spawnQueue.some(s => s.kind === 'warden')) {
      this.queueSpawn('warden', 480, 0.9);
    }
    this.hpMul = 1 + Math.max(0, w - 4) * 0.12;
    this.showBanner(w === 1 ? '第一波' : (w % 5 === 0 ? '裂隙激荡' : '第 ' + w + ' 波'),
                    w === 1 ? '斩杀，肢解，不要停下' : (w === 4 ? '铁钟卫 出现' : (w % 5 === 0 ? '敌人更强了' : '')), 1.5);
  },

  queueSpawn(kind, x, delay) {
    this.spawnQueue.push({ kind, x, t: delay, hpMul: this.hpMul || 1 });
  },

  updateSpawns(dt) {
    if (this.spawnQueue.length) {
      for (let i = this.spawnQueue.length - 1; i >= 0; i--) {
        const s = this.spawnQueue[i];
        s.t -= dt;
        if (s.t <= 0) {
          this.spawnEnemy(s.kind, s.x);
          this.spawnQueue.splice(i, 1);
        }
      }
    }
    if (this.waveActive && this.spawnQueue.length === 0) {
      const alive = this.enemies.filter(e => !e.dead).length;
      if (alive === 0) {
        this.waveActive = false;
        this.waveT = 0;
        this.onWaveCleared();
      }
    } else if (!this.waveActive) {
      this.waveT += dt;
      const alive = this.enemies.filter(e => !e.dead).length;
      if (this.waveT > 0.9 && alive === 0) this.startWave();
    }
  },

  spawnEnemy(kind, x, opts = {}) {
    x = clamp(x, WORLD.left + 80, WORLD.right - 80);
    // avoid spawning right on top of the player
    if (Math.abs(x - this.player.x) < 130) {
      x = this.player.x + (x > this.player.x ? 1 : -1) * rand(180, 300);
      x = clamp(x, WORLD.left + 80, WORLD.right - 80);
    }
    const e = new Enemy(kind, x, { emerge: true, hpMul: opts.hpMul || this.hpMul || 1 });
    this.enemies.push(e);
    // emergence effect
    FX.ring(x, WORLD.ground, 8, 52, 0.45, 'rgba(255,140,80,0.55)', 3, 0.3);
    FX.dust(x, WORLD.ground, 0, 1.1, 10);
    for (let i = 0; i < 12; i++) {
      FX.part({ x: x + rand(-20, 20), y: WORLD.ground - rand(0, 20), vx: rand(-40, 40), vy: rand(-280, -120),
        g: 700, drag: 0.6, life: rand(0.5, 0.9), size: rand(1.5, 3), color: '#ffb070', type: 'ember', glow: 1 });
    }
    return e;
  },

  onWaveCleared() {
    const bonus = 100 + this.wave * 40;
    this.score += bonus;
    this.showBanner('波次清除', '+' + bonus, 1.0);
    Sfx.charged();
  },

  /* ---------------- main loop ---------------- */
  frameLoop(now) {
    requestAnimationFrame(t => this.frameLoop(t));
    window.__dbgFrames = (window.__dbgFrames || 0) + 1;
    let dt = (now - this.lastFrameTime) / 1000;
    this.lastFrameTime = now;
    if (!isFinite(dt)) dt = 0;
    dt = Math.min(dt, 1 / 20); // clamp huge gaps
    this.frame++;

    this.update(dt);
    this.render(dt);
    Input.endFrame();
  },

  update(rawDt) {
    // Hitstop and slow-motion applied to the whole simulation but *not* to UI timers.
    let scale = 1;
    if (this.slowT > 0) {
      this.slowT -= rawDt;
      scale *= this.slowScale;
    }
    // 残心·时刃: the world crawls for ~1.8s, the blade does not.
    if (this.timeFracture > 0) {
      this.timeFracture -= rawDt;
      scale *= 0.18;
      if (this.timeFracture <= 0) {
        this.timeFracture = 0;
        Sfx.riftClose();
      }
    }
    if (this.hitstopT > 0) {
      this.hitstopT -= rawDt;
      scale = 0;
    }
    const dt = rawDt * scale;

    if (this.state === 'playing' || this.state === 'dead') {
      if (dt > 0) this.simulate(dt);
    }
    // pause hotkey
    if (this.state === 'playing' && Input.hit('Escape')) this.pause();
    else if (this.state === 'paused' && (Input.hit('Escape') || Input.hit('Enter'))) this.resume();

    if (Input.hit('KeyR') && this.state !== 'title') this.restart();
    if (this.state === 'dead' && Input.hit('Enter')) { this.restart(); return; }

    // UI timers run at real time
    this.tickUI(rawDt);
    Camera.update(rawDt);
    this.updateHUD(rawDt);
  },

  simulate(dt) {
    this.time += dt;
    World.update(dt);
    const p = this.player;
    if (this.state === 'playing') {
      p.update(dt);
    } else if (this.state === 'dead') {
      p.update(dt);
    }

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e.state !== 'spawn') e.update(dt); else e.update(dt);
      if (e.removeMe) {
        this.releaseAttackToken(e);
        this.enemies.splice(i, 1);
      }
    }
    this.separateEnemies();
    this.updateProjectiles(dt);
    Skills.tick(dt);
    if (this.state === 'playing') this.updateSpawns(dt);
    FX.update(dt);
    this.updateCameraTargets(dt);
  },

  separateEnemies() {
    // Soft body avoidance so enemies don't stack into one visual blob.
    const arr = this.enemies;
    for (let i = 0; i < arr.length; i++) {
      const a = arr[i];
      if (a.dead) continue;
      for (let j = i + 1; j < arr.length; j++) {
        const b = arr[j];
        if (b.dead) continue;
        const dx = b.x - a.x;
        const min = 44;
        if (Math.abs(dx) < min && Math.abs(a.y - b.y) < 50) {
          const push = (min - Math.abs(dx)) * 0.5 * sign(dx || 1);
          a.x -= push * 0.5; b.x += push * 0.5;
        }
      }
    }
  },

  updateCameraTargets(dt) {
    const p = this.player;
    let tx = p.x;
    let ty = 0;
    let zoom = 1;
    // look-ahead in facing direction, capped
    tx += p.facing * 58;
    // frame enemies nearby
    let nearest = null, nd = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.abs(e.x - p.x);
      if (d < nd) { nd = d; nearest = e; }
    }
    if (nearest && nd < 560) {
      tx = lerp(tx, (p.x + nearest.x) / 2 + p.facing * 20, 0.5);
      const spread = Math.abs(nearest.x - p.x);
      zoom = lerp(1.0, 0.9, clamp(spread / 420, 0, 1));
    }
    if (Camera.iaiT > 0) {
      Camera.iaiT -= dt;
      zoom *= 0.9;
      tx = lerp(tx, p.x + p.facing * 120, 0.55);
    }
    // air focus: follow the player up
    if (!p.onGround) ty = clamp((p.y - WORLD.ground) * 0.55, -150, 0);
    ty = clamp(ty, -190, 0);
    Camera.tx = clamp(tx, WORLD.left + WORLD.viewW / 2 * 0.35, WORLD.right - WORLD.viewW / 2 * 0.35);
    Camera.ty = ty;
    Camera.tz = zoom;
    // arena bound clamp so camera never shows void: allow overscan since background extends
  },

  tickUI(dt) {
    if (this.bannerT > 0) this.bannerT -= dt;
    if (this.comboDisplayT > 0) this.comboDisplayT -= dt;
    if (this.state === 'dead') this.deathT += dt;
    this.styleT = Math.max(0, this.styleT - dt);
    this.impactFlash = Math.max(0, (this.impactFlash || 0) - dt * 7);
    this.splashT = Math.max(0, this.splashT - dt);
    // score display easing
    this.displayScore = lerp(this.displayScore, this.score, 1 - Math.pow(0.001, dt));
    if (Math.abs(this.displayScore - this.score) < 1) this.displayScore = this.score;
  },

  updateHUD(dt) {
    UI.hudTick(this, dt);
  },

  /* ---------------- render ---------------- */
  render(dt) {
    const ctx = this.ctx;
    const w = this.canvas.width, h = this.canvas.height;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    const vw = this.vw, vh = this.vh;

    VIEW.update(vw, vh, Camera);

    World.drawSky(ctx, vw, vh);
    World.drawFar(ctx);
    World.drawMid(ctx);
    World.drawNear(ctx);
    World.drawGround(ctx, false);
    World.drawBounds(ctx);

    // --- world-space layer, using the SAME mapping as the background ---
    ctx.save();
    ctx.translate(vw / 2, VIEW.horizon);
    ctx.scale(VIEW.k, VIEW.k);
    ctx.translate(-VIEW.camX, -(WORLD.ground + VIEW.camY));

    World.drawMotes(ctx);
    FX.drawBack(ctx);
    FX.drawGround(ctx);

    const ents = [];
    for (const e of this.enemies) ents.push({ y: e.y - e.yOff, draw: () => { e.draw(ctx); } });
    const p = this.player;
    ents.push({ y: p.y + 0.5, draw: () => p.draw(ctx) });
    ents.sort((a, b) => a.y - b.y);
    // save/restore per entity: a single unbalanced transform must never leak
    for (const en of ents) { ctx.save(); en.draw(); ctx.restore(); }

    this.drawProjectiles(ctx);
    Skills.drawWorld(ctx);
    FX.drawParts(ctx);
    FX.drawSlashes(ctx);
    FX.drawTop(ctx);
    ctx.restore();

    this.drawEnemyBars(ctx, vw, vh);
    Skills.drawScreen(ctx, vw, vh, dt);

    // --- screen-space overlays ---
    this.drawScreenFX(ctx, vw, vh);
    World.drawForeground(ctx);
    UI.draw(ctx, this, vw, vh, dt);
  },

  drawEnemyBars(ctx, vw, vh) {
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const sx = VIEW.sx(e.x);
      if (sx < -90 || sx > vw + 90) continue;
      const top = VIEW.sy(e.y - e.h * 1.2);
      const w = e.kind === 'warden' ? 86 : 62;
      const hh = 5;
      const x = sx - w / 2, y = top - 20;
      const pct = clamp(e.hp / e.maxHp, 0, 1);
      const hostile = (e.state === 'tell' || e.state === 'attack');
      ctx.save();
      ctx.globalAlpha = 0.92;
      // frame
      ctx.fillStyle = 'rgba(8,7,12,0.72)';
      ctx.fillRect(x - 1, y - 1, w + 2, hh + 2);
      ctx.strokeStyle = hostile ? 'rgba(255,140,90,0.85)' : 'rgba(150,140,130,0.45)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - 1.5, y - 1.5, w + 3, hh + 3);
      // fill
      const g = ctx.createLinearGradient(x, y, x, y + hh);
      if (e.kind === 'warden') { g.addColorStop(0, '#ffd08a'); g.addColorStop(1, '#b0703a'); }
      else if (e.kind === 'stalker') { g.addColorStop(0, '#9fe8ff'); g.addColorStop(1, '#3f97b8'); }
      else { g.addColorStop(0, '#ff9c72'); g.addColorStop(1, '#a83a2c'); }
      ctx.fillStyle = g;
      ctx.fillRect(x, y, w * pct, hh);
      // limb damage pips
      const broken = Object.keys(e.limbs).filter(k => e.limbs[k].broken).length;
      for (let i = 0; i < broken; i++) {
        ctx.fillStyle = '#ff6a4a';
        ctx.fillRect(x + 2 + i * 5, y + hh + 3, 3, 2);
      }
      ctx.restore();
    }
  },

  drawScreenFX(ctx, vw, vh) {
    // Impact frames: a short, warm rim flash during the meatiest hitstop beats.
    if (this.hitstopT > 0.07 && this.impactFlash > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = Math.min(0.16, this.impactFlash * 0.16);
      const g = ctx.createRadialGradient(vw / 2, vh * 0.52, vh * 0.2, vw / 2, vh * 0.52, vh * 0.75);
      g.addColorStop(0, 'rgba(255,220,180,0.55)');
      g.addColorStop(1, 'rgba(255,150,90,0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, vw, vh);
      ctx.restore();
    }
    // subtle color grade
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    ctx.fillStyle = 'rgba(90,60,120,0.05)';
    ctx.fillRect(0, 0, vw, vh);
    ctx.restore();
    // damage vignette
    const p = this.player;
    if (p) {
      const lowHp = 1 - clamp(p.hp / p.maxHp, 0, 1);
      if (lowHp > 0.5 || p.hurtT > 0) {
        const a = Math.max(p.hurtT > 0 ? p.hurtT * 0.6 : 0, (lowHp - 0.5) * 0.5);
        const g = ctx.createRadialGradient(vw / 2, vh / 2, vh * 0.32, vw / 2, vh / 2, vh * 0.82);
        g.addColorStop(0, 'rgba(120,10,20,0)');
        g.addColorStop(1, `rgba(120,10,20,${a})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, vw, vh);
      }
      if (p.parrySuccessFlash > 0.01) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = p.parrySuccessFlash * 0.08;
        ctx.fillStyle = '#9fd8ff';
        ctx.fillRect(0, 0, vw, vh);
        ctx.restore();
      }
    }
  },

  /* ---------------- state API ---------------- */
  getState() {
    return {
      ready: !!this.ready,
      playerAlive: !!(this.player && this.player.alive),
      enemyCount: this.enemies.filter(e => !e.dead).length,
      hitCount: this.hitCount,
      limbBreakCount: this.limbBreakCount,
      playing: !!this.playing
    };
  }
};

/* ============================================================
   UI: HUD, overlays, tutorial prompts. Canvas + DOM hybrid.
   ============================================================ */
const UI = {
  root: null, hudEls: {},
  init() {},

  setup(game) {
    this.root = document.getElementById('ui');
  },

  hideOverlay() {
    document.getElementById('skillbar')?.classList.add('show');
    const ov = document.getElementById('overlay');
    if (ov) { ov.classList.remove('show'); ov.classList.add('hidden'); }
    const pause = document.getElementById('pauseScreen');
    if (pause) pause.classList.remove('show');
    document.getElementById('btnRestart')?.classList.remove('show');
  },

  showPause() {
    const el = document.getElementById('pauseScreen');
    if (el) el.classList.add('show');
  },

  showDeath(game) {
    const el = document.getElementById('deathScreen');
    if (!el) return;
    document.getElementById('deathScore').textContent = Math.round(game.score);
    document.getElementById('deathWave').textContent = game.wave;
    document.getElementById('deathBest').textContent = game.comboBest;
    el.classList.add('show');
  },

  skillFlash(id) {
    if (!this._skillEls) this._skillEls = Array.from(document.querySelectorAll('#skillbar .skill'));
    for (const el of this._skillEls) {
      if (el.dataset.skill !== id) continue;
      const sw = el.querySelector('.sk-sweep');
      if (sw) { sw.classList.remove('go'); void sw.offsetWidth; sw.classList.add('go'); }
    }
  },

  flashDamage() {
    const el = document.getElementById('dmgFlash');
    if (!el) return;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  },

  applyAudio(game) {
    const muted = !(game.audioEnabled !== false);
    Sfx.setMuted(muted);
    const btn = document.getElementById('btnMute');
    if (btn) {
      btn.textContent = muted ? '🔇 静音' : '🔊 音效';
      btn.classList.toggle('muted', muted);
    }
  },

  hudTick(game, dt) {
    const hpFill = document.getElementById('hpFill');
    if (!hpFill) return;
    const p = game.player;
    const hpPct = clamp(p.hp / p.maxHp, 0, 1);
    hpFill.style.width = (hpPct * 100).toFixed(1) + '%';
    hpFill.classList.toggle('low', hpPct < 0.3);
    document.getElementById('hpText').textContent = Math.ceil(p.hp) + ' / ' + p.maxHp;
    document.getElementById('waveNum').textContent = game.wave;
    document.getElementById('killNum').textContent = game.killCount;
    document.getElementById('scoreNum').textContent = Math.round(game.displayScore);
    const qiFill = document.getElementById('qiFill');
    if (qiFill) qiFill.style.width = ((p.qi / p.maxQi) * 100).toFixed(1) + '%';

    // skill readiness
    if (!this._skillEls) {
      this._skillEls = Array.from(document.querySelectorAll('#skillbar .skill'));
    }
    for (const el of this._skillEls) {
      const id = el.dataset.skill;
      const def = SKILL_BY_ID[id];
      if (!def) continue;
      const cd = p.skillCd[id] || 0;
      const cdEl = el.querySelector('.sk-cd');
      if (cdEl) cdEl.style.transform = 'scaleY(' + (cd / def.cd).toFixed(3) + ')';
      const affordable = p.qi >= def.cost;
      el.classList.toggle('ready', cd <= 0.02 && affordable);
      el.classList.toggle('nogas', !affordable && cd <= 0.02);
    }

    // chain indicator
    const chain = document.getElementById('chainPips');
    if (chain) {
      for (let i = 0; i < 3; i++) {
        chain.children[i]?.classList.toggle('lit', p.combo > i && p.comboWindow > 0);
      }
    }
  },

  draw(ctx, game, vw, vh, dt) {
    // Combo counter (canvas, for punchy font)
    const p = game.player;
    if (game.comboDisplayT > 0 && game.comboCount >= 2) {
      const k = clamp(game.comboDisplayT / 2.6, 0, 1);
      const alpha = k > 0.8 ? 1 : k / 0.8;
      const pop = clamp((2.6 - game.comboDisplayT) * 12, 0, 1);
      ctx.save();
      ctx.translate(vw - 90, vh * 0.28);
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'alphabetic';
      ctx.scale(1 + (1 - pop) * 0.25, 1 + (1 - pop) * 0.25);
      ctx.font = 'italic 900 64px "RB Serif", Georgia, serif';
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText(game.comboCount + '', 0, 0);
      const grad = ctx.createLinearGradient(0, -60, 0, 4);
      grad.addColorStop(0, '#fff4d8'); grad.addColorStop(0.55, '#ffd06a'); grad.addColorStop(1, '#ff8a48');
      ctx.fillStyle = grad;
      ctx.fillText(game.comboCount + '', 0, 0);
      ctx.font = '700 18px "RB Serif", Georgia, serif';
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.strokeText('连击', -70, -6);
      ctx.fillStyle = '#ffe2b0';
      ctx.fillText('连击', -70, -6);
      ctx.restore();
    }

    // Wave banner
    if (game.bannerT > 0 && game.banner) {
      const k = clamp(game.bannerT / 1.5, 0, 1);
      const inA = clamp((1.6 - game.bannerT) * 4, 0, 1);
      const outA = clamp(game.bannerT / 0.4, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(inA, outA);
      ctx.textAlign = 'center';
      ctx.translate(vw / 2, vh * 0.22 - (1 - inA) * 14);
      const sc = 0.9 + inA * 0.1;
      ctx.scale(sc, sc);
      ctx.font = '900 54px "RB Serif", Georgia, serif';
      ctx.lineWidth = 8; ctx.strokeStyle = 'rgba(8,6,10,0.7)';
      ctx.strokeText(game.banner.main, 0, 0);
      const grad = ctx.createLinearGradient(0, -50, 0, 10);
      grad.addColorStop(0, '#fff2d0'); grad.addColorStop(1, '#e09060');
      ctx.fillStyle = grad;
      ctx.fillText(game.banner.main, 0, 0);
      // flanking lines
      const tw = ctx.measureText(game.banner.main).width;
      ctx.strokeStyle = 'rgba(220,150,90,0.6)'; ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(-tw / 2 - 20, -18); ctx.lineTo(-tw / 2 - 90, -18);
      ctx.moveTo(tw / 2 + 20, -18); ctx.lineTo(tw / 2 + 90, -18);
      ctx.stroke();
      if (game.banner.sub) {
        ctx.font = '400 20px "RB Serif", Georgia, serif';
        ctx.fillStyle = 'rgba(240,220,200,0.85)';
        ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(8,6,10,0.7)';
        ctx.strokeText(game.banner.sub, 0, 42);
        ctx.fillText(game.banner.sub, 0, 42);
      }
      ctx.restore();
    }

    // Control hint at the bottom (fades after the first hit)
    if (game.state === 'playing' && game.hitCount < 3) {
      const a = clamp(1 - game.hitCount / 3, 0, 1) * 0.85;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.textAlign = 'center';
      ctx.font = '500 16px "RB Sans", system-ui, sans-serif';
      ctx.fillStyle = '#d8d0c8';
      ctx.fillText('A / D 移动 · Space 跳跃 · J 斩击 · K 蓄力斩 · L 闪避 · I 弹反', vw / 2, vh - 42);
      ctx.restore();
    }

    // mechanic hint rail — first few seconds only, never blocks play
    if (game.state === 'playing' && game.time < 9 && game.wave <= 1) {
      const a = clamp(9 - game.time, 0, 1) * clamp(game.time * 1.4, 0, 1) * 0.9;
      ctx.save();
      ctx.globalAlpha = a;
      const items = [
        ['J', '连斩三段 · 收招前再按可衔接'],
        ['K', '按住蓄力 · 满蓄斩断肢体'],
        ['L', '闪避 · 攻击中可取消'],
        ['I', '弹反 · 敌人红光起手时按下'],
        ['U', '居合突刺 · 长距离斩穿（刃气35）'],
        ['O', '千刃回旋 · 持续吸附多段（刃气45）'],
        ['P', '升龙挑空 · 将敌人打上天（刃气30）'],
        ['H', '时刃减速 · 斩击留回响（刃气60）']
      ];
      const bx = 24, by = vh - 262;
      ctx.fillStyle = 'rgba(8,7,12,0.46)';
      ctx.fillRect(bx - 10, by - 16, 344, 236);
      ctx.strokeStyle = 'rgba(180,140,100,0.22)';
      ctx.lineWidth = 1;
      ctx.strokeRect(bx - 10, by - 16, 344, 236);
      ctx.textAlign = 'left';
      for (let i = 0; i < items.length; i++) {
        const y = by + i * 26;
        ctx.font = '700 12px "RB Serif", Georgia, serif';
        ctx.fillStyle = '#ffd9a8';
        ctx.fillText(items[i][0], bx, y);
        ctx.font = '400 12px "RB Sans", system-ui, sans-serif';
        ctx.fillStyle = '#c3b4a4';
        ctx.fillText(items[i][1], bx + 58, y);
      }
      ctx.restore();
    }

    // "R 重开" hint
    if (game.state === 'playing' && game.time < 6) {
      ctx.save();
      ctx.globalAlpha = clamp(6 - game.time, 0, 1) * 0.45;
      ctx.textAlign = 'center';
      ctx.font = '500 14px "RB Sans", system-ui, sans-serif';
      ctx.fillStyle = '#b8b0a8';
      ctx.fillText('R 重新开始', vw / 2, vh - 20);
      ctx.restore();
    }

    // Death prompt
    if (game.state === 'dead' && game.deathT > 0.8) {
      ctx.save();
      ctx.globalAlpha = clamp((game.deathT - 0.8) * 2, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = '500 18px "RB Sans", system-ui, sans-serif';
      ctx.fillStyle = 'rgba(240,230,220,0.9)';
      ctx.fillText('按 R 或点击画面 重新开始', vw / 2, vh * 0.72);
      ctx.restore();
    }
  }
};
