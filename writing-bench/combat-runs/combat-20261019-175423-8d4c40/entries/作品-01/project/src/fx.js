/* =========================================================
   fx.js — particles, impacts, trails, floating text
   ========================================================= */
class FX {
  constructor() {
    this.parts = [];
    this.rings = [];
    this.arclights = [];
    this.texts = [];
    this.streaks = [];
    this.maxParts = 320;
  }
  reset() {
    this.parts.length = 0; this.rings.length = 0;
    this.arclights.length = 0; this.texts.length = 0; this.streaks.length = 0;
  }
  addPart(p) {
    if (this.parts.length >= this.maxParts) this.parts.shift();
    this.parts.push(p);
  }
  spark(x, y, opts) {
    const o = opts || {};
    const n = o.count || 8;
    const dir = o.dir === undefined ? rand(-Math.PI, Math.PI) : o.dir;
    const spread = o.spread === undefined ? Math.PI : o.spread;
    const color = o.color || '#fff3d6';
    const speed = o.speed || 520;
    for (let i = 0; i < n; i++) {
      const a = dir + rand(-spread / 2, spread / 2);
      const s = speed * rand(0.35, 1.15);
      this.addPart({
        kind: 'spark', x, y,
        vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.lift || 0),
        life: (o.life || 0.3) * rand(0.6, 1.25), max: 0.4,
        size: (o.size || 2.6) * rand(0.6, 1.5),
        color, grav: o.grav === undefined ? 900 : o.grav,
        drag: o.drag === undefined ? 2.6 : o.drag,
        shape: o.shape || 'line'
      });
    }
  }
  burst(x, y, color, count, speed, size, life, grav) {
    this.spark(x, y, { count, speed: speed || 300, size: size || 3, life: life || 0.5, color, grav: grav === undefined ? 700 : grav, spread: Math.PI * 2 });
  }
  dust(x, y, count, dir) {
    for (let i = 0; i < (count || 6); i++) {
      this.addPart({
        kind: 'smoke', x: x + rand(-10, 10), y: y + rand(-3, 2),
        vx: rand(-80, 80) + (dir || 0) * 40, vy: rand(-90, -20),
        life: rand(0.35, 0.7), max: 0.7, size: rand(5, 12),
        color: 'rgba(196,181,168,0.5)', grav: -60, drag: 3.4
      });
    }
  }
  ember(x, y, count) {
    for (let i = 0; i < (count || 1); i++) {
      this.addPart({
        kind: 'ember', x: x + rand(-6, 6), y: y + rand(-6, 6),
        vx: rand(-30, 30), vy: rand(-70, -20),
        life: rand(0.6, 1.4), max: 1.4, size: rand(1.2, 2.6),
        color: Math.random() < 0.5 ? '#ff5a4a' : '#ffb84a', grav: -30, drag: 0.8
      });
    }
  }
  streak(x, y, angle, len, w, color, life) {
    this.streaks.push({ x, y, angle, len, w, color, life: life || 0.16, t: 0 });
  }
  ring(x, y, r0, r1, color, life, width) {
    this.rings.push({ x, y, r0, r1, color, life: life || 0.3, t: 0, width: width || 3 });
  }
  slashLight(x, y, angle, spread, radius, color, life, width) {
    this.arclights.push({ x, y, angle, spread, radius, color, life: life || 0.22, t: 0, width: width || 10 });
  }
  // keep simultaneous combat words from piling on the same pixels
  stackOffset(x, y) {
    let n = 0, hasSub = false;
    for (const t of this.texts) {
      if (t.t < 0.35 && Math.abs(t.x - x) < 110) { n++; if (t.sub) hasSub = true; }
    }
    return { x: x + (n % 2 ? -22 : 22) * (n > 0 ? 1 : 0), y: y - n * 30, dense: n > 0 && hasSub };
  }
  damage(x, y, value, color, big) {
    const o = this.stackOffset(x, y);
    this.texts.push({ x: o.x, y: o.y, vx: rand(-20, 20), vy: -95, str: '' + value, color: color || '#fff6df', life: 0.7, t: 0, size: big ? 26 : 18, kind: 'num' });
    if (this.texts.length > 30) this.texts.splice(0, this.texts.length - 30);
  }
  word(x, y, str, color, size, life) {
    const o = this.stackOffset(x, y);
    this.texts.push({ x: o.x, y: o.y, vx: 0, vy: -36, str, color: color || '#ffdd88', life: life || 0.9, t: 0, size: size || 20, kind: 'word' });
    if (this.texts.length > 30) this.texts.splice(0, this.texts.length - 30);
  }
  word2(x, y, str, sub, color, size, life) {
    const o = this.stackOffset(x, y);
    // when several labels are live at once, drop the sub-line so the stack stays readable
    this.texts.push({ x: o.x, y: o.y, vx: 0, vy: -36, str, sub: o.dense ? undefined : sub, color: color || '#ffdd88', life: life || 0.9, t: 0, size: size || 20, kind: 'word' });
    if (this.texts.length > 30) this.texts.splice(0, this.texts.length - 30);
  }
  update(dt, freezePart) {
    const k = freezePart ? 0.22 : 1;
    dt *= k;
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += (p.grav || 0) * dt;
      const dr = Math.max(0, 1 - (p.drag || 0) * dt);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.kind === 'smoke') p.size += 22 * dt;
      if (p.kind === 'severed' && p.y > p.floor) {
        p.y = p.floor;
        if (p.vy > 40) { p.vy *= -0.32; p.vx *= 0.6; p.vr *= 0.5; p.bounces = (p.bounces || 0) + 1; }
        else { p.vy = 0; p.vx *= 0.8; p.vr *= 0.7; p.rest = true; }
      }
    }
    for (let i = this.streaks.length - 1; i >= 0; i--) {
      const s = this.streaks[i];
      s.t += dt; if (s.t >= s.life) this.streaks.splice(i, 1);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i]; r.t += dt; if (r.t >= r.life) this.rings.splice(i, 1);
    }
    for (let i = this.arclights.length - 1; i >= 0; i--) {
      const a = this.arclights[i]; a.t += dt; if (a.t >= a.life) this.arclights.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i]; t.t += dt;
      t.x += t.vx * dt; t.y += t.vy * dt; t.vy += (t.kind === 'word' ? 30 : 190) * dt;
      if (t.t >= t.life) this.texts.splice(i, 1);
    }
  }
  drawBack(ctx) {
    // ground-level rings & dust
    for (const r of this.rings) {
      const k = r.t / r.life;
      ctx.globalAlpha = (1 - k) * 0.8;
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.width * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, lerp(r.r0, r.r1, easeOutCubic(k)), lerp(r.r0, r.r1, easeOutCubic(k)) * 0.38, 0, 0, TAU);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
  draw(ctx, additive) {
    ctx.save();
    if (additive) ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const lifeK = clamp(p.life / p.max, 0, 1);
      if (p.kind === 'smoke') {
        ctx.globalAlpha = lifeK * 0.45;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      } else if (p.kind === 'severed') {
        // handled by world drawing severed limbs separately
      } else if (p.kind === 'spark') {
        ctx.globalAlpha = Math.min(1, lifeK * 1.4);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = Math.max(1, p.size * lifeK);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.022, p.y - p.vy * 0.022);
        ctx.stroke();
      } else if (p.kind === 'ember') {
        ctx.globalAlpha = lifeK * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * lifeK + 0.4, 0, TAU); ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.globalAlpha = lifeK;
        ctx.fillStyle = p.color;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot || 0);
        ctx.fillRect(-p.size, -p.size * 0.35, p.size * 2, p.size * 0.7);
        ctx.restore();
      }
    }
    // speed streaks
    for (const s of this.streaks) {
      const k = 1 - s.t / s.life;
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.w * k;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x - Math.cos(s.angle) * s.len, s.y - Math.sin(s.angle) * s.len);
      ctx.stroke();
    }
    // slash arcs
    for (const a of this.arclights) {
      const k = a.t / a.life;
      const alpha = (1 - k);
      ctx.globalAlpha = alpha;
      const r0 = a.radius * (0.62 + 0.38 * k);
      ctx.strokeStyle = a.color;
      ctx.lineWidth = a.width * (1 - k * 0.7);
      ctx.beginPath();
      ctx.arc(a.x, a.y, r0, a.angle - a.spread / 2, a.angle + a.spread / 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  drawTexts(ctx) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const k = t.t / t.life;
      const pop = t.t < 0.09 ? 1.35 - (t.t / 0.09) * 0.35 : 1;
      ctx.globalAlpha = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
      ctx.font = '900 ' + Math.round(t.size * pop) + 'px "Trebuchet MS","PingFang SC","Microsoft YaHei",sans-serif';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(20,10,14,0.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      if (t.sub) {
        ctx.font = '800 11px "Trebuchet MS",sans-serif';
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(20,10,14,0.85)';
        ctx.strokeText(t.sub, t.x, t.y + t.size * 0.82);
        ctx.fillStyle = 'rgba(255,240,220,0.85)';
        ctx.fillText(t.sub, t.x, t.y + t.size * 0.82);
      }
    }
    ctx.restore();
  }
}
