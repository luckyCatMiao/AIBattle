'use strict';
/* ============================================================
   World + view transform.
   ONE mapping is shared by background, ground and entities:
     screenX = vw/2 + (worldX - cam.x) * k
     screenY = horizon + (worldY - GROUND_Y - cam.y) * k
   ============================================================ */

const WORLD = {
  left: -880,
  right: 880,
  ground: 560
};

const VIEW = {
  vw: 1280, vh: 720,
  k: 1.5,
  horizon: 0,
  camX: 0, camY: 0,
  worldH: 430,          // world units visible vertically
  update(vw, vh, cam) {
    this.vw = vw; this.vh = vh;
    // Fit the action band on both axes: on very wide or very tall screens the
    // world scale is capped so fighters never become tiny or oversized.
    let k = vh / this.worldH;
    const minVisW = 560;                  // world units the screen should always show
    k = Math.min(k, vw / minVisW);
    k = Math.max(k, 1.05);
    this.k = k * cam.zoom;
    this.horizon = vh * 0.735;
    this.camX = cam.x + cam.sx + cam.kickX;
    this.camY = (cam.y + cam.sy + cam.kickY) * 0.55;
  },
  X(wx, par = 1) { return this.vw / 2 + (wx - this.camX * par) * this.k; },
  Y(wy, parY = 1) { return this.horizon + (wy - WORLD.ground - this.camY * parY) * this.k; },
  // screen position for a world-space point fully affected by the camera
  sx(wx) { return this.vw / 2 + (wx - this.camX) * this.k; },
  sy(wy) { return this.horizon + (wy - WORLD.ground - this.camY) * this.k; }
};

const World = {
  t: 0,
  farRidge: [], midRidge: [], nearRidge: [],
  stars: [], motes: [], grasses: [], pillars: [], lanterns: [], rocks: [], fgRocks: [],
  rift: { x: 0 },

  init() {
    const mk = (seed, n, step, baseAbove, amp, jag) => {
      const r = rngSeed(seed); const out = [];
      let hgt = baseAbove;
      for (let i = 0; i < n; i++) {
        hgt += (r() - 0.5) * jag;
        hgt = clamp(hgt, baseAbove - amp, baseAbove + amp * 0.6);
        out.push({ x: -3400 + i * step, h: hgt });
      }
      return out;
    };
    this.farRidge = mk(3, 80, 170, 230, 95, 40);
    this.midRidge = mk(11, 66, 190, 150, 62, 52);
    this.nearRidge = mk(29, 56, 240, 78, 34, 30);

    const r = rngSeed(5);
    for (let i = 0; i < 120; i++) {
      this.stars.push({ x: r() * 2400 - 300, y: r() * 0.42 * 720, s: r() * 1.8 + 0.5, p: r() * TAU, sp: 0.5 + r() * 2 });
    }
    for (let i = 0; i < 70; i++) {
      this.motes.push({
        x: rand(WORLD.left - 300, WORLD.right + 300), y: rand(WORLD.ground - 430, WORLD.ground - 10),
        z: rand(0.35, 1.2), sp: rand(7, 26), ph: rand(0, TAU), size: rand(0.7, 2.2),
        drift: rand(-10, 6)
      });
    }
    const gr = rngSeed(77);
    for (let i = 0; i < 150; i++) {
      this.grasses.push({
        x: gr() * (WORLD.right - WORLD.left + 900) - 450 + WORLD.left,
        h: 7 + gr() * 20, w: 1.6 + gr() * 3, lean: (gr() - 0.5) * 12, c: gr()
      });
    }
    const rk = rngSeed(51);
    for (let i = 0; i < 40; i++) {
      this.rocks.push({ x: rk() * (WORLD.right - WORLD.left + 600) - 300 + WORLD.left, w: 6 + rk() * 22, h: 4 + rk() * 10, c: rk() });
    }
    const fr = rngSeed(91);
    for (let i = 0; i < 16; i++) {
      this.fgRocks.push({ x: fr() * 3200 - 1600, w: 40 + fr() * 90, h: 20 + fr() * 36, c: fr() });
    }
    this.pillars = [
      { x: -900, w: 56, h: 270, broken: true, par: 0.78 },
      { x: -620, w: 44, h: 165, broken: true, par: 0.84 },
      { x: 640, w: 66, h: 350, broken: false, par: 0.8 },
      { x: 930, w: 46, h: 210, broken: true, par: 0.86 },
      { x: -1200, w: 34, h: 130, broken: true, par: 0.9 },
      { x: 1180, w: 38, h: 170, broken: true, par: 0.9 }
    ];
    this.lanterns = [
      { x: -740, h: 255 }, { x: 780, h: 235 }, { x: -120, h: 195 }, { x: 250, h: 300 }
    ];
    this.rift.x = 0;
  },

  update(dt) {
    this.t += dt;
    for (const m of this.motes) {
      m.y -= m.sp * dt * m.z;
      m.x += Math.sin(this.t * 0.5 + m.ph) * 8 * dt + m.drift * dt;
      if (m.y < WORLD.ground - 440) { m.y = WORLD.ground - 10; m.x = rand(WORLD.left - 300, WORLD.right + 300); }
    }
  },

  /* ---------------- sky ---------------- */
  drawSky(ctx, vw, vh) {
    const g = ctx.createLinearGradient(0, 0, 0, vh);
    g.addColorStop(0.00, '#0a0d1e');
    g.addColorStop(0.28, '#141a35');
    g.addColorStop(0.52, '#262340');
    g.addColorStop(0.72, '#3d2a3f');
    g.addColorStop(0.85, '#5a3341');
    g.addColorStop(1.00, '#241828');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, vw, vh);

    // moon
    const mx = vw * 0.77 - (VIEW.camX * 0.012) * VIEW.k * 0.2;
    const my = vh * 0.175;
    const mg = ctx.createRadialGradient(mx, my, 10, mx, my, vh * 0.34);
    mg.addColorStop(0, 'rgba(255,240,214,0.26)');
    mg.addColorStop(0.25, 'rgba(226,198,196,0.10)');
    mg.addColorStop(1, 'rgba(226,198,196,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(mx - vh * 0.4, my - vh * 0.4, vh * 0.8, vh * 0.8);
    const mr = vh * 0.072;
    ctx.fillStyle = '#f4e8d2';
    ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
    ctx.fillStyle = 'rgba(126,108,116,0.16)';
    ctx.beginPath(); ctx.arc(mx - mr * 0.3, my - mr * 0.22, mr * 0.26, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + mr * 0.33, my + mr * 0.3, mr * 0.17, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx + mr * 0.12, my - mr * 0.48, mr * 0.11, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.arc(mx - mr * 0.5, my + mr * 0.28, mr * 0.09, 0, TAU); ctx.fill();

    // stars
    for (const s of this.stars) {
      const x = ((s.x - VIEW.camX * 0.03) % 2400 + 2400) % 2400 - 300;
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(this.t * s.sp + s.p));
      ctx.fillStyle = `rgba(214,226,255,${0.2 + tw * 0.6})`;
      ctx.fillRect(x, s.y, s.s, s.s);
    }

    // drifting cloud strata
    ctx.save();
    ctx.globalAlpha = 0.5;
    for (let i = 0; i < 5; i++) {
      const y = vh * (0.16 + i * 0.075) + Math.sin(this.t * 0.06 + i) * 5;
      const off = ((i * 330 - VIEW.camX * 0.02 * VIEW.k) % 2200 + 2200) % 2200 - 400;
      const cg = ctx.createLinearGradient(0, y, 0, y + vh * 0.04);
      cg.addColorStop(0, 'rgba(126,116,166,0)');
      cg.addColorStop(0.5, `rgba(${140 + i * 6},${124 + i * 4},${182},${0.16 + i * 0.02})`);
      cg.addColorStop(1, 'rgba(126,116,166,0)');
      ctx.fillStyle = cg;
      ctx.fillRect(off, y, 2000, vh * 0.04);
    }
    ctx.restore();
  },

  ridgePath(ctx, ridge, par, baseAbove, color, edge) {
    const k = VIEW.k;
    const yBase = VIEW.Y(WORLD.ground - baseAbove, par * 0.25);
    ctx.beginPath();
    ctx.moveTo(-600, VIEW.vh + 400);
    let started = false;
    for (const p of ridge) {
      const x = VIEW.vw / 2 + (p.x - VIEW.camX * par) * k;
      if (x < -700) continue;
      if (x > VIEW.vw + 700) break;
      const y = VIEW.Y(WORLD.ground - p.h, par * 0.25);
      if (!started) { ctx.lineTo(x, y); started = true; }
      else ctx.lineTo(x, y);
    }
    ctx.lineTo(VIEW.vw + 700, VIEW.vh + 400);
    ctx.closePath();
    const g = ctx.createLinearGradient(0, yBase - 260 * k * 0.4, 0, VIEW.vh);
    g.addColorStop(0, color[0]);
    g.addColorStop(1, color[1]);
    ctx.fillStyle = g;
    ctx.fill();
    if (edge) { ctx.strokeStyle = edge; ctx.lineWidth = 1.4; ctx.stroke(); }
  },

  drawFar(ctx) {
    this.ridgePath(ctx, this.farRidge, 0.09, 230, ['#1a2038', '#0e1120'], 'rgba(126,148,200,0.16)');
    // haze above the horizon
    const hy = VIEW.Y(WORLD.ground - 150, 0);
    const hg = ctx.createLinearGradient(0, hy - VIEW.vh * 0.1, 0, hy + VIEW.vh * 0.12);
    hg.addColorStop(0, 'rgba(96,104,164,0)');
    hg.addColorStop(0.55, 'rgba(104,104,160,0.10)');
    hg.addColorStop(1, 'rgba(96,104,164,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, hy - VIEW.vh * 0.1, VIEW.vw, VIEW.vh * 0.24);
  },

  drawMid(ctx) {
    this.ridgePath(ctx, this.midRidge, 0.24, 150, ['#141928', '#0a0d18'], 'rgba(140,152,200,0.10)');
    // ruined shrine silhouette on the ridge
    const k = VIEW.k;
    const bx = VIEW.X(-520, 0.24);
    const by = VIEW.Y(WORLD.ground - 96, 0.06);
    const s = k * 0.85;
    ctx.save();
    ctx.translate(bx, by);
    ctx.scale(s, s);
    ctx.fillStyle = '#0b0e19';
    // platform
    ctx.fillRect(-80, -8, 160, 12);
    // hall body
    ctx.fillRect(-50, -78, 100, 72);
    // pillars
    ctx.fillRect(-52, -86, 9, 86); ctx.fillRect(20, -86, 9, 86); ctx.fillRect(-24, -86, 7, 86);
    // sweeping roof
    ctx.beginPath();
    ctx.moveTo(-92, -84);
    ctx.quadraticCurveTo(-44, -104, -18, -120);
    ctx.lineTo(0, -128);
    ctx.lineTo(18, -120);
    ctx.quadraticCurveTo(44, -104, 92, -84);
    ctx.quadraticCurveTo(60, -96, 0, -96);
    ctx.quadraticCurveTo(-60, -96, -92, -84);
    ctx.closePath(); ctx.fill();
    ctx.fillRect(-104, -88, 208, 6);
    // broken gap in the roof
    ctx.clearRect ? null : null;
    // torii gate
    ctx.fillRect(-150, -70, 9, 70); ctx.fillRect(132, -70, 9, 70);
    ctx.fillRect(-166, -74, 316, 7);
    ctx.fillRect(-152, -58, 300, 4);
    ctx.restore();
    // graveyard of broken blades on the far lip (silhouettes)
    ctx.save();
    const bankY = VIEW.Y(WORLD.ground - 6, 0);
    const blades = [[-320, 46, -0.1], [-290, 30, 0.15], [-250, 58, 0.03], [300, 40, -0.12], [352, 62, 0.08], [396, 34, -0.05], [440, 50, 0.12]];
    for (const [bx, bh, rot] of blades) {
      const x = VIEW.X(bx, 0.62);
      if (x < -60 || x > VIEW.vw + 60) continue;
      const hh = bh * VIEW.k * 0.7;
      ctx.save();
      ctx.translate(x, bankY);
      ctx.rotate(rot);
      ctx.strokeStyle = 'rgba(150,164,196,0.20)';
      ctx.lineWidth = Math.max(1, 2.2 * VIEW.k * 0.5);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -hh); ctx.stroke();
      ctx.lineWidth = Math.max(1, 1.2 * VIEW.k * 0.5);
      ctx.beginPath();
      ctx.moveTo(-3 * VIEW.k * 0.4, -hh * 0.8);
      ctx.lineTo(3.5 * VIEW.k * 0.4, -hh * 0.8);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();

    // mist
    const my = VIEW.Y(WORLD.ground - 40, 0);
    const mg = ctx.createLinearGradient(0, my - VIEW.vh * 0.16, 0, my + VIEW.vh * 0.04);
    mg.addColorStop(0, 'rgba(104,108,158,0)');
    mg.addColorStop(0.6, 'rgba(112,112,160,0.13)');
    mg.addColorStop(1, 'rgba(104,108,158,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(0, my - VIEW.vh * 0.16, VIEW.vw, VIEW.vh * 0.2);
  },

  drawNear(ctx) {
    this.ridgePath(ctx, this.nearRidge, 0.42, 78, ['#0c1019', '#070a10'], 'rgba(150,160,210,0.06)');

    // the rift: a slow-breathing vertical tear behind the arena
    const rx = VIEW.X(this.rift.x, 0.55);
    const ry = VIEW.Y(WORLD.ground - 150, 0.12);
    const rh = 250 * VIEW.k * 0.55;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const pulse = 0.7 + 0.3 * Math.sin(this.t * 1.3);
    const rg = ctx.createRadialGradient(rx, ry, 2, rx, ry, rh * 0.9);
    rg.addColorStop(0, `rgba(255,120,70,${0.16 * pulse})`);
    rg.addColorStop(0.35, `rgba(170,60,90,${0.07 * pulse})`);
    rg.addColorStop(1, 'rgba(120,40,80,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.ellipse(rx, ry, rh * 0.55, rh, 0, 0, TAU); ctx.fill();
    // jagged slit
    ctx.strokeStyle = `rgba(255,170,120,${0.35 * pulse})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    for (let i = 0; i <= 14; i++) {
      const k = i / 14;
      const yy = ry - rh * 0.85 + k * rh * 1.7;
      const xx = rx + Math.sin(k * 14 + this.t * 0.8) * rh * 0.055 * Math.sin(k * Math.PI);
      if (i === 0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();

    // pillars
    const k = VIEW.k;
    for (const p of this.pillars) {
      const x = VIEW.X(p.x, p.par);
      const gy = VIEW.Y(WORLD.ground, 0);
      if (x < -220 || x > VIEW.vw + 220) continue;
      const sc = k * (0.86 + (1 - p.par) * 0.5);
      ctx.save();
      ctx.translate(x, gy);
      ctx.scale(sc, sc);
      const g = ctx.createLinearGradient(-p.w / 2, 0, p.w / 2, 0);
      g.addColorStop(0, '#10131f'); g.addColorStop(0.42, '#242a3b'); g.addColorStop(1, '#0c0f18');
      ctx.fillStyle = g;
      ctx.fillRect(-p.w / 2, -p.h, p.w, p.h);
      // base
      ctx.fillStyle = '#1e2333';
      ctx.fillRect(-p.w / 2 - 6, -10, p.w + 12, 12);
      // capital
      ctx.fillStyle = '#262c3d';
      ctx.fillRect(-p.w / 2 - 7, -p.h - 9, p.w + 14, 10);
      if (p.broken) {
        ctx.fillStyle = '#121622';
        ctx.beginPath();
        ctx.moveTo(-p.w / 2, -p.h - 9);
        ctx.lineTo(-p.w * 0.12, -p.h - 40);
        ctx.lineTo(p.w * 0.16, -p.h + 2);
        ctx.lineTo(p.w / 2, -p.h + 26);
        ctx.lineTo(p.w / 2, -p.h - 9);
        ctx.closePath(); ctx.fill();
      }
      // cracks + weathering
      ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-p.w * 0.15, -p.h * 0.72); ctx.lineTo(p.w * 0.1, -p.h * 0.48); ctx.lineTo(-p.w * 0.05, -p.h * 0.2);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(120,140,180,0.10)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(-p.w / 2 + 2, -p.h + 6); ctx.lineTo(-p.w / 2 + 2, -12); ctx.stroke();
      ctx.restore();
    }

    // hanging lanterns
    for (const L of this.lanterns) {
      const x = VIEW.X(L.x, 0.82);
      const y = VIEW.Y(WORLD.ground - L.h, 0.1);
      if (x < -100 || x > VIEW.vw + 100) continue;
      const flick = 0.86 + Math.sin(this.t * 3.1 + L.x) * 0.07 + Math.sin(this.t * 7.7 + L.x) * 0.04;
      ctx.strokeStyle = 'rgba(26,28,40,0.85)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, y - 18); ctx.stroke();
      const r = 54 * VIEW.k;
      const lg = ctx.createRadialGradient(x, y, 2, x, y, r);
      lg.addColorStop(0, `rgba(255,176,96,${0.34 * flick})`);
      lg.addColorStop(0.4, `rgba(255,138,72,${0.11 * flick})`);
      lg.addColorStop(1, 'rgba(255,128,64,0)');
      ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
      const s = VIEW.k * 0.9;
      ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = `rgba(255,200,128,${0.92 * flick})`;
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(-8, -12, 16, 24, 5); else ctx.rect(-8, -12, 16, 24);
      ctx.fill();
      ctx.fillStyle = 'rgba(70,42,32,0.85)';
      ctx.fillRect(-9, -14, 18, 3); ctx.fillRect(-9, 11, 18, 3);
      ctx.fillStyle = `rgba(255,240,200,${0.5 * flick})`;
      ctx.fillRect(-2, -12, 4, 24);
      ctx.restore();
      // tassel
      ctx.strokeStyle = 'rgba(200,80,60,0.6)'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, y + 13 * VIEW.k * 0.9); ctx.lineTo(x, y + 22 * VIEW.k * 0.9); ctx.stroke();
    }
  },

  /* ---------------- ground ---------------- */
  drawGround(ctx, front) {
    const k = VIEW.k;
    const gy = VIEW.Y(WORLD.ground, 0);
    const vw = VIEW.vw, vh = VIEW.vh;

    if (!front) {
      // the far lip of the arena: a dark band fading into the gorge
      const lg = ctx.createLinearGradient(0, gy - 30 * k, 0, gy + 4);
      lg.addColorStop(0, 'rgba(24,26,40,0)');
      lg.addColorStop(1, 'rgba(18,19,30,0.95)');
      ctx.fillStyle = lg;
      ctx.fillRect(0, gy - 30 * k, vw, 30 * k + 4);
    }

    // main floor
    const g2 = ctx.createLinearGradient(0, gy, 0, vh + 40);
    g2.addColorStop(0, '#322c36');
    g2.addColorStop(0.06, '#242029');
    g2.addColorStop(0.32, '#191620');
    g2.addColorStop(1, '#08070c');
    ctx.fillStyle = g2;
    ctx.fillRect(0, gy, vw, vh - gy + 40);

    if (!front) {
      // moonlit lip
      ctx.fillStyle = 'rgba(206,208,232,0.30)';
      ctx.fillRect(0, gy - 2, vw, 2.5);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, gy + 2, vw, 1);

      // stone slabs, tiled in world space so they scroll with the floor
      const tile = 150;
      const startX = Math.floor((VIEW.camX * 1 - VIEW.vw / 2 / k) / tile) * tile;
      ctx.save();
      ctx.beginPath(); ctx.rect(0, gy, vw, vh - gy + 40); ctx.clip();
      for (let wx = startX; wx < VIEW.camX + VIEW.vw / 2 / k + tile * 2; wx += tile) {
        for (let row = 0; row < 6; row++) {
          const x = VIEW.sx(wx) + (row % 2) * tile * k * 0.5;
          const y = gy + (7 + row * 30) * k * 0.72 + row * row * 2.2;
          if (y > vh + 40) continue;
          const rr = rngSeed(wx * 31 + row * 977);
          const shade = 0.5 + rr() * 0.5;
          ctx.strokeStyle = `rgba(104,106,132,${0.10 * shade})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(x - tile * k * 0.5 + 2, y);
          ctx.lineTo(x + tile * k * 0.5 - 3, y + (rr() - 0.5) * 2);
          ctx.stroke();
          // occasional vertical joint
          if (rr() > 0.75) {
            ctx.beginPath();
            ctx.moveTo(x + tile * k * 0.5, y);
            ctx.lineTo(x + tile * k * 0.5, y + 22 * k * 0.72);
            ctx.stroke();
          }
        }
      }
      // wet moon reflection
      const mx = vw * 0.77;
      const rg = ctx.createLinearGradient(mx - 160 * k * 0.3, gy, mx + 160 * k * 0.3, gy);
      rg.addColorStop(0, 'rgba(210,216,255,0)');
      rg.addColorStop(0.5, 'rgba(210,216,255,0.045)');
      rg.addColorStop(1, 'rgba(210,216,255,0)');
      ctx.fillStyle = rg; ctx.fillRect(mx - 160, gy, 320, 90);
      ctx.restore();

      // scattered rubble
      for (const r of this.rocks) {
        const x = VIEW.sx(r.x);
        if (x < -40 || x > vw + 40) continue;
        const yy = gy + 5 + r.c * 10;
        ctx.fillStyle = `rgba(${52 + r.c * 20},${50 + r.c * 18},${62 + r.c * 18},0.85)`;
        ctx.beginPath();
        ctx.ellipse(x, yy, r.w * k * 0.5, r.h * k * 0.4, 0, Math.PI, TAU);
        ctx.fill();
        ctx.strokeStyle = 'rgba(190,200,230,0.10)'; ctx.lineWidth = 1; ctx.stroke();
      }

      // grass tufts on the lip
      for (const gg of this.grasses) {
        const x = VIEW.sx(gg.x);
        if (x < -20 || x > vw + 20) continue;
        const sway = Math.sin(this.t * 1.6 + gg.x * 0.03) * 2.2;
        ctx.strokeStyle = `rgba(${64 + gg.c * 44},${76 + gg.c * 60},${92 + gg.c * 44},${0.3 + gg.c * 0.28})`;
        ctx.lineWidth = gg.w * 0.5;
        const hh = gg.h * k * 0.86;
        ctx.beginPath();
        ctx.moveTo(x, gy + 1);
        ctx.quadraticCurveTo(x + gg.lean * 0.5 * k * 0.4, gy - hh * 0.6, x + (gg.lean + sway) * k * 0.4, gy - hh);
        ctx.stroke();
      }
    }
  },

  drawForeground(ctx) {
    const vw = VIEW.vw, vh = VIEW.vh, k = VIEW.k;
    const gy = VIEW.Y(WORLD.ground, 0);
    // blurred near rocks at the very bottom
    for (const r of this.fgRocks) {
      const x = VIEW.X(r.x, 1.32);
      if (x < -200 || x > vw + 200) continue;
      const yy = vh + 6;
      ctx.fillStyle = `rgba(6,6,10,${0.75 + r.c * 0.2})`;
      ctx.beginPath();
      ctx.ellipse(x, yy, r.w * k * 0.5, r.h * k * 0.5, 0, Math.PI, TAU);
      ctx.fill();
    }
    // vignette
    const vg = ctx.createRadialGradient(vw / 2, vh * 0.46, vh * 0.34, vw / 2, vh * 0.5, vh * 0.95);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, vw, vh);

    // bottom haze
    const fg = ctx.createLinearGradient(0, vh - 110, 0, vh);
    fg.addColorStop(0, 'rgba(8,8,14,0)');
    fg.addColorStop(1, 'rgba(8,8,14,0.72)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, vh - 110, vw, 110);
  },

  drawMotes(ctx) {
    const vw = VIEW.vw;
    for (const m of this.motes) {
      const x = VIEW.X(m.x, 0.72 + m.z * 0.22);
      const y = VIEW.Y(m.y, 0.7 + m.z * 0.22);
      if (x < -30 || x > vw + 30) continue;
      const a = 0.10 + 0.26 * (0.5 + 0.5 * Math.sin(this.t * 2 + m.ph));
      ctx.fillStyle = `rgba(196,214,255,${a * m.z})`;
      ctx.beginPath(); ctx.arc(x, y, m.size * VIEW.k * 0.75, 0, TAU); ctx.fill();
    }
  },

  drawBounds(ctx) {
    const drawOne = (wx) => {
      const x = VIEW.sx(wx);
      if (x < -80 || x > VIEW.vw + 80) return;
      const gy = VIEW.Y(WORLD.ground, 0);
      const hh = 230 * VIEW.k;
      const g = ctx.createLinearGradient(x, gy - hh, x, gy);
      g.addColorStop(0, 'rgba(255,120,70,0)');
      g.addColorStop(0.65, 'rgba(255,120,70,0.06)');
      g.addColorStop(1, 'rgba(255,120,70,0.16)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 2, gy - hh, 4, hh);
      ctx.strokeStyle = 'rgba(255,150,90,0.32)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      for (let i = 0; i < 9; i++) {
        const y = gy - (i + 0.4) * hh / 9;
        const ww = 5 + Math.sin(this.t * 2 + i) * 3;
        ctx.moveTo(x - ww, y); ctx.lineTo(x + ww, y + 8);
      }
      ctx.stroke();
    };
    drawOne(WORLD.left);
    drawOne(WORLD.right);
  }
};
