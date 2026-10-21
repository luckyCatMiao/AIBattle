'use strict';
/* ============================================================
   Severed limbs — physical debris that settles on the floor
   ============================================================ */
class SeveredLimb {
  constructor(x, y, vx, vy, kind, color, color2, scale, spin, ownerType, maskColor) {
    this.maskColor = maskColor;
    this.x = x; this.y = y; this.vx = vx; this.vy = vy;
    this.kind = kind; this.color = color; this.color2 = color2 || color;
    this.scale = scale;
    this.rot = rand(-0.4, 0.4); this.spin = spin;
    this.len = kind === 'leg' ? 44 : kind === 'head' ? 13 : 32;
    this.life = 14;
    this.rest = false;
    this.bounces = 0;
    this.ownerType = ownerType;
    this.stringLen = rand(30, 60);
    this.settled = false;
    this.glow = 0.4;
    this.seed = Math.random() * 100;
  }
  update(dt) {
    this.life -= dt;
    if (this.rest) return;
    this.vy += GRAV * 0.9 * dt;
    this.x += this.vx * dt; this.y += this.vy * dt;
    this.rot += this.spin * dt;
    /* thin red trail while flying */
    if (!this.settled && Math.random() < 0.55) {
      FX.parts.push({ type: 'ink', x: this.x + rand(-4, 4), y: this.y + rand(-4, 4), vx: this.vx * 0.12, vy: this.vy * 0.1, life: 0.28, max: 0.28, r: rand(1, 2.4), color: '#ff4d63', grav: 300, drag: 1 });
    }
    const gy = GROUND_Y - (this.kind === 'head' ? 10 : 3);
    if (this.y > gy) {
      this.y = gy;
      if (Math.abs(this.vy) > 120 && this.bounces < 3) {
        this.vy *= -0.40; this.vx *= 0.68; this.spin *= 0.5;
        this.bounces++;
        FX.parts.push({ type: 'dust', x: this.x, y: GROUND_Y, vx: rand(-90, 90), vy: rand(-70, -14), life: 0.4, max: 0.4, r: rand(6, 14), color: 'rgba(210,190,160,', grav: 50, drag: 3 });
        FX.parts.push({ type: 'ink', x: this.x, y: GROUND_Y - 2, vx: rand(-160, 160), vy: rand(-190, -40), life: 0.4, max: 0.4, r: rand(1.5, 3.5), color: '#e8324f', grav: 900, drag: 0.5 });
        Audio_.land();
      } else {
        this.vy = 0; this.vx *= 0.80; this.spin *= 0.75;
        if (Math.abs(this.vx) < 26) {
          this.rest = true; this.settled = true;
          /* lie flat-ish */
          this.rot = this.kind === 'head' ? this.rot : Math.PI / 2 * sign(Math.sin(this.rot) || 1) * (0.8 + Math.random() * 0.2);
        }
      }
    }
    if (this.y >= gy) this.y = gy;
  }
  draw(ctx) {
    const a = clamp(this.life > 10 ? 1 : this.life / 10, 0, 1);
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rot);
    const s = this.scale;
    if (this.kind === 'head') {
      ctx.fillStyle = this.color;
      roundRect(ctx, -10 * s, -11 * s, 20 * s, 22 * s, 5 * s); ctx.fill();
      ctx.strokeStyle = '#1d1610'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = this.color2;
      ctx.beginPath(); ctx.moveTo(-11 * s, -6 * s); ctx.quadraticCurveTo(0, -16 * s, 11 * s, -6 * s); ctx.lineTo(10 * s, -10 * s); ctx.quadraticCurveTo(0, -19 * s, -10 * s, -10 * s); ctx.fill();
      ctx.fillStyle = this.maskColor || '#e8dfc8';
      roundRect(ctx, -8 * s, -5 * s, 15 * s, 12 * s, 3 * s); ctx.fill();
      ctx.strokeStyle = 'rgba(40,30,20,0.7)'; ctx.lineWidth = 1.2; ctx.stroke();
      ctx.fillStyle = '#2a2018';
      ctx.beginPath(); ctx.arc(0, 11 * s, 3.4 * s, 0, TAU); ctx.fill();
      /* dangling strings */
      ctx.strokeStyle = 'rgba(220,210,200,0.25)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 11 * s); ctx.lineTo(Math.sin(Game.time * 2 + this.seed) * 8, 11 * s + this.stringLen); ctx.stroke();
    } else {
      /* limb segment */
      taperedLimb(ctx, -this.len / 2 * s, 0, this.len / 2 * s, 0, 11 * s, 7 * s, this.color, '#1d1610', 2);
      /* joint knobs */
      ctx.fillStyle = '#2a2018';
      ctx.beginPath(); ctx.arc(-this.len / 2 * s, 0, 4 * s, 0, TAU); ctx.fill();
      ctx.beginPath(); ctx.arc(this.len / 2 * s, 0, 3.3 * s, 0, TAU); ctx.fill();
      /* splintered end with dark socket */
      const ex = -this.len / 2 * s;
      ctx.fillStyle = '#241a12';
      ctx.beginPath(); ctx.arc(ex + 2 * s, 0, 4.6 * s, 0, TAU); ctx.fill();
      ctx.fillStyle = '#ecd9a6';
      poly(ctx, [ex, -4 * s, ex - 7 * s, -1 * s, ex - 4 * s, 1 * s, ex - 7 * s, 3 * s, ex, 4 * s]); ctx.fill();
      /* strings */
      ctx.strokeStyle = 'rgba(220,210,200,0.22)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(0, 2 * s); ctx.lineTo(Math.sin(Game.time * 2 + this.seed) * 10, this.stringLen); ctx.stroke();
    }
    ctx.restore();
  }
}

/* ============================================================
   Enemies' thrown lantern orbs
   ============================================================ */
class Orb {
  constructor(x, y, dir, owner) {
    this.x = x; this.y = y; this.vx = dir * 300; this.vy = 0;
    this.r = 9; this.life = 3.2; this.dir = dir;
    this.dead = false; this.t = 0;
    this.owner = owner;
    this.hb = { x: x - 12, y: y - 12, w: 24, h: 24 };
    this.dmg = owner ? owner.T.dmg : 10;
  }
  update(dt) {
    this.t += dt; this.life -= dt;
    this.vy += 240 * dt * 0.35;
    this.x += this.vx * dt; this.y += this.vy * dt;
    if (this.y > GROUND_Y - 6) { this.y = GROUND_Y - 6; this.vy = -220; this.burst(); return; }
    if (this.x < 20 || this.x > WORLD.w - 20) this.dead = true;
    if (this.life <= 0) this.burst();
    this.hb = { x: this.x - 10, y: this.y - 10, w: 20, h: 20 };
    /* trail */
    if (Math.random() < 0.7) {
      FX.parts.push({ type: 'spark', x: this.x, y: this.y, vx: rand(-30, 30), vy: rand(-30, 30), life: 0.25, max: 0.25, w: 1.6, color: '#8ff0ff', grav: -30, drag: 2 });
    }
  }
  burst() {
    if (this.dead) return;
    this.dead = true;
    Audio_.break_();
    FX.ring(this.x, this.y, 4, 44, 0.3, 'rgba(120,240,255,', 3);
    for (let i = 0; i < 12; i++) {
      const a = Math.random() * TAU;
      FX.parts.push({ type: 'spark', x: this.x, y: this.y, vx: Math.cos(a) * rand(60, 220), vy: Math.sin(a) * rand(60, 220), life: rand(0.2, 0.4), max: 0.4, w: 2, color: '#9ff6ff', grav: 200, drag: 3 });
    }
  }
  draw(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    glowCircle(ctx, this.x, this.y, 34, 'rgba(110,230,255,0.55)', 1);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#dffcff';
    ctx.beginPath(); ctx.arc(this.x, this.y, 7 + Math.sin(this.t * 24) * 1.2, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(90,220,255,0.9)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.arc(this.x, this.y, 11, this.t * 8, this.t * 8 + 2.2); ctx.stroke();
    ctx.restore();
  }
}
