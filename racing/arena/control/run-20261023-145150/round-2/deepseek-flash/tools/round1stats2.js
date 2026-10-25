'use strict';
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');
const dir = path.resolve(__dirname, '..', '..', '..');

function analyze(file) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, file))));
  const me = d.seats.indexOf('deepseek-flash');
  const op = 1 - me;
  const F = d.frames;
  const N = F.length;
  const L = d.track.length;
  console.log(`\n===== ${d.id} seed=${d.seed} =====`);
  console.log(`起跑格: me(${F[0].cars[me].x.toFixed(2)},${F[0].cars[me].y.toFixed(2)}) angle=${F[0].cars[me].angle.toFixed(3)} | op(${F[0].cars[op].x.toFixed(2)},${F[0].cars[op].y.toFixed(2)}) angle=${F[0].cars[op].angle.toFixed(3)}`);

  // 连续段统计
  function segments(idx, key) {
    const segs = [];
    let start = -1;
    for (let f = 0; f < N; f++) {
      const v = !!F[f].cars[idx][key];
      if (v && start < 0) start = f;
      if (!v && start >= 0) { segs.push([start, f - 1]); start = -1; }
    }
    if (start >= 0) segs.push([start, N - 1]);
    return segs;
  }
  for (const [idx, tag] of [[me, '我'], [op, '对手']]) {
    const z = F[N - 1].cars[idx];
    const off = segments(idx, 'offRoad'), dr = segments(idx, 'drifting'), bo = segments(idx, 'boosting');
    console.log(`[${tag}] 漂移段 ${dr.length} 次 / 喷火段 ${bo.length} 次 / 出路段 ${off.length} 次; 计数 boosts=${z.boosts} driftTime=${z.driftTime}s collisions=${z.collisions}`);
    if (off.length) console.log(`   出路段: ` + off.map(([a, b]) => `${(a * 0.05).toFixed(2)}–${(b * 0.05).toFixed(2)}s`).join(', '));
    // 每圈平均速度（用圈事件切分）
    console.log(`   平均速度(全程): ${(z.progress / (z.finishTime || (N * 0.05))).toFixed(2)} 格/s`);
  }

  // 领先差距（剔除计圈瞬间 progress 跳变）
  const rows = [];
  for (let f = 30; f < N; f++) {
    const c = F[f].cars;
    let gap = c[me].progress - c[op].progress;
    if (Math.abs(gap) > 250) continue; // 计圈瞬间的 progress 跳变
    rows.push([f, gap, c[me].lap - c[op].lap]);
  }
  const maxRow = rows.reduce((a, b) => (b[1] > a[1] ? b : a));
  console.log(`最大领先 +${maxRow[1].toFixed(1)} 格 @ ${(maxRow[0] * 0.05).toFixed(1)}s`);
  // 每隔5秒打印
  const out = [];
  for (const [f, gap] of rows) if (f % 100 === 0) out.push(`${(f * 0.05).toFixed(0)}s:${gap >= 0 ? '+' : ''}${gap.toFixed(0)}`);
  console.log('差距曲线(格): ' + out.join(' '));
  // 每圈完成时差距
  for (const e of d.events) {
    if (e.type === 'lap') {
      const f = e.frame;
      const c = F[f].cars;
      console.log(`  ${e.text} 时，双方进度 ${c[me].progress.toFixed(1)} / ${c[op].progress.toFixed(1)} (差 ${(c[me].progress - c[op].progress).toFixed(1)})`);
    }
  }
  // 各车每圈时间
  const lapsMe = [], lapsOp = [];
  let prev = null;
  for (const e of d.events) if (e.type === 'lap') {
    if (e.team === me) lapsMe.push(e.time);
    if (e.team === op) lapsOp.push(e.time);
  }
  console.log(`圈速: 我 ${lapsMe.join(' / ')} | 对手 ${lapsOp.join(' / ')}`);
  // 最大速度出现时刻
  for (const [idx, tag] of [[me, '我'], [op, '对手']]) {
    let mv = 0, mf = 0;
    for (let f = 30; f < N; f++) { const s = F[f].cars[idx].speed; if (s > mv) { mv = s; mf = f; } }
    console.log(`[${tag}] 峰值 speed=${mv.toFixed(2)} @${(mf * 0.05).toFixed(1)}s (x=${F[mf].cars[idx].x.toFixed(1)},y=${F[mf].cars[idx].y.toFixed(1)}, boosting=${F[mf].cars[idx].boosting}, drifting=${F[mf].cars[idx].drifting})`);
  }
}

for (const f of ['r1-g1.json.gz', 'r1-g2.json.gz']) analyze(f);
