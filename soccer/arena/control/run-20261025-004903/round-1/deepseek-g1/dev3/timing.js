'use strict';
/* 单窗口响应耗时测量：最重要的硬约束是「单次响应 ≤ 5 秒」。 */
const path = require('path');
const sim = require('../simulation.js');
const { PyAgent } = require('../dev/arena.js');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
const PY = process.env.PYEXE || 'python';
const ME = arg('me', 'agent.py');
const OPP = arg('opp', 'dev3/opps/search_def.py');
const N = Number(arg('n', 6));
const SEED = Number(arg('seed', 2));
const ROOT = path.resolve(__dirname, '..');

(async () => {
  const me = new PyAgent(PY, ME, ROOT, 'me');
  const op = new PyAgent(PY, OPP, ROOT, 'op');
  const g = sim.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: SEED, teamSize: N });
  const lat = [];
  let wi = 0;
  while (g.status === 'playing' && wi < 240) {
    const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
    const t0 = process.hrtime.bigint();
    const r0 = JSON.parse(await me.ask(v0)).inputs;
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    lat.push(dt);
    const r1 = JSON.parse(await op.ask(v1)).inputs;
    sim.advanceWindow(g, [sim.submitWindow(g, 0, r0), sim.submitWindow(g, 1, r1)]);
    wi++;
  }
  me.kill(); op.kill();
  lat.sort((a, b) => a - b);
  const n = lat.length;
  const q = p => lat[Math.min(n - 1, Math.floor(p * n))];
  console.log(`n=${N} seed=${SEED} windows=${n} score=${g.score.join(':')} ` +
    `mean=${(lat.reduce((a, b) => a + b, 0) / n).toFixed(0)}ms ` +
    `p50=${q(0.5).toFixed(0)} p95=${q(0.95).toFixed(0)} p99=${q(0.99).toFixed(0)} max=${lat[n - 1].toFixed(0)}ms ` +
    `total=${(lat.reduce((a, b) => a + b, 0) / 1000).toFixed(1)}s`);
})();
