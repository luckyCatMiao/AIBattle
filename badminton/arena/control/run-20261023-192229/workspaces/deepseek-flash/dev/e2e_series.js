'use strict';
/* 一个 agent 进程连续打两局（换座位），模拟真实系列赛。 */
const { spawn } = require('child_process');
const readline = require('node:readline');
const path = require('path');
const sim = require('../engine.js');
const brain = require('../brain.js');
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
  const agent = startAgent();
  for (const seat of [0, 1]) {
    const g = sim.createMatch({ id: 'series', seed: 2, players: [{ name: 'me', kind: 'api' }, { name: 'opp', kind: 'api' }] });
    let w = 0, bad = 0, maxMs = 0;
    while (g.status === 'playing' && w < 520) {
      const o = sim.view(g, seat); o.yourPlayer = seat;
      const t0 = Date.now();
      const reply = await agent.ask(o);
      maxMs = Math.max(maxMs, Date.now() - t0);
      if (!reply || !Array.isArray(reply.inputs) || reply.inputs.length !== 10) { bad++; break; }
      const oo = sim.view(g, 1 - seat); oo.yourPlayer = 1 - seat;
      const fo = brain.decide(oo).frames;
      const wins = []; wins[seat] = reply.inputs; wins[1 - seat] = fo;
      sim.advanceWindow(g, [sim.submitWindow(g, 0, wins[0]), sim.submitWindow(g, 1, wins[1])]);
      w++;
    }
    console.log('game seat', seat, 'score', g.score.join(':'), 'mine', g.score[seat], 'windows', w, 'bad', bad, 'maxMs', maxMs);
  }
  agent.close();
})();
