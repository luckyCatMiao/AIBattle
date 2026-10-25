'use strict';
/* A/B evaluator: plays every seed twice with seats swapped, then reports
 * match and round win rates.  usage:
 *   node dev/ab.js --count 30 --seed 9000 --a "python agent.py" --b "python dev/agents/v1.py"
 */
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine.js');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]; const nxt = argv[i + 1];
    if (nxt === undefined || nxt.startsWith('--')) a[k.slice(2)] = true;
    else { a[k.slice(2)] = nxt; i++; }
  }
  return a;
}
const win20 = []; for (let i = 0; i < 20; i++) win20.push({ dir: 'N', btn: null });

class Agent {
  constructor(cmd) {
    const p = cmd.split(' ');
    this.proc = spawn(p[0], p.slice(1), { cwd: path.resolve(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = ''; this.lines = []; this.waiters = []; this.dead = false; this.err = '';
    this.proc.stdout.on('data', d => {
      this.buf += d.toString(); let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (line) this.lines.push(line);
      }
      while (this.lines.length && this.waiters.length) this.waiters.shift()(this.lines.shift());
    });
    this.proc.stderr.on('data', d => { this.err += d.toString(); if (this.err.length > 3000) this.err = this.err.slice(-3000); });
    this.proc.on('close', () => { this.dead = true; while (this.waiters.length) this.waiters.shift()(null); });
    this.proc.on('error', () => { this.dead = true; while (this.waiters.length) this.waiters.shift()(null); });
  }
  next(ms = 5000) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (this.dead) return Promise.resolve(null);
    return new Promise(res => { const t = setTimeout(() => res(null), ms); this.waiters.push(l => { clearTimeout(t); res(l); }); });
  }
  send(o) { this.proc.stdin.write(JSON.stringify(o) + '\n'); }
  kill() { try { this.proc.kill(); } catch (e) { } }
}

async function playMatch(seed, cmdA, cmdB, timeoutMs) {
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [new Agent(cmdA), new Agent(cmdB)];
  let w = 0;
  while (g.status === 'playing' && w < 800) {
    w++;
    const obs = [0, 1].map(o => { const s = engine.snapshot(g, o); s.lastErrors = []; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = win20; return s; });
    agents.forEach((a, i) => a.send(obs[i]));
    const rep = await Promise.all(agents.map(a => a.next(timeoutMs)));
    const wi = [null, null]; let tech = false;
    for (let i = 0; i < 2; i++) {
      if (rep[i] === null) { tech = true; break; }
      let p; try { p = JSON.parse(rep[i]); } catch (e) { tech = true; break; }
      if (!p || !Array.isArray(p.inputs) || p.inputs.length > 20) { tech = true; break; }
      wi[i] = engine.submitWindow(g, i, p.inputs);
    }
    if (tech) { agents.forEach(a => a.kill()); return { seed, tech: true }; }
    engine.advanceWindow(g, wi);
  }
  agents.forEach(a => a.kill());
  return { seed, status: g.status, winner: g.winner, roundLog: g.roundLog };
}

async function main() {
  const args = parseArgs(process.argv);
  const count = parseInt(args.count || '20', 10), seed0 = parseInt(args.seed || '1', 10);
  const timeoutMs = parseInt(args.timeout || '5000', 10);
  const t0 = Date.now();
  let mw = 0, ml = 0, md = 0, tech = 0;
  let gw = 0, gl = 0, gd = 0;
  const detail = [];
  for (let i = 0; i < count; i++) {
    const seed = seed0 + i;
    const r1 = await playMatch(seed, args.a, args.b, timeoutMs);
    if (r1.tech) { tech++; continue; }
    const r2 = await playMatch(seed, args.b, args.a, timeoutMs);
    if (r2.tech) { tech++; continue; }
    // r1: ourAgent is seat 0 ; r2: ourAgent is seat 1
    const w1 = r1.winner === 0 ? 'W' : r1.winner === 1 ? 'L' : 'D';
    const w2 = r2.winner === 1 ? 'W' : r2.winner === 0 ? 'L' : 'D';
    for (const [wv, r] of [[w1, r1], [w2, r2]]) {
      if (wv === 'W') mw++; else if (wv === 'L') ml++; else md++;
      for (const rl of r.roundLog) {
        const me = (r === r1) ? 'A' : 'B';
        if (!rl.winner) gd++;
        else if (rl.winner === me) gw++; else gl++;
      }
    }
    detail.push(`${seed}:${w1}${w2}`);
  }
  const n = mw + ml + md;
  const dt = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(detail.join(' '));
  console.log(`matches ${n}: A=${args.a}  W ${mw} (${(100 * mw / Math.max(1, n)).toFixed(1)}%)  L ${ml}  D ${md}  tech ${tech}   [${dt}s]`);
  const g = gw + gl + gd;
  console.log(`rounds  ${g}: W ${gw} (${(100 * gw / Math.max(1, g)).toFixed(1)}%)  L ${gl}  D ${gd}   W/(W+L)=${(100 * gw / Math.max(1, gw + gl)).toFixed(1)}%`);
  console.log(`match W/(W+L)=${(100 * mw / Math.max(1, mw + ml)).toFixed(1)}%`);
}
main();
