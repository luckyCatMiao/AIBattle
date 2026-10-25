'use strict';
/* End-to-end protocol test: spawn agent.js as a child process and drive it
 * exactly like the referee does (JSON line per decision window). */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const sim = require('../simulation.js');

const seed = Number(process.argv[2] || 2000);
const agentPath = path.join(__dirname, '..', 'agent.js');
const child = spawn(process.execPath, [agentPath], { stdio: ['pipe', 'pipe', 'inherit'] });
const rl = readline.createInterface({ input: child.stdout, crlfDelay: Infinity });
const waiting = [];
rl.on('line', line => {
  const cb = waiting.shift();
  if (cb) cb(line);
});

function ask(obs, timeoutMs) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout ' + timeoutMs)), timeoutMs);
    waiting.push(line => { clearTimeout(t); resolve(line); });
    child.stdin.write(JSON.stringify(obs) + '\n');
  });
}

(async () => {
  const g = sim.createMatch({ id: 'e2e', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  g.cars[1].x = 2; g.cars[1].y = 2;
  const neutralW = Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]);
  let w = 0, maxMs = 0, maxBytes = 0, t0 = Date.now();
  while (g.status === 'playing' && w < 340) {
    const obs = sim.view(g, 0);
    obs.decisionWindows = true; obs.framesPerWindow = 20; obs.exampleWindow = [];
    obs.lastErrors = [];
    const bytes = JSON.stringify(obs).length;
    if (bytes > maxBytes) maxBytes = bytes;
    const ta = Date.now();
    const line = await ask(obs, 5000);
    const ms = Date.now() - ta;
    if (ms > maxMs) maxMs = ms;
    const reply = JSON.parse(line);
    if (!reply || !Array.isArray(reply.inputs) || reply.inputs.length !== 20) throw new Error('bad reply shape ' + line.slice(0, 200));
    const w0 = sim.submitWindow(g, 0, reply.inputs);
    const w1 = sim.submitWindow(g, 1, neutralW);
    sim.advanceWindow(g, [w0, w1]);
    g.cars[1].x = 2; g.cars[1].y = 2; g.cars[1].vx = 0; g.cars[1].vy = 0;
    w++;
  }
  console.log(JSON.stringify({
    seed, status: g.status, finish: g.cars[0].finishTime, lap: g.cars[0].lap, best: g.cars[0].bestLap,
    windows: w, maxRoundTripMs: maxMs, maxObsBytes: maxBytes, wallSec: (Date.now() - t0) / 1000,
  }));
  child.kill();
})().catch(e => { console.error('E2E FAIL', e); child.kill(); process.exit(1); });
