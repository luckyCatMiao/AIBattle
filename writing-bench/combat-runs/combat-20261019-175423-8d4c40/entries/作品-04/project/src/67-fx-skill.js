'use strict';
/* ============================================================
   Skill VFX — petals, thorns, bloom bursts
   ============================================================ */
const Thorns = {
  list: [],
  clear() { this.list.length = 0; },
  spawn(x, lean) {
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      this.list.push({
        x: x + rand(-16, 16), y: GROUND_Y - 2,
        h: rand(34, 96), w: rand(5, 11),
        lean: lean * 0.35 + rand(-0.25, 0.25),
        life: rand(0.5, 0.95), max: 0.95,
        grow: 0, rot: rand(-0.1, 0.1),
        seed: Math.random() * 10
      });
    }
    FX.parts.push({ type: 'dust', x, y: GROUND_Y - 4, vx: 0, vy: -60, life: 0.4, max: 0.4, r: 18, color: 'rgba(255,120,130,', grav: 0, drag: 5 });
  },
  update(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const t = this.list[i];
      t.life -= dt;
      t.grow = Math.min(1, t.grow + dt * 9);
      if (t.life <= 0) this.list.splice(i, 1);
    }
  },
  draw(ctx) {
    for (const t of this.list) {
      const grow = easeOutBack(clamp(t.grow, 0, 1));
      const a = clamp(t.life / 0.35, 0, 1);
      const h = t.h * grow;
      const lean = t.lean * h * 0.8;
      ctx.save();
      ctx.translate(t.x, t.y);
      ctx.rotate(t.rot);
      /* spike body */
      ctx.beginPath();
      ctx.moveTo(-t.w / 2, 0);
      ctx.quadraticCurveTo(-t.w * 0.4 + lean * 0.5, -h * 0.55, lean, -h);
      ctx.quadraticCurveTo(t.w * 0.35 + lean * 0.4, -h * 0.5, t.w / 2, 0);
      ctx.closePath();
      const g = ctx.createLinearGradient(0, 0, lean, -h);
      g.addColorStop(0, 'rgba(70,10,20,' + a + ')');
      g.addColorStop(0.55, 'rgba(178,28,44,' + a + ')');
      g.addColorStop(1, 'rgba(255,170,180,' + a + ')');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = 'rgba(20,4,10,' + (0.7 * a) + ')'; ctx.lineWidth = 1.4; ctx.stroke();
      /* hot edge */
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,120,130,' + (0.55 * a) + ')'; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(lean * 0.4, -h * 0.55, lean, -h); ctx.stroke();
      /* blossom at the tip */
      if (t.life > 0.15) {
        ctx.fillStyle = 'rgba(255,190,200,' + (0.85 * a) + ')';
        for (let p = 0; p < 5; p++) {
          const pa = (p / 5) * TAU + t.seed;
          ctx.beginPath();
          ctx.ellipse(lean + Math.cos(pa) * 3.4, -h + Math.sin(pa) * 3.4, 4.4, 2.4, pa, 0, TAU);
          ctx.fill();
        }
      }
      ctx.restore();
    }
  }
};

const Bloom = {
  bursts: [],
  spawn(x, y, color, n = 22, speed = 300) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      FX.parts.push({
        type: 'petal', x, y, vx: Math.cos(a) * rand(speed * 0.2, speed), vy: Math.sin(a) * rand(speed * 0.2, speed) - 80,
        life: rand(0.5, 1.1), max: 1.1, r: rand(2.2, 5), color,
        grav: 200, drag: 1.4, rot: Math.random() * TAU, spin: rand(-10, 10)
      });
    }
  }
};
