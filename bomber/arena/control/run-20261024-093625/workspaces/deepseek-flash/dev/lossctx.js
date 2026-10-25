'use strict';
/* Dump the last N windows of a chosen side before it dies.
 * usage: node dev/lossctx.js --count 6 --seed 9000 --a "python agent.py" --b "python dev/agents/v1.py" --side 0 */
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine_an.js');
function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) { const k = argv[i], n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) a[k.slice(2)] = true; else { a[k.slice(2)] = n; i++; } }
  return a;
}
const win20 = []; for (let i = 0; i < 20; i++) win20.push({ dir: 'N', btn: null });
class Agent {
  constructor(cmd) {
    const p = cmd.split(' ');
    this.proc = spawn(p[0], p.slice(1), { cwd: path.resolve(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = ''; this.lines = []; this.waiters = []; this.dead = false;
    this.proc.stdout.on('data', d => { this.buf += d.toString(); let i;
      while ((i = this.buf.indexOf('\n')) >= 0) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (l) this.lines.push(l); }
      while (this.lines.length && this.waiters.length) this.waiters.shift()(this.lines.shift()); });
    this.proc.stderr.on('data', () => { });
    this.proc.on('close', () => { this.dead = true; while (this.waiters.length) this.waiters.shift()(null); });
  }
  next(ms = 5000) { if (this.lines.length) return Promise.resolve(this.lines.shift()); if (this.dead) return Promise.resolve(null);
    return new Promise(r => { const t = setTimeout(() => r(null), ms); this.waiters.push(l => { clearTimeout(t); r(l); }); }); }
  send(o) { this.proc.stdin.write(JSON.stringify(o) + '\n'); }
  kill() { try { this.proc.kill(); } catch (e) { } }
}
async function play(seed, cmdA, cmdB, side, keep) {
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const ag = [new Agent(cmdA), new Agent(cmdB)];
  const hist = []; let w = 0; const out = [];
  let round0 = 1;
  while (g.status === 'playing' && w < 800) {
    w++;
    const obs = [0, 1].map(o => { const s = engine.snapshot(g, o); s.lastErrors = []; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = win20; return s; });
    ag.forEach((a, i) => a.send(obs[i]));
    const rep = await Promise.all(ag.map(a => a.next()));
    const wi = [null, null]; const notes = [];
    for (let i = 0; i < 2; i++) { try { const p = JSON.parse(rep[i]); wi[i] = engine.submitWindow(g, i, p.inputs); notes.push(String(p.note || '')); } catch (e) { ag.forEach(a => a.kill()); return out; } }
    const f = g.fighters;
    hist.push({ r: g.round, t: +(g.roundFrames / 20).toFixed(1), me: [f[side].x, f[side].y], opp: [f[1 - side].x, f[1 - side].y],
      eq: `${f[side].bombs}/${f[side].blast}/${f[side].speed}`, oppeq: `${f[1 - side].bombs}/${f[1 - side].blast}/${f[1 - side].speed}`,
      note: notes[side], oppnote: notes[1 - side], bombs: g.bombs.map(b => `${b.owner === side ? 'M' : 'O'}(${b.x},${b.y})f${b.fuse}`).join(' '),
      ndrops: g.drops.length });
    if (hist.length > 400) hist.shift();
    const nEv = g.events.length;
    const r0 = g.round;
    engine.advanceWindow(g, wi);
    const dead = g.events.slice(nEv).filter(e => e.type === 'death');
    if (dead.length && dead.some(e => e.owner === side)) {
      out.push({ seed, round: r0, died: dead.find(e => e.owner === side), hist: hist.slice(-keep) });
    }
    if (g.round !== r0) { hist.length = 0; }
  }
  ag.forEach(a => a.kill());
  return out;
}
async function main() {
  const args = parseArgs(process.argv);
  const count = parseInt(args.count || '6', 10), seed0 = parseInt(args.seed || '9000', 10);
  const side = parseInt(args.side || '0', 10), keep = parseInt(args.keep || '12', 10);
  for (let i = 0; i < count; i++) {
    const r = await play(seed0 + i, args.a, args.b, side, keep);
    for (const d of r) {
      console.log(`\n=== seed ${d.seed} round ${d.round} death at (${d.died.x},${d.died.y}) frame ${d.died.frame} bombOwners=${JSON.stringify(d.died.blastOwners)}`);
      for (const h of d.hist) console.log(` t${String(h.t).padStart(6)} me(${h.me}) ${h.eq} opp(${h.opp}) ${h.oppeq} drops=${h.ndrops} bombs[${h.bombs}]\n        my: ${h.note}\n        op: ${h.oppnote}`);
    }
  }
}
main();
