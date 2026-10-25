'use strict';
/* Local match harness: drives two external agent programs (stdin/stdout JSON lines)
 * against the real engine (dev/engine.js, a patched copy of simulation.js).
 *
 * usage: node dev/harness.js --count 20 --seed 1 --a "python agent.py" --b "python dev/opps/random.py"
 */
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine.js');
const catalog = require('../catalog');

const EXAMPLE_WINDOW = [];
for (let i = 0; i < 20; i++) EXAMPLE_WINDOW.push({ dir: i < 4 ? 'R' : 'N', btn: i === 4 ? 'BOMB' : null });

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) { a[k.slice(2)] = true; }
      else { a[k.slice(2)] = nxt; i++; }
    }
  }
  return a;
}

function cmdParts(s) {
  // split on spaces (paths here have no spaces)
  return s.split(' ').filter(Boolean);
}

class Agent {
  constructor(cmd, label) {
    this.label = label;
    const [exe, ...rest] = cmdParts(cmd);
    this.proc = spawn(exe, rest, { cwd: path.resolve(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = '';
    this.lines = [];
    this.waiters = [];
    this.err = '';
    this.dead = false;
    this.proc.stdout.on('data', d => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (line) this.push(line);
      }
    });
    this.proc.stderr.on('data', d => { this.err += d.toString(); if (this.err.length > 4000) this.err = this.err.slice(-4000); });
    this.proc.on('error', () => { this.dead = true; this.push(null); });
    this.proc.on('exit', () => { this.dead = true; this.push(null); });
  }
  push(line) {
    const w = this.waiters.shift();
    if (w) w(line); else this.lines.push(line);
  }
  next(timeoutMs = 5000) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (this.dead) return Promise.resolve(null);
    return new Promise(res => {
      const t = setTimeout(() => res(null), timeoutMs);
      this.waiters.push(l => { clearTimeout(t); res(l); });
    });
  }
  send(obj) { this.proc.stdin.write(JSON.stringify(obj) + '\n'); }
  kill() { try { this.proc.kill(); } catch (e) { } }
}

function validateInputs(parsed) {
  if (!parsed || typeof parsed !== 'object') return 'not object';
  if (!Array.isArray(parsed.inputs)) return 'inputs not array';
  if (parsed.inputs.length > 20) return 'too many frames';
  for (const f of parsed.inputs) {
    if (!f || typeof f !== 'object' || Array.isArray(f)) return 'frame not object';
    const dir = f.dir === null || f.dir === undefined ? 'N' : String(f.dir).toUpperCase();
    const btn = f.btn === null || f.btn === undefined ? null : String(f.btn).toUpperCase();
    if (!['N', 'U', 'D', 'L', 'R'].includes(dir)) return 'bad dir ' + f.dir;
    if (btn !== null && btn !== 'BOMB') return 'bad btn ' + f.btn;
  }
  return null;
}

async function playMatch(seed, cmdA, cmdB, opts = {}) {
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [new Agent(cmdA, 'A'), new Agent(cmdB, 'B')];
  const lastErrors = [[], []];
  const windows = opts.maxWindows || 800;
  let techLoss = [false, false];
  let w = 0;
  while (g.status === 'playing' && w < windows) {
    w++;
    const obs = [0, 1].map(owner => {
      const s = engine.snapshot(g, owner);
      s.lastErrors = lastErrors[owner];
      s.decisionWindows = true;
      s.framesPerWindow = 20;
      s.exampleWindow = EXAMPLE_WINDOW;
      return s;
    });
    agents.forEach((a, i) => a.send(obs[i]));
    const replies = await Promise.all(agents.map(a => a.next(opts.timeoutMs || 5000)));
    const windowsIn = [null, null];
    for (let i = 0; i < 2; i++) {
      if (replies[i] === null) { techLoss[i] = true; lastErrors[i].push('no reply / process died'); continue; }
      let parsed;
      try { parsed = JSON.parse(replies[i]); } catch (e) { techLoss[i] = true; lastErrors[i].push('bad json'); continue; }
      const err = validateInputs(parsed);
      if (err) { techLoss[i] = true; lastErrors[i].push(err); continue; }
      windowsIn[i] = engine.submitWindow(g, i, parsed.inputs);
    }
    if (techLoss[0] || techLoss[1]) {
      agents.forEach(a => a.kill());
      return { seed, status: 'tech', winner: techLoss[0] && techLoss[1] ? null : (techLoss[0] ? 1 : 0), techLoss, roundLog: g.roundLog, windows: w };
    }
    engine.advanceWindow(g, windowsIn);
  }
  agents.forEach(a => a.kill());
  const errs = agents.map(a => a.err).filter(Boolean);
  return { seed, status: g.status, winner: g.winner, reason: g.reason, roundLog: g.roundLog, windows: w, stderr: errs };
}

async function main() {
  const args = parseArgs(process.argv);
  const count = parseInt(args.count || '1', 10);
  const seed0 = parseInt(args.seed || '1', 10);
  const cmdA = args.a || 'python agent.py';
  const cmdB = args.b || 'python agent.py';
  let wins = 0, losses = 0, draws = 0, techs = 0, games = 0;
  let gwins = 0, glosses = 0, gdraws = 0;
  const t0 = Date.now();
  for (let i = 0; i < count; i++) {
    const seed = seed0 + i;
    const r = await playMatch(seed, cmdA, cmdB, { timeoutMs: parseInt(args.timeout || '5000', 10) });
    for (const rl of (r.roundLog || [])) {
      games++;
      if (rl.winner === 'A') gwins++; else if (rl.winner === 'B') glosses++; else gdraws++;
    }
    if (r.status === 'tech') { techs++; console.log(`seed ${seed}: TECH ${JSON.stringify(r.techLoss)}`); continue; }
    if (r.winner === 0) wins++; else if (r.winner === 1) losses++; else draws++;
    if (args.verbose) {
      const g = (r.roundLog || []).map(x => `${x.winner === null ? 'D' : (x.winner === 'A' ? 'W' : 'L')}(${x.reason},${Math.round(x.frames / 20)}s${x.cause ? ',' + x.cause : ''})`).join(' ');
      const st = (r.roundLog || []).map(x => '[' + x.fighters.map(f => `b${f.bombs}p${f.blast}s${f.speed}${f.alive ? '' : 'X'}`).join('/') + ']').join('');
      console.log(`seed ${seed}: match=${r.winner} [${g}] ${st}`);
    }
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\nA=${cmdA}\nB=${cmdB}`);
  console.log(`matches ${count}: A-wins ${wins} (${(100 * wins / count).toFixed(1)}%) B-wins ${losses} draws ${draws} tech ${techs}  [${dt}s]`);
  console.log(`games   ${games}: A ${gwins} (${(100 * gwins / Math.max(1, games)).toFixed(1)}%) B ${glosses} draw ${gdraws}`);
}

main();
