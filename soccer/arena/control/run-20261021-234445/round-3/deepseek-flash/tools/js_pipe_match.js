// Real simulation.js + PERSISTENT python agent processes (one per team),
// speaking the line-per-window protocol over stdio.
// usage: node js_pipe_match.js <seed> <teamSize|0> [maxWindows]
const sim = require('/workspace/simulation.js');
const { spawn } = require('child_process');
const readline = require('readline');

const seed = Number(process.argv[2] || 1);
const teamSize = Number(process.argv[3] || 0) || undefined;
const maxWindows = Number(process.argv[4] || 400);

function startAgent() {
  const p = spawn('python3', ['/workspace/agent.py'], { cwd: '/workspace' });
  const rl = readline.createInterface({ input: p.stdout });
  const q = [];
  const waiters = [];
  let stderr = '';
  rl.on('line', l => {
    if (waiters.length) waiters.shift()(l); else q.push(l);
  });
  p.stderr.on('data', d => { stderr += d.toString(); });
  return { p, q, waiters, get stderr() { return stderr; },
    ask(line) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout 6000ms')), 6000);
        const done = l => { clearTimeout(timer); resolve(l); };
        if (q.length) done(q.shift()); else waiters.push(done);
        p.stdin.write(line + '\n');
      });
    } };
}

const g = sim.createMatch({
  id: 'pipe', seed, teamSize,
  players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }],
});
const A = startAgent(), B = startAgent();
let worst = 0, total = 0, windows = 0, illegal = 0;

(async () => {
  while (g.status === 'playing' && windows < maxWindows) {
    const obs0 = JSON.stringify(sim.view(g, 0));
    const obs1 = JSON.stringify(sim.view(g, 1));
    const t0 = Date.now();
    const l0 = await A.ask(obs0);
    const d0 = Date.now() - t0;
    const t1 = Date.now();
    const l1 = await B.ask(obs1);
    const d1 = Date.now() - t1;
    worst = Math.max(worst, d0, d1); total += d0 + d1; windows++;
    let f0, f1;
    try {
      f0 = JSON.parse(l0).inputs;
      f1 = JSON.parse(l1).inputs;
    } catch (e) { console.log('BAD JSON', e.message); break; }
    try {
      sim.advanceWindow(g, {
        0: sim.submitWindow(g, 0, f0),
        1: sim.submitWindow(g, 1, f1),
      });
    } catch (e) {
      illegal++;
      console.log('ILLEGAL INPUT at frame', g.frame, e.message);
      break;
    }
  }
  const st = g.stats.map((s, i) => `t${i}: poss=${s.possession} kicks=${s.kicks} fouls=${s.fouls}`).join(' | ');
  console.log(`seed ${g.seed} n=${g.teamSize} status=${g.status} score=${g.score} winner=${g.winner} (${g.reason}) frames=${g.frame}`);
  console.log('stats', st);
  console.log(`windows=${windows} illegal=${illegal} worst=${worst}ms avg=${(total / (2 * windows || 1)).toFixed(1)}ms`);
  if (A.stderr.trim()) console.log('stderr A:', A.stderr.trim().slice(0, 400));
  if (B.stderr.trim()) console.log('stderr B:', B.stderr.trim().slice(0, 400));
  A.p.kill(); B.p.kill();
})();
