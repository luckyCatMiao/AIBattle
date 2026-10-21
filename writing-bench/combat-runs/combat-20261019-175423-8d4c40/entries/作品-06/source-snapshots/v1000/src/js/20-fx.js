'use strict';
/* ============================================================
   FX: particles, slash arcs, impact bursts, floating damage
   ============================================================ */

const FX = {
  parts: [],
  slashes: [],
  texts: [],
  ghosts: [],
  rings: [],
  impacts: [],
  MAXPARTS: 900,

  reset() {
    this.parts.length = 0; this.slashes.length = 0; this.texts.length = 0;
    this.ghosts.length = 0; this.rings.length = 0; this.impacts.length = 0;
  },

  part(o) {
    if (this.parts.length >= this.MAXPARTS) this.parts.shift();
    this.parts.push(Object.assign({
      x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, life: 0.5, max: 0.5,
      size: 2, rot: 0, vr: 0, color: '#fff', type: 'spark', glow: 0, fade: 1
    }, o));
  },

  // ---- authored effects ----
  sparkBurst(x, y, dir, power = 1, color = '#ffe6b0', n = 10) {
    const count = Math.round(n * clamp(power, 0.6, 2.4));
    for (let i = 0; i < count; i++) {
      const a = rand(-0.95, 0.95) + (dir > 0 ? 0 : Math.PI);
      const sp = rand(180, 720) * (0.6 + power * 0.5);
      this.part({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.85 - rand(0, 120),
        g: 900, drag: 2.6, life: rand(0.16, 0.45), size: rand(1, 2.6),
        color, type: 'streak', glow: 0.7
      });
    }
    // a few slower embers
    for (let i = 0; i < 4; i++) {
      this.part({
        x: x + rand(-8, 8), y: y + rand(-8, 8),
        vx: rand(-90, 90), vy: rand(-170, -20), g: 260, drag: 1.4,
        life: rand(0.4, 0.9), size: rand(1.4, 3), color, type: 'dot', glow: 1
      });
    }
  },

  inkBurst(x, y, dir, power = 1, n = 8) {
    for (let i = 0; i < n * power; i++) {
      const a = rand(-1.2, 1.2) + (dir > 0 ? 0 : Math.PI);
      const sp = rand(80, 420) * power;
      this.part({
        x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - rand(0, 80),
        g: 1100, drag: 1.8, life: rand(0.25, 0.6), size: rand(1.5, 4),
        color: pick(['#9fd7e8', '#c9ecf5', '#6e9fb5']), type: 'blob', glow: 0.2
      });
    }
  },

  dust(x, y, dir = 0, power = 1, n = 8) {
    for (let i = 0; i < n * power; i++) {
      this.part({
        x: x + rand(-14, 14), y: y - rand(0, 6),
        vx: rand(-90, 90) + dir * 60, vy: rand(-70, -10), g: -20, drag: 2.2,
        life: rand(0.35, 0.85), size: rand(6, 16), color: 'rgba(150,150,180,1)',
        type: 'smoke', glow: 0, fade: 0.35
      });
    }
  },

  ring(x, y, r0, r1, life, color, width = 3, squash = 1) {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width, squash });
  },

  slash(x, y, r, a0, a1, dir, life, color, width, glow = true) {
    this.slashes.push({ x, y, r, a0, a1, dir, life, max: life, color, width, glow });
  },

  impactLines(x, y, dir, power = 1, color = '#fff3d0') {
    const n = Math.round(6 + power * 4);
    const lines = [];
    for (let i = 0; i < n; i++) {
      const a = rand(-0.8, 0.8) + (dir > 0 ? 0 : Math.PI) + rand(-0.5, 0.5);
      lines.push({ a, len: rand(30, 90) * power, w: rand(1, 3) });
    }
    this.impacts.push({ x, y, life: 0.16, max: 0.16, dir, lines, color });
  },

  text(x, y, str, color, size = 26, opts = {}) {
    this.texts.push({
      x, y, str, color, size, life: opts.life || 0.8, max: opts.life || 0.8,
      vy: opts.vy != null ? opts.vy : -70, vx: opts.vx || 0, pop: opts.pop !== false,
      weight: opts.weight || 800, italic: opts.italic || false, grow: opts.grow || 0
    });
  },

  ghost(silhouette, x, y, facing, alpha, color, life = 0.22) {
    this.ghosts.push({ silhouette, x, y, facing, alpha, color, life, max: life });
  },

  // ---- update / draw ----
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += p.g * dt;
      p.vx -= p.vx * p.drag * dt;
      p.vy -= p.vy * p.drag * dt * 0.35;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vr * dt;
      if (p.type === 'shard' && p.y > WORLD.ground - (p.floor || 0)) {
        p.y = WORLD.ground - (p.floor || 0);
        p.vy *= -0.38; p.vx *= 0.6; p.vr *= 0.6;
        if (Math.abs(p.vy) > 60) this.dust(p.x, p.y, 0, 0.3, 2);
      }
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) {
      this.slashes[i].life -= dt;
      if (this.slashes[i].life <= 0) this.slashes.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.life -= dt;
      if (t.life <= 0) { this.texts.splice(i, 1); continue; }
      t.x += t.vx * dt;
      t.y += t.vy * dt;
      t.vy += 150 * dt;
      t.vy *= 0.96;
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      this.rings[i].life -= dt;
      if (this.rings[i].life <= 0) this.rings.splice(i, 1);
    }
    for (let i = this.impacts.length - 1; i >= 0; i--) {
      this.impacts[i].life -= dt;
      if (this.impacts[i].life <= 0) this.impacts.splice(i, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      this.ghosts[i].life -= dt;
      if (this.ghosts[i].life <= 0) this.ghosts.splice(i, 1);
    }
  },

  drawGround(ctx) {
    ctx.save();
    for (const r of this.rings) {
      if (r.y < WORLD.ground - 120) continue;
      const t = 1 - r.life / r.max;
      const rad = lerp(r.r0, r.r1, easeOut(t));
      ctx.globalAlpha = (1 - t) * 0.7;
      ctx.strokeStyle = r.color; ctx.lineWidth = Math.max(0.5, r.width * (1 - t * 0.7));
      ctx.beginPath();
      ctx.ellipse(r.x, r.y, Math.max(0.5, rad), Math.max(0.5, rad * r.squash), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    // ground particles
    for (const p of this.parts) {
      if (p.y < WORLD.ground - 2) continue;
    }
  },

  drawBack(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const g of this.ghosts) {
      const a = (g.life / g.max) * g.alpha;
      ctx.globalAlpha = a;
      ctx.fillStyle = g.color;
      g.silhouette(ctx, g.x, g.y, g.facing);
    }
    ctx.restore();
  },

  drawSlashes(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of this.slashes) {
      const t = 1 - s.life / s.max;
      const alpha = Math.pow(1 - t, 0.95);
      const rr = s.r * (0.9 + 0.16 * easeOut(t));
      const span = s.a1 - s.a0;
      // The sweep trails: the leading edge advances, the tail catches up.
      const tail = s.a0 + span * t * 0.55 * (s.dir > 0 ? 1 : -1) * -1;
      let a0 = s.dir > 0 ? s.a0 + span * t * 0.42 : s.a1 - span * t * 0.42;
      let a1 = s.dir > 0 ? s.a1 : s.a0;
      // tapered crescent: sampled arc, thickness falls off at both ends
      const N = 15;
      const outer = [], inner = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const ang = a0 + (a1 - a0) * k;
        const taper = Math.sin(Math.pow(k, 0.62) * Math.PI);
        const w = Math.max(0.5, s.width * (0.22 + 0.78 * taper) * (1 - t * 0.55));
        const rr2 = Math.max(1, rr + Math.sin(k * Math.PI) * s.width * 0.16);
        outer.push([s.x + Math.cos(ang) * (rr2 + w * 0.5), s.y + Math.sin(ang) * (rr2 + w * 0.5)]);
        inner.push([s.x + Math.cos(ang) * (rr2 - w * 0.5), s.y + Math.sin(ang) * (rr2 - w * 0.5)]);
      }
      ctx.globalAlpha = Math.min(1, alpha * 0.95);
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.moveTo(outer[0][0], outer[0][1]);
      for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i][0], outer[i][1]);
      for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
      ctx.closePath();
      ctx.fill();
      // hot white core along the middle of the crescent
      const mid = [];
      for (let i = 0; i <= N; i++) {
        const k = i / N;
        const ang = a0 + (a1 - a0) * k;
        const taper = Math.sin(Math.pow(k, 0.62) * Math.PI);
        const rr2 = Math.max(1, rr + Math.sin(k * Math.PI) * s.width * 0.16);
        mid.push([s.x + Math.cos(ang) * rr2, s.y + Math.sin(ang) * rr2, 0.15 + taper * 0.85]);
      }
      ctx.globalAlpha = Math.min(1, alpha * 1.0);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, s.width * 0.2);
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let i = 0; i < mid.length; i++) {
        if (i === 0) ctx.moveTo(mid[i][0], mid[i][1]); else ctx.lineTo(mid[i][0], mid[i][1]);
      }
      ctx.stroke();
      // outer glow hugs the crescent instead of forming a ring
      if (s.glow) {
        ctx.globalAlpha = Math.min(1, alpha * 0.09);
        ctx.fillStyle = s.color;
        ctx.beginPath();
        ctx.moveTo(outer[0][0], outer[0][1]);
        for (let i = 1; i < outer.length; i++) ctx.lineTo(outer[i][0], outer[i][1]);
        for (let i = inner.length - 1; i >= 0; i--) ctx.lineTo(inner[i][0], inner[i][1]);
        ctx.closePath();
        ctx.lineWidth = 26;
        ctx.strokeStyle = s.color;
        ctx.stroke();
      }
    }
    ctx.restore();
  },

  drawParts(ctx) {
    ctx.save();
    for (const p of this.parts) {
      const lt = p.life / p.max;
      const a = Math.min(1, lt * 1.6) * (p.fade != null ? Math.min(1, p.fade) : 1);
      if (p.type === 'smoke') {
        ctx.globalAlpha = lt * 0.22;
        ctx.fillStyle = p.color;
        const s = Math.max(0.5, p.size * (1.6 - lt * 0.6));
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
      } else if (p.type === 'streak') {
        ctx.globalAlpha = Math.min(1, lt * 2.2);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.size;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.028, p.y - p.vy * 0.028);
        ctx.stroke();
      } else if (p.type === 'dot') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = lt;
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, Math.max(0.5, p.size * 3));
        g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(255,180,80,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * 3), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.type === 'blob') {
        ctx.globalAlpha = Math.min(1, lt * 2);
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.ellipse(p.x, p.y, p.size * 1.6, p.size, p.rot, 0, TAU); ctx.fill();
      } else if (p.type === 'shard') {
        ctx.globalAlpha = Math.min(1, lt * 3);
        ctx.save();
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        const s = p.size;
        ctx.moveTo(-s, -s * 0.4); ctx.lineTo(s * 0.4, -s * 0.9); ctx.lineTo(s * 0.9, s * 0.2);
        ctx.lineTo(-s * 0.2, s * 0.8); ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 0.8; ctx.stroke();
        ctx.restore();
      } else if (p.type === 'limb') {
        ctx.globalAlpha = Math.min(1, lt * 4);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size;
        drawSeveredPiece(ctx, p.limbKind, s, p.color);
        ctx.restore();
      } else if (p.type === 'ember') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = lt * 0.9;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(0.5, p.size * (0.5 + lt)), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, p.size, p.size);
      }
    }
    ctx.restore();
  },

  drawTop(ctx) {
    ctx.save();
    // impact radial lines
    ctx.globalCompositeOperation = 'lighter';
    for (const im of this.impacts) {
      const t = 1 - im.life / im.max;
      const a = Math.pow(1 - t, 1.5);
      ctx.globalAlpha = a;
      ctx.strokeStyle = im.color;
      ctx.lineCap = 'round';
      for (const ln of im.lines) {
        const r0 = 12 + t * 30;
        const r1 = r0 + ln.len * (0.5 + t * 0.9);
        ctx.lineWidth = ln.w * (1 - t);
        ctx.beginPath();
        ctx.moveTo(im.x + Math.cos(ln.a) * r0, im.y + Math.sin(ln.a) * r0);
        ctx.lineTo(im.x + Math.cos(ln.a) * r1, im.y + Math.sin(ln.a) * r1);
        ctx.stroke();
      }
    }
    ctx.restore();

    // floating text
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const t of this.texts) {
      const lt = t.life / t.max;
      const popIn = t.pop ? clamp((1 - lt) * 7, 0, 1) : 1;
      const sc = 0.5 + easeOut(popIn) * 0.55 + t.grow * (1 - lt);
      const alpha = lt < 0.3 ? lt / 0.3 : 1;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.scale(sc, sc);
      ctx.globalAlpha = alpha;
      ctx.font = `${t.italic ? 'italic ' : ''}${t.weight} ${t.size}px "RB Serif",Georgia,serif`;
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.65)';
      ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, 0, 0);
      ctx.restore();
    }
    ctx.restore();
  },

  // Convenience: full hit burst used by every damaging hit
  hitBurst(x, y, dir, power, kind = 'normal') {
    power *= 1.35;
    if (kind === 'parry') {
      this.sparkBurst(x, y, dir, 1.5, '#bfefff', 22);
      this.impactLines(x, y, dir, 1.4, '#d8f6ff');
      this.ring(x, y, 6, 78, 0.32, 'rgba(190,240,255,0.9)', 3);
      this.ring(x, y, 4, 46, 0.22, 'rgba(255,255,255,0.9)', 2);
    } else if (kind === 'heavy') {
      this.sparkBurst(x, y, dir, power, '#ffd08a', 22);
      this.inkBurst(x, y, dir, power, 9);
      this.impactLines(x, y, dir, power, '#fff0c8');
      this.ring(x, y, 8, 76 * power, 0.32, 'rgba(255,200,130,0.85)', 4.5);
      this.ring(x, y, 4, 44 * power, 0.2, 'rgba(255,255,255,0.9)', 2.5);
    } else if (kind === 'break') {
      this.sparkBurst(x, y, dir, power, '#ff9a6a', 24);
      this.inkBurst(x, y, dir, power, 12);
      this.impactLines(x, y, dir, power * 1.3, '#ffd2b0');
      this.ring(x, y, 8, 90, 0.4, 'rgba(255,160,100,0.9)', 5);
    } else {
      this.sparkBurst(x, y, dir, power, '#ffe6b0', 14);
      this.inkBurst(x, y, dir, power, 5);
      this.impactLines(x, y, dir, 0.8 * power, '#fff2d8');
      this.ring(x, y, 5, 40 * power, 0.22, 'rgba(255,230,190,0.85)', 2.8);
    }
  }
};

/* Severed limb piece rendering: a real chunky body part, not a generic particle. */
function drawSeveredPiece(ctx, kind, s, color) {
  ctx.fillStyle = color || '#c9bfa9';
  ctx.strokeStyle = 'rgba(20,16,18,0.65)';
  ctx.lineWidth = 1.4;
  if (kind === 'head') {
    // skull-like chunk
    ctx.beginPath();
    ctx.moveTo(-s * 0.8, s * 0.15);
    ctx.quadraticCurveTo(-s, -s * 0.7, -s * 0.15, -s);
    ctx.quadraticCurveTo(s * 0.8, -s * 0.9, s, -s * 0.1);
    ctx.quadraticCurveTo(s * 0.85, s * 0.7, s * 0.2, s * 0.8);
    ctx.quadraticCurveTo(-s * 0.4, s * 0.85, -s * 0.8, s * 0.15);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // eye socket
    ctx.fillStyle = '#1a1210';
    ctx.beginPath(); ctx.ellipse(s * 0.35, -s * 0.15, s * 0.22, s * 0.18, 0.2, 0, TAU); ctx.fill();
    // jaw
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-s * 0.3, s * 0.35, s * 0.85, s * 0.14);
    // torn neck
    ctx.fillStyle = '#5a1a16';
    ctx.beginPath(); ctx.ellipse(-s * 0.55, s * 0.5, s * 0.3, s * 0.18, 0.5, 0, TAU); ctx.fill();
  } else if (kind.startsWith('leg')) {
    ctx.lineWidth = s * 0.85;
    ctx.strokeStyle = color || '#b8ac93';
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 1.1, -s * 0.7); ctx.quadraticCurveTo(-s * 0.2, 0, s * 0.7, s * 0.85); ctx.stroke();
    ctx.lineWidth = s * 0.5;
    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath(); ctx.moveTo(-s * 1.1, -s * 0.7); ctx.quadraticCurveTo(-s * 0.2, 0, s * 0.7, s * 0.85); ctx.stroke();
    // torn upper end
    ctx.fillStyle = '#4c1412';
    ctx.beginPath(); ctx.arc(-s * 1.1, -s * 0.7, s * 0.32, 0, TAU); ctx.fill();
    // boot/foot
    ctx.fillStyle = '#2b2520';
    ctx.beginPath(); ctx.ellipse(s * 0.85, s * 0.95, s * 0.55, s * 0.28, 0.4, 0, TAU); ctx.fill();
  } else {
    // arm
    ctx.lineWidth = s * 0.72;
    ctx.strokeStyle = color || '#c9bfa9';
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.9, -s * 0.8); ctx.quadraticCurveTo(0, -s * 0.1, s * 0.8, s * 0.7); ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,0.24)'; ctx.lineWidth = s * 0.36;
    ctx.beginPath(); ctx.moveTo(-s * 0.9, -s * 0.8); ctx.quadraticCurveTo(0, -s * 0.1, s * 0.8, s * 0.7); ctx.stroke();
    // torn shoulder end
    ctx.fillStyle = '#4c1412';
    ctx.beginPath(); ctx.arc(-s * 0.9, -s * 0.8, s * 0.3, 0, TAU); ctx.fill();
    // claw hand
    ctx.strokeStyle = color || '#c9bfa9'; ctx.lineWidth = s * 0.16;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath(); ctx.moveTo(s * 0.8, s * 0.7);
      ctx.lineTo(s * 0.8 + Math.cos(0.6 + i * 0.45) * s * 0.6, s * 0.7 + Math.sin(0.6 + i * 0.45) * s * 0.6);
      ctx.stroke();
    }
  }
}
