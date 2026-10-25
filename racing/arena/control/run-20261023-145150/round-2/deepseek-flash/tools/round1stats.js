'use strict';
// 复盘用：读取官方回放（r1-g1/g2.json.gz），统计双方逐窗口差距、圈速、喷火/漂移、出路面等。
const zlib = require('zlib');
const fs = require('fs');
const path = require('path');

const dir = path.resolve(__dirname, '..', '..', '..');
const files = ['r1-g1.json.gz', 'r1-g2.json.gz'];

function analyze(file) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, file))));
  const N = d.frames.length;
  const me = d.seats.indexOf('deepseek-flash');
  const op = 1 - me;
  const cs = (f) => d.frames[f].cars;
  console.log(`\n===== ${d.id} seed=${d.seed} seats=${JSON.stringify(d.seats)} =====`);
  console.log(`track length=${d.track.length.toFixed(2)} halfWidth=${d.track.halfWidth.toFixed(3)} roadTiles=${d.track.audit.roadTiles} minSelfDist=${d.track.audit.minSelfDistance.toFixed(2)} attempt=${d.track.audit.attempt}`);
  console.log(`frames=${N} windows=${d.windows.length} matchSec=${d.rules.matchSeconds} laps=${d.rules.laps} decisionFrames=${d.rules.decisionFrames}`);

  // 每 20 帧采样
  const step = 20;
  let bestLead = { me: -1e9, op: -1e9 };
  let leadSwitches = 0, lastSign = 0;
  const rows = [];
  let offMe = 0, offOp = 0, boostMe = 0, boostOp = 0, driftMe = 0, driftOp = 0;
  for (let f = 0; f < N; f += step) {
    const c = cs(f);
    const a = c[me], b = c[op];
    const gap = a.progress - b.progress;
    if (a.progress > 0 && b.progress > 0) {
      bestLead.me = Math.max(bestLead.me, gap);
      bestLead.op = Math.max(bestLead.op, -gap);
      const sign = Math.sign(gap);
      if (lastSign !== 0 && sign !== 0 && sign !== lastSign) leadSwitches++;
      if (sign !== 0) lastSign = sign;
    }
    if (a.offRoad) offMe++;
    if (b.offRoad) offOp++;
    if (a.boosting) boostMe++;
    if (b.boosting) boostOp++;
    if (a.drifting) driftMe++;
    if (b.drifting) driftOp++;
    rows.push({ t: f * 0.05, fps: f, gap, lapA: a.lap, lapB: b.lap, va: a.speed, vb: b.speed });
  }
  // 采样行打印关键节点（每 5 秒）
  console.log('t(s) | 我的进度-对手 | lap(me/op) | v(me/op)');
  for (const r of rows) {
    if (r.fps % 100 === 0 || Math.abs(r.gap) < 1) {
      console.log(`${r.t.toFixed(0).padStart(3)} | ${(r.gap >= 0 ? '+' : '') + r.gap.toFixed(1).padStart(8)} | ${r.lapA}/${r.lapB} | ${r.va.toFixed(1)}/${r.vb.toFixed(1)}`);
    }
  }
  const nSample = rows.length;
  console.log(`offRoad 采样占比: me ${(100 * offMe / nSample).toFixed(1)}%  op ${(100 * offOp / nSample).toFixed(1)}%`);
  console.log(`boosting 采样占比: me ${(100 * boostMe / nSample).toFixed(1)}%  op ${(100 * boostOp / nSample).toFixed(1)}%`);
  console.log(`drifting 采样占比: me ${(100 * driftMe / nSample).toFixed(1)}%  op ${(100 * driftOp / nSample).toFixed(1)}%`);
  console.log(`最大领先: me ${bestLead.me.toFixed(1)} 格 / op ${bestLead.op.toFixed(1)} 格, 采样内领先交换 ${leadSwitches} 次`);

  // 逐帧补充：最高速度、出路面次数（连续段）、漂移/喷火转换次数
  const last = cs(N - 1);
  for (const [idx, tag] of [[me, 'me'], [op, 'op']]) {
    let maxV = 0, offSegs = 0, prevOff = false, wallLike = 0, prevV = 0;
    for (let f = 30; f < N; f++) {
      const c = cs(f).cars ? cs(f)[idx] : cs(f)[idx];
      if (c.speed > maxV) maxV = c.speed;
      if (c.offRoad && !prevOff) offSegs++;
      prevOff = c.offRoad;
    }
    const z = last[idx];
    console.log(`[${tag}] finish=${z.finishTime} laps=${z.lap} bestLap=${z.bestLap} boosts=${z.boosts} driftTime=${z.driftTime} collisions=${z.collisions} maxV=${maxV.toFixed(2)} offSegs=${offSegs}`);
  }

  // 每圈分段：从事件时间计算
  console.log('events:');
  for (const e of d.events) if (e.type === 'lap') console.log(`  t=${e.t} ${e.text}`);
  // 窗口输入统计
  let fullThrottle = [0, 0], brake = [0, 0], steerAbs = [0, 0], boostFrames = [0, 0], driftFrames = [0, 0], frames = 0;
  for (const w of d.windows) {
    if (!Array.isArray(w.inputs)) continue;
    for (let ci = 0; ci < 2; ci++) {
      const arr = w.inputs[ci];
      if (!Array.isArray(arr)) continue;
      for (const fr of arr) {
        const inp = Array.isArray(fr) ? fr[0] : fr;
        if (!inp || typeof inp !== 'object') continue;
        if ((inp.throttle || 0) > 0.99) fullThrottle[ci]++;
        if ((inp.throttle || 0) < -0.01) brake[ci]++;
        steerAbs[ci] += Math.abs(inp.steer || 0);
        if (inp.boost) boostFrames[ci]++;
        if (inp.drift) driftFrames[ci]++;
      }
    }
    frames++;
  }
  const total = frames * 20;
  console.log(`输入统计(共${total}帧): me 全油门 ${(100 * fullThrottle[me] / total).toFixed(1)}% 刹车 ${(100 * brake[me] / total).toFixed(1)}% |steer|均值 ${(steerAbs[me] / total).toFixed(3)} boost键 ${(100 * boostFrames[me] / total).toFixed(1)}% drift键 ${(100 * driftFrames[me] / total).toFixed(1)}%`);
  console.log(`           op 全油门 ${(100 * fullThrottle[op] / total).toFixed(1)}% 刹车 ${(100 * brake[op] / total).toFixed(1)}% |steer|均值 ${(steerAbs[op] / total).toFixed(3)} boost键 ${(100 * boostFrames[op] / total).toFixed(1)}% drift键 ${(100 * driftFrames[op] / total).toFixed(1)}%`);

  // 差距曲线极小/极大时刻
  let minGapAt = rows.find((r) => r.fps >= 30);
  let maxGapAt = rows.find((r) => r.fps >= 30);
  let closest = null;
  for (const r of rows) {
    if (r.fps < 30) continue;
    if (r.gap < minGapAt.gap) minGapAt = r;
    if (r.gap > maxGapAt.gap) maxGapAt = r;
    if (Math.abs(r.gap) < 6 && r.fps > 100 && !closest) closest = r;
  }
  console.log(`最小差距(我方视角) t=${minGapAt.t}s gap=${minGapAt.gap.toFixed(1)}; 最大差距 t=${maxGapAt.t}s gap=${maxGapAt.gap.toFixed(1)}`);
}

for (const f of files) analyze(f);
