'use strict';
/* 单场逐窗口追踪：node dev/trace.js --seed 1 --a "python agent.py" --b "python dev/opps/greedy.py" */
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine.js');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k.startsWith('--')) {
      const nxt = argv[i + 1];
      if (nxt === undefined || nxt.startsWith('--')) a[k.slice(2)] = true;
      else { a[k.slice(2)] = nxt; i++; }
    }
  }
  return a;
}
const EXAMPLE_WINDOW = [];
for (let i = 0; i < 20; i++) EXAMPLE_WINDOW.push({ dir: i < 4 ? 'R' : 'N', btn: i === 4 ? 'BOMB' : null });

class Agent {
  constructor(cmd, tag) {
    this.tag = tag;
    const p = cmd.split(' ');
    this.proc = spawn(p[0], p.slice(1), { cwd: path.resolve(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = ''; this.lines = []; this.waiters = []; this.dead = false;
    this.proc.stdout.on('data', d => {
      this.buf += d.toString(); let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const l = this.buf.slice(0, i).trim(); this.buf = this.buf.slice(i + 1);
        if (l) this.push(l);
      }
    });
    this.proc.stderr.on('data', d => process.stderr.write('[' + (this.tag || 'opp') + '] ' + d.toString()));
    this.proc.on('exit', () => { this.dead = true; this.push(null); });
  }
  push(l) { const w = this.waiters.shift(); if (w) w(l); else this.lines.push(l); }
  next() {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (this.dead) return Promise.resolve(null);
    return new Promise(res => this.waiters.push(res));
  }
  send(o) { this.proc.stdin.write(JSON.stringify(o) + '\n'); }
  kill() { try { this.proc.kill(); } catch (e) { } }
}

async function main() {
  const args = parseArgs(process.argv);
  const seed = parseInt(args.seed || '1', 10);
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [new Agent(args.a || 'python agent.py', 'A'), new Agent(args.b || 'python dev/opps/greedy.py', 'B')];
  const lastErrors = [[], []];
  let lastRound = 0;
  while (g.status === 'playing') {
    if (g.round !== lastRound) { lastRound = g.round; console.log(`\n=== round ${g.round} spawns=${JSON.stringify(g.spawns)} ===`); }
    const obs = [0, 1].map(o => { const s = engine.snapshot(g, o); s.lastErrors = lastErrors[o]; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = EXAMPLE_WINDOW; return s; });
    agents.forEach((a, i) => a.send(obs[i]));
    const reps = await Promise.all(agents.map(a => a.next()));
    const win = [null, null];
    for (let i = 0; i < 2; i++) {
      if (!reps[i]) { console.log(`p${i} NO REPLY`); continue; }
      let p; try { p = JSON.parse(reps[i]); } catch (e) { console.log(`p${i} BAD JSON`); continue; }
      win[i] = engine.submitWindow(g, i, p.inputs);
      if (i === 0) {
        const dirs = (p.inputs || []).map(f => (f.dir || 'N') + (f.btn ? '!' : '')).join('');
        console.log(`t=${(g.roundFrames / 20).toFixed(0)}s f=${g.roundFrames} A(${g.fighters[0].x},${g.fighters[0].y}) B(${g.fighters[1].x},${g.fighters[1].y}) stats A[b${g.fighters[0].bombs} p${g.fighters[0].blast} s${g.fighters[0].speed}] B[b${g.fighters[1].bombs} p${g.fighters[1].blast} s${g.fighters[1].speed}] drops=${g.drops.length} bombs=${g.bombs.length} | A:${dirs} | ${p.note || ''}`);
      }
      if (i === 1 && args.showB) {
        const dirs = (p.inputs || []).map(f => (f.dir || 'N') + (f.btn ? '!' : '')).join('');
        console.log(`   B: ${dirs}`);
      }
    }
    if (win[0] === null || win[1] === null) break;
    engine.advanceWindow(g, win);
  }
  agents.forEach(a => a.kill());
  const counts = {};
  for (const ev of g.events) counts[ev.type] = (counts[ev.type] || 0) + 1;
  console.log('\nevent counts:', JSON.stringify(counts));
  console.log('result:', g.status, 'winner', g.winner, g.reason);
  for (const r of g.roundLog) console.log(`  round ${r.round}: winner=${r.winner} reason=${r.reason} frames=${r.frames} ${JSON.stringify(r.fighters)}`);
}
main();
