// ============================================================================
// game.js — 主循环、世界更新、战斗判定、敌人刷新、摄像机、状态
// ============================================================================

class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.audio = new AudioEngine();
    this.input = new Input();
    this.particles = new Particles();
    this.fx = new FX();
    this.renderer = new Renderer(this);

    this.state = 'menu';           // menu | playing | gameover
    this.time = 0;
    this.camX = 0;
    this.player = new Player(this);
    this.enemies = [];
    this.projectiles = [];
    this.clones = [];
    this.pendingStrikes = [];
    this.hitCount = 0;
    this.limbBreakCount = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.spawnTimer = 0;
    this.deathTimer = 0;
    this.nextId = 1;
    this.petalTimer = 0;
    this.lastTime = 0;
    this.raf = 0;
    this.onStateChange = null;

    this.view = {
      w: 960, h: 540, groundY: 420,
      toX: (x) => this.toX(x),
      toY: (y) => this.toY(y),
    };

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this.input.attach();
    this.loop = this.loop.bind(this);
  }

  // ---- 坐标变换 ----
  toX(x) { return (x - this.camX) + this.view.w / 2; }
  toY(y) { return this.view.groundY - y; }

  enemyDef(type) { return ENEMY_TYPES[type]; }

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = this.canvas.clientWidth || window.innerWidth || 960;
    const h = this.canvas.clientHeight || window.innerHeight || 540;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.dpr = dpr;
    this.view.w = w;
    this.view.h = h;
    this.view.groundY = Math.round(h * 0.78);
  }

  start() {
    this.lastTime = performance.now();
    this.raf = requestAnimationFrame(this.loop);
  }

  // ---- 状态切换 ----
  reset() {
    this.player = new Player(this);
    this.enemies = [];
    this.projectiles = [];
    this.clones = [];
    this.pendingStrikes = [];
    this.particles.clear();
    this.fx.reset();
    this.hitCount = 0;
    this.limbBreakCount = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.time = 0;
    this.camX = 0;
    this.spawnTimer = 0.4;
    this.deathTimer = 0;
    this.nextId = 1;
    this.petalTimer = 0;
  }

  startRun() {
    this.reset();
    this.state = 'playing';
    this.input.flush();
    // 开场立刻安排两只敌人，几秒内即可开打
    this.spawnEnemyAt(-1);
    this.spawnEnemyAt(1);
    this.spawnTimer = CFG.spawnInterval;
    if (this.onStateChange) this.onStateChange('playing');
  }

  onPlayerDeath() {
    this.deathTimer = 1.15;
    this.audio.explode();
    this.fx.addShake(10);
    this.fx.addZoom(0.02);
    this.particles.sparks(this.player.x, this.player.y - this.player.h * 0.5, 26, COLORS.blood, 460);
    this.particles.ring(this.player.x, this.player.y - this.player.h * 0.5, COLORS.blood, 8, 90, 0.4);
  }

  onPlayerHurt() {
    // 目前受伤反馈在 Player.takeDamage 内完成；这里用于可能的额外逻辑
  }

  // ---- 主循环 ----
  loop(now) {
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (dt > 1 / 20) dt = 1 / 20;
    if (dt <= 0) dt = 1 / 120; // 防御性：时钟回跳或后台恢复时不倒流
    this.update(dt);
    this.render();
    this.raf = requestAnimationFrame(this.loop);
  }

  update(dt) {
    // 全局按键（开始 / 重开）
    if (this.input.pressed('Enter')) {
      if (this.state === 'menu' || this.state === 'gameover') {
        this.audio.ui();
        this.startRun();
        return;
      }
    }
    if (this.input.pressed('KeyR')) {
      if (this.state === 'playing' || this.state === 'gameover') {
        this.audio.ui();
        this.startRun();
        return;
      }
    }

    // 玩家输入缓冲（顿帧期间也继续收集，保证手感连贯）
    if (this.state === 'playing') this.player.queueInput(this.input);

    // 震屏 / 缩放 / 顿帧始终更新（顿帧时世界冻结但画面仍在震）
    this.fx.update(dt);

    if (this.fx.hitStop > 0) {
      // 命中顿帧：世界冻结
      return;
    }

    if (this.state === 'playing') {
      if (this.deathTimer > 0) {
        this.deathTimer -= dt;
        if (this.deathTimer <= 0) {
          this.state = 'gameover';
          if (this.onStateChange) this.onStateChange('gameover');
        }
      }
      this.worldUpdate(dt);
    } else {
      this.time += dt;
      this.particles.update(dt);
      this.spawnAmbient(dt);
    }
  }

  worldUpdate(dt) {
    this.time += dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    this.player.update(dt, this.input);

    for (const e of this.enemies) {
      if (!e.dead) e.update(dt);
    }
    for (const pr of this.projectiles) {
      if (!pr.dead) pr.update(dt);
    }
    for (const c of this.clones) {
      if (!c.dead) c.update(dt);
    }

    // 落雷延迟结算
    for (const s of this.pendingStrikes) {
      s.t += dt;
      if (!s.done && s.t >= s.delay) {
        s.done = true;
        this.execLightning(s);
      }
    }

    this.particles.update(dt);
    this.spawnAmbient(dt);

    this.enemies = this.enemies.filter((e) => !e.dead);
    this.projectiles = this.projectiles.filter((p) => !p.dead);
    this.clones = this.clones.filter((c) => !c.dead);
    this.pendingStrikes = this.pendingStrikes.filter((s) => !s.done);

    if (this.player.state !== 'dead') this.updateSpawning(dt);
    this.updateCamera(dt);
  }

  updateSpawning(dt) {
    this.spawnTimer -= dt;
    const target = Math.min(CFG.maxEnemies, 2 + Math.floor(this.time / 22));
    if (this.enemies.length < target && this.spawnTimer <= 0) {
      this.spawnEnemy();
      this.spawnTimer = CFG.spawnInterval;
    }
  }

  spawnEnemy() {
    const p = this.player;
    const dir = Math.random() < 0.5 ? -1 : 1;
    const x = p.x + dir * (this.view.w / 2 + CFG.spawnMargin + rand(0, 90));
    let type = 'blade';
    if (this.time > 30 && Math.random() < 0.42) type = 'cannon';
    else if (this.time > 12 && Math.random() < 0.28) type = 'cannon';
    this.spawnEnemyOfType(type, x);
  }

  spawnEnemyAt(dir) {
    const p = this.player;
    const x = p.x + dir * (Math.min(this.view.w * 0.3, 460) + rand(0, 40));
    this.spawnEnemyOfType('blade', x);
  }

  spawnEnemyOfType(type, x) {
    const e = new Enemy(this, type, x);
    e.id = this.nextId++;
    this.enemies.push(e);
  }

  addProjectile(x, y, vx, vy) {
    this.projectiles.push(new Projectile(this, x, y, vx, vy));
  }

  updateCamera(dt) {
    const p = this.player;
    const lead = clamp(p.vx * CFG.camLookahead, -CFG.camMaxLead, CFG.camMaxLead);
    const target = p.x + lead;
    this.camX = lerp(this.camX, target, 1 - Math.exp(-CFG.camLerp * dt));
  }

  // ---- 环境花瓣 ----
  spawnAmbient(dt) {
    this.petalTimer -= dt;
    if (this.petalTimer <= 0) {
      this.petalTimer = 0.5;
      const side = Math.random() < 0.5 ? -1 : 1;
      this.particles.add({
        type: 'petal',
        x: this.camX + side * (this.view.w / 2 + 40),
        y: -rand(80, this.view.h * 0.7),
        vx: -side * rand(30, 70),
        vy: rand(30, 60),
        life: rand(4, 7),
        size: rand(2.5, 4.5),
        color: Math.random() < 0.7 ? '#ff7a9c' : '#ffb3c6',
        rot: rand(0, Math.PI * 2),
        vr: rand(-2, 2),
      });
    }
  }

  // ============================================================ 玩家攻击判定 ====
  dealPlayerAttack(player, a, hitDone) {
    const hb = a.hb;
    const cx = player.x + player.facing * hb.cx;
    const cy = player.y - player.h / 2 + hb.cy;
    const rect = { x: cx - hb.w / 2, y: cy - hb.h / 2, w: hb.w, h: hb.h };

    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const br = e.bodyRect();
      const bodyKey = e.id + ':body';
      const bodyHit = !hitDone.has(bodyKey) && rectsOverlap(rect.x, rect.y, rect.w, rect.h, br.x, br.y, br.w, br.h);

      const limbHits = [];
      for (const id in e.limbs) {
        const l = e.limbs[id];
        if (l.broken) continue;
        const key = e.id + ':' + id;
        if (hitDone.has(key)) continue;
        const pos = e.limbPos(id);
        if (pos && circleRect(pos.x, pos.y, pos.r, rect.x, rect.y, rect.w, rect.h)) {
          limbHits.push({ l, pos });
          hitDone.add(key);
        }
      }

      if (!bodyHit && limbHits.length === 0) continue;

      let point = { x: cx, y: cy };
      let bodyDmg = 0;
      let died = false;

      if (bodyHit) {
        hitDone.add(bodyKey);
        bodyDmg = Math.round(a.damage * rand(0.9, 1.1));
        point = { x: e.x, y: e.y - e.h * 0.5 };
        died = e.takeHit(bodyDmg, a.knockback, a.launch, player.facing || sign(e.x - player.x));
        this.hitCount++;
      }

      if (!died) {
        for (const hl of limbHits) {
          this.hitEnemyLimb(e, hl.l, hl.pos, a, player.facing);
          if (!bodyHit && limbHits.length === 1) point = hl.pos;
        }
      }

      // 命中反馈（每名敌人一次）
      this.applyHitFeedback(point, a, bodyDmg, died);
      this.combo++;
      this.comboTimer = CFG.comboWindow;
      if (died) break;
    }
  }

  hitEnemyLimb(e, l, pos, a, dir) {
    const dmg = Math.round(a.damage * a.breakMul * rand(0.9, 1.1));
    l.hp -= dmg;
    this.hitCount++;
    e.hitFlash = Math.max(e.hitFlash, 0.1);
    e.vx += dir * 50;
    this.particles.sparks(pos.x, pos.y, 4, COLORS.spark, 190, 1.6);
    if (l.hp <= 0) {
      l.hp = 0;
      e.breakLimb(l.id);
    }
  }

  applyHitFeedback(point, a, bodyDmg, died) {
    this.fx.addHitStop(a.hitstop);
    this.fx.addShake(a.shake);
    if (a.zoom) this.fx.addZoom(a.zoom);
    const strength = clamp(a.damage / 30, 0.5, 1.4);
    this.audio.hit(strength);
    this.particles.sparks(point.x, point.y, 6 + Math.round(strength * 6), COLORS.spark, 320, 2.2);
    this.particles.ring(point.x, point.y, COLORS.slashHot, 4, 30 + strength * 22, 0.22);
    if (bodyDmg > 0) {
      const big = a.damage >= 30;
      this.particles.number(point.x, point.y - 10, '' + bodyDmg, big ? '#ffd24a' : '#eaf6ff', big ? 26 : 19);
    }
  }

  spawnSlashVisual(player, a) {
    const hb = a.hb;
    const cx = player.x + player.facing * hb.cx;
    const cy = player.y - player.h / 2 + hb.cy;
    let ang = player.facing > 0 ? 0 : Math.PI;
    let arc = 1.6;
    if (a === ATTACKS.launcher) {
      ang = -Math.PI / 2 + (player.facing > 0 ? 0 : Math.PI);
      arc = 1.5;
    }
    this.particles.slash(cx, cy, ang, arc, a.hb.w * 0.62, COLORS.slash, COLORS.slashHot, 0.15);
  }

  spawnEnemySlash(e) {
    const hb = e.def.attackHb;
    const cx = e.x + e.facing * hb.cx;
    const cy = e.y - e.h * 0.5 + hb.cy;
    const ang = e.facing > 0 ? 0 : Math.PI;
    this.particles.slash(cx, cy, ang, 1.4, hb.w * 0.5, '#ffb3a0', '#ff5a5a', 0.14);
  }

  // ============================================================ 主动技能 ====
  castSkill(player, d) {
    switch (d.type) {
      case 'dashSlash': this.castIai(player, d); break;
      case 'clone': this.castClones(player, d); break;
      case 'lightning': this.castLightning(player, d); break;
      case 'nova': this.castNova(player, d); break;
    }
  }

  // 用技能定义对一块区域结算伤害（身体 + 肢体），并给出命中反馈
  dealSkillArea(rect, d, dir) {
    let hitEnemies = 0;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const br = e.bodyRect();
      const bodyHit = rectsOverlap(rect.x, rect.y, rect.w, rect.h, br.x, br.y, br.w, br.h);
      const limbHits = [];
      for (const id in e.limbs) {
        const l = e.limbs[id];
        if (l.broken) continue;
        const pos = e.limbPos(id);
        if (pos && circleRect(pos.x, pos.y, pos.r + 6, rect.x, rect.y, rect.w, rect.h)) {
          limbHits.push({ l, pos });
        }
      }
      if (!bodyHit && limbHits.length === 0) continue;
      hitEnemies++;
      const point = { x: e.x, y: e.y - e.h * 0.5 };
      let bodyDmg = 0;
      let died = false;
      if (bodyHit) {
        bodyDmg = Math.round(d.damage * rand(0.9, 1.1));
        died = e.takeHit(bodyDmg, d.knockback, d.launch, dir);
        this.hitCount++;
      }
      if (!died) {
        for (const hl of limbHits) this.hitEnemyLimb(e, hl.l, hl.pos, d, dir);
      }
      this.applyHitFeedback(point, d, bodyDmg, died);
      this.combo++;
      this.comboTimer = CFG.comboWindow;
      if (died) continue;
    }
    return hitEnemies;
  }

  castIai(player, d) {
    const dir = player.facing;
    player.vx = dir * d.move;
    player.invuln = Math.max(player.invuln, 0.28);
    const x0 = player.x, x1 = player.x + dir * d.range;
    const cy = player.y - player.h * 0.5;
    const rect = { x: Math.min(x0, x1) - 20, y: cy - 74, w: Math.abs(x1 - x0) + 40, h: 148 };
    this.dealSkillArea(rect, d, dir);
    this.audio.iai();
    const mid = (x0 + x1) / 2;
    this.particles.slash(mid, cy, dir > 0 ? 0 : Math.PI, 2.0, Math.abs(x1 - x0) * 0.5, COLORS.slash, COLORS.slashHot, 0.22);
    this.particles.ring(player.x, cy, COLORS.slashHot, 6, 70, 0.25);
    this.particles.sparks(x1, cy, 12, COLORS.spark, 340);
    // 冲刺残影
    for (let i = 1; i <= 3; i++) {
      this.particles.add({
        type: 'dot', x: player.x + dir * i * 30, y: cy,
        vx: -dir * 80, vy: 0, life: 0.2, size: 6, color: '#6ad8ff', drag: 2,
      });
    }
  }

  castClones(player, d) {
    this.audio.clone();
    const dir = player.facing;
    const n = d.clones || 3;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2);
      const cy = player.y - player.h * 0.5 + off * 26;
      const cx = player.x + dir * 8 + off * dir * 10;
      this.clones.push(new Clone(this, cx, cy, dir, d, i * 0.05));
    }
    this.particles.ring(player.x, player.y - player.h * 0.5, '#7a8cff', 4, 56, 0.3);
  }

  castLightning(player, d) {
    this.audio.lightning();
    // 锁定至多 strikes 名范围内敌人
    const targets = [];
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const dd = Math.abs(e.x - player.x);
      if (dd <= d.radius) targets.push({ x: e.x, y: e.y - e.h * 0.5, dist: dd });
    }
    targets.sort((a, b) => a.dist - b.dist);
    targets.splice(d.strikes);
    if (targets.length === 0) {
      this.spawnLightningStrike(player.x + player.facing * 150, 0, d, player.facing, 0.04);
    } else {
      targets.forEach((t, i) => {
        const dir = sign(t.x - player.x) || player.facing;
        this.spawnLightningStrike(t.x, t.y, d, dir, 0.04 + i * 0.07);
      });
    }
  }

  spawnLightningStrike(x, y, d, dir, delay) {
    this.pendingStrikes.push({ x, y, d, dir, delay, t: 0, done: false });
  }

  execLightning(s) {
    const { x, y, d, dir } = s;
    const rect = { x: x - 46, y: y - 72, w: 92, h: 150 };
    this.dealSkillArea(rect, d, dir);
    // 视觉：竖直闪电 + 冲击
    this.particles.add({ type: 'bolt', x, y, life: 0.18, size: 7, color: '#ffe08a', data: { y0: y - 560, inner: '#ffffff' } });
    this.particles.ring(x, y, '#fff3c4', 8, 84, 0.3);
    this.particles.sparks(x, y, 18, COLORS.spark, 420);
    this.particles.dust(x, 0, 5, 130);
    this.fx.addShake(6);
  }

  castNova(player, d) {
    this.audio.nova();
    const cy = player.y - player.h * 0.5;
    const rect = { x: player.x - d.radius, y: cy - d.radius - 30, w: d.radius * 2, h: d.radius * 2 + 60 };
    this.dealSkillArea(rect, d, player.facing);
    // 迟滞范围内敌人
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const dx = e.x - player.x;
      const dy = (e.y - e.h * 0.5) - cy;
      if (dx * dx + dy * dy <= d.radius * d.radius) {
        e.slowTimer = d.slow;
      }
    }
    this.particles.ring(player.x, cy, '#6ad8ff', 10, d.radius, 0.4);
    this.particles.ring(player.x, cy, '#bfeaff', 4, d.radius * 0.78, 0.5);
    this.particles.sparks(player.x, cy, 22, '#6ad8ff', 380);
  }

  // ---- 坠斩 ----
  dealDive(player) {
    const d = ATTACKS.dive;
    const rect = { x: player.x - player.w / 2 - 4, y: player.y - player.h, w: player.w + 8, h: player.h };
    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const key = e.id + ':dive';
      if (player.diveHit.has(key)) continue;
      const br = e.bodyRect();
      if (rectsOverlap(rect.x, rect.y, rect.w, rect.h, br.x, br.y, br.w, br.h)) {
        player.diveHit.add(key);
        const dir = sign(e.x - player.x) || player.facing;
        const bodyDmg = Math.round(d.damage * rand(0.9, 1.1));
        e.takeHit(bodyDmg, d.knockback, d.launch, dir);
        this.hitCount++;
        const point = { x: e.x, y: e.y - e.h * 0.5 };
        this.applyHitFeedback(point, d, bodyDmg, false);
        // 顺带对肢体造成高额破坏
        for (const id in e.limbs) {
          const l = e.limbs[id];
          if (l.broken) continue;
          const pos = e.limbPos(id);
          if (!pos) continue;
          if (circleRect(pos.x, pos.y, pos.r + 6, rect.x, rect.y, rect.w, rect.h)) {
            this.hitEnemyLimb(e, l, pos, d, dir);
          }
        }
        this.combo++;
        this.comboTimer = CFG.comboWindow;
        // 玩家弹起，可继续空连
        player.vy = -470;
        player.vx *= 0.35;
        player.state = 'jump';
      }
    }
  }

  diveImpact(player) {
    const d = ATTACKS.dive;
    this.fx.addHitStop(d.hitstop);
    this.fx.addShake(d.shake);
    this.fx.addZoom(d.zoom);
    this.audio.hit(1.4);
    this.audio.land(1.1);
    this.particles.dust(player.x, 0, 14, 240);
    this.particles.ring(player.x, 0, COLORS.slashHot, 6, d.radius, 0.3);
    this.particles.sparks(player.x, 0, 18, COLORS.spark, 400);

    for (const e of this.enemies) {
      if (e.dead || e.state === 'spawn') continue;
      const ex = e.x, ey = e.y - e.h * 0.5;
      if (Math.abs(ex - player.x) < d.radius + e.w * 0.5 && ey > -d.radius - 40) {
        const dir = sign(ex - player.x) || 1;
        const bodyDmg = Math.round(d.damage * rand(0.85, 1.1));
        e.takeHit(bodyDmg, d.knockback, d.launch, dir);
        this.hitCount++;
        this.applyHitFeedback({ x: ex, y: ey }, d, bodyDmg, false);
        for (const id in e.limbs) {
          const l = e.limbs[id];
          if (l.broken) continue;
          const pos = e.limbPos(id);
          if (pos && Math.abs(pos.x - player.x) < d.radius + 10 && pos.y > -d.radius - 30) {
            this.hitEnemyLimb(e, l, pos, d, dir);
          }
        }
        this.combo++;
        this.comboTimer = CFG.comboWindow;
      }
    }
  }

  // ---- 敌人近战判定 ----
  dealEnemyMelee(e) {
    const hb = e.getAttackHb();
    if (!hb || e.attackHitPlayer) return;
    const p = this.player;
    const pr = { x: p.x - p.w / 2, y: p.y - p.h, w: p.w, h: p.h };
    if (rectsOverlap(hb.x, hb.y, hb.w, hb.h, pr.x, pr.y, pr.w, pr.h)) {
      e.attackHitPlayer = true;
      if (p.takeDamage(e.def.attackDamage, e.x)) {
        this.particles.sparks(p.x, p.y - p.h * 0.5, 8, COLORS.blood, 260);
      }
    }
  }

  // ---- 断肢 / 击杀 ----
  onLimbBreak(e, l, pos) {
    this.limbBreakCount++;
    this.combo += 2;
    this.fx.addHitStop(0.055);
    this.fx.addShake(8);
    this.fx.addZoom(0.02);
    this.audio.breakLimb();
    // 肢体碎片
    const color = l.kind === 'cannon' ? COLORS.cannonGlow : COLORS.enemySteelLit;
    for (let i = 0; i < 3; i++) {
      this.particles.shard(pos.x, pos.y, {
        color: i === 0 ? color : COLORS.enemySteelDark,
        edge: '#0c1018',
        w: rand(5, 10), h: rand(4, 8),
      });
    }
    this.particles.sparks(pos.x, pos.y, 14, COLORS.spark, 430, Math.PI * 2);
    this.particles.ring(pos.x, pos.y, '#ffd24a', 4, 56, 0.3);
    this.particles.number(pos.x, pos.y - 8, '断肢', '#ffb347', 20);
    if (l.kind === 'head') {
      e.state = 'stun';
      e.stunTimer = 1.3;
      e.stateTimer = 0;
      e.vx = 0;
    }
  }

  killEnemy(e) {
    e.dead = true;
    e.state = 'dead';
    this.fx.addHitStop(0.07);
    this.fx.addShake(9);
    this.fx.addZoom(0.022);
    this.audio.explode();
    // 剩余肢体 + 本体全部飞散
    for (const id in e.limbs) {
      const l = e.limbs[id];
      if (l.broken) continue;
      const pos = e.limbPos(id) || { x: e.x, y: e.y - e.h * 0.5 };
      for (let i = 0; i < 2; i++) {
        this.particles.shard(pos.x, pos.y, { color: i === 0 ? COLORS.enemySteelLit : COLORS.enemySteel, w: rand(5, 11), h: rand(4, 8) });
      }
    }
    for (let i = 0; i < 5; i++) {
      this.particles.shard(e.x, e.y - e.h * 0.5, { color: i % 2 ? COLORS.enemySteelDark : COLORS.enemySteel, w: rand(7, 14), h: rand(5, 10) });
    }
    this.particles.sparks(e.x, e.y - e.h * 0.5, 24, COLORS.spark, 480);
    this.particles.ring(e.x, e.y - e.h * 0.5, COLORS.enemyCore, 6, 90, 0.35);
    this.particles.number(e.x, e.y - e.h * 0.5 - 12, '摧毁', '#ff5a5a', 26);
  }

  // ============================================================ 渲染 ============
  render() {
    const ctx = this.ctx;
    const v = this.view;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);

    const z = 1 + this.fx.zoom;
    const cx = v.w / 2, cy = v.groundY;

    // 全场景（背景 + 地面 + 实体）统一震屏 / 缩放
    ctx.save();
    ctx.translate(cx + this.fx.shakeX, cy + this.fx.shakeY);
    ctx.scale(z, z);
    ctx.translate(-cx, -cy);

    this.renderer.drawBackground(ctx, v, this.time);
    this.renderer.drawWorldBack(ctx, v, this.time);

    for (const e of this.enemies) this.renderer.drawSpawn(ctx, v, e, this.time);
    for (const e of this.enemies) this.renderer.drawEnemy(ctx, v, e, this.time);
    for (const s of this.pendingStrikes) this.renderer.drawStrikeMarker(ctx, v, s, this.time);
    this.renderer.drawPlayer(ctx, v, this.player, this.time);
    for (const pr of this.projectiles) this.renderer.drawProjectile(ctx, v, pr);
    for (const c of this.clones) this.renderer.drawClone(ctx, v, c, this.time);
    this.particles.draw(ctx, v);

    ctx.restore();

    // HUD（不受震屏影响）
    if (this.state !== 'menu') {
      this.renderer.drawHUD(ctx, v, this);
      this.renderer.drawSkills(ctx, v, this);
    }
    this.renderer.drawControlsHint(ctx, v, this);
  }

  // ---- 只读状态（供外部检查） ----
  getState() {
    return {
      ready: this.state !== 'playing',
      playerAlive: this.state === 'playing' && this.player.hp > 0,
      enemyCount: this.enemies.length,
      hitCount: this.hitCount,
      limbBreakCount: this.limbBreakCount,
      playing: this.state === 'playing',
    };
  }
}
