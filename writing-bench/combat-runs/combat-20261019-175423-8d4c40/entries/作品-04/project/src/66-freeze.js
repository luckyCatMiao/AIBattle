'use strict';
/* ============================================================
   刹那 — time freeze: enemies halt, player moves at full speed.
   Hits during the freeze leave rune marks that detonate on release.
   ============================================================ */
const Freeze = {
  active: false,
  t: 0, max: 0,
  motes: [],
  begin(seconds) {
    this.active = true;
    this.t = seconds;
    this.max = seconds;
    Audio_.freezeIn();
    this.motes.length = 0;
    for (let i = 0; i < 44; i++) {
      this.motes.push({
        x: rand(0, W / Camera.zoom), yy: rand(0, H / Camera.zoom),
        r: rand(0.8, 2.6), ph: rand(0, TAU), sp: rand(2, 12)
      });
    }
    /* marks on any enemy already on screen */
    for (const e of Game.enemies) if (e.alive) e.freezeMarks = 0;
  },
  update(dt) {
    if (!this.active) return;
    this.t -= dt;
    for (const m of this.motes) { m.x += m.sp * dt * 0.2; m.ph += dt * 2; }
    if (this.t <= 0) this.release();
  },
  release() {
    this.active = false;
    Audio_.freezeOut();
    Game.flash = Math.max(Game.flash, 0.28);
    Game.flashColor = '170,205,255';
    Camera.kick(0.45);
  },
  draw(ctx, camX) {
    if (!this.active) return;
    const k = clamp(this.t / this.max, 0, 1);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    /* cold wash */
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(110,150,255,' + (0.10 + 0.06 * Math.sin(this.t * 8)) + ')');
    g.addColorStop(1, 'rgba(60,90,200,0.04)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    /* drifting motes */
    const z = Camera.zoom, vw = W / z;
    for (const m of this.motes) {
      const wx = ((m.x - camX * 0.4) % vw + vw) % vw;
      const sy = (m.yy + Math.sin(m.ph) * 8 - GROUND_Y) * z + GROUND_SCREEN;
      const sx = (wx - vw / 2) * z + W / 2;
      if (sy < -20 || sy > H + 20) continue;
      ctx.fillStyle = 'rgba(190,215,255,' + (0.35 + 0.3 * Math.sin(m.ph * 1.7)) + ')';
      ctx.beginPath(); ctx.arc(sx, sy, m.r, 0, TAU); ctx.fill();
    }
    /* frost frame */
    ctx.strokeStyle = 'rgba(180,210,255,' + (0.35 * k + 0.1) + ')';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.restore();
  }
};

/* Rune mark drawn on a frozen enemy */
function drawFreezeMark(ctx, e) {
  if (!e.freezeMarkT || e.freezeMarkT <= 0) return;
  const a = clamp(e.freezeMarkT * 2, 0, 1);
  const cx = e.x, cy = e.y - 58 * e.scale;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.translate(cx, cy);
  ctx.rotate(e.freezeMarkT * 3);
  ctx.strokeStyle = 'rgba(170,210,255,' + (0.55 * a) + ')';
  ctx.lineWidth = 2;
  const r = 30 + (1 - a) * 12;
  for (let i = 0; i < 3; i++) {
    const a0 = (i / 3) * TAU;
    ctx.beginPath();
    ctx.arc(0, 0, r, a0, a0 + 1.5);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(210,235,255,' + (0.8 * a) + ')';
  ctx.beginPath(); ctx.arc(0, 0, 3, 0, TAU); ctx.fill();
  ctx.restore();
}
