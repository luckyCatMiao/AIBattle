'use strict';
/* Parallel A/B: splits seeds across K processes and aggregates.
 * usage: node dev/parab.js --count 60 --seed 9000 --procs 6 --a "python agent.py" --b "python dev/agents/v1.py" */
const { spawn } = require('child_process');
const path = require('path');
function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) { const k = argv[i], n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) a[k.slice(2)] = true; else { a[k.slice(2)] = n; i++; } }
  return a;
}
const args = parseArgs(process.argv);
const count = parseInt(args.count || '40', 10);
const seed0 = parseInt(args.seed || '9000', 10);
const procs = parseInt(args.procs || '7', 10);
const per = Math.ceil(count / procs);

function runChunk(i) {
  return new Promise(res => {
    const s = seed0 + i * per;
    const t0 = Date.now();
    const p = spawn(process.execPath, [path.join(__dirname, 'ab.js'), '--count', String(per), '--seed', String(s),
      '--a', args.a, '--b', args.b], { cwd: path.resolve(__dirname, '..'), stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => out += d.toString());
    p.on('close', () => res({ chunk: i, out, dt: (Date.now() - t0) / 1000 }));
  });
}

(async () => {
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: procs }, (_, i) => runChunk(i)));
  let mw = 0, ml = 0, md = 0, gw = 0, gl = 0, gd = 0, mtech = 0;
  for (const r of rs) {
    const m = r.out.match(/matches \d+: A=.*?W (\d+).*?L (\d+)\s+D (\d+)\s+tech (\d+)/);
    if (m) { mw += +m[1]; ml += +m[2]; md += +m[3]; mtech += +m[4]; }
    const g = r.out.match(/rounds\s+\d+: W (\d+).*?L (\d+)\s+D (\d+)/);
    if (g) { gw += +g[1]; gl += +g[2]; gd += +g[3]; }
    if (!m) console.log('chunk failed:', r.out.slice(-400));
  }
  const n = mw + ml + md, gn = gw + gl + gd;
  console.log(`matches ${n}: W ${mw} (${(100 * mw / Math.max(1, n)).toFixed(1)}%) L ${ml} D ${md} tech ${mtech}`);
  console.log(`match W/(W+L)=${(100 * mw / Math.max(1, mw + ml)).toFixed(1)}%   draws ${(100 * md / Math.max(1, n)).toFixed(1)}%`);
  console.log(`rounds  ${gn}: W ${gw} (${(100 * gw / Math.max(1, gn)).toFixed(1)}%) L ${gl} D ${gd}   round W/(W+L)=${(100 * gw / Math.max(1, gw + gl)).toFixed(1)}%`);
  console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`);
})();
