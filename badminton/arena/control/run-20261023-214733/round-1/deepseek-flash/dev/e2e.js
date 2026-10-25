'use strict';
/* 端到端：我方 agent.js 以真实子进程（stdin/stdout）参赛，对手在进程内。 */
const { spawn } = require('child_process');
const readline = require('node:readline');
const path = require('path');
const sim = require('../engine.js');

function startAgent() {
  const p = spawn(process.execPath, [path.join(__dirname, '..', 'agent.js')], { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [];
  let waiter = null;
  rl.on('line', line => {
    let v;
    try { v = JSON.parse(line); } catch (e) { v = null; }
    if (waiter) { const w = waiter; waiter = null; w(v); } else queue.push(v);
  });
  p.stderr.on('data', d => process.stderr.write('[agent] ' + d));
  return {
    ask(obs) {
      return new Promise(resolve => {
        const t = setTimeout(() => resolve(null), 5000);
        p.stdin.write(JSON.stringify(obs) + '\n');
        const done = v => { clearTimeout(t); resolve(v); };
        if (queue.length) done(queue.shift()); else waiter = done;
      });
    },
    close() { p.stdin.end(); p.kill(); },
  };
}

(async () => {
  const opp = require('./variants/noAntX.js');
  const g = sim.createMatch({ id: 'e2e', seed: 1, players: [{ name: 'agent', kind: 'api' }, { name: 'opp', kind: 'api' }] });
  const agent = startAgent();
  let w = 0, maxMs = 0, bad = 0;
  const t0 = Date.now();
  while (g.status === 'playing' && w < 520) {
    const obs = sim.view(g, 0); obs.yourPlayer = 0;
    obs.decisionWindows = true; obs.framesPerWindow = 10;
    const a = Date.now();
    const reply = await agent.ask(obs);
    const ms = Date.now() - a; if (ms > maxMs) maxMs = ms;
    if (!reply || !Array.isArray(reply.inputs) || reply.inputs.length !== 10) { bad++; break; }
    const o1 = sim.view(g, 1); o1.yourPlayer = 1;
    const f1 = opp.decide(o1).frames;
    try {
      sim.advanceWindow(g, [sim.submitWindow(g, 0, reply.inputs), sim.submitWindow(g, 1, f1)]);
    } catch (e) { bad++; console.log('submit error', e.message); break; }
    w++;
  }
  agent.close();
  console.log('status', g.status, 'score', g.score.join(':'), 'windows', w, 'frames', g.frame, 'bad', bad,
    'maxMs', maxMs, 'totalMs', Date.now() - t0, 'reason', g.reason);
})();
