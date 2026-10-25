'use strict';
// 离线分析：正确统计地面高度、坑、平台、地刺、台阶、食人花、锯齿。
const sim = require('../simulation.js');
const { rules, TILE_SPIKE } = require('../catalog.js');

function runs(arr, pred) {
  const out = []; let s = -1;
  for (let i = 0; i <= arr.length; i++) {
    const v = i < arr.length && pred(arr[i]);
    if (v && s < 0) s = i;
    if (!v && s >= 0) { out.push([s, i - s]); s = -1; }
  }
  return out;
}

const spikeWidths = {}, pitWidths = {}, stepHeights = {};
const pitCover = { 2: { plat: 0, crumble: 0, none: 0 }, 3: { plat: 0, crumble: 0, none: 0 }, 4: { plat: 0, crumble: 0, none: 0 } };
let seedsWith3 = 0, badSeeds = [];
let pit3Bare = []; // 3 宽坑无桥（需直接跳）
let platformOver = 0;
for (let seed = 1; seed <= 2000; seed++) {
  const L = sim.generateLevel(seed);
  const w = L.w;
  const surf = []; // 最高实心表面世界 y（无实心 = -99）
  const spike = [];
  for (let x = 0; x < w; x++) {
    let top = -99;
    for (let y = 0; y < L.h; y++) {
      const t = L.tiles[y * w + x];
      if (t === 1 || t === 2 || t === 4) { top = L.h - y; break; }
    }
    surf.push(top);
    spike.push(L.tiles[(rules.groundY - 1) * w + x] === TILE_SPIKE);
  }
  for (const [s, n] of runs(spike, v => v)) spikeWidths[n] = (spikeWidths[n] || 0) + 1;
  let has3 = false;
  for (const [s, n] of runs(spike, v => v)) if (n >= 3) has3 = true;
  if (has3) { seedsWith3++; if (badSeeds.length < 20) badSeeds.push(seed); }
  for (const [s, n] of runs(surf, v => v < 3)) {
    pitWidths[n] = (pitWidths[n] || 0) + 1;
    if (n >= 2 && n <= 4) {
      const covered = L.platforms.some(pf => !(pf.to.x < s - 1.2 || pf.from.x > s + n + 1.2));
      let crumble = false;
      for (let k = 0; k < n; k++) for (let y = 13; y < 16; y++) if (L.tiles[y * w + s + k] === 4) crumble = true;
      if (covered) { pitCover[n].plat++; if (n === 4) platformOver++; }
      else if (crumble) pitCover[n].crumble++;
      else { pitCover[n].none++; if (n === 3 && pit3Bare.length < 10) pit3Bare.push([seed, s]); }
    }
  }
}
console.log('spike widths', spikeWidths);
console.log('spike>=3 seeds', seedsWith3, '/2000', badSeeds);
console.log('pit widths (<=8)', Object.fromEntries(Object.entries(pitWidths).filter(([k]) => +k <= 8)));
console.log('pit cover', pitCover, 'pit4withPlatform', platformOver);
console.log('bare 3-pits sample', pit3Bare);
