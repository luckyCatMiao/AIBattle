'use strict';
/* Latency probe: plays one match and records per-window response time for side A.
 * usage: node dev/latency.js --seed 9000 --a "python agent.py" --b "python dev/opps/none.py" */
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine.js');
function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) { const k = argv[i], n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) a[k.slice(2)] = true; else { a[k.slice(2)] = n; i++; } }
  return a;
}
const win20 = []; for (let i = 0; i < 20; i++) win20.push({ dir: 'N', btn: null });
class Agent {
  constructor(cmd) { const p = cmd.split(' ');
    this.proc = spawn(p[0], p.slice(1), { cwd: path.resolve(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = ''; this.lines = []; this.waiters = []; this.dead = false;
    this.proc.stdout.on('data', d => { this.buf += d.toString(); let i;
      while ((i = this.buf.indexOf('\n')) >= 0) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (l) this.lines.push(l); }
      while (this.lines.length && this.waiters.length) this.waiters.shift()(this.lines.shift()); });
    this.proc.stderr.on('data', () => { });
    this.proc.on('close', () => { this.dead = true; while (this.waiters.length) this.waiters.shift()(null); }); }
  next(ms = 5000) { if (this.lines.length) return Promise.resolve(this.lines.shift()); if (this.dead) return Promise.resolve(null);
    return new Promise(r => { const t = setTimeout(() => r(null), ms); this.waiters.push(l => { clearTimeout(t); r(l); }); }); }
  send(o) { this.proc.stdin.write(JSON.stringify(o) + '\n'); }
  kill() { try { this.proc.kill(); } catch (e) { } }
}
(async () => {
  const args = parseArgs(process.argv);
  const seed = parseInt(args.seed || '9000', 10);
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const ag = [new Agent(args.a || 'python agent.py'), new Agent(args.b || 'python dev/opps/none.py')];
  const times = [];
  let w = 0;
  while (g.status === 'playing' && w < 800) {
    w++;
    const obs = [0, 1].map(o => { const s = engine.snapshot(g, o); s.lastErrors = []; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = win20; return s; });
    const t0 = process.hrtime.bigint();
    ag.forEach((a, i) => a.send(obs[i]));
    const rep = await Promise.all(ag.map(a => a.next()));
    const dt = Number(process.hrtime.bigint() - t0) / 1e6;
    times.push(dt);
    const wi = [null, null];
    for (let i = 0; i < 2; i++) { try { wi[i] = engine.submitWindow(g, i, JSON.parse(rep[i]).inputs); } catch (e) { console.log('TECH', i); ag.forEach(a => a.kill()); return; } }
    engine.advanceWindow(g, wi);
  }
  ag.forEach(a => a.kill());
  times.sort((a, b) => a - b);
  const q = p => times[Math.min(times.length - 1, Math.floor(times.length * p))].toFixed(1);
  console.log(`windows=${times.length} median=${q(0.5)}ms p95=${q(0.95)}ms p99=${q(0.99)}ms max=${times[times.length - 1].toFixed(1)}ms`);
})();
