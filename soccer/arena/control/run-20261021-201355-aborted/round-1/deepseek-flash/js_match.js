'use strict';
// Reference-engine match driver: talks to Python agent(s)/bots over stdin/stdout.
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require('/workspace/simulation.js');

function Player(name, kind) {
  this.name = name;
  let cmd, args;
  if (kind === 'agent') { cmd = 'python3'; args = ['/workspace/agent.py']; }
  else { cmd = 'python3'; args = ['/workspace/bot_server.py', kind]; }
  this.proc = spawn(cmd, args, { cwd: '/workspace' });
  this.rl = readline.createInterface({ input: this.proc.stdout });
  this.queue = [];
  this.waiters = [];
  this.rl.on('line', (l) => {
    if (this.waiters.length) this.waiters.shift()(l);
    else this.queue.push(l);
  });
  this.proc.stderr.on('data', (d) => process.stderr.write('[' + name + '] ' + d));
  this.maxMs = 0;
}
Player.prototype.ask = function (obs) {
  const t0 = Date.now();
  this.proc.stdin.write(JSON.stringify(obs) + '\n');
  return new Promise((resolve) => {
    const done = (l) => { this.maxMs = Math.max(this.maxMs, Date.now() - t0); resolve(l); };
    if (this.queue.length) done(this.queue.shift());
    else this.waiters.push(done);
  });
};
Player.prototype.close = function () { try { this.proc.stdin.end(); } catch (e) {} };

async function main() {
  const kindA = process.argv[2] || 'agent';
  const kindB = process.argv[3] || 'motion';
  const p0 = new Player('P0', kindA);
  const p1 = new Player('P1', kindB);

  const g = sim.createMatch({
    id: 'jsmatch', seed: 1,
    players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }],
  });
  let prev = [0, 0];
  const goals = [];
  let windows = 0;
  const t0 = Date.now();
  while (g.status === 'playing' && windows < 200) {
    const v0 = sim.view(g, 0);
    const v1 = sim.view(g, 1);
    const [r0, r1] = await Promise.all([p0.ask(v0), p1.ask(v1)]);
    let w0, w1;
    try {
      w0 = JSON.parse(r0); w1 = JSON.parse(r1);
      sim.submitWindow(g, 0, w0.inputs);
      sim.submitWindow(g, 1, w1.inputs);
    } catch (e) {
      console.error('bad window at frame', g.frame, e.message);
      process.exit(2);
    }
    sim.advanceWindow(g, { 0: w0.inputs, 1: w1.inputs });
    if (g.score[0] !== prev[0] || g.score[1] !== prev[1]) {
      goals.push({ t: +(g.frame / 20).toFixed(1), score: g.score.slice() });
      prev = g.score.slice();
    }
    windows++;
  }
  p0.close(); p1.close();
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(JSON.stringify({
    kindA, kindB, score: g.score, status: g.status, reason: g.reason,
    frames: g.frame, goals, delay_s: +secs,
    maxRespMs: { p0: p0.maxMs, p1: p1.maxMs },
    stats: g.stats,
  }));
}
main().catch((e) => { console.error(e); process.exit(1); });
