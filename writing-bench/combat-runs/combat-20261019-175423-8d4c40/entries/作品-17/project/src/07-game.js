/* ============================================================
 * 07-game.js — 世界 / 波次 / 相机 / 场景 / HUD / 主循环
 * ============================================================ */
'use strict';

const STEP = 1 / 60;

/* 波次编成 */
function waveComp(n) {
  const c = [];
  if (n === 1) c.push('swordsman', 'swordsman', 'swordsman');
  else if (n === 2) c.push('swordsman', 'swordsman', 'swordsman', 'swordsman');
  else if (n === 3) c.push('swordsman', 'swordsman', 'brute', 'swordsman');
  else if (n === 4) c.push('leaper', 'swordsman', 'swordsman', 'leaper', 'swordsman');
  else if (n === 5) c.push('brute', 'swordsman', 'swordsman', 'leaper', 'swordsman');
  else {
    const cnt = Math.min(4 + Math.floor(n * 0.7), 9);
    for (let i = 0; i < cnt; i++) {
      const r = Math.random();
      const bruteP = Math.min(0.1 + (n - 5) * 0.02, 0.24);
      const leapP = 0.3;
      c.push(r < bruteP ? 'brute' : (r < bruteP + leapP ? 'leaper' : 'swordsman'));
    }
  }
  return c;
}

class Game {
  constructor() {
    this.state = 'title'; // title | playing | dead
    this.player = new Player(ARENA_W / 2, GROUND_Y);
    this.enemies = [];
    this.wave = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.betweenT = 0;      // 波间计时
    this.waveState = 'idle';// idle | spawning | fighting | cleared
    this.camX = ARENA_W / 2;
    this.camY = 0;
    this.time = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.maxCombo = 0;
    this.hitCount = 0;
    this.limbBreaks = 0;
    this.killCount = 0;
    this.banner = null;     // {main, sub, t, dur}
    this.hpGhost = 1;
    this.comboPop = 0;
    this.input = input;
    this.titleT = 0;
    this.clouds = [];
    for (let i = 0; i < 7; i++) this.clouds.push({ x: rand(0, ARENA_W), y: rand(40, 220), s: rand(0.6, 1.6), v: rand(4, 12) });
    this.motes = [];
    for (let i = 0; i < 26; i++) this.motes.push({ x: rand(0, ARENA_W), y: rand(100, GROUND_Y), s: rand(1, 2.6), ph: rand(0, TAU) });
    this.plankSeams = [];
    for (let x = 0; x < ARENA_W; x += 52) this.plankSeams.push(x + rand(-6, 6));
    this.lanterns = [];
    for (let x = 220; x < ARENA_W; x += 460) this.lanterns.push(x);
    this.perfectT = 0; // 完美闪避慢动作提示
  }

  /* ---------------- 流程 ---------------- */
  start() {
    this.state = 'playing';
    this.player = new Player(ARENA_W / 2, GROUND_Y);
    this.enemies.length = 0;
    fx.reset();
    this.wave = 0;
    this.score = 0;
    this.combo = 0; this.comboTimer = 0; this.maxCombo = 0;
    this.hitCount = 0; this.limbBreaks = 0; this.killCount = 0;
    this.camX = ARENA_W / 2;
    this.spawnQueue.length = 0;
    this.waveState = 'idle';
    this.betweenT = 0.4;
    this.banner = null;
    this.hpGhost = 1;
  }

  nextWave() {
    this.wave++;
    this.spawnQueue = waveComp(this.wave);
    this.waveState = 'spawning';
    this.spawnTimer = 0.1;
    this.banner = { main: `第 ${this.wave} 波`, sub: `${this.spawnQueue.length} 具傀儡逼近`, t: 0, dur: 1.6 };
    synth.waveStart();
  }

  onEnemyKilled(enemy, hit) {
    this.killCount++;
    this.score += enemy.cfg.score + this.combo * 2;
    fx.addSlowmo(0.35, 0.22);
  }

  registerHit(hit, result) {
    this.hitCount++;
    this.combo++;
    this.comboTimer = 1.6;
    this.comboPop = 1;
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.score += 5 + Math.min(this.combo, 40);
    this.player.bladeGlow = Math.max(this.player.bladeGlow, 0.25);
  }

  /* 玩家攻击命中检测 */
  resolvePlayerAttack() {
    const hit = this.player.activeHit();
    if (!hit) return;
    for (const e of this.enemies) {
      if (e.dead || e.state === 'drop') continue;
      if (this.player.hitSet.has(e.uid)) continue;
      const hb = e.hurtBox();
      if (rectsHit(hit.x, hit.y, hit.w, hit.h, hb.x, hb.y, hb.w, hb.h)) {
        this.player.hitSet.add(e.uid);
        const result = e.hurt(hit, this);
        if (result !== 'none') {
          this.registerHit(hit, result);
          // 命中回血微激励? 否。改为连击加速冲刺回复
          this.player.dashRegenT += 0.12;
        }
      }
    }
  }

  /* 空中下劈落地 */
  playerSlamLand() {
    const p = this.player;
    const def = ATTACKS.slamHit;
    synth.slam();
    fx.shake(def.shake, 0.3, 0, 0.6);
    fx.addHitstop(CFG.hitstop.heavy);
    fx.ring(p.x, GROUND_Y, 12, 150, 0.45, 'rgba(160,230,255,0.85)', 7);
    fx.dust(p.x, GROUND_Y, 16, 240);
    fx.spark(p.x, GROUND_Y - 8, 1, 10, 420, '160,230,255', 2.6);
    fx.spark(p.x, GROUND_Y - 8, -1, 10, 420, '160,230,255', 2.6);
    const hit = {
      x: p.x - def.reach, y: GROUND_Y - def.hh, w: def.reach * 2, h: def.hh,
      dir: p.facing, def, swingId: -999, name: 'slamHit',
      cx: p.x, cy: GROUND_Y - 40,
    };
    for (const e of this.enemies) {
      if (e.dead || e.state === 'drop') continue;
      const hb = e.hurtBox();
      if (rectsHit(hit.x, hit.y, hit.w, hit.h, hb.x, hb.y, hb.w, hb.h)) {
        const h2 = { ...hit, dir: sign(e.x - p.x) || p.facing, cx: e.x, cy: e.y - e.h * 0.5 };
        const r = e.hurt(h2, this);
        if (r !== 'none') this.registerHit(h2, r);
      }
    }
  }

  /* 敌人攻击打到玩家（含完美闪避判定） */
  enemyStrike(enemy, box) {
    if (this.state !== 'playing' || this.player.dead) return false;
    if (enemy.struckUid === enemy.strikeUid) return false;
    const p = this.player;
    const hb = p.hurtBox();
    if (!rectsHit(box.x, box.y, box.w, box.h, hb.x, hb.y, hb.w, hb.h)) return false;

    if (p.dashIFrames > 0) {
      // 完美闪避！
      enemy.struckUid = enemy.strikeUid;
      this.perfectT = 0.6;
      fx.addSlowmo(0.22, 0.4);
      fx.text(p.x, p.y - 80, '完美闪避', '#8df0ff', 24, true);
      fx.ring(p.x, p.y - 30, 8, 60, 0.35, 'rgba(140,240,255,0.9)', 4);
      fx.spark(p.x, p.y - 34, -p.facing, 8, 380, '140,240,255', 1.6);
      synth.dash();
      this.score += 50;
      return false;
    }
    if (p.invulnerable) return false;
    enemy.struckUid = enemy.strikeUid;
    const dirX = sign(p.x - enemy.x) || 1;
    p.takeHit(box.dmg, dirX, box.kbX, box.kbY, this);
    if (p.dead) this.state = 'dead';
    return true;
  }

  /* ---------------- 更新 ---------------- */
  update(dt) {
    this.time += dt;
    if (this.banner) {
      this.banner.t += dt;
      if (this.banner.t > this.banner.dur) this.banner = null;
    }
    this.perfectT = Math.max(0, this.perfectT - dt);

    if (this.state === 'title') {
      this.titleT += dt;
      this.player.stateT = this.titleT; // 标题页保持待机呼吸
      if (this.input.pressed('start') || this.input.pressed('atk')) {
        this.input.consume('start'); this.input.consume('atk');
        synth.ensure(); synth.uiClick();
        this.start();
      }
      return;
    }

    if (this.state === 'dead') {
      this.player.update(dt, this);
      for (const e of this.enemies) e.update(dt, this);
      fx.updateWorld(dt);
      if (this.input.pressed('restart') || this.input.pressed('start')) {
        this.input.consume('restart'); this.input.consume('start');
        synth.uiClick();
        this.start();
      }
      return;
    }

    /* playing */
    if (this.input.pressed('restart')) {
      this.input.consume('restart');
      this.start();
      return;
    }

    this.player.update(dt, this);
    if (this.player.dead) { this.state = 'dead'; return; }
    this.resolvePlayerAttack();

    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      e.update(dt, this);
      if (e.removeMe) this.enemies.splice(i, 1);
    }

    fx.updateWorld(dt);

    // 连击计时
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    this.comboPop = Math.max(0, this.comboPop - dt * 4);

    // 波次管理
    const alive = this.enemies.filter(e => !e.dead).length;
    if (this.waveState === 'spawning') {
      this.spawnTimer -= dt;
      if (this.spawnQueue.length > 0 && this.spawnTimer <= 0 && alive < 6) {
        this.spawnTimer = rand(0.35, 0.7);
        const type = this.spawnQueue.shift();
        // 在相机视野外（或场边）落入场内
        const viewL = this.camX - VIEW_W / 2, viewR = this.camX + VIEW_W / 2;
        let sx;
        if (Math.random() < 0.5) sx = clamp(viewL - rand(60, 160), 60, ARENA_W - 60);
        else sx = clamp(viewR + rand(60, 160), 60, ARENA_W - 60);
        // 若两侧都被夹到视野内（玩家在角落），就从另一侧来
        if (Math.abs(sx - this.player.x) < 200) sx = clamp(this.player.x + (sx < this.player.x ? -1 : 1) * rand(380, 520), 60, ARENA_W - 60);
        const e = new Puppet(this, sx, type);
        // 落点尘影预告
        fx.ring(sx, GROUND_Y, 4, 34, 0.5, 'rgba(255,150,80,0.5)', 2);
        this.enemies.push(e);
      }
      if (this.spawnQueue.length === 0) this.waveState = 'fighting';
    } else if (this.waveState === 'fighting') {
      if (alive === 0) {
        this.waveState = 'cleared';
        this.betweenT = 1.15;
        const bonus = 150 + this.wave * 60;
        this.score += bonus;
        this.player.heal(16);
        this.banner = { main: '肃清!', sub: `波次奖励 +${bonus} · 体力回复`, t: 0, dur: 1.15 };
        fx.addSlowmo(0.45, 0.3);
      }
    } else if (this.waveState === 'cleared') {
      this.betweenT -= dt;
      if (this.betweenT <= 0) this.nextWave();
    } else if (this.waveState === 'idle') {
      this.betweenT -= dt;
      if (this.betweenT <= 0) this.nextWave();
    }

    // 相机
    const lookAhead = this.player.facing * 90 + this.player.vx * 0.12;
    const targetX = clamp(this.player.x + lookAhead, VIEW_W / 2, ARENA_W - VIEW_W / 2);
    this.camX = damp(this.camX, targetX, 5, dt);

    // HP 残影条
    this.hpGhost = damp(this.hpGhost, this.player.hp / this.player.maxHp, 3.5, dt);
  }

  /* ---------------- 渲染 ---------------- */
  render(ctx) {
    const shake = fx.getShakeOffset(this.time);
    const camX = this.camX + shake.x;
    const camY = shake.y;

    this.drawBackground(ctx, camX);

    ctx.save();
    ctx.translate(VIEW_W / 2 - camX, camY);

    // 地面
    this.drawGround(ctx, camX);

    // 残骸在角色下层
    fx.drawDebris(ctx);

    // 敌人
    for (const e of this.enemies) e.draw(ctx, this.time);

    // 玩家
    this.player.draw(ctx, this.time);

    // 特效
    fx.drawAfterimages(ctx);
    fx.draw(ctx);

    // 前景草叶
    this.drawForeground(ctx, camX);

    ctx.restore();

    // 屏幕效果
    if (fx.flashA > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.16, fx.flashA);
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, VIEW_W, VIEW_H);
      ctx.restore();
    }
    this.drawVignette(ctx);

    // HUD
    if (this.state !== 'title') this.drawHUD(ctx);
    if (this.state === 'title') this.drawTitle(ctx);
    if (this.state === 'dead') this.drawDeath(ctx);
    if (this.banner && this.state === 'playing') this.drawBanner(ctx);
  }

  /* ---------- 背景 ---------- */
  drawBackground(ctx, camX) {
    // 天空
    const sky = ctx.createLinearGradient(0, 0, 0, VIEW_H);
    sky.addColorStop(0, '#0b0d1f');
    sky.addColorStop(0.55, '#1c1838');
    sky.addColorStop(0.8, '#33244a');
    sky.addColorStop(1, '#241a30');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    // 星星
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 733.3) % VIEW_W;
      const sy = (i * 197.7) % 260;
      const tw = 0.4 + 0.6 * Math.abs(Math.sin(this.time * 0.8 + i));
      ctx.globalAlpha = tw * 0.5;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    ctx.restore();

    // 月亮 + 光晕
    const moonX = VIEW_W * 0.72 - camX * 0.03;
    const moonY = 130;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = ctx.createRadialGradient(moonX, moonY, 30, moonX, moonY, 240);
    glow.addColorStop(0, 'rgba(220,225,255,0.28)');
    glow.addColorStop(1, 'rgba(220,225,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(moonX - 240, moonY - 240, 480, 480);
    ctx.restore();
    ctx.fillStyle = '#e8e6da';
    ctx.beginPath(); ctx.arc(moonX, moonY, 52, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(190,185,170,0.5)';
    ctx.beginPath(); ctx.arc(moonX - 16, moonY - 10, 10, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(moonX + 14, moonY + 16, 7, 0, TAU); ctx.fill();

    // 云
    ctx.save();
    ctx.fillStyle = 'rgba(30,26,54,0.85)';
    for (const c of this.clouds) {
      const cx = ((c.x + this.time * c.v - camX * 0.06) % (ARENA_W + 400)) - 200;
      ctx.beginPath();
      ctx.ellipse(cx, c.y, 90 * c.s, 16 * c.s, 0, 0, TAU);
      ctx.ellipse(cx + 50 * c.s, c.y + 8 * c.s, 60 * c.s, 12 * c.s, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // 远山两层
    this.drawMountainLayer(ctx, camX * 0.12, 420, 140, '#171430');
    this.drawMountainLayer(ctx, camX * 0.22, 480, 100, '#1e1938');

    // 远处鸟居剪影
    ctx.save();
    ctx.translate(-camX * 0.35, 0);
    ctx.fillStyle = '#241d3e';
    for (const gx of [500, 1400, 2100]) {
      ctx.fillRect(gx - 90, 330, 14, 180);
      ctx.fillRect(gx + 76, 330, 14, 180);
      ctx.fillRect(gx - 120, 320, 240, 16);
      ctx.fillRect(gx - 100, 352, 200, 10);
    }
    ctx.restore();

    // 中层立柱 + 灯笼
    ctx.save();
    ctx.translate(-camX * 0.6, 0);
    ctx.fillStyle = '#2c2344';
    for (let x = 150; x < ARENA_W * 1.2; x += 380) {
      ctx.fillRect(x, 300, 26, 300);
      ctx.fillRect(x - 12, 292, 50, 14);
    }
    // 灯笼
    for (const lx of this.lanterns) {
      const lx2 = lx * 1.0;
      ctx.strokeStyle = '#3a2f50';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(lx2, 310); ctx.lineTo(lx2, 360); ctx.stroke();
      const fl = 0.75 + Math.sin(this.time * 5 + lx) * 0.12 + Math.sin(this.time * 13.7 + lx * 2) * 0.06;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const lg = ctx.createRadialGradient(lx2, 378, 4, lx2, 378, 60);
      lg.addColorStop(0, `rgba(255,170,80,${0.35 * fl})`);
      lg.addColorStop(1, 'rgba(255,170,80,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(lx2 - 60, 318, 120, 120);
      ctx.restore();
      ctx.fillStyle = `rgba(255,190,100,${0.85 * fl})`;
      ctx.beginPath();
      ctx.ellipse(lx2, 378, 11, 15, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = '#3a2f50';
      ctx.fillRect(lx2 - 12, 362, 24, 4);
      ctx.fillRect(lx2 - 12, 390, 24, 4);
    }
    ctx.restore();

    // 漂浮尘萤
    ctx.save();
    ctx.translate(-camX * 0.85, 0);
    for (const m of this.motes) {
      const my = m.y + Math.sin(this.time * 0.7 + m.ph) * 14;
      const mx = m.x + Math.cos(this.time * 0.4 + m.ph) * 20;
      ctx.globalAlpha = 0.25 + 0.2 * Math.sin(this.time + m.ph * 3);
      ctx.fillStyle = '#ffd9a0';
      ctx.beginPath(); ctx.arc(mx, my, m.s, 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  drawMountainLayer(ctx, off, baseY, h, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-50, VIEW_H);
    ctx.lineTo(-50, baseY);
    for (let x = -50; x < VIEW_W + 100; x += 130) {
      const px = x - (off % 130);
      ctx.lineTo(px + 65, baseY - h - ((x * 7) % 60));
      ctx.lineTo(px + 130, baseY);
    }
    ctx.lineTo(VIEW_W + 50, VIEW_H);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  drawGround(ctx, camX) {
    // 木地板
    const g = ctx.createLinearGradient(0, GROUND_Y, 0, VIEW_H);
    g.addColorStop(0, '#4a3527');
    g.addColorStop(0.15, '#3a2a20');
    g.addColorStop(1, '#191219');
    ctx.fillStyle = g;
    ctx.fillRect(camX - VIEW_W / 2 - 60, GROUND_Y, VIEW_W + 120, VIEW_H - GROUND_Y);
    // 板缝
    ctx.strokeStyle = 'rgba(20,12,10,0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (const sx of this.plankSeams) {
      ctx.moveTo(sx, GROUND_Y + 4);
      ctx.lineTo(sx - 10, VIEW_H);
    }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(70,50,36,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(camX - VIEW_W / 2 - 60, GROUND_Y + 26);
    ctx.lineTo(camX + VIEW_W / 2 + 60, GROUND_Y + 26);
    ctx.stroke();
    // 地面受光（月光）
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const mg = ctx.createLinearGradient(0, GROUND_Y, 0, GROUND_Y + 70);
    mg.addColorStop(0, 'rgba(150,140,190,0.12)');
    mg.addColorStop(1, 'rgba(150,140,190,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(camX - VIEW_W / 2 - 60, GROUND_Y, VIEW_W + 120, 70);
    ctx.restore();

    // 场地两端界柱
    for (const wx of [26, ARENA_W - 26]) {
      ctx.fillStyle = '#33233a';
      ctx.fillRect(wx - 16, GROUND_Y - 190, 32, 190);
      ctx.fillStyle = '#44304e';
      ctx.fillRect(wx - 22, GROUND_Y - 200, 44, 16);
      // 符纸条
      ctx.fillStyle = 'rgba(230,220,200,0.8)';
      const sw = Math.sin(this.time * 2 + wx) * 4;
      ctx.beginPath();
      ctx.moveTo(wx - 6, GROUND_Y - 184);
      ctx.quadraticCurveTo(wx + sw, GROUND_Y - 140, wx - 4 + sw, GROUND_Y - 100);
      ctx.lineTo(wx + 6 + sw, GROUND_Y - 102);
      ctx.quadraticCurveTo(wx + 10 + sw, GROUND_Y - 140, wx + 6, GROUND_Y - 184);
      ctx.closePath(); ctx.fill();
    }
  }

  drawForeground(ctx, camX) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.strokeStyle = '#10101e';
    ctx.lineWidth = 2.5;
    const off = camX * 1.12;
    for (let i = 0; i < 30; i++) {
      const gx = ((i * 173.7) % (ARENA_W + 200)) - 100;
      const sx = gx + (camX - off) * 0 + (1.12 - 1) * 0; // 简化:直接世界坐标偏前
      const x = gx;
      const sway = Math.sin(this.time * 1.6 + i * 1.3) * 5;
      ctx.beginPath();
      ctx.moveTo(x, VIEW_H + 4);
      ctx.quadraticCurveTo(x + sway, VIEW_H - 26, x + sway * 1.8, VIEW_H - 44 - (i % 3) * 10);
      ctx.stroke();
    }
    ctx.restore();
  }

  drawVignette(ctx) {
    const v = ctx.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.42, VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.95);
    v.addColorStop(0, 'rgba(6,4,12,0)');
    v.addColorStop(1, 'rgba(6,4,12,0.55)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  }

  /* ---------- HUD ---------- */
  drawHUD(ctx) {
    const p = this.player;
    ctx.save();

    // 血条
    const bx = 24, by = 22, bw = 280, bh = 16;
    ctx.fillStyle = 'rgba(8,6,14,0.72)';
    ctx.fillRect(bx - 4, by - 4, bw + 8, bh + 8);
    ctx.fillStyle = '#3a0f18';
    ctx.fillRect(bx, by, bw, bh);
    const hpR = clamp(p.hp / p.maxHp, 0, 1);
    // 残影
    ctx.fillStyle = 'rgba(255,220,200,0.55)';
    ctx.fillRect(bx, by, bw * clamp(this.hpGhost, 0, 1), bh);
    const hg = ctx.createLinearGradient(bx, by, bx, by + bh);
    hg.addColorStop(0, '#ff6a55');
    hg.addColorStop(1, '#c22335');
    ctx.fillStyle = hg;
    ctx.fillRect(bx, by, bw * hpR, bh);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 11px "Trebuchet MS", sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${Math.ceil(p.hp)} / ${p.maxHp}`, bx + 6, by + 12);

    // 冲刺充能
    for (let i = 0; i < CFG.player.dashMax; i++) {
      const dx = bx + 12 + i * 26, dy = by + 34;
      ctx.save();
      ctx.translate(dx, dy);
      ctx.rotate(Math.PI / 4);
      if (i < p.dashCharges) {
        ctx.fillStyle = '#6ee7ff';
        ctx.fillRect(-6, -6, 12, 12);
      } else if (i === p.dashCharges) {
        const k = p.dashRegenT / CFG.player.dashRegen;
        ctx.strokeStyle = 'rgba(110,231,255,0.8)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-6, -6, 12, 12);
        ctx.fillStyle = 'rgba(110,231,255,0.35)';
        ctx.fillRect(-6, 6 - 12 * k, 12, 12 * k);
      } else {
        ctx.strokeStyle = 'rgba(110,231,255,0.3)';
        ctx.lineWidth = 2;
        ctx.strokeRect(-6, -6, 12, 12);
      }
      ctx.restore();
    }

    // 特殊技冷却（I 挑空）
    const ix = bx + 12 + CFG.player.dashMax * 26 + 10, iy = by + 34;
    ctx.save();
    ctx.strokeStyle = p.specialCd <= 0 ? '#ffd766' : 'rgba(255,215,102,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(ix, iy, 9, 0, TAU); ctx.stroke();
    if (p.specialCd > 0) {
      ctx.fillStyle = 'rgba(255,215,102,0.3)';
      ctx.beginPath();
      ctx.moveTo(ix, iy);
      ctx.arc(ix, iy, 9, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - p.specialCd / 1.0));
      ctx.closePath(); ctx.fill();
    } else {
      ctx.fillStyle = '#ffd766';
      ctx.beginPath(); ctx.moveTo(ix, iy + 6); ctx.lineTo(ix - 5, iy - 2); ctx.lineTo(ix, iy - 7); ctx.lineTo(ix + 5, iy - 2); ctx.closePath(); ctx.fill();
    }
    ctx.restore();

    // 分数与波次
    ctx.textAlign = 'right';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.font = 'bold 22px "Trebuchet MS", sans-serif';
    ctx.fillText(`${this.score}`, VIEW_W - 24, 40);
    ctx.font = '12px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('SCORE', VIEW_W - 24, 56);
    ctx.fillText(`第 ${Math.max(1, this.wave)} 波 · 击破 ${this.killCount} · 断肢 ${this.limbBreaks}`, VIEW_W - 24, 76);

    // 连击
    if (this.combo >= 3) {
      const pop = 1 + this.comboPop * 0.5;
      ctx.save();
      ctx.translate(VIEW_W - 110, 150);
      ctx.scale(pop, pop);
      ctx.textAlign = 'center';
      ctx.font = 'italic bold 44px "Trebuchet MS", sans-serif';
      ctx.lineWidth = 5;
      ctx.strokeStyle = 'rgba(10,8,16,0.9)';
      ctx.strokeText(`${this.combo}`, 0, 0);
      const cg = ctx.createLinearGradient(0, -30, 0, 6);
      cg.addColorStop(0, '#ffe27a');
      cg.addColorStop(1, '#ff7a45');
      ctx.fillStyle = cg;
      ctx.fillText(`${this.combo}`, 0, 0);
      ctx.font = 'bold 15px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.fillText('HITS', 0, 20);
      // 连击剩余时间
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(-30, 28, 60, 3);
      ctx.fillStyle = '#ffd766';
      ctx.fillRect(-30, 28, 60 * clamp(this.comboTimer / 1.6, 0, 1), 3);
      ctx.restore();
    }

    // 完美闪避提示
    if (this.perfectT > 0) {
      ctx.save();
      ctx.globalAlpha = clamp(this.perfectT * 2, 0, 1);
      ctx.textAlign = 'center';
      ctx.font = 'italic bold 20px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#8df0ff';
      ctx.fillText('PERFECT DODGE', VIEW_W / 2, 120);
      ctx.restore();
    }

    // 底部按键提示
    ctx.textAlign = 'center';
    ctx.font = '13px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText('A/D 移动    Space 跳跃    J 连斩    K 蓄力斩(空中=下劈)    L 冲刺/闪避    I 挑空    R 重开', VIEW_W / 2, VIEW_H - 14);

    ctx.restore();
  }

  drawBanner(ctx) {
    const b = this.banner;
    const k = b.t / b.dur;
    const inK = clamp(b.t / 0.18, 0, 1);
    const outK = clamp((b.dur - b.t) / 0.25, 0, 1);
    const a = Math.min(inK, outK);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.textAlign = 'center';
    ctx.translate(VIEW_W / 2, 200);
    ctx.scale(0.8 + easeOutBack(inK) * 0.2, 0.8 + easeOutBack(inK) * 0.2);
    ctx.font = 'bold 52px "Trebuchet MS", serif';
    ctx.lineWidth = 8;
    ctx.strokeStyle = 'rgba(8,6,14,0.9)';
    ctx.strokeText(b.main, 0, 0);
    const g = ctx.createLinearGradient(0, -40, 0, 8);
    g.addColorStop(0, '#fff2c8');
    g.addColorStop(1, '#ffb347');
    ctx.fillStyle = g;
    ctx.fillText(b.main, 0, 0);
    if (b.sub) {
      ctx.font = '16px "Trebuchet MS", sans-serif';
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.fillText(b.sub, 0, 30);
    }
    ctx.restore();
  }

  drawTitle(ctx) {
    // 标题界面上叠一层暗化
    ctx.save();
    ctx.fillStyle = 'rgba(6,4,14,0.45)';
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.textAlign = 'center';
    const tt = this.titleT;
    const float = Math.sin(tt * 1.4) * 4;

    ctx.save();
    ctx.translate(VIEW_W / 2, 210 + float);
    ctx.font = 'bold 84px "Trebuchet MS", serif';
    ctx.lineWidth = 12;
    ctx.strokeStyle = 'rgba(8,6,14,0.95)';
    ctx.strokeText('月下傀儡庭', 0, 0);
    const g = ctx.createLinearGradient(0, -70, 0, 10);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(0.6, '#ffd9a0');
    g.addColorStop(1, '#ff9a55');
    ctx.fillStyle = g;
    ctx.fillText('月下傀儡庭', 0, 0);
    ctx.font = '18px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(200,220,255,0.75)';
    ctx.fillText('— 太 刀 · 木 偶 · 断 肢 之 庭 —', 0, 44);
    ctx.restore();

    // 闪烁开始提示
    if (Math.sin(tt * 4) > -0.3) {
      ctx.font = 'bold 26px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText('按 Enter 或点击画面 开始', VIEW_W / 2, 340);
    }

    // 操作说明卡
    ctx.save();
    ctx.translate(VIEW_W / 2, 420);
    ctx.fillStyle = 'rgba(10,8,18,0.66)';
    ctx.fillRect(-330, -20, 660, 170);
    ctx.strokeStyle = 'rgba(255,215,150,0.25)';
    ctx.strokeRect(-330, -20, 660, 170);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.font = '15px "Trebuchet MS", sans-serif';
    const lines = [
      'A / D  移动          Space  跳跃（可二段跳）',
      'J  三段连斩          K  蓄力重斩（满蓄力一击断肢）',
      'L  冲刺闪避（无敌帧·可取消攻击·擦弹触发慢动作）',
      'I  挑空斩 → 空中 J 连段 → 空中 K 下劈砸地',
      'R  重新开始',
    ];
    lines.forEach((l, i) => ctx.fillText(l, 0, 12 + i * 28));
    ctx.restore();

    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,180,120,0.8)';
    ctx.fillText('提示：傀儡的头、双臂、双腿都可被斩断——断其武器手则无法斩击，断其腿则跛行', VIEW_W / 2, 640);

    ctx.restore();
  }

  drawDeath(ctx) {
    ctx.save();
    const a = clamp(this.player.deadT * 1.4, 0, 0.72);
    ctx.fillStyle = `rgba(30,4,10,${a})`;
    ctx.fillRect(0, 0, VIEW_W, VIEW_H);

    ctx.textAlign = 'center';
    ctx.font = 'bold 72px "Trebuchet MS", serif';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(0,0,0,0.9)';
    ctx.strokeText('战 死', VIEW_W / 2, 250);
    ctx.fillStyle = '#d84040';
    ctx.fillText('战 死', VIEW_W / 2, 250);

    ctx.font = '18px "Trebuchet MS", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`坚持到第 ${this.wave} 波 · 击破 ${this.killCount} · 最大连击 ${this.maxCombo} · 断肢 ${this.limbBreaks}`, VIEW_W / 2, 310);
    ctx.fillText(`得分 ${this.score}`, VIEW_W / 2, 340);

    if (Math.sin(this.time * 4) > -0.3) {
      ctx.font = 'bold 24px "Trebuchet MS", sans-serif';
      ctx.fillStyle = '#ffe9b0';
      ctx.fillText('按 R 重新挑战', VIEW_W / 2, 420);
    }
    ctx.restore();
  }

  benchState() {
    return {
      ready: true,
      playerAlive: !this.player.dead && this.player.hp > 0,
      enemyCount: this.enemies.filter(e => !e.dead).length,
      hitCount: this.hitCount,
      limbBreakCount: this.limbBreaks,
      playing: this.state === 'playing',
    };
  }
}

/* ============================================================
 * 启动
 * ============================================================ */
(function boot() {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const game = new Game();

  input.attach(window);

  // 自适应缩放（保持 16:9 信箱式）
  function resize() {
    const ww = window.innerWidth, wh = window.innerHeight;
    const scale = Math.min(ww / VIEW_W, wh / VIEW_H);
    canvas.style.width = `${Math.floor(VIEW_W * scale)}px`;
    canvas.style.height = `${Math.floor(VIEW_H * scale)}px`;
  }
  window.addEventListener('resize', resize);
  resize();

  // 首次交互解锁音频
  const unlock = () => synth.ensure();
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('keydown', unlock);

  // 点击画面：标题页开始
  canvas.addEventListener('pointerdown', () => {
    if (game.state === 'title') {
      synth.ensure(); synth.uiClick();
      game.start();
    }
  });

  // 静音按钮
  const muteBtn = document.getElementById('muteBtn');
  muteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    synth.ensure();
    synth.setMuted(!synth.muted);
    muteBtn.textContent = synth.muted ? '🔇' : '🔊';
  });

  // 基准状态接口（只读）
  window.combatBenchState = () => game.benchState();
  window.__game = game; // 调试/自测句柄

  // 主循环：固定步长 + 顿帧冻结 + 慢动作
  let last = performance.now();
  let acc = 0;
  function loop(now) {
    const realDt = Math.min(0.1, (now - last) / 1000);
    last = now;

    fx.update(realDt); // 顿帧/震屏/闪白按真实时间衰减

    if (!fx.frozen) {
      acc += realDt * fx.timeScale;
      let steps = 0;
      while (acc >= STEP && steps < 5) {
        game.update(STEP);
        acc -= STEP;
        steps++;
      }
      if (steps === 5) acc = 0;
    }

    input.update(realDt);
    game.render(ctx);
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
})();
