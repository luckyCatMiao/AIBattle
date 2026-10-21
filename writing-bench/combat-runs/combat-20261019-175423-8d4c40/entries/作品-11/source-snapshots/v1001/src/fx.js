// ============================================================
// fx.js — 粒子 / 残骸(Gib) / 刀光轨迹 / 冲击特效
// ============================================================
const FX = {
  ps: [], gibs: [], trails: [], ghosts: [],
  reset() { this.ps.length = 0; this.gibs.length = 0; this.trails.length = 0; this.ghosts.length = 0; },
  // ---- 粒子 ----
  spark(x, y, n, dir, spread, col, spd) {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(rand(-1, 1) * spread, dir + rand(-0.6, 0.6) * spread);
      const v = rand(0.35, 1) * spd;
      this.ps.push({ t: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: rand(0.1, 0.26), max: 0.26, col, w: rand(1, 2.4) });
    }
  },
  chips(x, y, n, col, spd = 260) {
    for (let i = 0; i < n; i++) {
      this.ps.push({ t: 'chip', x, y, vx: rand(-1, 1) * spd, vy: rand(-1.2, 0.2) * spd, rot: rand(TAU), vr: rand(-9, 9), life: rand(0.4, 0.9), max: 0.9, col: col || (chance(0.5) ? '#c99a5e' : '#8a5a34'), w: rand(2, 4.5), grav: 1 });
    }
  },
  dust(x, y, n, spd = 90, col = 'rgba(180,150,110,') {
    for (let i = 0; i < n; i++) {
      this.ps.push({ t: 'dust', x: x + rand(-8, 8), y: y + rand(-4, 2), vx: rand(-1, 1) * spd, vy: rand(-0.6, -0.05) * spd, life: rand(0.3, 0.7), max: 0.7, col, w: rand(4, 10) });
    }
  },
  ring(x, y, r0, r1, life, col, lw = 2) { this.ps.push({ t: 'ring', x, y, r0, r1, life, max: life, col, lw }); },
  flash(x, y, r, life, col) { this.ps.push({ t: 'flash', x, y, r, life, max: life, col: col || '#ffffff' }); },
  lines(x, y, dir, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(-1.2, 1.2) + (dir > 0 ? 0 : PI);
      const len = rand(26, 70);
      this.ps.push({ t: 'line', x, y, a, len, life: rand(0.08, 0.18), max: 0.18, col: chance(0.4) ? '#fff6d8' : '#ffd98a' });
    }
  },
  puffString(x, y) { // 断线
    for (let i = 0; i < 3; i++) this.ps.push({ t: 'chip', x, y, vx: rand(-40, 40), vy: rand(20, 80), rot: rand(TAU), vr: rand(-4, 4), life: 0.5, max: 0.5, col: '#d8d2c4', w: 1.5, grav: 0.4 });
  },
  // ---- 残骸 ----
  gib(x, y, kind, e, vx, vy) {
    this.gibs.push({
      x, y, vx, vy, rot: rand(-0.4, 0.4), vr: rand(-7, 7) * (chance(0.5) ? 1 : -1),
      kind, type: e.type, pal: e.pal, scale: e.scale, face: e.face, weapon: e.weapon,
      life: rand(2.6, 3.6), max: 3.6, rest: false,
      l1: 16 * e.scale, l2: 15 * e.scale, r: 9 * e.scale,
    });
  },
  weaponGib(x, y, weapon, pal, scale, vx, vy) {
    this.gibs.push({ x, y, vx, vy, rot: rand(TAU), vr: rand(-12, 12), kind: 'weapon', weapon, pal, scale, life: 2.8, max: 2.8, rest: false, l1: 0, l2: 0, r: 6 });
  },
  trail(col) { const tr = { pts: [], col }; this.trails.push(tr); return tr; },
  ghost(e) {
    if (!e.sk) return;
    this.ghosts.push({
      bones: e.sk.bones.map(b => ({ ax: b.ax, ay: b.ay, bx: b.bx, by: b.by, w: b.w })),
      head: e.sk.head ? { x: e.sk.head.x, y: e.sk.head.y, r: e.sk.head.r } : null,
      life: 0.22, max: 0.22, col: e.type ? 'rgba(255,150,120,' : 'rgba(150,220,240,',
    });
  },
  update(dt) {
    const gy = GROUND_Y;
    for (let i = this.ps.length - 1; i >= 0; i--) {
      const p = this.ps[i];
      p.life -= dt;
      if (p.life <= 0) { this.ps.splice(i, 1); continue; }
      if (p.t === 'spark') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy = p.vy * 0.92 + 300 * dt; }
      else if (p.t === 'chip') {
        p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 1500 * dt * (p.grav || 1); p.rot += p.vr * dt;
        if (p.y > gy) { p.y = gy; p.vy *= -0.35; p.vx *= 0.6; p.vr *= 0.5; }
      }
      else if (p.t === 'dust') { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94; p.w += 14 * dt; }
      else if (p.t === 'mote') { p.x += p.vx * dt + Math.sin(p.life * 20) * 0.6; p.y += p.vy * dt; p.vy *= 0.98; }
    }
    for (let i = this.gibs.length - 1; i >= 0; i--) {
      const g = this.gibs[i];
      g.life -= dt;
      if (g.life <= 0) { this.gibs.splice(i, 1); continue; }
      if (!g.rest) {
        g.x += g.vx * dt; g.y += g.vy * dt;
        g.vy += 1500 * dt; g.rot += g.vr * dt;
        g.x = clamp(g.x, 20, WORLD_W - 20);
        if (g.y > gy - 4) {
          g.y = gy - 4;
          if (Math.abs(g.vy) > 120) {
            g.vy *= -0.38; g.vx *= 0.55; g.vr *= 0.5;
            FX.dust(g.x, gy - 2, 2, 40);
            if (chance(0.7)) SFX.gib();
            if (Math.abs(g.vy) < 140) { g.rest = true; g.vy = 0; g.vx = 0; g.vr = 0; g.rot = Math.round(g.rot / PI) * PI + rand(-0.1, 0.1); }
          } else { g.rest = true; g.vy = 0; g.vx = 0; g.vr = 0; g.rot = Math.round(g.rot / PI) * PI; }
        }
      }
    }
    for (let i = this.trails.length - 1; i >= 0; i--) {
      const tr = this.trails[i];
      for (let j = tr.pts.length - 1; j >= 0; j--) { tr.pts[j].t -= dt; if (tr.pts[j].t <= 0) tr.pts.splice(j, 1); }
      if (!tr.pts.length) this.trails.splice(i, 1);
    }
    for (let i = this.ghosts.length - 1; i >= 0; i--) {
      const gh = this.ghosts[i];
      gh.life -= dt;
      if (gh.life <= 0) this.ghosts.splice(i, 1);
    }
    if (this.ps.length > 500) this.ps.splice(0, this.ps.length - 500);
  },
  // ---- 绘制 ----
  drawGibShape(ctx, g) {
    const pal = g.pal, s = g.scale;
    ctx.lineCap = 'round';
    const bone = (ax, ay, bx, by, w, col) => {
      ctx.strokeStyle = pal.outline; ctx.lineWidth = w + 2;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
      ctx.strokeStyle = col; ctx.lineWidth = w;
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
    };
    if (g.kind === 'head') {
      ctx.beginPath(); ctx.arc(0, 0, g.r, 0, TAU);
      ctx.fillStyle = pal.skin; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = pal.outline; ctx.stroke();
      ctx.fillStyle = pal.outline;
      ctx.beginPath(); ctx.arc(g.r * 0.3, -1, 1.8, 0, TAU); ctx.arc(-g.r * 0.25, -1, 1.8, 0, TAU); ctx.fill();
      ctx.strokeStyle = STUB_COL; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, -g.r + 1); ctx.lineTo(rand(-2, 2), -g.r - 5); ctx.stroke();
    } else if (g.kind === 'armF' || g.kind === 'armB') {
      bone(-8, 0, g.l1 * 0.4, g.l1 * 0.45, 5 * s, pal.cloth);
      bone(g.l1 * 0.4, g.l1 * 0.45, g.l1 * 0.4 + g.l2 * 0.8, g.l1 * 0.45 + g.l2 * 0.3, 4.2 * s, pal.skin);
      ctx.fillStyle = STUB_COL;
      ctx.beginPath(); ctx.arc(-8, 0, 3.4 * s, 0, TAU); ctx.fill();
    } else if (g.kind === 'legF' || g.kind === 'legB') {
      bone(-8, 0, g.l1 * 0.5, -g.l1 * 0.3, 7 * s, pal.cloth2);
      bone(g.l1 * 0.5, -g.l1 * 0.3, g.l1 * 0.5 + g.l2 * 0.9, g.l2 * 0.4, 5.6 * s, pal.boot);
      ctx.fillStyle = STUB_COL;
      ctx.beginPath(); ctx.arc(-8, 0, 3.8 * s, 0, TAU); ctx.fill();
    } else if (g.kind === 'chunk') {
      ctx.fillStyle = pal.cloth;
      ctx.strokeStyle = pal.outline; ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-8, -6); ctx.lineTo(9, -8); ctx.lineTo(12, 4); ctx.lineTo(-2, 9); ctx.lineTo(-10, 2);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = STUB_COL; ctx.fillRect(-3, -4, 6, 6);
    } else if (g.kind === 'weapon') {
      const tmp = { weapon: g.weapon, pal: g.pal, scale: g.scale, facing: 1 };
      drawWeaponShape(ctx, tmp, [0, 0], 0, g.pal, 0);
    }
  },
  drawBelow(ctx) {
    for (const g of this.gibs) {
      const a = clamp(g.life / 0.6, 0, 1);
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(g.x, g.y); ctx.rotate(g.rot);
      this.drawGibShape(ctx, g);
      ctx.restore();
    }
    for (const p of this.ps) {
      if (p.t !== 'dust') continue;
      const k = p.life / p.max;
      ctx.fillStyle = p.col + (0.16 * k) + ')';
      ctx.beginPath(); ctx.arc(p.x, p.y, p.w, 0, TAU); ctx.fill();
    }
  },
  drawAbove(ctx) {
    // 刀光轨迹
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const tr of this.trails) {
      for (let i = 1; i < tr.pts.length; i++) {
        const a = tr.pts[i - 1], b = tr.pts[i];
        const k = clamp(b.t / 0.13, 0, 1);
        ctx.globalAlpha = 0.34 * k;
        ctx.fillStyle = tr.col;
        ctx.beginPath();
        ctx.moveTo(a.bx, a.by); ctx.lineTo(a.tx, a.ty);
        ctx.lineTo(b.tx, b.ty); ctx.lineTo(b.bx, b.by);
        ctx.closePath(); ctx.fill();
      }
      if (tr.pts.length > 1) {
        const tip = tr.pts[tr.pts.length - 1];
        ctx.globalAlpha = 0.5 * clamp(tip.t / 0.13, 0, 1);
        ctx.strokeStyle = tr.col; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(tip.bx, tip.by); ctx.lineTo(tip.tx, tip.ty); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // 火花 / 木屑 / 光斑 / 冲击环
    for (const p of this.ps) {
      const k = clamp(p.life / p.max, 0, 1);
      if (p.t === 'mote') {
        ctx.globalAlpha = k;
        ctx.fillStyle = '#ffe9b0';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.w, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = k * 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.w * 2.2, 0, TAU); ctx.fill();
        ctx.globalCompositeOperation = 'source-over';
      } else if (p.t === 'spark') {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.col; ctx.lineWidth = p.w;
        ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03); ctx.stroke();
      } else if (p.t === 'chip') {
        ctx.globalAlpha = k;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.col; ctx.fillRect(-p.w / 2, -p.w / 4, p.w, p.w / 2);
        ctx.restore();
      } else if (p.t === 'flash') {
        ctx.globalAlpha = k * 0.9;
        ctx.fillStyle = p.col;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (1.4 - k * 0.5), 0, TAU); ctx.fill();
      } else if (p.t === 'ring') {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.col; ctx.lineWidth = p.lw * k + 0.5;
        ctx.beginPath(); ctx.arc(p.x, p.y, lerp(p.r1, p.r0, k), 0, TAU); ctx.stroke();
      } else if (p.t === 'line') {
        ctx.globalAlpha = k * 0.8;
        ctx.strokeStyle = p.col; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(p.a) * 6, p.y + Math.sin(p.a) * 6);
        ctx.lineTo(p.x + Math.cos(p.a) * p.len, p.y + Math.sin(p.a) * p.len);
        ctx.stroke();
      }
    }
    // 瞬步残影
    for (const gh of this.ghosts) {
      const k = clamp(gh.life / gh.max, 0, 1);
      ctx.globalAlpha = 0.3 * k;
      ctx.strokeStyle = '#bfe9f5'; ctx.lineCap = 'round';
      for (const b of gh.bones) {
        ctx.lineWidth = b.w;
        ctx.beginPath(); ctx.moveTo(b.ax, b.ay); ctx.lineTo(b.bx, b.by); ctx.stroke();
      }
      if (gh.head) { ctx.fillStyle = '#bfe9f5'; ctx.beginPath(); ctx.arc(gh.head.x, gh.head.y, gh.head.r, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  },
};
