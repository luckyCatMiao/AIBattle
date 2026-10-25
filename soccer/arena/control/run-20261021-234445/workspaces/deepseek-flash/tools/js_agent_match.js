// Integration test: play two python agents through the REAL simulation.js using
// the exact one-line-per-window protocol used by the server.
// usage: node js_agent_match.js <seed> <teamSize> [maxWindows]
const sim = require('/workspace/simulation.js');
const { spawnSync } = require('child_process');

const seed = Number(process.argv[2] || 1);
const teamSize = Number(process.argv[3] || 0) || undefined;
const maxWindows = Number(process.argv[4] || 400);

function askPython(obs) {
  const t0 = Date.now();
  const p = spawnSync('python3', ['/workspace/agent.py'], {
    input: JSON.stringify(obs) + '\n', encoding: 'utf8', timeout: 20000,
    cwd: '/workspace',
  });
  const dt = Date.now() - t0;
  if (p.error) throw p.error;
  const line = (p.stdout || '').trim().split('\n').filter(Boolean).pop();
  if (!line) throw new Error('no output; stderr=' + (p.stderr || '').slice(-500));
  const out = JSON.parse(line);
  return { frames: out.inputs, dt, stderr: p.stderr };
}

const g = sim.createMatch({
  id: 'itest', seed, teamSize,
  players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }],
});
let worst = 0, total = 0, windows = 0;
let illegal = 0;
while (g.status === 'playing' && windows < maxWindows) {
  const w0 = askPython(sim.view(g, 0));
  const w1 = askPython(sim.view(g, 1));
  if (w0.dt > 800) require('fs').writeFileSync('/workspace/tools/slow_obs.json', JSON.stringify(sim.view(g, 0)));
  if (w1.dt > 800) require('fs').writeFileSync('/workspace/tools/slow_obs.json', JSON.stringify(sim.view(g, 1)));
  worst = Math.max(worst, w0.dt, w1.dt); total += w0.dt + w1.dt; windows++;
  if (w0.stderr.trim()) console.log('stderr t0:', w0.stderr.trim().slice(0, 300));
  if (w1.stderr.trim()) console.log('stderr t1:', w1.stderr.trim().slice(0, 300));
  try {
    const f0 = sim.submitWindow(g, 0, w0.frames);
    const f1 = sim.submitWindow(g, 1, w1.frames);
    sim.advanceWindow(g, { 0: f0, 1: f1 });
  } catch (e) {
    illegal++;
    console.log('ILLEGAL INPUT at frame', g.frame, e.message);
    break;
  }
}
const st = g.stats.map((s, i) => `t${i}: poss=${s.possession} kicks=${s.kicks} fouls=${s.fouls}`).join(' | ');
console.log(`seed ${g.seed} n=${g.teamSize} status=${g.status} score=${g.score} winner=${g.winner} (${g.reason}) frames=${g.frame}`);
console.log('stats', st);
console.log(`windows=${windows} illegal=${illegal} worst=${worst}ms avg=${(total / (2 * windows || 1)).toFixed(0)}ms`);
