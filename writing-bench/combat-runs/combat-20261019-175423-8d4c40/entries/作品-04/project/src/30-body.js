'use strict';
/* ============================================================
   Skeletal drawing helpers — tapered limbs, ink outlines,
   joints, masked heads, blades. Shared by player & puppets.
   ============================================================ */
function taperedLimb(ctx, x1, y1, x2, y2, w1, w2, fill, stroke = '#07080f', lineW = 2.4, rim = true) {
  const a = Math.atan2(y2 - y1, x2 - x1) + Math.PI / 2;
  const nx = Math.cos(a), ny = Math.sin(a);
  const pts = [
    x1 + nx * w1 / 2, y1 + ny * w1 / 2,
    x2 + nx * w2 / 2, y2 + ny * w2 / 2,
    x2 - nx * w2 / 2, y2 - ny * w2 / 2,
    x1 - nx * w1 / 2, y1 - ny * w1 / 2
  ];
  poly(ctx, pts);
  ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineW; ctx.lineJoin = 'round'; ctx.stroke(); }
  /* rounded caps */
  ctx.fillStyle = fill;
  ctx.beginPath(); ctx.arc(x1, y1, w1 / 2, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x2, y2, w2 / 2, 0, TAU); ctx.fill();
  if (rim) {
    /* cool rim light on the upper edge */
    ctx.strokeStyle = 'rgba(170,205,255,0.30)';
    ctx.lineWidth = Math.max(1, Math.min(w1, w2) * 0.16);
    ctx.beginPath();
    ctx.moveTo(x1 + nx * w1 * 0.34, y1 + ny * w1 * 0.34);
    ctx.lineTo(x2 + nx * w2 * 0.34, y2 + ny * w2 * 0.34);
    ctx.stroke();
  }
}
function jointDot(ctx, x, y, r, color) {
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
}
function blade(ctx, x1, y1, x2, y2, w, glow = false) {
  const a = Math.atan2(y2 - y1, x2 - x1);
  const nx = Math.cos(a + Math.PI / 2), ny = Math.sin(a + Math.PI / 2);
  const tx = x2 + Math.cos(a) * w * 3.2, ty = y2 + Math.sin(a) * w * 3.2;
  poly(ctx, [
    x1 + nx * w, y1 + ny * w,
    tx + nx * w * 0.12, ty + ny * w * 0.12,
    tx - nx * w * 0.12, ty - ny * w * 0.12,
    x1 - nx * w, y1 - ny * w
  ]);
  const g = ctx.createLinearGradient(x1, y1, tx, ty);
  g.addColorStop(0, '#f7fbff'); g.addColorStop(0.55, '#cfd9ee'); g.addColorStop(1, '#ffffff');
  ctx.fillStyle = g; ctx.fill();
  ctx.strokeStyle = 'rgba(10,12,20,0.75)'; ctx.lineWidth = 1; ctx.stroke();
  /* spine highlight */
  ctx.strokeStyle = 'rgba(255,255,255,' + (glow ? 0.95 : 0.55) + ')';
  ctx.lineWidth = Math.max(1, w * 0.5);
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(tx, ty); ctx.stroke();
}
function drawScarf(ctx, pts, color, edge) {
  if (pts.length < 2) return;
  for (let pass = 0; pass < 2; pass++) {
    const widths = pts.map((p, i) => lerp(7, 1.4, i / (pts.length - 1)) * (pass === 0 ? 1.7 : 1));
    for (let i = 0; i < pts.length - 1; i++) {
      taperedLimb(ctx, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y,
        widths[i], widths[i + 1], pass === 0 ? edge : color, null);
    }
  }
}

/* Trail ribbon: samples the anchor's history, then resamples it into
   an evenly spaced, wavy scarf. Stable by construction — no explosions. */
class Ribbon {
  constructor(n, len, color, edge) {
    this.n = n; this.len = len; this.color = color; this.edge = edge;
    this.pts = new Array(n).fill(0).map(() => ({ x: 0, y: 0 }));
    this.hist = [];
    this.init = false;
    this.phase = Math.random() * 10;
    this.spacing = len / (n - 1);
  }
  reset(x, y, dir) {
    this.hist.length = 0;
    for (let i = 0; i < 64; i++) this.hist.push({ x: x - i * 3 * dir, y });
    this.init = true;
    this.compute(dir, 1, 0, 0);
  }
  update(dt, x, y, dir, baseVx, baseVy, wind = 1) {
    if (!this.init) this.reset(x, y, dir);
    const h = this.hist;
    h.unshift({ x, y });
    const maxH = 90;
    if (h.length > maxH) h.length = maxH;
    this.compute(dir, wind, baseVy, baseVx);
    this.wind = wind;
  }
  compute(dir, wind = 1, baseVy = 0, baseVx = 0) {
    const h = this.hist;
    const n = this.n;
    let ri = 0;
    let travelled = 0;
    this.pts[0].x = h[0].x; this.pts[0].y = h[0].y;
    let idx = 1;
    for (let i = 1; i < h.length && idx < n; i++) {
      const a = h[i - 1], b = h[i];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      if (d < 0.0001) continue;
      let local = travelled;
      const segLen = d;
      while (local + this.spacing <= segLen + travelled && idx < n) {
        /* wait: simpler resample below */
        break;
      }
      travelled += d;
      /* resample at multiples of spacing */
      while (idx * this.spacing <= travelled && idx < n) {
        const target = idx * this.spacing;
        const back = travelled - target;
        const t = 1 - clamp(back / segLen, 0, 1);
        this.pts[idx].x = lerp(a.x, b.x, t);
        this.pts[idx].y = lerp(a.y, b.y, t);
        idx++;
      }
    }
    /* not enough history: extend backwards */
    while (idx < n) {
      const prev = this.pts[idx - 1];
      this.pts[idx].x = prev.x - dir * this.spacing;
      this.pts[idx].y = prev.y;
      idx++;
    }
    /* blend toward a relaxed droop so the scarf never points straight up */
    const t = Game.time;
    const ax = this.pts[0].x, ay = this.pts[0].y;
    const speed = Math.hypot(baseVx || 0, baseVy || 0);
    const trailK = clamp((speed - 60) / 260, 0, 1);
    for (let i = 1; i < n; i++) {
      const u = i / (n - 1);
      const restX = ax - dir * this.spacing * i * 0.62;
      const restY = ay + this.spacing * i * 0.55 + u * u * 8;
      const k = trailK * 0.85;
      this.pts[i].x = lerp(restX, this.pts[i].x, k) + Math.sin(t * 5.2 + this.phase + i * 0.62) * 3.4 * u * (wind || 1);
      this.pts[i].y = lerp(restY, this.pts[i].y, k) + Math.cos(t * 4.4 + this.phase + i * 0.5) * 2.8 * u;
    }
  }
  draw(ctx) { drawScarf(ctx, this.pts, this.color, this.edge); }
}
