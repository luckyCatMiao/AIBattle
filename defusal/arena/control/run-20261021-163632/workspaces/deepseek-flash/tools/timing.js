'use strict';
/* 协议耗时测试：真引擎驱动一个 agent 进程，记录每次请求的响应耗时。
 * 用法: node tools/timing.js --seed 1 [--agent 'python3 -u agent.py']
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'simulation.js'));

const args = process.argv.slice(2);
let seed = 1, cmd = 'python3 -u agent.py';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed') seed = +args[++i];
  else if (args[i] === '--agent') cmd = args[++i];
}

function makeAgent(c) {
  const p = spawn(c[0], c.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [], waiters = [];
  let stderr = '';
  p.stderr.on('data', d => { stderr += String(d); });
  rl.on('line', (line) => {
    let v = null; try { v = JSON.parse(line); } catch (e) {}
    if (waiters.length) waiters.shift()(v); else queue.push(v);
  });
  p.on('exit', () => { while (waiters.length) waiters.shift()(null); });
  return {
    ask(obs) {
      const t0 = process.hrtime.bigint();
      p.stdin.write(JSON.stringify(obs) + '\n');
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout 5s')), 5000);
        const done = (v) => {
          clearTimeout(t);
          const ms = Number(process.hrtime.bigint() - t0) / 1e6;
          res({ v, ms });
        };
        if (queue.length) done(queue.shift()); else waiters.push(done);
      });
    },
    stderr: () => stderr,
    close() { try { p.kill(); } catch (e) {} },
  };
}

(async () => {
  const g = sim.createMatch({ id: 'timing' + seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const cmdv = cmd.split(' ');
  const agents = [makeAgent(cmdv), makeAgent(cmdv)];
  const all = [];
  let errors = 0;
  try {
    while (g.status === 'playing') {
      const phase = g.phase;
      if (phase === 'buy') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const rs = await Promise.all(agents.map((a, k) => a.ask(views[k])));
        rs.forEach(r => all.push({ phase, ms: r.ms }));
        sim.submitBuys(g, 0, (rs[0].v && rs[0].v.buys) || []);
        sim.submitBuys(g, 1, (rs[1].v && rs[1].v.buys) || []);
      } else if (phase === 'live') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const rs = await Promise.all(agents.map((a, k) => a.ask(views[k])));
        rs.forEach(r => all.push({ phase, ms: r.ms }));
        let w0, w1;
        try { w0 = sim.submitWindow(g, 0, (rs[0].v && rs[0].v.inputs) || []); }
        catch (e) { errors++; throw new Error('A bad: ' + e.message); }
        try { w1 = sim.submitWindow(g, 1, (rs[1].v && rs[1].v.inputs) || []); }
        catch (e) { errors++; throw new Error('B bad: ' + e.message); }
        sim.advanceWindow(g, { 0: w0, 1: w1 });
      } else break;
    }
  } finally { agents.forEach(a => a.close()); }
  const ms = all.map(x => x.ms).sort((a, b) => a - b);
  const pick = p => ms[Math.min(ms.length - 1, Math.floor(p * ms.length))];
  const stderr = agents.map(a => a.stderr()).join('');
  console.log(JSON.stringify({
    seed, requests: ms.length, buyReq: all.filter(x => x.phase === 'buy').length,
    mean: +(ms.reduce((s, x) => s + x, 0) / ms.length).toFixed(3),
    p50: +pick(0.5).toFixed(3), p95: +pick(0.95).toFixed(3), p99: +pick(0.99).toFixed(3),
    max: +ms[ms.length - 1].toFixed(3), errors, stderr: stderr.slice(0, 400),
    rounds: g.roundWins, winner: g.winner,
  }));
})();
