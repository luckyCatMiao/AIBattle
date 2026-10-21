/* ============================================================
 * 03-fx.js — 粒子 / 碎肢残骸 / 飘字 / 顿帧 / 震屏 / 慢动作
 * ============================================================ */
'use strict';

class FXSystem {
  constructor() {
    this.particles = [];   // 轻量粒子
    this.debris = [];      // 肢体残骸（物理）
    this.texts = [];       // 飘字
    this.rings = [];       // 冲击环
    this.afterimages = []; // 冲刺残影
    this.shakeAmp = 0;
    this.shakeDur = 0;
    this.shakeT = 0;
    this.shakeDirX = 0;
    this.shakeDirY = 0;
    this.hitstop = 0;      // 剩余顿帧秒
    this.slowmo = 0;       // 剩余慢动作秒
    this.slowmoScale = 1;
    this.flashA = 0;       // 屏幕闪白（极克制使用）
    this.trauma = 0;       // 累积震动量（自动衰减）
  }

  reset() {
    this.particles.length = 0;
    this.debris.length = 0;
    this.texts.length = 0;
    this.rings.length = 0;
    this.afterimages.length = 0;
    this.shakeAmp = 0; this.shakeT = 0; this.shakeDur = 0;
    this.hitstop = 0; this.slowmo = 0; this.flashA = 0; this.trauma = 0;
  }

  /* ---------- 顿帧 / 震屏 / 慢动作 ---------- */
  addHitstop(t) { this.hitstop = Math.max(this.hitstop, t); }

  addSlowmo(scale, dur) {
    this.slowmoScale = scale;
    this.slowmo = Math.max(this.slowmo, dur);
  }

  shake(amp, dur, dx = 0, dy = 0) {
    // 只增不减，避免连续小抖动互相覆盖成大抖
    if (amp >= this.shakeAmp * (1 - this.shakeT / Math.max(0.001, this.shakeDur))) {
      this.shakeAmp = amp;
      this.shakeDur = dur;
      this.shakeT = 0;
      const len = Math.hypot(dx, dy) || 1;
      this.shakeDirX = dx / len;
      this.shakeDirY = dy / len;
    }
  }

  flash(a) { this.flashA = Math.max(this.flashA, a); }

  getShakeOffset(t) {
    if (this.shakeT >= this.shakeDur) return { x: 0, y: 0 };
    const k = 1 - this.shakeT / this.shakeDur;
    const amp = this.shakeAmp * k * k;
    // 高频抖动 + 方向性踢动
    const n1 = Math.sin(t * 91.7) * 0.6 + Math.sin(t * 47.3) * 0.4;
    const n2 = Math.cos(t * 83.1) * 0.6 + Math.cos(t * 39.7) * 0.4;
    return {
      x: n1 * amp + this.shakeDirX * amp * 0.8,
      y: n2 * amp * 0.7 + this.shakeDirY * amp * 0.8,
    };
  }

  /* ---------- 生成器 ---------- */
  spark(x, y, dirX, n, speed, color, spread = 0.9, life = 0.35, size = 3) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(0, dirX) + rand(-spread, spread) + (dirX > 0 ? 0 : Math.PI);
      const sp = speed * rand(0.4, 1.15);
      this.particles.push({
        type: 'spark', x, y,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(40, 160),
        life: life * rand(0.6, 1.2), maxLife: life,
        size: size * rand(0.7, 1.4), color,
        grav: 1500, drag: 2.2,
      });
    }
  }

  dust(x, y, n, spreadX = 60, col = '150,140,125') {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        type: 'dust', x: x + rand(-10, 10), y: y + rand(-4, 4),
        vx: rand(-spreadX, spreadX), vy: rand(-90, -18),
        life: rand(0.35, 0.7), maxLife: 0.7,
        size: rand(4, 11), color: col,
        grav: -60, drag: 2.8,
      });
    }
  }

  embers(x, y, n, color = '255,170,60') {
    for (let i = 0; i < n; i++) {
      this.particles.push({
        type: 'ember', x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: rand(-50, 50), vy: rand(-140, -30),
        life: rand(0.5, 1.1), maxLife: 1.1,
        size: rand(1.5, 3.5), color,
        grav: -40, drag: 1.2,
      });
    }
  }

  splinters(x, y, n, dirX) { // 木屑
    for (let i = 0; i < n; i++) {
      this.particles.push({
        type: 'shard', x, y,
        vx: dirX * rand(60, 320) + rand(-80, 80), vy: rand(-360, -60),
        life: rand(0.4, 0.9), maxLife: 0.9,
        size: rand(2, 6), rot: rand(0, TAU), vr: rand(-14, 14),
        color: pick(['158,111,62', '122,84,46', '190,146,92']),
        grav: 1900, drag: 0.6,
      });
    }
  }

  oilSplash(x, y, n, dirX) { // 傀儡黑油
    for (let i = 0; i < n; i++) {
      this.particles.push({
        type: 'oil', x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: dirX * rand(40, 260) + rand(-60, 60), vy: rand(-300, -40),
        life: rand(0.35, 0.75), maxLife: 0.75,
        size: rand(2.5, 6), color: '20,16,24',
        grav: 2000, drag: 0.5,
      });
    }
  }

  ring(x, y, r0, r1, life, color, width = 4) {
    this.rings.push({ x, y, r0, r1, life, maxLife: life, color, width });
  }

  slashArc(x, y, dir, reach, color = '160,230,255', flip = false) {
    // 一次性刀光弧（大闪现），存在极短
    this.particles.push({
      type: 'arc', x, y, dir, reach, flip,
      life: 0.12, maxLife: 0.12, color, rot: rand(-0.15, 0.15),
    });
  }

  text(x, y, str, color, size = 18, crit = false) {
    this.texts.push({
      x: x + rand(-8, 8), y, str, color, size, crit,
      vy: crit ? -190 : -140, life: crit ? 0.8 : 0.6, maxLife: crit ? 0.8 : 0.6,
    });
    if (this.texts.length > 40) this.texts.shift();
  }

  addDebris(part) {
    this.debris.push(part);
    if (this.debris.length > 46) this.debris.splice(0, this.debris.length - 46);
  }

  addAfterimage(img) {
    this.afterimages.push(img);
    if (this.afterimages.length > 12) this.afterimages.shift();
  }

  /* ---------- 更新 ---------- */
  // 顿帧期间世界冻结；震屏与闪白照常衰减
  update(realDt) {
    if (this.hitstop > 0) this.hitstop -= realDt;
    if (this.slowmo > 0) this.slowmo -= realDt;
    if (this.flashA > 0) this.flashA = Math.max(0, this.flashA - realDt * 2.6);
    if (this.shakeT < this.shakeDur) this.shakeT += realDt;
  }

  get frozen() { return this.hitstop > 0; }
  get timeScale() { return this.slowmo > 0 ? this.slowmoScale : 1; }

  // 世界时间步（被顿帧跳过，慢动作缩放）
  updateWorld(dt) {
    // 粒子
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      if (p.type !== 'arc') {
        p.vy += (p.grav || 0) * dt;
        const dr = Math.exp(-(p.drag || 0) * dt);
        p.vx *= dr; p.vy *= dr;
        p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.rot !== undefined) p.rot += p.vr * dt;
        if (p.type === 'shard' || p.type === 'oil') {
          if (p.y > GROUND_Y + 2) { p.y = GROUND_Y + 2; p.vy *= -0.3; p.vx *= 0.6; if (p.vr) p.vr *= 0.6; }
        }
      }
    }
    if (this.particles.length > 420) this.particles.splice(0, this.particles.length - 420);

    // 残骸（肢体）
    for (let i = this.debris.length - 1; i >= 0; i--) {
      const d = this.debris[i];
      d.life -= dt;
      if (d.life <= 0) { this.debris.splice(i, 1); continue; }
      d.vy += 2300 * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.rot += d.vr * dt;
      const floor = GROUND_Y + d.radius * 0.4;
      if (d.y > floor) {
        d.y = floor;
        if (Math.abs(d.vy) > 140) {
          d.vy *= -0.42; d.vx *= 0.62; d.vr *= 0.55;
          this.dust(d.x, GROUND_Y, 2, 40);
        } else {
          d.vy = 0; d.vx *= Math.exp(-8 * dt); d.vr *= Math.exp(-6 * dt);
        }
      }
      if (d.x < 20) { d.x = 20; d.vx = Math.abs(d.vx) * 0.5; }
      if (d.x > ARENA_W - 20) { d.x = ARENA_W - 20; d.vx = -Math.abs(d.vx) * 0.5; }
    }

    // 冲击环
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }

    // 飘字
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.vy += 300 * dt;
      t.y += t.vy * dt;
    }

    // 残影
    for (let i = this.afterimages.length - 1; i >= 0; i--) {
      const a = this.afterimages[i];
      a.life -= dt;
      if (a.life <= 0) this.afterimages.splice(i, 1);
    }
  }

  /* ---------- 绘制 ---------- */
  drawDebris(ctx) {
    for (const d of this.debris) {
      const a = clamp(d.life / 0.5, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      d.draw(ctx);
      ctx.restore();
    }
  }

  drawAfterimages(ctx) {
    for (const a of this.afterimages) {
      const k = clamp(a.life / a.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = k * 0.35;
      a.draw(ctx, k);
      ctx.restore();
    }
  }

  draw(ctx) {
    // 粒子
    for (const p of this.particles) {
      const k = clamp(p.life / p.maxLife, 0, 1);
      if (p.type === 'spark') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        ctx.strokeStyle = `rgba(${p.color},1)`;
        ctx.lineWidth = p.size * 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
        ctx.stroke();
        ctx.restore();
      } else if (p.type === 'dust') {
        ctx.save();
        ctx.globalAlpha = k * 0.4;
        ctx.fillStyle = `rgba(${p.color},1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - k * 0.6), 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'ember') {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k;
        ctx.fillStyle = `rgba(${p.color},1)`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * k, 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'shard') {
        ctx.save();
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = `rgb(${p.color})`;
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        ctx.restore();
      } else if (p.type === 'oil') {
        ctx.save();
        ctx.globalAlpha = k * 0.85;
        ctx.fillStyle = `rgb(${p.color})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (0.5 + k * 0.5), 0, TAU);
        ctx.fill();
        ctx.restore();
      } else if (p.type === 'arc') {
        // 大刀光闪
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * 0.9;
        ctx.translate(p.x, p.y);
        ctx.scale(p.dir, 1);
        ctx.rotate(p.rot + (p.flip ? 0.5 : -0.1));
        ctx.strokeStyle = `rgba(${p.color},1)`;
        ctx.lineWidth = 7 * k + 2;
        ctx.beginPath();
        ctx.arc(0, 0, p.reach, p.flip ? -1.9 : -0.7, p.flip ? 0.4 : 1.15);
        ctx.stroke();
        ctx.lineWidth = 3 * k;
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.stroke();
        ctx.restore();
      }
    }

    // 冲击环
    for (const r of this.rings) {
      const k = 1 - r.life / r.maxLife;
      const rad = lerp(r.r0, r.r1, easeOutCubic(k));
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, rad, rad * 0.36, 0, 0, TAU);
      ctx.stroke();
      ctx.restore();
    }

    // 飘字
    for (const t of this.texts) {
      const k = clamp(t.life / t.maxLife, 0, 1);
      const pop = t.crit ? easeOutBack(clamp(1 - k + 0.15, 0, 1) * 3) : 1;
      ctx.save();
      ctx.globalAlpha = Math.min(1, k * 2);
      ctx.font = `bold ${Math.round(t.size * (t.crit ? Math.min(pop, 1.4) : 1))}px "Trebuchet MS", sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,8,16,0.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  }
}

const fx = new FXSystem();
