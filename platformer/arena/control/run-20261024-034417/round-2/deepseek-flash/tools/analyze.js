'use strict';
// 离线分析：统计生成关卡中的障碍分布与可通过性。
const sim = require('../simulation.js');
const { rules, TILE_SPIKE } = require('../catalog.js');

function runs(arr, pred) {
  const out = [];
  let s = -1;
  for (let i = 0; i <= arr.length; i++) {
    const v = i < arr.length && pred(arr[i]);
    if (v && s < 0) s = i;
    if (!v && s >= 0) { out.push([s, i - s]); s = -1; }
  }
  return out;
}

const stats = { seeds: 0, spikeWidths: {}, pitWidths: {}, badSeeds: [], noPlat4: [], pitNoBridge: {}, goal: [] };
for (let seed = 1; seed <= 800; seed++) {
  const L = sim.generateLevel(seed);
  stats.seeds++;
  const w = L.w;
  // 每列最高实心表面
  const height = [];
  const spikeRow = new Array(w).fill(false);
  for (let x = 0; x < w; x++) {
    let hgt = -1;
    for (let y = 0; y < L.h; y++) {
      const t = L.tiles[y * w + x];
      if (t === 1 || t === 2 || t === 4) { hgt = L.h - 1 - y; break; }
    }
    height.push(hgt);
    for (let y = 0; y < L.h; y++) if (L.tiles[y * w + x] === TILE_SPIKE) spikeRow[x] = true;
  }
  // 地刺连续段
  for (const [s, n] of runs(spikeRow, v => v)) stats.spikeWidths[n] = (stats.spikeWidths[n] || 0) + 1;
  // 坑：地面高度 <3（即没有 row>=groundY 的实心）的连续段
  const isPit = x => height[x] < 3;
  for (const [s, n] of runs(height, v => v < 3)) {
    stats.pitWidths[n] = (stats.pitWidths[n] || 0) + 1;
    const covered = L.platforms.some(pf => !(pf.to.x < s || pf.from.x > s + n));
    if (n >= 4 && !covered) stats.noPlat4.push([seed, s, n]);
    if (n <= 3) {
      const key = n;
      stats.pitNoBridge[key] = stats.pitNoBridge[key] || { total: 0, withCrumble: 0, withPlat: 0 };
      stats.pitNoBridge[key].total++;
      let crumble = false;
      for (let k = 0; k < n; k++) for (let y = 13; y < 16; y++) if (L.tiles[y * w + s + k] === 4) crumble = true;
      if (crumble) stats.pitNoBridge[key].withCrumble++;
      if (covered) stats.pitNoBridge[key].withPlat++;
    }
  }
  if (Object.keys(stats.spikeWidths).includes('3') && spikeRow.some((v, x) => v)) {
    // 记录本 seed 是否有 3 连刺
  }
  let has3 = false;
  for (const [s, n] of runs(spikeRow, v => v)) if (n >= 3) has3 = true;
  if (has3) stats.badSeeds.push(seed);
  stats.goal.push(L.goalX);
}
console.log('seeds', stats.seeds);
console.log('spike run widths', stats.spikeWidths);
console.log('pit widths', stats.pitWidths);
console.log('pits<=3 coverage', stats.pitNoBridge);
console.log('pits>=4 without platform', stats.noPlat4.length);
console.log('seeds with >=3-wide spikes:', stats.badSeeds.length, stats.badSeeds.slice(0, 30));
console.log('goalX min/max/avg', Math.min(...stats.goal), Math.max(...stats.goal), (stats.goal.reduce((a, b) => a + b, 0) / stats.goal.length).toFixed(1));
