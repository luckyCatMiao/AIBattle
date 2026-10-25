'use strict';
/* 检查点通过裕度统计：统计每个检查点的最近通过距离 / 半径。
 * 用法：SEAT=0 SEEDFILE=randseeds.txt node tools/cpstat.js <params.json|default>
 */
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const sim = require('../simulation');

class Agent {
  constructor() {
    this.q = []; this.w = []; this.buf = '';
    this.c = spawn('python', ['-u', 'agent.py'], { cwd: path.join(__dirname, '..'), env: process.env });
    this.c.stdout.on('data', d => {
      this.buf += d;
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const l = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        const w = this.w.shift(); if (w) w(l);
      }
    });
  }
  ask(l) { this.c.stdin.write(l + '\n'); return new Promise(r => this.w.push(r)); }
  kill() { try { this.c.kill(); } catch (e) {} }
}

(async () => {
  const sf = process.env.SEEDFILE || 'randseeds.txt';
  const seeds = fs.readFileSync(path.join(__dirname, sf), 'utf8').trim().split(',').map(Number);
  const seat = Number(process.env.SEAT || 0);
  const opp = 1 - seat;
  const out = [];
  for (const seed of seeds) {
    const a = new Agent();
    const g = sim.createMatch({ id: 't', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
    const cpMin = g.track.checkpoints.map(() => 99);
    let n = 0;
    while (g.status === 'playing' && n < 200) {
      const line = await a.ask(JSON.stringify(sim.view(g, seat)));
      const w = sim.submitWindow(g, seat, JSON.parse(line).inputs);
      for (let i = 0; i < 20 && g.status === 'playing'; i++) {
        for (const c of g.cars) c.held = (w[i] && w[i][0]) || { throttle: 0 };
        g.cars[opp].held = { throttle: 0, steer: 0, drift: false, boost: false };
        sim.step(g);
        const car = g.cars[seat];
        for (let k = 0; k < g.track.checkpoints.length; k++) {
          const cp2 = g.track.checkpoints[k];
          const dd = Math.hypot(car.x - cp2.x, car.y - cp2.y);
          if (dd < cpMin[k]) cpMin[k] = dd;
        }
      }
      n++;
    }
    a.kill();
    const ratios = cpMin.map((d, k) => d / g.track.checkpoints[k].radius);
    out.push({ seed, maxRatio: Math.max(...ratios), finished: g.cars[seat].finished });
  }
  const mr = out.map(o => o.maxRatio);
  const over = out.filter(o => o.maxRatio > 0.85).map(o => o.seed);
  const unf = out.filter(o => !o.finished).map(o => o.seed);
  console.log(JSON.stringify({
    cfg: (process.env.AGENT_PARAMS || 'default').split(/[\\/]/).pop(), seat, n: out.length,
    max: +Math.max(...mr).toFixed(2),
    p95: +mr.slice().sort((a, b) => a - b)[Math.floor(mr.length * 0.95)].toFixed(2),
    over85: over.length, seeds: over.slice(0, 15), unfinished: unf,
  }));
})();
