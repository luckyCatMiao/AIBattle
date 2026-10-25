'use strict';
// Mock referee: runs one agent (team 0) against a neutral car (team 1).
// Usage: node mock_referee.js <seed> <agentCommand...>
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require('./simulation.js');

const seed = Number(process.argv[2] || 6011);
const TEAM = Number(process.env.TEAM || 0);
const cmd = process.argv.slice(3);
if (!cmd.length) { console.error('need agent command'); process.exit(2); }

const g = sim.createMatch({
  id: 'mock', seed,
  players: [{ name: 'agent', kind: 'api' }, { name: 'neutral', kind: 'api' }],
});

const child = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
child.stderr.on('data', d => process.stderr.write('[agent] ' + d.toString()));
let buf = '';
const waiting = [];
child.stdout.on('data', d => {
  buf += d.toString();
  let i;
  while ((i = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    const cb = waiting.shift();
    if (cb) cb(line);
  }
});

function ask(payload) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    waiting.push(line => resolve({ line, ms: Date.now() - t0 }));
    child.stdin.write(JSON.stringify(payload) + '\n');
    setTimeout(() => { if (waiting.length) { waiting.shift(); reject(new Error('timeout')); } }, 8000);
  });
}

const neutral = Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]);
const t0 = Date.now();
let maxMs = 0, totalMs = 0, windows = 0;
let result = null;

(async () => {
  while (g.status === 'playing' && g.frame < 300 * 20) {
    const obs = sim.view(g, TEAM);
    const { line, ms } = await ask(obs);
    maxMs = Math.max(maxMs, ms); totalMs += ms; windows++;
    let win;
    try { win = JSON.parse(line); } catch (e) { console.error('bad json', line.slice(0, 200)); process.exit(3); }
    if (!win || !Array.isArray(win.inputs) || win.inputs.length !== 20) {
      console.error('bad window shape', line.slice(0, 200)); process.exit(3);
    }
    const frames = sim.submitWindow(g, TEAM, win.inputs);
    const windows2 = TEAM === 0 ? [frames, neutral] : [neutral, frames];
    sim.advanceWindow(g, windows2);
  }
  const a = g.cars[TEAM], b = g.cars[1 - TEAM];
  console.log(JSON.stringify({
    seed, status: g.status, winner: g.winner, reason: g.reason,
    frames: g.frame, seconds: (g.frame - 30) / 20,
    me: { lap: a.lap, finished: a.finished, finishTime: a.finishTime, progress: a.progress,
            bestLap: a.bestLap, boosts: a.boosts, driftTime: a.driftTime, collisions: a.collisions },
    other: { lap: b.lap, finished: b.finished, finishTime: b.finishTime, progress: b.progress },
    windows, maxMs, avgMs: totalMs / Math.max(1, windows), wall: (Date.now() - t0) / 1000,
  }));
  child.stdin.end();
  setTimeout(() => child.kill(), 200);
})().catch(e => { console.error('ERR', e); child.kill(); process.exit(1); });
