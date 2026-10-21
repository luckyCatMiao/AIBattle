(function (AV) {
  "use strict";
  const U = AV.util;
  const { clamp, lerp, TAU, rand, easeOutCubic } = U;
  const PAL = AV.gfx.palette;

  // Seeded PRNG so the forge looks the same every load.
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  class Stage {
    constructor(game) {
      this.game = game;
      this.arenaW = 3200;
      this.groundY = 0;
      this.rnd = mulberry32(1337);
      this.embers = [];
      this.steam = [];
      this.sparkVents = [];
      this.time = 0;
      this.built = false;
      this.farCanvas = null;
      this.midCanvas = null;
      this.foreCanvas = null;
      this.plateCanvas = null;
      this.build();
    }

    build() {
      const R = mulberry32(90210);
      // ---------------------------------------------------------------- far
      const W = 1600, H = 800;
      const far = document.createElement("canvas");
      far.width = W; far.height = H;
      const f = far.getContext("2d");
      const sky = f.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, "#090a0e");
      sky.addColorStop(0.42, "#101015");
      sky.addColorStop(0.72, "#1b1512");
      sky.addColorStop(0.86, "#2a1a11");
      sky.addColorStop(1, "#140e0b");
      f.fillStyle = sky;
      f.fillRect(0, 0, W, H);

      // distant furnace glow
      for (let i = 0; i < 4; i++) {
        const gx = 180 + i * 420 + R() * 120;
        const gy = 560 + R() * 40;
        const rg = f.createRadialGradient(gx, gy, 10, gx, gy, 260);
        rg.addColorStop(0, "rgba(255,116,40,0.20)");
        rg.addColorStop(0.5, "rgba(210,80,25,0.07)");
        rg.addColorStop(1, "rgba(120,40,10,0)");
        f.fillStyle = rg;
        f.fillRect(gx - 280, gy - 280, 560, 560);
      }

      // huge gothic arches
      f.strokeStyle = "rgba(10,10,14,0.9)";
      f.fillStyle = "rgba(12,12,17,0.85)";
      for (let i = 0; i < 5; i++) {
        const ax = 120 + i * 340 + R() * 30;
        const aw = 160 + R() * 60;
        const ah = 380 + R() * 120;
        const base = 690;
        f.beginPath();
        f.moveTo(ax, base);
        f.lineTo(ax, base - ah * 0.55);
        f.quadraticCurveTo(ax + aw * 0.5, base - ah * 1.12, ax + aw, base - ah * 0.55);
        f.lineTo(ax + aw, base);
        f.lineTo(ax + aw - 26, base);
        f.lineTo(ax + aw - 26, base - ah * 0.5);
        f.quadraticCurveTo(ax + aw * 0.5, base - ah * 0.92, ax + 26, base - ah * 0.5);
        f.lineTo(ax + 26, base);
        f.closePath();
        f.fill();
      }

      // glowing windows in the arch backs
      for (let i = 0; i < 10; i++) {
        const wx = 100 + i * 160 + R() * 40;
        const wy = 250 + R() * 190;
        const ww = 16 + R() * 24;
        const wh = 40 + R() * 70;
        const g = f.createLinearGradient(wx, wy, wx, wy + wh);
        g.addColorStop(0, "rgba(255,150,70,0.22)");
        g.addColorStop(1, "rgba(255,90,30,0.02)");
        f.fillStyle = g;
        f.fillRect(wx, wy, ww, wh);
      }

      // giant vertical pipes
      for (let i = 0; i < 9; i++) {
        const px = 40 + i * 190 + R() * 60;
        const pw = 14 + R() * 26;
        f.fillStyle = "rgba(9,9,12,0.82)";
        f.fillRect(px, 0, pw, 700);
        f.fillStyle = "rgba(60,50,42,0.18)";
        f.fillRect(px + 2, 0, 2, 700);
      }

      // hanging chains silhouettes
      f.strokeStyle = "rgba(8,8,11,0.9)";
      for (let i = 0; i < 22; i++) {
        const cx = R() * W;
        const len = 90 + R() * 300;
        f.lineWidth = 1.5 + R() * 2;
        f.beginPath();
        f.moveTo(cx, 0);
        f.lineTo(cx + Math.sin(i) * 4, len);
        f.stroke();
        // hook / weight
        f.fillStyle = "rgba(8,8,11,0.85)";
        f.beginPath();
        f.arc(cx + Math.sin(i) * 4, len + 5, 4 + R() * 4, 0, TAU);
        f.fill();
      }

      // haze
      const haze = f.createLinearGradient(0, 420, 0, H);
      haze.addColorStop(0, "rgba(255,120,50,0)");
      haze.addColorStop(0.7, "rgba(255,110,40,0.05)");
      haze.addColorStop(1, "rgba(255,90,30,0)");
      f.fillStyle = haze;
      f.fillRect(0, 420, W, H - 420);

      this.farCanvas = far;

      // ---------------------------------------------------------------- mid
      const MW = 2000, MH = 820;
      const mid = document.createElement("canvas");
      mid.width = MW; mid.height = MH;
      const m = mid.getContext("2d");

      // distant scaffold / wall
      m.fillStyle = "rgba(16,14,14,0.0)";
      // platforms
      for (let i = 0; i < 8; i++) {
        const x = i * 270 + R() * 60;
        const y = 300 + R() * 220;
        const w = 120 + R() * 90;
        m.fillStyle = "rgba(13,12,13,0.95)";
        m.fillRect(x, y, w, 12);
        m.fillStyle = "rgba(22,19,17,0.95)";
        m.fillRect(x, y + 12, w, 5);
        // support posts
        m.fillStyle = "rgba(11,10,11,0.92)";
        m.fillRect(x + 10, y + 16, 6, 220);
        m.fillRect(x + w - 16, y + 16, 6, 220);
        // railing
        m.strokeStyle = "rgba(30,26,22,0.8)";
        m.lineWidth = 2;
        m.beginPath(); m.moveTo(x, y); m.lineTo(x + w, y); m.stroke();
      }

      // giant gears
      const gear = (x, y, r, teeth, fill) => {
        m.save();
        m.translate(x, y);
        m.fillStyle = fill;
        m.beginPath();
        for (let i = 0; i < teeth * 2; i++) {
          const a = (i / (teeth * 2)) * TAU;
          const rr = i % 2 === 0 ? r : r * 0.86;
          const px = Math.cos(a) * rr;
          const py = Math.sin(a) * rr;
          if (i === 0) m.moveTo(px, py); else m.lineTo(px, py);
        }
        m.closePath();
        m.fill();
        m.beginPath();
        m.arc(0, 0, r * 0.62, 0, TAU);
        m.fill();
        m.globalCompositeOperation = "destination-out";
        m.beginPath();
        m.arc(0, 0, r * 0.2, 0, TAU);
        m.fill();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * TAU;
          m.beginPath();
          m.arc(Math.cos(a) * r * 0.4, Math.sin(a) * r * 0.4, r * 0.09, 0, TAU);
          m.fill();
        }
        m.restore();
      };
      m.globalAlpha = 0.95;
      gear(320, 470, 150, 14, "rgba(18,16,16,0.95)");
      gear(1330, 380, 105, 12, "rgba(16,14,14,0.95)");
      gear(760, 640, 82, 10, "rgba(14,13,13,0.95)");
      gear(1740, 560, 128, 13, "rgba(17,15,15,0.95)");
      m.globalAlpha = 1;

      // pipes between
      m.strokeStyle = "rgba(20,17,16,0.95)";
      m.lineWidth = 20;
      m.beginPath();
      m.moveTo(0, 240);
      m.lineTo(400, 240);
      m.quadraticCurveTo(470, 240, 470, 310);
      m.lineTo(470, 720);
      m.stroke();
      m.strokeStyle = "rgba(46,36,30,0.25)";
      m.lineWidth = 3;
      m.beginPath();
      m.moveTo(0, 232); m.lineTo(400, 232);
      m.stroke();

      // furnaces with lit grates
      for (let i = 0; i < 4; i++) {
        const fx = 180 + i * 480 + R() * 40;
        const fy = 560;
        const fw = 100, fh = 120;
        m.fillStyle = "rgba(12,11,11,0.98)";
        m.beginPath();
        m.moveTo(fx, fy);
        m.lineTo(fx, fy - fh + 20);
        m.quadraticCurveTo(fx + fw / 2, fy - fh - 24, fx + fw, fy - fh + 20);
        m.lineTo(fx + fw, fy);
        m.closePath();
        m.fill();
        // glow inside
        const gg = m.createRadialGradient(fx + fw / 2, fy - 40, 4, fx + fw / 2, fy - 40, 70);
        gg.addColorStop(0, "rgba(255,130,50,0.5)");
        gg.addColorStop(0.5, "rgba(255,90,30,0.16)");
        gg.addColorStop(1, "rgba(255,60,10,0)");
        m.fillStyle = gg;
        m.fillRect(fx - 30, fy - 120, fw + 60, 140);
        // grate bars
        m.strokeStyle = "rgba(10,9,9,0.9)";
        m.lineWidth = 4;
        for (let k = 0; k < 5; k++) {
          m.beginPath();
          m.moveTo(fx + 10 + k * 20, fy);
          m.lineTo(fx + 10 + k * 20, fy - 60);
          m.stroke();
        }
      }

      // hanging cages
      const cage = (x, y, s) => {
        m.save();
        m.translate(x, y);
        m.strokeStyle = "rgba(14,12,12,0.9)";
        m.lineWidth = 2;
        m.beginPath(); m.moveTo(0, -60 * s); m.lineTo(0, 0); m.stroke();
        m.beginPath();
        m.ellipse(0, 22 * s, 16 * s, 24 * s, 0, 0, TAU);
        m.stroke();
        for (let i = -2; i <= 2; i++) {
          m.beginPath();
          m.moveTo(i * 7 * s, 0);
          m.lineTo(i * 7 * s, 44 * s);
          m.stroke();
        }
        m.restore();
      };
      cage(600, 300, 1.1);
      cage(1180, 240, 0.9);
      cage(1560, 340, 1.3);

      // mid-ground ember mist
      const mist = m.createLinearGradient(0, 500, 0, MH);
      mist.addColorStop(0, "rgba(255,120,50,0)");
      mist.addColorStop(0.6, "rgba(255,100,35,0.06)");
      mist.addColorStop(1, "rgba(40,20,12,0.22)");
      m.fillStyle = mist;
      m.fillRect(0, 500, MW, MH - 500);
      this.midCanvas = mid;

      // ---------------------------------------------------------------- ground plates
      const PW = 640, PH = 150;
      const plate = document.createElement("canvas");
      plate.width = PW; plate.height = PH;
      const p = plate.getContext("2d");
      const pg = p.createLinearGradient(0, 0, 0, PH);
      pg.addColorStop(0, "#22211f");
      pg.addColorStop(0.12, "#161514");
      pg.addColorStop(0.7, "#0d0c0c");
      pg.addColorStop(1, "#080707");
      p.fillStyle = pg;
      p.fillRect(0, 0, PW, PH);
      // top edge highlight
      p.fillStyle = "#4a3a2c";
      p.fillRect(0, 0, PW, 3);
      p.fillStyle = "rgba(255,150,80,0.35)";
      p.fillRect(0, 0, PW, 1);
      // plates
      p.strokeStyle = "rgba(0,0,0,0.8)";
      p.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        const x = i * 160;
        p.beginPath(); p.moveTo(x, 0); p.lineTo(x + 8, PH); p.stroke();
        p.fillStyle = "rgba(70,62,54,0.25)";
        p.fillRect(x + 2, 4, 154, 1);
      }
      // rivets
      for (let i = 0; i < 4; i++) {
        for (let k = 0; k < 3; k++) {
          p.fillStyle = "#35302a";
          p.beginPath();
          p.arc(i * 160 + 20 + k * 55, 16 + (k % 2) * 10, 2.6, 0, TAU);
          p.fill();
          p.fillStyle = "rgba(255,190,130,0.25)";
          p.beginPath();
          p.arc(i * 160 + 19, 15 + (k % 2) * 10, 1, 0, TAU);
          p.fill();
        }
      }
      // glowing cracks
      p.globalCompositeOperation = "lighter";
      for (let i = 0; i < 6; i++) {
        const sx = R() * PW;
        const sy = 22 + R() * 100;
        p.strokeStyle = "rgba(255,110,40," + (0.14 + R() * 0.2) + ")";
        p.lineWidth = 1.2 + R() * 1.6;
        p.beginPath();
        p.moveTo(sx, sy);
        let cx = sx, cy = sy;
        for (let k = 0; k < 4; k++) {
          cx += 8 + R() * 22;
          cy += (R() - 0.5) * 18;
          p.lineTo(cx, cy);
        }
        p.stroke();
      }
      p.globalCompositeOperation = "source-over";
      this.plateCanvas = plate;

      // ---------------------------------------------------------------- foreground
      const FW = 1600, FH = 700;
      const fore = document.createElement("canvas");
      fore.width = FW; fore.height = FH;
      const q = fore.getContext("2d");
      q.fillStyle = "rgba(3,4,5,0.98)";
      // left pipe
      q.beginPath();
      q.moveTo(0, 0);
      q.lineTo(120, 0);
      q.quadraticCurveTo(90, 320, 130, 700);
      q.lineTo(0, 700);
      q.closePath();
      q.fill();
      q.strokeStyle = "rgba(255,120,60,0.08)";
      q.lineWidth = 3;
      q.beginPath();
      q.moveTo(112, 0); q.quadraticCurveTo(84, 320, 122, 700);
      q.stroke();
      // right chain + hook
      q.strokeStyle = "rgba(4,4,5,0.98)";
      q.lineWidth = 10;
      q.beginPath();
      q.moveTo(1480, 0);
      q.bezierCurveTo(1460, 200, 1520, 330, 1500, 520);
      q.stroke();
      q.fillStyle = "rgba(4,4,5,0.98)";
      q.beginPath();
      q.arc(1500, 530, 18, 0, TAU);
      q.fill();
      q.beginPath();
      q.moveTo(1490, 545);
      q.lineTo(1470, 600);
      q.lineTo(1495, 590);
      q.lineTo(1510, 620);
      q.lineTo(1520, 560);
      q.closePath();
      q.fill();
      this.foreCanvas = fore;

      // ambient embers
      const r2 = mulberry32(4242);
      for (let i = 0; i < 90; i++) {
        this.embers.push({
          x: r2() * this.arenaW,
          y: -r2() * 520,
          vy: -(8 + r2() * 28),
          vx: (r2() - 0.5) * 16,
          size: 0.8 + r2() * 2.2,
          ph: r2() * TAU,
          spd: 0.6 + r2() * 1.8,
          a: 0.2 + r2() * 0.65,
        });
      }
      for (let i = 0; i < 10; i++) {
        this.steam.push({
          x: r2() * this.arenaW, y: -20 - r2() * 20, s: 18 + r2() * 40, vx: (r2() - 0.5) * 10, life: r2(), spd: 0.15 + r2() * 0.2,
        });
      }
      this.built = true;
    }

    update(dt) {
      this.time += dt;
      for (const e of this.embers) {
        e.y += e.vy * dt;
        e.x += (e.vx + Math.sin(this.time * e.spd + e.ph) * 10) * dt;
        if (e.y < -560) { e.y = -20; e.x = rand(this.arenaW); }
      }
      for (const s of this.steam) {
        s.life += dt * s.spd;
        s.y -= 26 * dt;
        s.x += s.vx * dt;
        if (s.life > 1) { s.life = 0; s.x = rand(this.arenaW); s.y = -20; }
      }
    }

    // returns shake offsets for background (subtle)
    draw(ctx, cam) {
      const W = cam.w, H = cam.h;
      const viewX = cam.x;
      const viewY = cam.y;

      // ---- far layer
      const farW = this.farCanvas.width;
      const farScale = (W * 1.5) / farW;
      const farH = this.farCanvas.height * farScale;
      const fx = -(viewX * 0.12) % (farW * farScale);
      const fy = H * 0.5 - farH * 0.55 - viewY * 0.06;
      ctx.drawImage(this.farCanvas, fx - W * 0.1, fy, farW * farScale, farH);
      ctx.drawImage(this.farCanvas, fx + farW * farScale - W * 0.1, fy, farW * farScale, farH);

      // ---- mid layer
      const midW = this.midCanvas.width;
      const midScale = (W * 1.25) / midW;
      const midH = this.midCanvas.height * midScale;
      const mx = -(viewX * 0.32) % (midW * midScale);
      const my = H * 0.52 - midH * 0.66 - viewY * 0.18;
      ctx.drawImage(this.midCanvas, mx - W * 0.06, my, midW * midScale, midH);
      ctx.drawImage(this.midCanvas, mx + midW * midScale - W * 0.06, my, midW * midScale, midH);

      // ---- atmosphere glow
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      const emberG = ctx.createLinearGradient(0, H * 0.55, 0, H);
      emberG.addColorStop(0, "rgba(255,110,40,0)");
      emberG.addColorStop(1, "rgba(255,90,30,0.10)");
      ctx.fillStyle = emberG;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    drawAmbient(ctx, cam) {
      // embers
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      for (const e of this.embers) {
        const sx = e.x - cam.x * 0.92 + cam.ox;
        const sy = e.y - cam.y * 0.92 + cam.oy;
        if (sx < -40 || sx > cam.w + 40) continue;
        const flick = 0.55 + Math.sin(this.time * e.spd * 3 + e.ph) * 0.45;
        ctx.fillStyle = "rgba(255," + (130 + Math.floor(flick * 70)) + ",60," + (e.a * flick) + ")";
        ctx.beginPath();
        ctx.arc(sx, sy, e.size, 0, TAU);
        ctx.fill();
      }
      ctx.restore();
    }

    drawGround(ctx, cam) {
      const plate = this.plateCanvas;
      const pw = plate.width, ph = plate.height;
      const left = cam.x - cam.w / 2 - 40;
      const right = cam.x + cam.w / 2 + 40;
      const start = Math.floor(left / pw) * pw;
      for (let x = start; x < right; x += pw) {
        ctx.drawImage(plate, x, 0, pw, ph);
      }
      // ground edge glow line
      const g = ctx.createLinearGradient(0, -2, 0, 16);
      g.addColorStop(0, "rgba(255,160,90,0.35)");
      g.addColorStop(1, "rgba(255,100,40,0)");
      ctx.fillStyle = g;
      ctx.fillRect(left, 0, right - left, 16);
      // depth fade
      const dg = ctx.createLinearGradient(0, 0, 0, 130);
      dg.addColorStop(0, "rgba(0,0,0,0)");
      dg.addColorStop(1, "rgba(0,0,0,0.7)");
      ctx.fillStyle = dg;
      ctx.fillRect(left, 0, right - left, 130);
    }

    drawForeground(ctx, cam) {
      const fw = this.foreCanvas.width;
      const scale = cam.h / this.foreCanvas.height;
      const fh = this.foreCanvas.height * scale;
      const w = fw * scale;
      const ox = -((cam.x * 1.22) % w);
      const oy = cam.h - fh + Math.max(-30, Math.min(30, -cam.y * 0.35 - 120));
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.drawImage(this.foreCanvas, ox - 10, oy, w, fh);
      ctx.drawImage(this.foreCanvas, ox + w - 10, oy, w, fh);
      ctx.restore();
    }
  }

  AV.Stage = Stage;
})(window.AV = window.AV || {});
