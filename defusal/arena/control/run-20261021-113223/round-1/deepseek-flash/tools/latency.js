'use strict';
// Measure agent response latency per decision window.
const { runMatch } = require('./run_match');
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require('../simulation');

class Timed {
  constructor(tag) {
    this.tag = tag;
    this.proc = spawn('python3', ['/workspace/agent.py'], { stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.q = []; this.w = [];
    this.rl.on('line', l => { const w = this.w.shift(); if (w) w(l); else this.q.push(l); });
    this.proc.stderr.on('data', d => process.stderr.write('[' + tag + '] ' + d));
    this.times = [];
  }
  ask(obj) {
    const t0 = process.hrtime.bigint();
    this.proc.stdin.write(JSON.stringify(obj) + '\n');
    return new Promise((res, rej) => {
      const tm = setTimeout(() => rej(new Error('timeout ' + this.tag)), 5000);
      this.w.push(l => { clearTimeout(tm); this.times.push(Number(process.hrtime.bigint() - t0) / 1e6); res(JSON.parse(l)); });
      if (this.q.length) { clearTimeout(tm); this.times.push(Number(process.hrtime.bigint() - t0) / 1e6); res(JSON.parse(this.q.shift())); }
    });
  }
  async buy(v) { return this.ask({ ...v, phase: 'buy' }); }
  async live(v) { return this.ask(v); }
  kill() { try { this.proc.kill(); } catch (e) {} }
}

async function main() {
  const seeds = (process.argv[2] || '1,2,3').split(',').map(Number);
  let all = [];
  for (const seed of seeds) {
    const a = new Timed('a'), b = new Timed('b');
    const g = sim.createMatch({ id: 'l' + seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
    let guard = 0;
    while (g.status === 'playing' && guard++ < 5000) {
      if (g.phase === 'buy') {
        const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
        const [b0, b1] = await Promise.all([a.buy(v0), b.buy(v1)]);
        sim.submitBuys(g, 0, b0.buys || []); sim.submitBuys(g, 1, b1.buys || []);
      } else if (g.phase === 'live') {
        const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
        const [i0, i1] = await Promise.all([a.live(v0), b.live(v1)]);
        const w0 = sim.submitWindow(g, 0, i0.inputs), w1 = sim.submitWindow(g, 1, i1.inputs);
        sim.advanceWindow(g, [w0, w1]);
      } else break;
    }
    a.kill(); b.kill();
    all = all.concat(a.times);
    console.log(`seed ${seed}: windows=${a.times.length} max=${Math.max(...a.times).toFixed(0)}ms`);
  }
  all.sort((x, y) => x - y);
  console.log(`overall n=${all.length} p50=${all[Math.floor(all.length * 0.5)].toFixed(0)}ms p95=${all[Math.floor(all.length * 0.95)].toFixed(0)}ms max=${all[all.length - 1].toFixed(0)}ms`);
}
main().catch(e => { console.error(e); process.exit(1); });
