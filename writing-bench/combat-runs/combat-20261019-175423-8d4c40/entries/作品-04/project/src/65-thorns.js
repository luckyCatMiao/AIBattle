'use strict';
/* ============================================================
   Thorn wave — 血椿 crimson spikes erupting along the ground
   ============================================================ */
class ThornWave {
  constructor(x, dir) {
    this.x = x; this.dir = dir;
    this.t = 0; this.dur = 0.95;
    this.reach = 470;
    this.hit = new Set();
    this.step = 0;
    this.stepT = 0;
    this.dead = false;
  }
  update(dt) {
    this.t += dt;
    this.stepT += dt;
    if (this.t > this.dur) this.dead = true;
    /* six bursts walking forward */
    const N = 7;
    while (this.step < N && this.t >= 0.02 + this.step * 0.055) {
      const i = this.step++;
      const d = 34 + i * (this.reach / N);
      const bx = this.x + this.dir * d;
      Game.spawnThorns(bx, this.dir * (1 - i / (N + 2)));
      /* damage anything standing there */
      for (const e of Game.enemies) {
        if (!e.alive) continue;
        if (Math.abs(e.x - bx) < 54 && !this.hit.has(e.id + '_' + i)) {
          this.hit.add(e.id + '_' + i);
          Game.skillHit(e, skillDef({ dmg: 15, limbDmg: 82, hitstop: 0.075, shake: 0.2, kb: 190, kbY: -300, hitH: 0.3, heavy: true, crack: true }));
        }
      }
    }
  }
}
