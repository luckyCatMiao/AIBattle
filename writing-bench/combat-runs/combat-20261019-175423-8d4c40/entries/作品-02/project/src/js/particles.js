'use strict';
// ---------------------------------------------------------------------------
// Particles, sparks, slash ribbons, damage numbers, decals
// ---------------------------------------------------------------------------
class Particles {
  constructor(max = 1400) {
    this.list = [];
    this.max = max;
  }
  add(p) {
    if (this.list.length >= this.max) {
      // replace oldest non-critical
      this.list.shift();
    }
    p.life = p.life ?? 0.5;
    p.maxLife = p.life;
    p.vx = p.vx ?? 0;
    p.vy = p.vy ?? 0;
    p.grav = p.grav ?? 0;
    p.drag = p.drag ?? 0;
    p.size = p.size ?? 3;
    p.rot = p.rot ?? 0;
    p.vr = p.vr ?? 0;
    p.add = p.add ?? false;
    p.type = p.type ?? 'dot';
    p.col = p.col ?? '#fff';
    p.fade = p.fade ?? 1;
    this.list.push(p);
    return p;
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.life -= dt;
      if (p.life <= 0) { L.splice(i, 1); continue; }
      p.vy += p.grav * dt;
      if (p.drag) {
        const d = Math.exp(-p.drag * dt);
        p.vx *= d; p.vy *= d;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.floor !== undefined && p.y > p.floor) {
        p.y = p.floor;
        if (p.bounce && Math.abs(p.vy) > 40) { p.vy *= -p.bounce; p.vx *= 0.6; p.vr *= 0.6; }
        else { p.vy = 0; p.vx *= 0.86; p.vr *= 0.8; }
      }
    }
  }
  draw(ctx) {
    const L = this.list;
    // additive pass first
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (!p.add) continue;
      this._drawOne(ctx, p);
    }
    ctx.restore();
    for (let i = 0; i < L.length; i++) {
      const p = L[i];
      if (p.add) continue;
      this._drawOne(ctx, p);
    }
  }
  _drawOne(ctx, p) {
    const t = clamp(p.life / p.maxLife, 0, 1);
    const a = p.fade === 1 ? t : Math.pow(t, p.fade);
    ctx.globalAlpha = a * (p.alpha ?? 1);
    const s = p.size * (p.grow ? lerp(1, p.grow, 1 - t) : 1);
    switch (p.type) {
      case 'dot':
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.3, s * (0.4 + t * 0.6)), 0, TAU);
        ctx.fill();
        break;
      case 'spark': {
        const len = s * (1.6 + (1 - t) * 2.4);
        ctx.strokeStyle = p.col;
        ctx.lineWidth = Math.max(0.6, s * 0.5 * t);
        ctx.lineCap = 'round';
        ctx.beginPath();
        const vx = p.vx * 0.014, vy = p.vy * 0.014;
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - vx * len, p.y - vy * len);
        ctx.stroke();
        break;
      }
      case 'shard': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.moveTo(-s * 0.5, -s * 0.5);
        ctx.lineTo(s * 0.9, 0);
        ctx.lineTo(-s * 0.5, s * 0.5);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'petal': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const c = p.col;
        ctx.fillStyle = c;
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.9, -s * 0.6, s * 0.7, s * 0.7, 0, s);
        ctx.bezierCurveTo(-s * 0.55, s * 0.5, -s * 0.8, -s * 0.4, 0, -s);
        ctx.fill();
        ctx.restore();
        break;
      }
      case 'streak': {
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.strokeStyle = p.col;
        ctx.lineWidth = s * 0.45;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-s * 2.2, 0);
        ctx.lineTo(s * 0.6, 0);
        ctx.stroke();
        ctx.restore();
        break;
      }
      case 'ring': {
        ctx.strokeStyle = p.col;
        ctx.lineWidth = Math.max(0.5, s * 0.14 * t);
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * (1.2 - t * 0.8), 0, TAU);
        ctx.stroke();
        break;
      }
      case 'dust': {
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, s * (1.6 - t * 0.5), s * (0.65 + (1 - t) * 0.3), 0, 0, TAU);
        ctx.fill();
        break;
      }
      case 'smoke': {
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, s * (1.4 - t * 0.5), 0, TAU);
        ctx.fill();
        break;
      }
      case 'ember': {
        ctx.fillStyle = p.col;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.4, s * t * (0.6 + 0.4 * Math.sin(p.life * 22 + p.rot))), 0, TAU);
        ctx.fill();
        break;
      }
    }
    ctx.globalAlpha = 1;
  }
}

// Slash ribbon trails swept by a blade.
// Each sample stores the blade's base and tip; we build a tapered ribbon between
// consecutive samples, fading out over its lifetime, drawn additively.
class Slashes {
  constructor() { this.list = []; }
  add(opts) {
    this.list.push({
      samples: [],                               // [{bx,by,tx,ty}]
      life: opts.life ?? 0.20,
      maxLife: opts.life ?? 0.20,
      width: opts.width ?? 26,
      col: opts.col ?? '#ffffff',
      col2: opts.col2 ?? '#ff4d6d',
      follow: opts.follow || null,
      core: opts.core ?? 1,
      grow: opts.grow ?? 0,
    });
    if (this.list.length > 48) this.list.shift();
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.life -= dt;
      if (s.life <= 0) { this.list.splice(i, 1); continue; }
      if (s.follow) {
        const f = s.follow();
        const last = s.samples[s.samples.length - 1];
        const moved = !last || Math.hypot(f.x - last.tx, f.y - last.ty) > 2.2;
        if (moved) {
          s.samples.push({ bx: f.bx, by: f.by, tx: f.x, ty: f.y });
          if (s.samples.length > 26) s.samples.shift();
        }
      }
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of this.list) {
      const N = s.samples.length;
      if (N < 2) continue;
      const t = clamp(s.life / s.maxLife, 0, 1);      // 1 -> 0
      const a = Math.pow(t, 0.85);
      // Draw as successive quads between samples with tapering width.
      for (let i = 1; i < N; i++) {
        const p0 = s.samples[i - 1], p1 = s.samples[i];
        const age0 = i / N, age1 = (i + 1) / N;         // 0 = old, 1 = new
        const w0 = s.width * Math.pow(age0, 1.6) * (0.30 + a * 0.55);
        const w1 = s.width * Math.pow(age1, 1.6) * (0.30 + a * 0.55);
        // direction along the blade
        let bx0 = p0.tx - p0.bx, by0 = p0.ty - p0.by;
        let bx1 = p1.tx - p1.bx, by1 = p1.ty - p1.by;
        const l0 = Math.hypot(bx0, by0) || 1, l1 = Math.hypot(bx1, by1) || 1;
        bx0 /= l0; by0 /= l0; bx1 /= l1; by1 /= l1;
        // Perpendicular = sweep direction feel; we expand toward the tip.
        const tipFade = 0.72;
        ctx.beginPath();
        ctx.moveTo(p0.bx - bx0 * w0 * 0.10, p0.by - by0 * w0 * 0.10);
        ctx.lineTo(p0.tx + bx0 * w0 * tipFade, p0.ty + by0 * w0 * tipFade);
        ctx.lineTo(p1.tx + bx1 * w1 * tipFade, p1.ty + by1 * w1 * tipFade);
        ctx.lineTo(p1.bx - bx1 * w1 * 0.10, p1.by - by1 * w1 * 0.10);
        ctx.closePath();
        const edge = age1;
        ctx.globalAlpha = a * edge * 0.30;
        ctx.fillStyle = s.col2;
        ctx.fill();
        // hot core near the blade edge
        ctx.globalAlpha = a * edge * 0.85 * s.core;
        ctx.strokeStyle = s.col;
        ctx.lineWidth = 1.6 + 2.6 * edge * a;
        ctx.beginPath();
        ctx.moveTo(p0.tx, p0.ty);
        ctx.lineTo(p1.tx, p1.ty);
        ctx.stroke();
      }
      // leading edge flash
      const last = s.samples[N - 1];
      const prev = s.samples[N - 2];
      ctx.globalAlpha = a * 0.75;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.2 + 2.5 * a;
      ctx.beginPath();
      ctx.moveTo(prev.tx, prev.ty);
      ctx.lineTo(last.tx, last.ty);
      ctx.stroke();
    }
    ctx.restore();
  }
}

// Floating damage / text popups
class Popups {
  constructor() { this.list = []; }
  add(text, x, y, opts = {}) {
    // nudge apart so limb-break labels and damage numbers never overprint
    let ny = y;
    const isLabel = /[A-Z]{3,}/.test(text);
    for (let pass = 0; pass < 4; pass++) {
      let clash = false;
      for (const q of this.list) {
        if (q.life <= 0.2) continue;
        const bigQ = /[A-Z]{3,}/.test(q.text);
        const sepX = (isLabel || bigQ) ? 120 : 62;
        const sepY = (isLabel || bigQ) ? 30 : 22;
        if (Math.abs(q.x - x) < sepX && Math.abs(q.y - ny) < sepY) { ny -= sepY; clash = true; break; }
      }
      if (!clash) break;
    }
    y = ny;
    this.list.push({
      text, x, y,
      vx: opts.vx ?? rand(-18, 18),
      vy: opts.vy ?? -95,
      life: opts.life ?? 0.75, maxLife: opts.life ?? 0.75,
      size: opts.size ?? 26,
      col: opts.col ?? '#fff',
      crit: opts.crit ?? false,
      shake: opts.shake ?? 0,
      delay: opts.delay ?? 0,
      font: opts.font ?? 'heavy',
    });
    if (this.list.length > 60) this.list.shift();
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      if (p.delay > 0) { p.delay -= dt; continue; }
      p.life -= dt;
      if (p.life <= 0) { this.list.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 220 * dt;
      p.vx *= 0.94;
    }
  }
  draw(ctx) {
    for (const p of this.list) {
      if (p.delay > 0) continue;
      const t = 1 - p.life / p.maxLife;
      const pop = t < 0.18 ? ease.outBack(t / 0.18) : 1;
      const a = p.life < 0.25 ? p.life / 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(p.x, p.y);
      ctx.scale(pop, pop);
      const sz = p.size * (p.crit ? 1.35 : 1);
      ctx.font = `900 ${sz}px "Arial Black", Arial, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = Math.max(2, sz * 0.16);
      ctx.strokeStyle = 'rgba(12,8,16,0.9)';
      ctx.strokeText(p.text, 0, 0);
      if (p.crit) {
        const g = ctx.createLinearGradient(0, -sz * 0.6, 0, sz * 0.6);
        g.addColorStop(0, '#fff7d6');
        g.addColorStop(0.5, '#ffcf5c');
        g.addColorStop(1, '#ff6a3d');
        ctx.fillStyle = g;
      } else {
        ctx.fillStyle = p.col;
      }
      ctx.fillText(p.text, 0, 0);
      ctx.restore();
    }
  }
}

// Scorch marks / sap splats on the ground
class Decals {
  constructor(max = 90) { this.list = []; this.max = max; }
  add(d) {
    d.life = d.life ?? 14; d.maxLife = d.life;
    d.rot = d.rot ?? rand(0, TAU);
    d.seed = rand(0, 100);
    this.list.push(d);
    if (this.list.length > this.max) this.list.shift();
  }
  update(dt) { for (let i = this.list.length - 1; i >= 0; i--) { const d = this.list[i]; d.life -= dt; if (d.life <= 0) this.list.splice(i, 1); } }
  draw(ctx) {
    for (const d of this.list) {
      const t = clamp(d.life / d.maxLife, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, t * 2) * (d.alpha ?? 0.5);
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.fillStyle = d.col || '#2a0e12';
      ctx.beginPath();
      const n = 7;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU;
        const r = (d.r || 18) * (0.6 + hash1(d.seed + i) * 0.7);
        const x = Math.cos(a) * r, y = Math.sin(a) * r * (d.flat ?? 0.35);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }
}
