/* Measure time-to-combat from a cold start with simple scripted play. */
const H = require('./harness_lib.js');
const t0 = process.hrtime.bigint();
H.key('Enter', true); H.key('Enter', false);
const w = H.world(), p = w.player;
let firstEnemyT = -1, firstHitT = -1, firstAttackableT = -1, frames = 0;
for (let i = 0; i < 600; i++) { // up to ~9.6s of sim
  const alive = w.enemies.filter(e => !e.dead);
  if (firstEnemyT < 0 && alive.length) firstEnemyT = i * 16 / 1000;
  let e = null, best = 1e9;
  for (const c of alive) { const d = Math.abs(c.x - p.x); if (d < best) { best = d; e = c; } }
  if (e) {
    const dx = e.x - p.x;
    H.key('KeyD', dx > 30); H.key('KeyA', dx < -30);
    if (firstAttackableT < 0 && best < 120) firstAttackableT = i * 16 / 1000;
    if (best < 110) { H.key('KeyJ', true); H.key('KeyJ', false); }
  }
  H.frame(16);
  frames = i;
  if (firstHitT < 0 && w.stats.hitCount > 0) { firstHitT = i * 16 / 1000; break; }
}
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log('first enemy alive at', firstEnemyT.toFixed(2) + 's');
console.log('player within attack range at', firstAttackableT.toFixed(2) + 's');
console.log('first landed hit at', firstHitT.toFixed(2) + 's');
console.log('sim frames used', frames + 1, '| wall time', ms.toFixed(0) + 'ms');
if (firstEnemyT < 0 || firstEnemyT > 2.5) throw new Error('enemy did not appear promptly');
if (firstHitT < 0 || firstHitT > 5) throw new Error('combat did not start promptly');
console.log('COLD START OK');
