'use strict';
/* 双向端到端：agent 子进程分别坐 team0 / team1，各打一局。 */
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
async function run(seat) {
  const g = sim.createMatch({ id: 'e2e', seed: 1, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  const agent = startAgent();
  let w = 0, maxMs = 0, bad = 0; const t0 = Date.now();
  const dirs = [];
  while (g.status === 'playing' && w < 520) {
    const o = sim.view(g, seat); o.yourPlayer = seat;
    const a = Date.now();
    const reply = await agent.ask(o);
    const ms = Date.now() - a; if (ms > maxMs) maxMs = ms;
    if (!reply || !Array.isArray(reply.inputs) || reply.inputs.length !== 10) { bad++; break; }
    const other = 1 - seat;
    const oo = sim.view(g, other); oo.yourPlayer = other;
    const fo = opp.decide(oo);
    const wins = [];
    wins[seat] = reply.inputs;
    wins[other] = fo;
    try { sim.advanceWindow(g, [sim.submitWindow(g, 0, wins[0]), sim.submitWindow(g, 1, wins[1])]); }
    catch (e) { bad++; console.log('submit error', e.message); break; }
    w++;
  }
  agent.close();
  const mine = g.score[seat];
  console.log('seat', seat, 'status', g.status, 'score', g.score.join(':'), 'mine', mine, 'windows', w, 'bad', bad, 'maxMs', maxMs, 'totalMs', Date.now() - t0, g.reason);
}
(async () => { await run(0); await run(1); })();
