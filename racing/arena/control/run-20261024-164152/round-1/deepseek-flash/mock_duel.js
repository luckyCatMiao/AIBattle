'use strict';
// Self-play referee: two agent processes, one per seat.
// Usage: node mock_duel.js <seed> <agentCommand...>
const { spawn } = require('child_process');
const sim = require('./simulation.js');

const seed = Number(process.argv[2] || 6011);
const cmd = process.argv.slice(3);
if (!cmd.length) { console.error('need agent command'); process.exit(2); }

const g = sim.createMatch({
  id: 'duel', seed,
  players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }],
});

const procs = [0, 1].map(() => {
  const child = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
  const st = { child, buf: '', waiting: [] };
  child.stdout.on('data', d => {
    st.buf += d.toString();
    let i;
    while ((i = st.buf.indexOf('\n')) >= 0) {
      const line = st.buf.slice(0, i); st.buf = st.buf.slice(i + 1);
      const cb = st.waiting.shift();
      if (cb) cb(line);
    }
  });
  child.stderr.on('data', d => process.stderr.write('[agent] ' + d.toString()));
  return st;
});

function ask(st, payload) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    st.waiting.push(line => resolve({ line, ms: Date.now() - t0 }));
    st.child.stdin.write(JSON.stringify(payload) + '\n');
    setTimeout(() => { if (st.waiting.length) { st.waiting.shift(); reject(new Error('timeout')); } }, 8000);
  });
}

(async () => {
  let maxMs = 0, totalMs = 0, windows = 0, close = 0, mind = 99, closePos = [];
  while (g.status === 'playing' && g.frame < 300 * 20) {
    const obs0 = sim.view(g, 0);
    const obs1 = sim.view(g, 1);
    const [r0, r1] = await Promise.all([ask(procs[0], obs0), ask(procs[1], obs1)]);
    maxMs = Math.max(maxMs, r0.ms, r1.ms); totalMs += Math.max(r0.ms, r1.ms); windows++;
    const w0 = sim.submitWindow(g, 0, JSON.parse(r0.line).inputs);
    const w1 = sim.submitWindow(g, 1, JSON.parse(r1.line).inputs);
    sim.advanceWindow(g, [w0, w1]);
    const dd = Math.hypot(g.cars[0].x - g.cars[1].x, g.cars[0].y - g.cars[1].y);
    if (dd < mind) mind = dd;
    if (dd < 1.6) { close++; if (closePos.length < 8) closePos.push([Math.round(g.frame/20)/1, Math.round(g.cars[0].progress), Math.round(g.cars[1].progress)]); }
  }
  const out = [0, 1].map(t => {
    const c = g.cars[t];
    return { team: t, lap: c.lap, finished: c.finished, finishTime: c.finishTime,
             bestLap: c.bestLap, progress: c.progress, boosts: c.boosts,
             driftTime: c.driftTime, collisions: c.collisions };
  });
  const coll = g.events.filter(e=>e.type==='collision').map(e=>({t:e.t,frame:e.frame,a:e.a,b:e.b,speed:e.speed}));
  console.log(JSON.stringify({ seed, status: g.status, winner: g.winner, reason: g.reason,
                               frames: g.frame, seconds: (g.frame - 30) / 20, cars: out,
                               maxMs, avgMs: totalMs / Math.max(1, windows), collisions: coll, minDist: mind, closeFrames: close, closePos }));
  procs.forEach(p => { p.child.stdin.end(); setTimeout(() => p.child.kill(), 100); });
})().catch(e => { console.error('ERR', e); procs.forEach(p => p.child.kill()); process.exit(1); });
