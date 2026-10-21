/* =========================================================
   Effects: sparks, dust, rings, threads, ghosts, floating text
   All in world coordinates.
   ========================================================= */
const FX = (() => {
  const parts = [];
  const ghosts = [];
  const texts = [];
  const decals = [];
  const MAXP = 900;

  function reset() {
    parts.length = 0; ghosts.length = 0; texts.length = 0; decals.length = 0;
  }

  function add(p) {
    if (parts.length > MAXP) parts.shift();
    p.life = p.life || 0.5;
    p.maxLife = p.life;
    p.x = p.x || 0; p.y = p.y || 0;
    p.vx = p.vx || 0; p.vy = p.vy || 0;
    p.g = p.g || 0;
    p.drag = p.drag == null ? 0.9 : p.drag;
    p.rot = p.rot || 0;
    p.vrot = p.vrot || 0;
    p.size = p.size || 3;
    p.t = 0;
    parts.push(p);
    return p;
  }

  // ---------- spawners ----------
  function sparks(x, y, dirX, power = 1, tint = '#ffd9a0') {
    const n = Math.round(6 + power * 7);
    for (let i = 0; i < n; i++) {
      const ang = rnd(TAU);
      const sp = rnd(180, 900) * (0.5 + power * 0.35);
      add({
        kind: 'spark', x, y,
        vx: Math.cos(ang) * sp + dirX * 160 * power,
        vy: Math.sin(ang) * sp - 60,
        g: 1500, drag: 0.86,
        life: rnd(0.08, 0.3) + power * 0.03,
        w: rnd(1, 2.6),
        color: Math.random() < 0.25 ? '#fff6e0' : (Math.random() < 0.5 ? tint : '#ff7a3c'),
      });
    }
    // one hot diamond flash
    add({ kind: 'flash', x, y, life: 0.09, size: 16 + power * 12, color: tint });
    add({ kind: 'ring', x, y, life: 0.14 + power * 0.02, size: 6, grow: 110 + power * 55, color: 'rgba(255,178,107,.7)', w: 1.6 });
  }

  function blood(x, y, dirX, n = 8, power = 1) {
    for (let i = 0; i < n; i++) {
      add({
        kind: 'blot', x: x + rnd(10, -10), y: y + rnd(14, -14),
        vx: dirX * rnd(80, 480) * power + rnd(80, -80),
        vy: rnd(-40, 250) * power,
        g: 1500, drag: 0.94,
        life: rnd(0.35, 0.8),
        size: rnd(2, 6) * power,
        color: Math.random() < 0.3 ? '#ff5a32' : '#b81d16',
      });
    }
  }

  function dust(x, y, n = 10, power = 1, dir = 0) {
    for (let i = 0; i < n; i++) {
      add({
        kind: 'dust', x: x + rnd(18, -18), y: y + rnd(4, -4),
        vx: dir * rnd(160, 20) + rnd(90, -90) * power,
        vy: rnd(-30, -110) * power,
        g: -30, drag: 0.9,
        life: rnd(0.3, 0.75),
        size: rnd(7, 20) * power,
        color: 'rgba(120,105,88,',
      });
    }
  }

  function ring(x, y, size, grow, color, life = 0.28, w = 2) {
    add({ kind: 'ring', x, y, life, size, grow, color, w });
  }

  function shock(x, y, dirX, power = 1) {
    add({ kind: 'shock', x, y, life: 0.22, size: 10, grow: 780 * power, color: '#ffcf9a', w: 3.4 });
    add({ kind: 'shock', x, y, life: 0.3, size: 4, grow: 480 * power, color: '#ff5a2a', w: 2 });
    for (let i = 0; i < 4; i++) {
      add({
        kind: 'spark', x: x + rnd(30, -30), y,
        vx: dirX * rnd(900, 300), vy: rnd(-120, 120),
        g: 1200, drag: 0.9, life: rnd(0.15, 0.35), w: rnd(1.5, 3),
        color: '#ffe4b0',
      });
    }
  }

  function threadBurst(x, y, n = 10, power = 1) {
    for (let i = 0; i < n; i++) {
      const ang = rnd(TAU);
      add({
        kind: 'thread', x, y,
        vx: Math.cos(ang) * rnd(60, 420) * power,
        vy: Math.sin(ang) * rnd(60, 380) * power - 80,
        g: 700, drag: 0.94,
        life: rnd(0.5, 1.1),
        size: rnd(10, 26) * power,
        color: Math.random() < 0.5 ? '#ff3b2a' : '#e8d3ae',
        rot: ang, vrot: rnd(4, -4),
      });
    }
  }

  function debris(x, y, n, dirX, colors) {
    for (let i = 0; i < n; i++) {
      const ang = rnd(TAU);
      add({
        kind: 'shard', x, y,
        vx: Math.cos(ang) * rnd(120, 640) + dirX * 200,
        vy: Math.sin(ang) * rnd(120, 520) - 120,
        g: 1700, drag: 0.92,
        life: rnd(0.7, 1.4),
        size: rnd(3, 9),
        rot: rnd(TAU), vrot: rnd(12, -12),
        color: pick(colors || ['#2a2420', '#4a3a2c', '#7a5a3e', '#111']),
      });
    }
  }

  function slashFx(x, y, angle, len, dirSign, opt = {}) {
    add({
      kind: 'crescent', x, y, rot: angle, size: len,
      life: opt.life || 0.16, dir: dirSign,
      color: opt.color || '#fff2d0', tint: opt.tint || '#5ff0e0',
      w: opt.w || 1,
      vrot: (opt.spin || 0),
    });
  }

  function text(x, y, str, opt = {}) {
    texts.push({
      x, y, str, t: 0, life: opt.life || 0.65,
      vy: opt.vy == null ? -80 : opt.vy,
      size: opt.size || 22, color: opt.color || '#ffe9c0',
      glow: opt.glow || 'rgba(255,80,40,.9)',
      font: opt.font || '700 22px "Impact","Arial Black",sans-serif',
      weight: opt.weight || 1,
    });
    if (texts.length > 30) texts.shift();
  }

  function ghost(skeleton, color, life = 0.22) {
    if (!skeleton) return;
    ghosts.push({ sk: skeleton, t: 0, life, color: color || '#ffcf9a' });
  }

  function decal(x, y, rot, size, color, life = 6) {
    decals.push({ x, y, rot, size, color, t: 0, life, maxLife: life });
    if (decals.length > 60) decals.shift();
  }

  // ---------- update ----------
  function update(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.t += dt;
      if (p.t >= p.life) { parts.splice(i, 1); continue; }
      if (p.kind === 'ring' || p.kind === 'shock' || p.kind === 'crescent' || p.kind === 'flash') {
        p.x += (p.vx || 0) * dt; p.y += (p.vy || 0) * dt;
        p.rot += (p.vrot || 0) * dt;
        continue;
      }
      p.vy += p.g * dt;
      const dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vrot * dt;
      if (p.kind === 'shard' || p.kind === 'blot') {
        const gy = WORLD.groundY + 2;
        if (p.y > gy && p.vy > 0) {
          p.y = gy; p.vy *= -0.32; p.vx *= 0.6; p.vrot *= 0.5;
          if (Math.abs(p.vy) < 40) { p.vy = 0; p.y = gy; p.vx *= 0.8; }
          if (p.kind === 'blot' && Math.random() < 0.5) {
            decal(p.x, gy, 0, p.size * rnd(1.6, 0.8), 'rgba(130,18,12,0.55)', 4);
          }
        }
      }
    }
    for (let i = ghosts.length - 1; i >= 0; i--) {
      ghosts[i].t += dt;
      if (ghosts[i].t >= ghosts[i].life) ghosts.splice(i, 1);
    }
    for (let i = texts.length - 1; i >= 0; i--) {
      const tx = texts[i]; tx.t += dt;
      tx.y += tx.vy * dt; tx.vy *= Math.pow(0.9, dt * 60);
      if (tx.t >= tx.life) texts.splice(i, 1);
    }
    for (let i = decals.length - 1; i >= 0; i--) {
      decals[i].t += dt;
      if (decals[i].t >= decals[i].life) decals.splice(i, 1);
    }
  }

  // ---------- drawing ----------
  function drawDecals(ctx) {
    for (const d of decals) {
      const a = 1 - d.t / d.life;
      ctx.save(); ctx.globalAlpha = a * 0.7; ctx.translate(d.x, d.y); ctx.rotate(d.rot);
      ctx.fillStyle = d.color;
      ctx.beginPath(); ctx.ellipse(0, 0, d.size, d.size * 0.45, 0, 0, TAU); ctx.fill();
      ctx.restore();
    }
  }

  function draw(ctx) {
    ctx.save();
    // additive-ish bright particles
    for (const p of parts) {
      const k = p.t / p.life;
      const a = 1 - k;
      if (p.kind === 'spark') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = p.w * (0.4 + a * 0.9);
        ctx.lineCap = 'round';
        const lx = p.vx * 0.022, ly = p.vy * 0.022;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - lx, p.y - ly); ctx.stroke();
      } else if (p.kind === 'flash') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * 0.9;
        const s = p.size * (0.6 + k * 1.6);
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, s);
        g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, p.color); g.addColorStop(1, 'rgba(255,120,50,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, s, 0, TAU); ctx.fill();
      } else if (p.kind === 'ring' || p.kind === 'shock') {
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = a * (p.kind === 'shock' ? 0.8 : 0.65);
        const r = p.size + p.grow * Ease.outCubic(k);
        ctx.strokeStyle = p.color; ctx.lineWidth = Math.max(0.5, p.w * a);
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.stroke();
      } else if (p.kind === 'crescent') {
        // tapered blade arc: filled crescent with a white hot core
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        const s = p.size;
        const alpha = a;
        const spread = 0.95 * (1 - k * 0.45);
        const rr = s * (0.72 + k * 0.42);
        const thick = 13 * p.w * (0.85 - k * 0.55);
        const seg = 18;
        ctx.globalAlpha = alpha * 0.75;
        ctx.beginPath();
        for (let i = 0; i <= seg; i++) {
          const u = -spread + (2 * spread) * (i / seg);
          const taper = Math.pow(Math.cos((u / spread) * Math.PI / 2), 0.65);
          const r0 = rr - thick * taper * 0.5;
          ctx.lineTo(Math.cos(u) * r0, Math.sin(u) * r0);
        }
        for (let i = seg; i >= 0; i--) {
          const u = -spread + (2 * spread) * (i / seg);
          const taper = Math.pow(Math.cos((u / spread) * Math.PI / 2), 0.65);
          const r1 = rr + thick * taper * 0.5;
          ctx.lineTo(Math.cos(u) * r1, Math.sin(u) * r1);
        }
        ctx.closePath();
        const cg = ctx.createLinearGradient(-rr, 0, rr, 0);
        cg.addColorStop(0, 'rgba(255,255,255,0)');
        cg.addColorStop(0.35, p.tint);
        cg.addColorStop(0.62, p.color);
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cg;
        ctx.fill();
        // hot inner edge
        ctx.globalAlpha = alpha * 0.9;
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.6 * p.w;
        ctx.beginPath();
        for (let i = 0; i <= seg; i++) {
          const u = -spread * 0.82 + (1.64 * spread) * (i / seg);
          const taper = Math.pow(Math.cos((u / spread) * Math.PI / 2), 0.4);
          const r0 = rr - thick * taper * 0.34;
          ctx.lineTo(Math.cos(u) * r0, Math.sin(u) * r0);
        }
        ctx.stroke();
        ctx.restore();
      } else if (p.kind === 'thread') {      } else if (p.kind === 'thread') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * 0.85;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        const nx = Math.cos(p.rot) * p.size, ny = Math.sin(p.rot) * p.size;
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x - ny * 0.3, p.y + nx * 0.3, p.x - nx, p.y - ny);
        ctx.stroke();
      } else if (p.kind === 'dust') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a * 0.33;
        ctx.fillStyle = p.color + (a * 0.5).toFixed(2) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (0.7 + k * 1.3), 0, TAU); ctx.fill();
      } else if (p.kind === 'blot') {
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      } else if (p.kind === 'shard') {
        ctx.save();
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = a;
        ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.moveTo(-p.size, -p.size * 0.4);
        ctx.lineTo(p.size * 0.7, -p.size);
        ctx.lineTo(p.size, p.size * 0.6);
        ctx.lineTo(-p.size * 0.6, p.size);
        ctx.closePath(); ctx.fill();
        ctx.restore();
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.restore();

    // floating texts
    for (const t of texts) {
      const k = t.t / t.life;
      const a = k < 0.15 ? k / 0.15 : 1 - Math.pow((k - 0.15) / 0.85, 2);
      ctx.save();
      ctx.globalAlpha = Math.max(0, a);
      ctx.font = t.font;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.shadowColor = t.glow; ctx.shadowBlur = 12;
      ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(10,4,2,.85)';
      ctx.strokeText(t.str, t.x, t.y);
      ctx.fillStyle = t.color;
      ctx.fillText(t.str, t.x, t.y);
      ctx.restore();
    }
  }

  function drawGhosts(ctx) {
    for (const g of ghosts) {
      const a = 1 - g.t / g.life;
      ctx.save();
      ctx.globalAlpha = a * 0.32;
      ctx.globalCompositeOperation = 'lighter';
      if (typeof drawPlayerSkeleton === 'function') drawPlayerSkeleton(ctx, g.sk, { ghost: true, color: g.color, alpha: a });
      ctx.restore();
    }
  }

  // ---- blade trail: a persistent ribbon of recent sword-tip samples ----
  const trail = { pts: [], active: false, t: 0 };
  function trailPush(x, y, iv, len, ang) {
    trail.pts.push({ x, y, t: 0, iv, len });
    if (trail.pts.length > 26) trail.pts.shift();
  }
  function trailReset() { trail.pts.length = 0; }
  function trailUpdate(dt) {
    for (const p of trail.pts) p.t += dt;
    while (trail.pts.length && trail.pts[0].t > 0.12) trail.pts.shift();
  }
  function trailDraw(ctx) {
    const pts = trail.pts;
    if (pts.length < 4) return;
    // resample into one smooth ribbon (polyline of the sword hand->tip midpoints)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i], b = pts[i - 1];
      const age = a.t / 0.12;
      const k = 1 - age;
      if (k <= 0) continue;
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (d > 90) continue; // skip teleport-sized jumps
      const fade = k * k;
      ctx.globalAlpha = fade * 0.30 + 0.04;
      ctx.strokeStyle = '#63e6dc';
      ctx.lineWidth = 2.2 + 5.5 * fade;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
      ctx.globalAlpha = fade * 0.55;
      ctx.strokeStyle = '#eafffb';
      ctx.lineWidth = 0.8 + 1.8 * fade;
      ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(a.x, a.y); ctx.stroke();
    }
    ctx.restore();
  }

  return { reset, update, draw, drawDecals, drawGhosts, sparks, blood, dust, ring, shock, threadBurst, debris, slashFx, text, ghost, decal, add,
    trailPush, trailReset, trailUpdate, trailDraw, trail };
})();
