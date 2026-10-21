// ---- particles, debris, trails, shockwaves, floating text ----
'use strict';

class Particles {
  constructor() { this.list = []; }
  spawn(o) {
    if (this.list.length > 900) this.list.splice(0, 60);
    this.list.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0,
      life: 0.5, age: 0, size: 3, color: '#fff',
      type: 'spark', // spark | dot | ring | flash
      rot: 0, vr: 0,
    }, o));
  }
  burst(x, y, n, opt) {
    for (let i = 0; i < n; i++) {
      const a = opt.angle !== undefined ? opt.angle + rand(-opt.spread || -0.6, opt.spread || 0.6) : rand(0, TAU);
      const sp = rand(opt.spMin || 60, opt.spMax || 320);
      this.spawn({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        g: opt.g !== undefined ? opt.g : 700,
        drag: opt.drag !== undefined ? opt.drag : 2.2,
        life: rand(opt.lifeMin || 0.2, opt.lifeMax || 0.55),
        size: rand(opt.sizeMin || 1.5, opt.sizeMax || 3.5),
        color: Array.isArray(opt.color) ? pick(opt.color) : (opt.color || '#ffd76a'),
        type: opt.type || 'spark',
      });
    }
  }
  update(dt) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const p = L[i];
      p.age += dt;
      if (p.age >= p.life) { L.splice(i, 1); continue; }
      p.vy += p.g * dt;
      if (p.drag) { const d = Math.max(0, 1 - p.drag * dt); p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
    }
  }
  draw(ctx) {
    for (const p of this.list) {
      const t = p.age / p.life;
      const a = 1 - t;
      if (p.type === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = p.size * a + 0.4;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
        ctx.stroke();
      } else if (p.type === 'dot') {
        ctx.fillStyle = p.color;
        ctx.globalAlpha = a;
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.3, p.size * (1 - t * 0.7)), 0, TAU);
        ctx.fill();
      } else if (p.type === 'flash') {
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = p.color;
        const s = p.size * (0.4 + t * 1.2);
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

// severed limbs / wreck chunks with physics
class DebrisSys {
  constructor() { this.list = []; }
  spawn(x, y, opt) {
    if (this.list.length > 70) this.list.shift();
    this.list.push(Object.assign({
      x, y, vx: rand(-220, 220), vy: rand(-420, -140),
      rot: rand(0, TAU), vr: rand(-12, 12),
      g: 1500, len: 26, thick: 9, hue: 30, metal: '#c9a15a',
      life: 2.6, age: 0, bounces: 2, kind: 'limb', seed: rand(0, 9),
    }, opt));
  }
  update(dt, groundY) {
    const L = this.list;
    for (let i = L.length - 1; i >= 0; i--) {
      const d = L[i];
      d.age += dt;
      if (d.age >= d.life) { L.splice(i, 1); continue; }
      d.vy += d.g * dt;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.rot += d.vr * dt;
      if (d.y > groundY - 4) {
        d.y = groundY - 4;
        if (d.bounces > 0 && Math.abs(d.vy) > 60) {
          d.vy = -Math.abs(d.vy) * 0.42;
          d.vx *= 0.6; d.vr *= 0.5; d.bounces--;
        } else { d.vy = 0; d.vx *= 0.86; d.vr *= 0.86; d.g = 0; }
      }
    }
  }
  draw(ctx) {
    for (const d of this.list) {
      const a = clamp((d.life - d.age) / 0.6, 0, 1);
      ctx.save();
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.globalAlpha = a;
      if (d.kind === 'hammer') {
        ctx.fillStyle = '#3a3f4d';
        ctx.fillRect(-d.len * 0.4, -d.thick * 0.6, d.len * 0.8, d.thick * 1.2);
        ctx.fillStyle = '#6d7890';
        ctx.fillRect(d.len * 0.25, -d.thick, d.len * 0.3, d.thick * 2);
      } else if (d.kind === 'gun') {
        ctx.fillStyle = '#4a5165';
        ctx.fillRect(-d.len * 0.5, -d.thick * 0.45, d.len, d.thick * 0.9);
        ctx.fillStyle = '#8be9ff';
        ctx.fillRect(d.len * 0.3, -d.thick * 0.25, d.len * 0.18, d.thick * 0.5);
      } else { // mecha limb chunk
        const w = d.len, h = d.thick;
        ctx.fillStyle = d.metal;
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(-w / 2, -h / 2, w, h, h * 0.45); else ctx.rect(-w / 2, -h / 2, w, h);
        ctx.fill();
        // torn joint
        ctx.fillStyle = '#23283a';
        ctx.beginPath(); ctx.arc(w * 0.42, 0, h * 0.42, 0, TAU); ctx.fill();
        // wires
        ctx.strokeStyle = '#ff5f4a';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(w * 0.42, 0);
        ctx.quadraticCurveTo(w * 0.7, Math.sin(d.seed * 7 + d.age * 20) * 6, w * 0.85, 4);
        ctx.moveTo(w * 0.42, 0);
        ctx.quadraticCurveTo(w * 0.75, -5, w * 0.9, -3);
        ctx.stroke();
        // crack shading
        ctx.strokeStyle = 'rgba(0,0,0,0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-w * 0.3, -h * 0.4); ctx.lineTo(-w * 0.1, 0); ctx.lineTo(-w * 0.25, h * 0.4);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

// ribbon trail for the blade
class Trail {
  constructor() { this.pts = []; }
  push(x1, y1, x2, y2) {
    this.pts.push({ x1, y1, x2, y2, age: 0 });
    if (this.pts.length > 14) this.pts.shift();
  }
  clear() { this.pts.length = 0; }
  update(dt) {
    for (let i = this.pts.length - 1; i >= 0; i--) {
      this.pts[i].age += dt;
      if (this.pts[i].age > 0.22) this.pts.splice(i, 1);
    }
  }
  draw(ctx, color, width) {
    const n = this.pts.length;
    if (n < 2) return;
    for (let i = 1; i < n; i++) {
      const a = this.pts[i], b = this.pts[i - 1];
      const t = 1 - a.age / 0.22;
      ctx.strokeStyle = color;
      ctx.globalAlpha = t * 0.85;
      ctx.lineWidth = Math.max(0.5, width * t * (i / n));
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2);
      ctx.moveTo(b.x1, b.y1); ctx.lineTo(b.x2, b.y2);
      // draw quad as two lines for cheap ribbon
      ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2);
      ctx.stroke();
      // fill ribbon
      ctx.globalAlpha = t * 0.35;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1); ctx.lineTo(a.x2, a.y2); ctx.lineTo(b.x2, b.y2); ctx.lineTo(b.x1, b.y1);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }
}

// pose snapshots for dash/attack afterimages
class Afterimages {
  constructor() { this.list = []; }
  add(skel, color) {
    this.list.push({ skel: skel, color: color || '#7fd8ff', age: 0, life: 0.28 });
    if (this.list.length > 12) this.list.shift();
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      this.list[i].age += dt;
      if (this.list[i].age > this.list[i].life) this.list.splice(i, 1);
    }
  }
  draw(ctx) {
    for (const a of this.list) {
      const t = 1 - a.age / a.life;
      drawSkeletonGhost(ctx, a.skel, a.color, t * 0.4);
    }
  }
}

class Shockwaves {
  constructor() { this.list = []; }
  spawn(x, y, opt) {
    this.list.push(Object.assign({ x, y, r0: 8, r1: 160, life: 0.35, age: 0, color: '#ffd76a', width: 5, ring: true }, opt));
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const s = this.list[i];
      s.age += dt;
      if (s.age > s.life) this.list.splice(i, 1);
    }
  }
  draw(ctx) {
    for (const s of this.list) {
      const t = s.age / s.life;
      const r = lerp(s.r0, s.r1, easeOutCubic(t));
      ctx.globalAlpha = (1 - t) * 0.9;
      if (s.ring) {
        ctx.strokeStyle = s.color;
        ctx.lineWidth = s.width * (1 - t) + 1;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.45, 0, 0, TAU); ctx.stroke();
      } else { // ground crack flash disc
        ctx.fillStyle = s.color;
        ctx.beginPath(); ctx.ellipse(s.x, s.y, r, r * 0.3, 0, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  }
}

class Floaters {
  constructor() { this.list = []; }
  spawn(x, y, txt, color, size) {
    this.list.push({ x: x + rand(-8, 8), y, txt, color: color || '#fff', size: size || 17, age: 0, life: 0.8, vy: -80 });
  }
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      f.age += dt; f.y += f.vy * dt; f.vy *= (1 - 3 * dt);
      if (f.age > f.life) this.list.splice(i, 1);
    }
  }
  draw(ctx) {
    ctx.textAlign = 'center';
    for (const f of this.list) {
      const t = f.age / f.life;
      const pop = t < 0.15 ? easeOutBack(t / 0.15) : 1;
      ctx.globalAlpha = 1 - t * t;
      ctx.font = `bold ${Math.round(f.size * pop)}px "Segoe UI", "Microsoft YaHei", sans-serif`;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 3;
      ctx.strokeText(f.txt, f.x, f.y);
      ctx.fillStyle = f.color;
      ctx.fillText(f.txt, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }
}

// shared fx bundle
class FX {
  constructor() {
    this.particles = new Particles();
    this.debris = new DebrisSys();
    this.shocks = new Shockwaves();
    this.floaters = new Floaters();
    this.trails = []; // per-attacker trails keyed externally
  }
  hitSpark(x, y, heavy, dirX) {
    const n = heavy ? 22 : 10;
    this.particles.burst(x, y, n, {
      angle: dirX > 0 ? 0 : Math.PI, spread: 1.1,
      spMin: heavy ? 140 : 80, spMax: heavy ? 520 : 300,
      color: ['#fff6d8', '#ffd76a', '#ff9a3d', '#ff5f4a'],
      lifeMin: 0.15, lifeMax: heavy ? 0.6 : 0.4,
    });
    this.particles.spawn({ x, y, type: 'flash', size: heavy ? 34 : 18, life: 0.12, color: '#fff' });
  }
  clangSpark(x, y) {
    this.particles.burst(x, y, 8, { spMin: 120, spMax: 380, color: ['#cfe8ff', '#8be9ff', '#fff'], lifeMax: 0.3, g: 500 });
    this.particles.spawn({ x, y, type: 'flash', size: 14, life: 0.08, color: '#bfe9ff' });
  }
  bloodOil(x, y, dirX, n) { // dark ichor + embers for mecha
    this.particles.burst(x, y, n || 8, {
      angle: dirX > 0 ? 0 : Math.PI, spread: 0.9,
      spMin: 60, spMax: 300, color: ['#2b2f3d', '#3d4b8f', '#5560d8', '#ffb347'],
      lifeMin: 0.25, lifeMax: 0.6, g: 900, type: 'dot', sizeMin: 2, sizeMax: 5,
    });
  }
  dust(x, y, n) {
    this.particles.burst(x, y, n || 6, {
      angle: -Math.PI / 2, spread: 1.2, spMin: 30, spMax: 130,
      color: ['#5a5f74', '#454a5e'], lifeMin: 0.3, lifeMax: 0.7, g: -40,
      type: 'dot', sizeMin: 3, sizeMax: 7, drag: 3,
    });
  }
  update(dt, groundY) {
    this.particles.update(dt);
    this.debris.update(dt, groundY);
    this.shocks.update(dt);
    this.floaters.update(dt);
  }
  drawWorld(ctx) {
    this.shocks.draw(ctx);
    this.particles.draw(ctx);
    this.debris.draw(ctx);
  }
}
