'use strict';
/* ============================================================
   Drawing helpers — Canvas2D primitives, particles, camera
   ============================================================ */
const W = 960, H = 540, GROUND_Y = 474, GROUND_SCREEN = 500;

const Palette = {
  sky0: '#070a16', sky1: '#151a33', sky2: '#2a2547',
  ink: '#05060c', bone: '#eef2ff', paper: '#dfe6f7',
  crimson: '#e8324f', crimsonDk: '#8c1229', gold: '#ffcf6e',
  cyan: '#7cf5ff', wood: '#c8915c', woodDk: '#7a4a2a',
  silk: '#f2e9da'
};

const Camera = {
  x: 0, y: 0, shake: 0, shakeX: 0, shakeY: 0, trauma: 0, dir: 1, zoom: 1.2,
  init() { this.x = 0; this.y = 0; this.trauma = 0; this.shake = 0; },
  kick(amount) { this.trauma = Math.min(1, this.trauma + amount); },
  update(dt, target) {
    const vw = W / this.zoom;
    const look = (target.facing || 1) * 46;
    const tx = clamp(target.x + look - vw / 2, 0, WORLD.w - vw);
    this.x = lerp(this.x, tx, 1 - Math.pow(0.0009, dt));
    this.trauma = Math.max(0, this.trauma - dt * 1.35);
    const s = this.trauma * this.trauma;
    this.shake = s * 16;
    this.shakeX = rand(-1, 1) * this.shake;
    this.shakeY = rand(-1, 1) * this.shake * 0.7;
  }
};

/* Context transform helper: world coords + shake */
function beginWorld(ctx) {
  ctx.save();
  const z = Camera.zoom, vw = W / z;
  ctx.translate(W / 2 + Camera.shakeX, GROUND_SCREEN + Camera.shakeY);
  ctx.scale(z, z);
  ctx.translate(-(Camera.x + vw / 2), -GROUND_Y);
}
function endWorld(ctx) { ctx.restore(); }
function screenOf(x, y) {
  const z = Camera.zoom, vw = W / z;
  return { x: (x - Camera.x - vw / 2) * z + W / 2 + Camera.shakeX, y: (y - GROUND_Y) * z + GROUND_SCREEN + Camera.shakeY };
}

/* ---------- shape helpers ---------- */
function capsule(ctx, x, y, x2, y2, w) {
  ctx.beginPath();
  const a = Math.atan2(y2 - y, x2 - x);
  ctx.arc(x, y, w / 2, a + Math.PI / 2, a - Math.PI / 2);
  ctx.arc(x2, y2, w / 2, a - Math.PI / 2, a + Math.PI / 2);
  ctx.closePath();
}
function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function glowCircle(ctx, x, y, r, color, alpha = 1) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = alpha;
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  ctx.globalAlpha = 1;
}
function poly(ctx, pts, close = true) {
  ctx.beginPath();
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) ctx.lineTo(pts[i], pts[i + 1]);
  if (close) ctx.closePath();
}

/* ============================================================
   Background — moonlit bamboo forest, parallax
   ============================================================ */
const Background = {
  lanterns: [],
  petals: [],
  init() {
    this.lanterns = [];
    for (let i = 0; i < 14; i++) {
      this.lanterns.push({ x: 120 + i * 220 + hash1(i) * 90, y: 90 + hash1(i + 9) * 120, r: 7 + hash1(i + 3) * 4, ph: hash1(i + 5) * TAU });
    }
    this.petals = [];
    for (let i = 0; i < 46; i++) {
      this.petals.push({
        x: Math.random() * W, y: Math.random() * H, s: 2 + Math.random() * 3,
        vx: -18 - Math.random() * 26, vy: 12 + Math.random() * 22,
        rot: Math.random() * TAU, spin: rand(-2, 2), ph: Math.random() * TAU
      });
    }
  },
  update(dt) {
    for (const p of this.petals) {
      p.x += (p.vx + Math.sin(Game.time * 0.7 + p.ph) * 12) * dt;
      p.y += p.vy * dt;
      p.rot += p.spin * dt;
      if (p.x < -10) { p.x = W + 10; p.y = Math.random() * H; }
      if (p.y > H + 10) { p.y = -10; p.x = Math.random() * W; }
    }
  },
  draw(ctx) {
    /* sky */
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, Palette.sky0);
    sky.addColorStop(0.55, Palette.sky1);
    sky.addColorStop(1, '#1b1730');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H);

    /* moon */
    const mx = W * 0.74 - Camera.x * 0.04, my = 152 - Camera.y * 0.03;
    glowCircle(ctx, mx, my, 250, 'rgba(255,190,160,0.14)', 1);
    ctx.save();
    const mg = ctx.createRadialGradient(mx - 18, my - 18, 8, mx, my, 78);
    mg.addColorStop(0, '#fff1de'); mg.addColorStop(0.7, '#f2cfb2'); mg.addColorStop(1, '#d9a98f');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, 76, 0, TAU); ctx.fill();
    ctx.globalAlpha = 0.10; ctx.fillStyle = '#7a5a50';
    ctx.beginPath(); ctx.arc(mx - 20, my - 10, 14, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 24, my + 18, 20, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + 6, my - 30, 9, 0, TAU); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.restore();

    /* distant ridge */
    ctx.fillStyle = '#0e1024';
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let x = 0; x <= W; x += 40) {
      const wx = x + Camera.x * 0.08;
      ctx.lineTo(x, 300 + Math.sin(wx * 0.004) * 34 + Math.sin(wx * 0.011 + 2) * 16);
    }
    ctx.lineTo(W, H); ctx.closePath(); ctx.fill();

    /* far bamboo layer */
    this.drawBamboo(ctx, 0.16, '#101428', 26, 0.55);
    /* mist band */
    const mist = ctx.createLinearGradient(0, 300, 0, 470);
    mist.addColorStop(0, 'rgba(120,140,190,0)');
    mist.addColorStop(0.7, 'rgba(120,140,190,0.10)');
    mist.addColorStop(1, 'rgba(120,140,190,0)');
    ctx.fillStyle = mist; ctx.fillRect(0, 300, W, 170);
    /* mid bamboo */
    this.drawBamboo(ctx, 0.42, '#0b0d1b', 16, 1);
    /* near bamboo (behind gameplay) */
    this.drawBamboo(ctx, 0.78, '#06080f', 8, 1.55);
    /* hanging lanterns */
    for (const l of this.lanterns) {
      const x = l.x - Camera.x * 0.55;
      if (x < -60 || x > W + 60) continue;
      const sway = Math.sin(Game.time * 0.9 + l.ph) * 6;
      const y = l.y + sway * 0.4;
      ctx.strokeStyle = 'rgba(15,15,28,0.9)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + sway * 0.2, y - l.r); ctx.stroke();
      glowCircle(ctx, x, y, 46, 'rgba(255,140,90,0.18)', 1);
      const g = ctx.createLinearGradient(x, y - l.r, x, y + l.r);
      g.addColorStop(0, '#ffb27a'); g.addColorStop(1, '#e2532e');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.ellipse(x, y, l.r * 0.8, l.r, 0, 0, TAU); ctx.fill();
      ctx.fillStyle = 'rgba(30,12,8,0.65)';
      ctx.fillRect(x - l.r * 0.85, y - l.r * 0.95, l.r * 1.7, 3);
      ctx.fillRect(x - l.r * 0.85, y + l.r * 0.85, l.r * 1.7, 3);
    }
  },
  drawBamboo(ctx, parallax, color, count, scale) {
    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < count; i++) {
      const seed = i * 3.7 + (parallax > 0.5 ? 200 : parallax > 0.3 ? 100 : 0);
      const bx = ((seed * 173.3) % (W + 300)) - 150 - Camera.x * parallax;
      const w = (7 + hash1(seed) * 7) * scale;
      const lean = (hash1(seed + 1) - 0.5) * 26 * scale;
      const topY = 40 - hash1(seed + 2) * 90;
      const sway = Math.sin(Game.time * 0.6 + seed) * 3 * scale;
      ctx.beginPath();
      ctx.moveTo(bx, H);
      ctx.quadraticCurveTo(bx + lean * 0.4 + sway, 300, bx + lean + sway, topY);
      ctx.lineTo(bx + lean + sway + w, topY);
      ctx.quadraticCurveTo(bx + lean * 0.4 + sway + w, 300, bx + w, H);
      ctx.closePath(); ctx.fill();
      /* nodes */
      ctx.strokeStyle = 'rgba(255,255,255,0.045)';
      ctx.lineWidth = 1.4;
      for (let k = 0; k < 7; k++) {
        const t = k / 7;
        const nx = bx + lerp(0, lean + sway, t * 0.9) + w / 2;
        const ny = lerp(H, topY, t);
        ctx.beginPath(); ctx.moveTo(nx - w / 2, ny); ctx.lineTo(nx + w / 2, ny); ctx.stroke();
      }
      /* leaves */
      if (parallax > 0.3) {
        ctx.fillStyle = color;
        for (let k = 0; k < 4; k++) {
          const t = 0.25 + hash1(seed + k + 7) * 0.7;
          const nx = bx + lerp(0, lean + sway, t);
          const ny = lerp(H, topY, t);
          const dir = (k % 2 ? 1 : -1);
          const ll = (30 + hash1(seed + k) * 40) * scale * 0.5;
          ctx.beginPath();
          ctx.moveTo(nx, ny);
          ctx.quadraticCurveTo(nx + dir * ll * 0.6, ny - 12 * scale, nx + dir * ll, ny + 4 * scale);
          ctx.quadraticCurveTo(nx + dir * ll * 0.5, ny + 4 * scale, nx, ny + 2 * scale);
          ctx.fill();
        }
      }
    }
    ctx.restore();
  },
  drawGround(ctx) {
    /* stone platform */
    const g = ctx.createLinearGradient(0, GROUND_Y - 6, 0, H);
    g.addColorStop(0, '#2a2440'); g.addColorStop(0.25, '#171428'); g.addColorStop(1, '#08070f');
    ctx.fillStyle = g;
    ctx.fillRect(0, GROUND_Y, WORLD.w, H - GROUND_Y + 120);
    /* front lip */
    ctx.fillStyle = 'rgba(200,175,255,0.16)';
    ctx.fillRect(0, GROUND_Y - 2, WORLD.w, 2);
    ctx.fillStyle = 'rgba(120,100,180,0.10)';
    ctx.fillRect(0, GROUND_Y, WORLD.w, 7);
    /* floor seams */
    for (let x = 0; x < WORLD.w; x += 96) {
      ctx.strokeStyle = 'rgba(150,140,210,0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y + 8); ctx.lineTo(x - 30, H + 60); ctx.stroke();
    }
    /* petal drift shadow on floor */
    ctx.fillStyle = 'rgba(232,50,79,0.05)';
    ctx.fillRect(0, GROUND_Y + 2, WORLD.w, 2);
  },
  drawPetals(ctx) {
    ctx.save();
    ctx.translate(-Camera.x * 0.25, 0);
    for (const p of this.petals) {
      ctx.save();
      ctx.translate(p.x + Camera.x * 0.25 * 0.6, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = 'rgba(255,150,175,0.35)';
      ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }
};

/* ============================================================
   Particle system — sparks, dust, slashes, afterimages
   ============================================================ */
const FX = {
  parts: [],
  slashes: [],
  rings: [],
  texts: [],
  after: [],
  trail: [],
  clear() { this.parts.length = 0; this.slashes.length = 0; this.rings.length = 0; this.texts.length = 0; this.after.length = 0; this.trail.length = 0; },
  addTrail(bx, by, tx, ty, color, width) {
    this.trail.push({ bx, by, tx, ty, color: color || '200,240,255', w: width || 1, life: 0.075, max: 0.075 });
    if (this.trail.length > 22) this.trail.shift();
  },
  emitSwordTrail(pl, root, tip) {
    if (root) this.addTrail(root.x, root.y, tip.x, tip.y, this.swingColor, 1);
  },
  drawTrails(ctx) {
    const tr = this.trail;
    if (tr.length < 2) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 1; i < tr.length; i++) {
      const a = tr[i - 1], b = tr[i];
      const al = clamp(b.life / b.max, 0, 1);
      if (al <= 0) continue;
      const k = Math.pow(i / tr.length, 1.5);
      /* taper: use only the outer half of the blade sweep */
      const abx = lerp(a.bx, a.tx, 0.42), aby = lerp(a.by, a.ty, 0.42);
      const bbx = lerp(b.bx, b.tx, 0.42), bby = lerp(b.by, b.ty, 0.42);
      ctx.beginPath();
      ctx.moveTo(abx, aby);
      ctx.lineTo(a.tx, a.ty);
      ctx.lineTo(b.tx, b.ty);
      ctx.lineTo(bbx, bby);
      ctx.closePath();
      ctx.fillStyle = 'rgba(' + b.color + ',' + (0.20 * al * k) + ')';
      ctx.fill();
      /* bright outer edge */
      ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * al * k) + ')';
      ctx.lineWidth = 1.2 * b.w * (0.4 + 0.6 * k);
      ctx.beginPath(); ctx.moveTo(a.tx, a.ty); ctx.lineTo(b.tx, b.ty); ctx.stroke();
    }
    ctx.restore();
  },
  spark(x, y, dir, power = 1, color = '#ffe9b0', count = 10) {
    for (let i = 0; i < count; i++) {
      const a = dir + rand(-0.85, 0.85);
      const sp = rand(140, 620) * power;
      this.parts.push({
        type: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60,
        life: rand(0.12, 0.34), max: 0.34, w: rand(1.2, 3.4) * power, color, grav: 900, drag: 3.5
      });
    }
    /* dust puff */
    for (let i = 0; i < 4; i++) {
      this.parts.push({
        type: 'dust', x: x + rand(-10, 10), y: y + rand(-10, 10), vx: rand(-90, 90), vy: rand(-150, -20),
        life: rand(0.25, 0.5), max: 0.5, r: rand(8, 22), color: 'rgba(210,200,240,', grav: 60, drag: 2
      });
    }
  },
  crack(x, y, dir, power = 1) {
    for (let i = 0; i < 14; i++) {
      const a = dir + rand(-1.4, 1.4);
      const sp = rand(220, 760) * power;
      this.parts.push({
        type: 'chip', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140,
        life: rand(0.5, 0.95), max: 0.95, w: rand(2.5, 6), color: pick(['#d8a066', '#a86f3c', '#f3dcae', '#6c3f22']),
        grav: 1500, drag: 1.4, rot: Math.random() * TAU, spin: rand(-14, 14)
      });
    }
  },
  blood(x, y, dir, amount = 1) {
    for (let i = 0; i < 9 * amount; i++) {
      const a = dir + rand(-1.1, 1.1);
      const sp = rand(100, 460) * amount;
      this.parts.push({
        type: 'ink', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80,
        life: rand(0.3, 0.7), max: 0.7, r: rand(1.6, 4.2), color: '#ff4d63', grav: 1100, drag: 2.2
      });
    }
  },
  ring(x, y, r0, r1, life, color = 'rgba(255,220,160,', width = 3) {
    this.rings.push({ x, y, r0, r1, life, max: life, color, width });
  },
  slash(x, y, ang, radius, arc, life, color, width) {
    this.slashes.push({ x, y, ang, radius, arc, life, max: life, color, width });
  },
  afterimage(snap, life = 0.22, color = 'rgba(150,225,255,', ) {
    this.after.push({ snap, life, max: life, color });
  },
  text(x, y, str, color = '#ffe9b0', size = 20) {
    this.texts.push({ x, y, str, color, size, life: 0.8, max: 0.8, vy: -46 });
  },
  update(dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.life -= dt;
      if (p.life <= 0) { this.parts.splice(i, 1); continue; }
      p.vy += (p.grav || 0) * dt;
      const d = Math.pow(0.5, (p.drag || 0) * dt);
      p.vx *= d; p.vy *= d;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.type === 'chip' && p.y > GROUND_Y - 2) { p.y = GROUND_Y - 2; p.vy *= -0.35; p.vx *= 0.7; p.spin *= 0.7; }
      if (p.rot !== undefined) p.rot += p.spin * dt;
    }
    for (let i = this.slashes.length - 1; i >= 0; i--) { this.slashes[i].life -= dt; if (this.slashes[i].life <= 0) this.slashes.splice(i, 1); }
    for (let i = this.rings.length - 1; i >= 0; i--) { this.rings[i].life -= dt; if (this.rings[i].life <= 0) this.rings.splice(i, 1); }
    for (let i = this.texts.length - 1; i >= 0; i--) { const t = this.texts[i]; t.life -= dt; t.y += t.vy * dt; t.vy *= 0.92; if (t.life <= 0) this.texts.splice(i, 1); }
    for (let i = this.after.length - 1; i >= 0; i--) { this.after[i].life -= dt; if (this.after[i].life <= 0) this.after.splice(i, 1); }
    for (let i = this.trail.length - 1; i >= 0; i--) { this.trail[i].life -= dt; if (this.trail[i].life <= 0) this.trail.splice(i, 1); }
  },
  draw(ctx) {
    /* afterimages */
    for (const a of this.after) {
      const t = a.life / a.max;
      ctx.save();
      ctx.globalAlpha = Math.pow(t, 1.4) * 0.85;
      ctx.globalCompositeOperation = 'lighter';
      a.snap(ctx, a.color, t);
      ctx.restore();
    }
    /* crescent slash flashes — tapered brush strokes along an arc */
    for (const s of this.slashes) {
      const t = 1 - s.life / s.max;
      const a = Math.pow(1 - t, 1.25);
      const reveal = clamp(t * 3.4, 0, 1);
      const sweep = s.arc * easeOutCubic(reveal);
      const rad = s.radius * (0.95 + 0.09 * easeOutCubic(t));
      const baseCol = s.color.slice(5, -1);
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.ang);
      ctx.globalCompositeOperation = 'lighter';
      const N = 22;
      const a0 = -sweep / 2, a1 = sweep / 2;
      const maxW = s.width * 3.4;
      const arcPts = (rr) => {
        const pts = [];
        for (let i = 0; i <= N; i++) {
          const u = i / N, ang = lerp(a0, a1, u);
          const w = maxW * Math.pow(Math.sin(Math.PI * u), 0.62);
          pts.push({ ang, r: rr, w });
        }
        return pts;
      };
      const passes = [
        { r: rad, widthMul: 2.4, col: 'rgba(' + baseCol + ',' + (0.10 * a) + ')', fill: true },
        { r: rad, widthMul: 1.0, col: 'rgba(' + baseCol + ',' + (0.34 * a) + ')', fill: true },
        { r: rad, widthMul: 0.38, col: 'rgba(255,255,255,' + (0.80 * a) + ')', fill: true }
      ];
      for (const pass of passes) {
        ctx.beginPath();
        /* outer edge */
        for (let i = 0; i <= N; i++) {
          const u = i / N, ang = lerp(a0, a1, u);
          const w = maxW * pass.widthMul * Math.pow(Math.sin(Math.PI * u), 0.62);
          const rr = pass.r + w / 2;
          const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        /* inner edge back */
        for (let i = N; i >= 0; i--) {
          const u = i / N, ang = lerp(a0, a1, u);
          const w = maxW * pass.widthMul * Math.pow(Math.sin(Math.PI * u), 0.62);
          const rr = pass.r - w / 2;
          ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = pass.col;
        ctx.fill();
      }
      /* motion smear trailing the blade */
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const u = i / N, ang = lerp(a0, a1, u);
        const rr = rad + maxW * 0.5 + 22 * Math.sin(Math.PI * u) * (1 - a);
        const x = Math.cos(ang) * rr, y = Math.sin(ang) * rr;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = 'rgba(' + baseCol + ',' + (0.10 * a) + ')';
      ctx.lineWidth = 1.2;
      ctx.stroke();
      ctx.restore();
    }
    /* sword trails */
    this.drawTrails(ctx);
    /* rings */
    for (const r of this.rings) {
      const t = 1 - r.life / r.max;
      const rad = lerp(r.r0, r.r1, easeOutCubic(t));
      ctx.strokeStyle = r.color + (1 - t) + ')';
      ctx.lineWidth = r.width * (1 - t) + 0.4;
      ctx.beginPath(); ctx.arc(r.x, r.y, rad, 0, TAU); ctx.stroke();
    }
    /* particles */
    ctx.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      const a = clamp(p.life / p.max, 0, 1);
      if (p.type === 'spark') {
        ctx.strokeStyle = p.color;
        ctx.globalAlpha = a;
        ctx.lineWidth = p.w;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x - p.vx * 0.018, p.y - p.vy * 0.018);
        ctx.stroke();
      } else if (p.type === 'ink') {
        ctx.fillStyle = p.color; ctx.globalAlpha = a;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (0.5 + a * 0.5), 0, TAU); ctx.fill();
      } else if (p.type === 'dust') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = p.color + (a * 0.20) + ')';
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.6 - a), 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    /* wood chips (solid, with outline) */
    for (const p of this.parts) {
      if (p.type !== 'chip') continue;
      const a = clamp(p.life / p.max, 0, 1);
      ctx.save();
      ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    /* floating texts */
    for (const t of this.texts) {
      const a = clamp(t.life / t.max * 1.6, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.font = `900 ${t.size}px "Crimson SC", "Trebuchet MS", system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(5,6,12,0.9)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  }
};
