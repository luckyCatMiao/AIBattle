// usage: node run_match.js <seed> <teamSize> <implA> <implB> [variantA] [variantB] [maxWindows]
const sim = require('/workspace/simulation.js');
const { spawn } = require('child_process');
const readline = require('readline');
const seed = Number(process.argv[2] || 1);
const teamSize = Number(process.argv[3] || 0) || undefined;
const implA = process.argv[4] || 'agent';
const implB = process.argv[5] || 'agent';
const varA = process.argv[6] || '';
const varB = process.argv[7] || '';
const maxWindows = Number(process.argv[8] || 400);
const swap = process.argv[9] === '1';

function startAgent(impl, variant) {
  const args = ['/workspace/work/r3/worker.py', '--impl', impl];
  if (variant && variant !== '-') args.push('--variant', variant);
  const env = Object.assign({}, process.env);
  const p = spawn('python3', args, { cwd: '/workspace', env });
  const rl = readline.createInterface({ input: p.stdout });
  const q = [], waiters = [];
  let stderr = '';
  rl.on('line', l => { if (waiters.length) waiters.shift()(l); else q.push(l); });
  p.stderr.on('data', d => { stderr += d.toString(); });
  return { p, q, waiters, get stderr() { return stderr; },
    ask(line) {
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('timeout 6000ms ' + impl)), 6000);
        const done = l => { clearTimeout(timer); resolve(l); };
        if (q.length) done(q.shift()); else waiters.push(done);
        p.stdin.write(line + '\n');
      });
    } };
}

const g = sim.createMatch({ id: 'r3', seed, teamSize,
  players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
const A = startAgent(implA, varA), B = startAgent(implB, varB);
let worst = 0, total = 0, windows = 0, illegal = 0;
const trace = [];
(async () => {
  while (g.status === 'playing' && windows < maxWindows) {
    const o0 = JSON.stringify(sim.view(g, 0));
    const o1 = JSON.stringify(sim.view(g, 1));
    const t0 = Date.now();
    const obsA = swap ? o1 : o0, obsB = swap ? o0 : o1;
    const l0 = await A.ask(obsA);
    const d0 = Date.now() - t0;
    const t1 = Date.now();
    const l1 = await B.ask(obsB);
    const d1 = Date.now() - t1;
    worst = Math.max(worst, d0, d1); total += d0 + d1; windows++;
    let f0, f1;
    try { f0 = JSON.parse(l0).inputs; f1 = JSON.parse(l1).inputs; }
    catch (e) { console.log(JSON.stringify({error: 'badjson ' + e.message})); break; }
    try {
      const fA = f0, fB = f1;
      const tA = swap ? 1 : 0, tB = swap ? 0 : 1;
      sim.advanceWindow(g, { [tA]: sim.submitWindow(g, tA, fA), [tB]: sim.submitWindow(g, tB, fB) });
    } catch (e) { illegal++; console.log(JSON.stringify({error: 'illegal ' + e.message, frame: g.frame})); break; }
    if (process.env.DUMP) {
      const own = g.ball.owner;
      trace.push([g.frame, +g.ball.x.toFixed(2), +g.ball.y.toFixed(2), own, +g.ball.vx.toFixed(2), +g.ball.vy.toFixed(2)]);
    }
  }
  const goals = g.events.filter(e => e.type === 'goal').map(e => ({f: e.frame, team: e.team, score: e.score}));
  const saves = [0, 0], fouls = [0, 0], kicks = [0, 0];
  const shots = [[], []];
  for (let i = 0; i < g.events.length; i++) {
    const e = g.events[i];
    if (e.type === 'save') saves[e.team]++;
    if (e.type === 'foul') fouls[e.team]++;
    if (e.type === 'kick') {
      kicks[e.team]++;
      // classify a "shot": aimed at opponent goal half and toward it
      const s = e.team === 0 ? 1 : -1;
      const gx = e.team === 0 ? 43 : 1;
      const dx = gx - e.x, dy = 13 - e.y;
      const dl = Math.hypot(dx, dy) || 1;
      const vx = Math.cos(e.angle), vy = Math.sin(e.angle);
      const cos = (vx * dx + vy * dy) / dl;
      if (cos > 0.93 && ((e.x - 22) * s) > 0) shots[e.team].push({f: e.frame, x: +e.x.toFixed(1), y: +e.y.toFixed(1), cos: +cos.toFixed(3), d: +dl.toFixed(1)});
    }
  }
  const tA = swap ? 1 : 0, tB = swap ? 0 : 1;
  const out = { seed: g.seed, n: g.teamSize, swap, status: g.status, score: g.score, reason: g.reason,
    frames: g.frame, windows, illegal, worst, goals,
    A: { team: tA, impl: implA, var: varA, score: g.score[tA], kicks: kicks[tA], saves: saves[tA], fouls: fouls[tA], shots: shots[tA].length, details: shots[tA].slice(0, 30) },
    B: { team: tB, impl: implB, var: varB, score: g.score[tB], kicks: kicks[tB], saves: saves[tB], fouls: fouls[tB], shots: shots[tB].length, details: shots[tB].slice(0, 30) },
    stderrA: A.stderr.slice(0, Number(process.env.STDERR_LEN || 200)), stderrB: B.stderr.slice(0, Number(process.env.STDERR_LEN || 200)) };
  if (process.env.DUMP) require('fs').writeFileSync(process.env.DUMP, JSON.stringify({events: g.events, stats: g.stats, trace}));
  console.log(JSON.stringify(out));
  A.p.kill(); B.p.kill();
})().catch(e => { console.log(JSON.stringify({error: String(e)})); A.p.kill(); B.p.kill(); });
