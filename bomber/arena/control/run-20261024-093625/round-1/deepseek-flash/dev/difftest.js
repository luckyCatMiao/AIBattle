'use strict';
/* 差分测试数据生成：用随机输入驱动真实引擎，把每个窗口结束时的快照写出来。
 * usage: node dev/difftest.js --seed 1 --windows 20 --out dev/diffcase.json */
const fs = require('fs');
const engine = require('./engine.js');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) { const n = argv[i + 1]; if (n === undefined || n.startsWith('--')) a[k.slice(2)] = true; else { a[k.slice(2)] = n; i++; } }
  }
  return a;
}
function mulberry(seed) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function main() {
  const args = parseArgs(process.argv);
  const seed = parseInt(args.seed || '1', 10);
  const nWindows = parseInt(args.windows || '20', 10);
  const rng = mulberry(seed * 7919 + 13);
  const dirs = ['N', 'U', 'D', 'L', 'R'];
  const g = engine.createMatch({ id: 'd', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const out = { seed, windows: [], snaps: [] };
  out.snaps.push(engine.snapshot(g, 0));
  for (let w = 0; w < nWindows; w++) {
    const win = [];
    for (let p = 0; p < 2; p++) {
      const frames = [];
      let d = dirs[Math.floor(rng() * 5)];
      for (let i = 0; i < 20; i++) {
        if (rng() < 0.12) d = dirs[Math.floor(rng() * 5)];
        frames.push({ dir: d, btn: (!args.nobomb && rng() < 0.02 ? 'BOMB' : null) });
      }
      win.push(frames);
    }
    out.windows.push(win);
    const norm = [engine.submitWindow(g, 0, win[0]), engine.submitWindow(g, 1, win[1])];
    engine.advanceWindow(g, norm);
    out.snaps.push(engine.snapshot(g, 0));
    if (g.status !== 'playing') break;
  }
  fs.writeFileSync(args.out || 'dev/diffcase.json', JSON.stringify(out));
  console.log('wrote', out.windows.length, 'windows, status', g.status);
}
main();
