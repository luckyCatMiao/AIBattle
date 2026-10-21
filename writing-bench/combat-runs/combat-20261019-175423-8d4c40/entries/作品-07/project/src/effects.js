// ============================================================================
// effects.js — 粒子系统 + 命中顿帧 / 震屏 / 缩放冲击（FX）
// ============================================================================

class Particle {
  constructor(p) {
    Object.assign(this, {
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0.4, maxLife: 0.4,
      size: 3, color: '#fff',
      gravity: 0, drag: 0,
      rot: 0, vr: 0,
      type: 'dot',
      // 附加数据（slash/shader/number 等用）
      data: null,
    }, p);
    this.t0 = this.life;
  }

  get t() { return this.maxLife > 0 ? this.life / this.maxLife : 1; } // 1 -> 0, 防御 NaN

  update(dt) {
    this.life -= dt;
    this.vy += this.gravity * dt;
    if (this.drag) {
      const f = Math.max(0, 1 - this.drag * dt);
      this.vx *= f; this.vy *= f;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.rot += (this.vr || 0) * dt;
  }

  draw(ctx, view) {
    if (this.life <= 0) return;
    const t = this.t;
    const alpha = t < 0.7 ? t / 0.7 : 1;
    const sx = view.toX(this.x);
    const sy = view.toY(this.y);

    switch (this.type) {
      case 'spark': {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(1, this.size * t);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx - this.vx * 0.022, sy - this.vy * 0.022);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'dot': {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, this.size * (0.4 + 0.6 * t)), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'ring': {
        const r = Math.max(0.5, this.data.r0 + (1 - t) * this.data.r1);
        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(1, 3 * t);
        ctx.beginPath();
        ctx.arc(sx, sy, r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'slash': {
        // 月牙形刀光
        const d = this.data;
        const sz = Math.max(1, this.size);
        ctx.save();
        ctx.globalAlpha = alpha * 0.9;
        ctx.lineCap = 'round';
        ctx.strokeStyle = d.inner || '#fff';
        ctx.lineWidth = Math.max(1, sz * 0.45 * t + 1);
        ctx.beginPath();
        ctx.arc(sx, sy, sz, d.ang - d.arc / 2, d.ang + d.arc / 2);
        ctx.stroke();
        ctx.strokeStyle = d.outer || this.color;
        ctx.lineWidth = Math.max(1, sz * t + 2);
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(1, sz * 1.04), d.ang - d.arc / 2 * 0.92, d.ang + d.arc / 2 * 0.92);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'shard': {
        const d = this.data || {};
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(sx, sy);
        ctx.rotate(this.rot);
        ctx.fillStyle = d.color || this.color;
        ctx.strokeStyle = d.edge || 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 1;
        const w = d.w || this.size, h = d.h || this.size * 0.6;
        ctx.beginPath();
        ctx.moveTo(-w / 2, -h / 2);
        ctx.lineTo(w / 2, -h / 2);
        ctx.lineTo(w / 2 + 3, h / 2);
        ctx.lineTo(-w / 2 + 2, h / 2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'number': {
        ctx.save();
        ctx.globalAlpha = clamp(t * 2, 0, 1);
        ctx.font = `700 ${this.size}px "Segoe UI", system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(this.data.text, sx, sy);
        ctx.fillStyle = this.color;
        ctx.fillText(this.data.text, sx, sy);
        ctx.restore();
        break;
      }
      case 'dust': {
        ctx.save();
        ctx.globalAlpha = alpha * 0.5;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(sx, sy, Math.max(0.5, this.size * (1.4 - 0.6 * t)), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'petal': {
        ctx.save();
        ctx.globalAlpha = alpha * 0.8;
        ctx.translate(sx, sy);
        ctx.rotate(this.rot);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.ellipse(0, 0, this.size, this.size * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'bolt': {
        // 竖直闪电（从高处劈到命中点）
        const d = this.data || {};
        const y0 = view.toY(d.y0 != null ? d.y0 : this.y - 520);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = d.inner || '#ffffff';
        ctx.lineWidth = Math.max(1.5, this.size * t);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, y0);
        const steps = 8;
        for (let i = 1; i < steps; i++) {
          const yy = y0 + (sy - y0) * (i / steps);
          const jx = sx + (hash01(i * 13 + Math.floor(this.x)) - 0.5) * 26 * (1 - i / steps + 0.2);
          ctx.lineTo(jx, yy);
        }
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.strokeStyle = this.color;
        ctx.lineWidth = Math.max(0.8, this.size * 0.4 * t);
        ctx.beginPath();
        ctx.moveTo(sx, y0);
        for (let i = 1; i < steps; i++) {
          const yy = y0 + (sy - y0) * (i / steps);
          const jx = sx + (hash01(i * 7 + Math.floor(this.x) + 5) - 0.5) * 20 * (1 - i / steps + 0.2);
          ctx.lineTo(jx, yy);
        }
        ctx.lineTo(sx, sy);
        ctx.stroke();
        ctx.restore();
        break;
      }
    }
  }
}

class Particles {
  constructor() {
    this.list = [];
  }

  add(p) {
    if (this.list.length > 520) return; // 上限保护
    this.list.push(new Particle(p));
  }

  clear() { this.list = []; }

  update(dt) {
    const l = this.list;
    for (let i = l.length - 1; i >= 0; i--) {
      l[i].update(dt);
      if (l[i].life <= 0) l.splice(i, 1);
    }
  }

  draw(ctx, view) {
    for (const p of this.list) p.draw(ctx, view);
  }

  // ---- 常用生成器 ----
  sparks(x, y, n, color, speed = 300, spread = Math.PI * 2) {
    for (let i = 0; i < n; i++) {
      const a = spread === Math.PI * 2 ? rand(0, Math.PI * 2) : rand(-spread / 2, spread / 2);
      const s = speed * rand(0.4, 1);
      this.add({
        type: 'spark', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: rand(0.12, 0.3), size: rand(1.5, 3.2),
        color: Math.random() < 0.5 ? color : '#ffffff',
        gravity: 900, drag: 3,
      });
    }
  }

  ring(x, y, color, r0, r1, life = 0.25) {
    this.add({ type: 'ring', x, y, color, size: 1, life, data: { r0: +r0 || 0, r1: +r1 || 0 } });
  }

  slash(x, y, ang, arc, radius, color, inner, life = 0.16) {
    this.add({ type: 'slash', x, y, size: radius, life, color, data: { ang, arc, inner, outer: color } });
  }

  shard(x, y, opts = {}) {
    this.add(Object.assign({
      type: 'shard', x, y,
      vx: rand(-260, 260), vy: rand(-420, 120),
      life: rand(0.5, 0.9), size: rand(5, 9),
      rot: rand(0, Math.PI * 2), vr: rand(-9, 9),
      gravity: 1300, drag: 0.4,
    }, opts));
  }

  dust(x, y, n = 5, spread = 120) {
    for (let i = 0; i < n; i++) {
      this.add({
        type: 'dust', x: x + rand(-8, 8), y: y + rand(-2, 4),
        vx: rand(-spread, spread) * 0.5, vy: rand(-spread, 20) * 0.4,
        life: rand(0.25, 0.5), size: rand(4, 8),
        color: COLORS.dust, drag: 3,
      });
    }
  }

  number(x, y, text, color, size = 22) {
    this.add({
      type: 'number', x: x + rand(-6, 6), y: y - 6,
      vx: rand(-14, 14), vy: rand(-90, -60),
      life: 0.6, size, color, gravity: -40, drag: 1.2,
      data: { text },
    });
  }
}

// ----------------------------------------------------------------------------
// FX — 命中顿帧、震屏、缩放冲击
// ----------------------------------------------------------------------------
class FX {
  constructor() {
    this.hitStop = 0;
    this.shakeAmp = 0;
    this.shakeX = 0;
    this.shakeY = 0;
    this.zoom = 0;
  }

  reset() {
    this.hitStop = 0; this.shakeAmp = 0; this.shakeX = 0; this.shakeY = 0; this.zoom = 0;
  }

  addHitStop(t) { if (t > this.hitStop) this.hitStop = t; }
  addShake(a) { this.shakeAmp = Math.min(this.shakeAmp + a, 20); }
  addZoom(z) { this.zoom = Math.min(this.zoom + z, 0.05); }

  update(dt) {
    if (this.hitStop > 0) this.hitStop = Math.max(0, this.hitStop - dt);
    if (this.shakeAmp > 0) {
      this.shakeAmp = Math.max(0, this.shakeAmp - this.shakeAmp * 9 * dt - 3 * dt);
      this.shakeX = rand(-1, 1) * this.shakeAmp;
      this.shakeY = rand(-1, 1) * this.shakeAmp;
    } else {
      this.shakeX = 0; this.shakeY = 0;
    }
    if (this.zoom > 0) this.zoom = Math.max(0, this.zoom - this.zoom * 7 * dt - 0.004 * dt);
  }
}
