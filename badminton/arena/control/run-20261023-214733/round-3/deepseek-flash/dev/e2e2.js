'use strict';
/* 座位交换版端到端：我方 agent.js 坐 team1，对手在进程内。 */
const { spawn } = require('child_process');
const readline = require('node:readline');
const path = require('path');
const sim = require('../engine.js');
const brain = require('../brain.js');
const opp = { decide: o => brain.decide(o).frames };

function startAgent() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'agent.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: p.stdout });
  const q = []; let waiter = null;
  rl.on('line', l => { let v = null; try { v = JSON.parse(l); } catch (e) {} if (waiter) { const w = waiter; waiter = null; w(v); } else q.push(v); });
  p.stderr.on('data', d => process.stderr.write('[agent] ' + d));
  return {
    ask(o) { return new Promise(res => { const t = setTimeout(() => res(null), 5000); p.stdin.write(JSON.stringify(o) + '\n'); const done = v => { clearTimeout(t); res(v); }; if (q.length) done(q.shift()); else waiter = done; }); },
    close() { p.stdin.end(); p.kill(); },
  };
}
(async () => {
  const g = sim.createMatch({ id: 'e2e2', seed: 1, players: [{ name: 'opp', kind: 'api' }, { name: 'agent', kind: 'api' }] });
  const agent = startAgent();
  let w = 0, maxMs = 0, bad = 0; const t0 = Date.now();
  while (g.status === 'playing' && w < 520) {
    const o1 = sim.view(g, 1); o1.yourPlayer = 1;
    const a = Date.now();
    const reply = await agent.ask(o1);
    const ms = Date.now() - a; if (ms > maxMs) maxMs = ms;
    if (!reply || !Array.isArray(reply.inputs) || reply.inputs.length !== 10) { bad++; break; }
    const o0 = sim.view(g, 0); o0.yourPlayer = 0;
    const f0 = opp.decide(o0);
    sim.advanceWindow(g, [sim.submitWindow(g, 0, f0), sim.submitWindow(g, 1, reply.inputs)]);
    w++;
  }
  agent.close();
  console.log('team1 seat: status', g.status, 'score', g.score.join(':'), 'windows', w, 'bad', bad, 'maxMs', maxMs, 'totalMs', Date.now() - t0, g.reason);
})();
