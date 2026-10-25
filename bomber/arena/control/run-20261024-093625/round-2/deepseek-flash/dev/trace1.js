'use strict';
/* Trace one match: prints A's position/equipment and B's position each window.
 * usage: node dev/trace1.js --seed 12000 --a "python agent.py" --b "python dev/opps/none.py" [--every 1] */
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine.js');
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
    this.buf = ''; this.lines = []; this.waiters = []; this.dead = false; this.err = '';
    this.proc.stdout.on('data', d => { this.buf += d.toString(); let i;
      while ((i = this.buf.indexOf('\n')) >= 0) { const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1); if (l) this.lines.push(l); }
      while (this.lines.length && this.waiters.length) this.waiters.shift()(this.lines.shift()); });
    this.proc.stderr.on('data', d => { const s=d.toString(); this.err += s; if (process.env.SHOWERR) process.stdout.write('[err] '+s); if (this.err.length > 2000) this.err = this.err.slice(-2000); });
    this.proc.on('close', () => { this.dead = true; while (this.waiters.length) this.waiters.shift()(null); });
  }
  next(ms = 5000) { if (this.lines.length) return Promise.resolve(this.lines.shift()); if (this.dead) return Promise.resolve(null);
    return new Promise(r => { const t = setTimeout(() => r(null), ms); this.waiters.push(l => { clearTimeout(t); r(l); }); }); }
  send(o) { this.proc.stdin.write(JSON.stringify(o) + '\n'); }
  kill() { try { this.proc.kill(); } catch (e) { } }
}
async function main() {
  const args = parseArgs(process.argv);
  const seed = parseInt(args.seed || '12000', 10);
  const every = parseInt(args.every || '1', 10);
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const ag = [new Agent(args.a || 'python agent.py'), new Agent(args.b || 'python dev/opps/none.py')];
  let w = 0; let round = 1;
  while (g.status === 'playing' && w < 800) {
    w++;
    if (g.round !== round) { round = g.round; console.log(`--- round ${round} ---`); }
    const obs = [0, 1].map(o => { const s = engine.snapshot(g, o); s.lastErrors = []; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = win20; return s; });
    ag.forEach((a, i) => a.send(obs[i]));
    const rep = await Promise.all(ag.map(a => a.next()));
    const wi = [null, null];
    for (let i = 0; i < 2; i++) { try { const p = JSON.parse(rep[i]); wi[i] = engine.submitWindow(g, i, p.inputs); if (i === 0 && w % every === 0) process.stdout.write(`  t${(g.roundFrames / 20).toFixed(0)} note="${p.note || ''}"\n`); } catch (e) { console.log('tech', i); ag.forEach(a => a.kill()); return; } }
    if (w % every === 0) {
      const f = g.fighters;
      console.log(`t${(g.roundFrames / 20).toFixed(0).padStart(3)} A(${f[0].x},${f[0].y}) ${f[0].bombs}/${f[0].blast}/${f[0].speed}${f[0].alive ? '' : 'X'}  B(${f[1].x},${f[1].y}) ${f[1].bombs}/${f[1].blast}/${f[1].speed}${f[1].alive ? '' : 'X'}  bombsA=${g.bombs.filter(b => b.owner === 0).length} drops=${g.drops.length}`);
    }
    engine.advanceWindow(g, wi);
  }
  ag.forEach(a => a.kill());
  console.log('result', g.status, g.winner, JSON.stringify(g.roundLog.map(r => [r.round, r.winner, r.frames])));
}
main();
