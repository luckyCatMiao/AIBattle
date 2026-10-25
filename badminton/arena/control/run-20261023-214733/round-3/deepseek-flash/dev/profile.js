'use strict';
// 弹道剖面：给定出球点与目标，打印关键高度的位置
const core = require('../core.js');
const { rules } = require('../catalog.js');
const NET = rules.netX, L = rules.courtLength;

function profile(name, x0, y0, kind, dir, target) {
  const ranges = {
    smash: [-0.42, -0.30, -0.18, -0.06, 0.06, 0.16, 0.26, 0.34],
    clear: [0.60, 0.72, 0.85], drop: [0.42, 0.55, 0.68], lift: [1.05, 1.20],
  }[kind];
  let chosen = null;
  for (const angle of ranges) {
    const speed = core.solveSpeed(x0, y0, angle, dir, target);
    const tr = core.shotTrace(x0, y0, angle, speed, dir);
    if (!tr.netHit && tr.landX > -0.05 && tr.landX < L + 0.05) { chosen = { angle, speed, tr }; break; }
  }
  if (!chosen) { console.log(name, 'NO VALID SHOT'); return; }
  const { angle, speed, tr } = chosen;
  console.log(`${name}: angle=${angle.toFixed(2)} speed=${speed.toFixed(2)} netY=${tr.netY.toFixed(2)} land=${tr.landX.toFixed(2)} T=${tr.landT.toFixed(3)}`);
  // 逐帧剖面
  const dt = core.SUB;
  let x = x0, y = y0, vx = dir * speed * Math.cos(angle), vy = speed * Math.sin(angle);
  const marks = [3.0, 2.6, 2.4, 2.2, 2.0, 1.8, 1.5, 1.2, 0.9, 0.6];
  const out = [];
  for (let n = 0; n < 20 * 5; n++) {
    for (let k = 0; k < rules.substeps; k++) {
      const sp = Math.hypot(vx, vy);
      vx -= vx * rules.shuttleDrag * sp * dt; vy -= vy * rules.shuttleDrag * sp * dt; vy -= rules.gravity * dt;
      x += vx * dt; y += vy * dt;
      if (y > rules.ceiling) { y = rules.ceiling; vy = -Math.abs(vy) * 0.25; }
      for (const m of marks) if (!out.find(o => o.m === m) && y <= m) out.push({ m, x, t: (n + (k + 1) / rules.substeps) * dt });
      if (y <= rules.shuttleRadius) { n = 1e9; break; }
    }
  }
  console.log('   ' + out.map(o => `y${o.m}:x${o.x.toFixed(2)}@${o.t.toFixed(2)}`).join('  '));
}

console.log('== team0 右向 ==');
profile('clear 从2.5高1.9  ->11.9', 2.5, 1.9, 'clear', 1, 11.9);
profile('clear 从3.5高2.3  ->11.9', 3.5, 2.3, 'clear', 1, 11.9);
profile('lift 从3.5低0.7  ->11.4', 3.5, 0.7, 'lift', 1, 11.4);
profile('drop 从2.5高2.2  ->9.4', 2.5, 2.2, 'drop', 1, 9.4);
profile('drop 从2.5高2.6  ->9.4', 2.5, 2.6, 'drop', 1, 9.4);
profile('smash 从5.0高2.4 ->8.3', 5.0, 2.4, 'smash', 1, 8.3);
profile('smash 从5.0高2.4 ->12.4', 5.0, 2.4, 'smash', 1, 12.4);
profile('smash 从4.0高2.4 ->8.3', 4.0, 2.4, 'smash', 1, 8.3);
profile('smash 从4.0高2.4 ->12.4', 4.0, 2.4, 'smash', 1, 12.4);
console.log('== team1 左向（镜像） ==');
profile('clear 从10.9高1.9 ->1.5', 10.9, 1.9, 'clear', -1, 1.5);
profile('lift 从9.9低0.7   ->2.0', 9.9, 0.7, 'lift', -1, 2.0);
profile('drop 从10.9高2.2 ->4.0', 10.9, 2.2, 'drop', -1, 4.0);
profile('smash 从8.4高2.4 ->5.1', 8.4, 2.4, 'smash', -1, 5.1);
