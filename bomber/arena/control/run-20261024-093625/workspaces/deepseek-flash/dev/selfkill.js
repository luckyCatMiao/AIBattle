'use strict';
/* Self-kill forensics: dumps the last few notes of a fighter that died to its own blast.
 * usage: node dev/selfkill.js --count 6 --seed 5000 --a "python agent.py" --b "python agent.py" */
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine_an.js');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], n = argv[i + 1];
    if (n === undefined || n.startsWith('--')) a[k.slice(2)] = true; else { a[k.slice(2)] = n; i++; }
  }
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

async function play(seed, cmdA, cmdB) {
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const ag = [new Agent(cmdA), new Agent(cmdB)];
  const notes = [[], []];
  let w = 0; let lastLog = [];
  while (g.status === 'playing' && w < 800) {
    w++;
    const obs = [0, 1].map(o => { const s = engine.snapshot(g, o); s.lastErrors = []; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = win20; return s; });
    ag.forEach((a, i) => a.send(obs[i]));
    const rep = await Promise.all(ag.map(a => a.next()));
    const wi = [null, null];
    for (let i = 0; i < 2; i++) {
      try { const p = JSON.parse(rep[i]); wi[i] = engine.submitWindow(g, i, p.inputs); notes[i].push(String(p.note || '')); }
      catch (e) { ag.forEach(a => a.kill()); return []; }
    }
    const r0 = g.round;
    const nEv = g.events.length;
    const pre = g.fighters.map(f => ({ x: f.x, y: f.y, bombs: g.bombs.map(b => ({ x: b.x, y: b.y, fuse: b.fuse, owner: b.owner })) }));
    engine.advanceWindow(g, wi);
    const newEv = g.events.slice(nEv).filter(e => e.type === 'death');
    for (const e of newEv) {
      const bo = e.blastOwners || [];
      if (bo.length && bo[0] === e.owner) {
        const o = e.owner;
        lastLog.push({
          seed, round: r0, frame: e.frame, owner: o, cell: [e.x, e.y],
          notes: notes[o].slice(-4),
          bombsAtDeath: pre[o].bombs,
        });
      }
    }
    if (g.round !== r0) { notes[0].length = 0; notes[1].length = 0; }
  }
  ag.forEach(a => a.kill());
  return lastLog;
}

async function main() {
  const args = parseArgs(process.argv);
  const count = parseInt(args.count || '6', 10), seed0 = parseInt(args.seed || '5000', 10);
  const all = [];
  for (let i = 0; i < count; i++) {
    const r = await play(seed0 + i, args.a, args.b);
    all.push(...r);
  }
  console.log(`self-kills: ${all.length}`);
  for (const d of all.slice(0, 25)) console.log(JSON.stringify(d));
}
main();
