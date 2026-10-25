'use strict';
/* Equipment/pace report: when does each side first reach each milestone, and who wins.
 * usage: node dev/pace.js --count 6 --seed 12000 --a "python agent.py" --b "python agent.py" */
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

async function playMatch(seed, cmdA, cmdB) {
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [new Agent(cmdA), new Agent(cmdB)];
  const milestones = [{}, {}];      // per round: {owner: {'b6':t,'p6':t,'s3':t,'max':t}}
  const perRound = [];
  let cur = { b: [null, null], p: [null, null], s: [null, null], max: [null, null] };
  let roundSeen = 1;
  let w = 0;
  while (g.status === 'playing' && w < 800) {
    w++;
    const obs = [0, 1].map(o => { const s = engine.snapshot(g, o); s.lastErrors = []; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = win20; return s; });
    agents.forEach((a, i) => a.send(obs[i]));
    const rep = await Promise.all(agents.map(a => a.next()));
    const wi = [null, null]; let tech = false;
    for (let i = 0; i < 2; i++) {
      if (rep[i] === null) { tech = true; break; }
      try { wi[i] = engine.submitWindow(g, i, JSON.parse(rep[i]).inputs); } catch (e) { tech = true; break; }
    }
    if (tech) { agents.forEach(a => a.kill()); return null; }
    engine.advanceWindow(g, wi);
    if (g.round !== roundSeen) { perRound.push({ round: roundSeen, b: cur.b, p: cur.p, s: cur.s, max: cur.max }); cur = { b: [null, null], p: [null, null], s: [null, null], max: [null, null] }; roundSeen = g.round; }
    for (let o = 0; o < 2; o++) {
      const f = g.fighters[o];
      if (!f) continue;
      const t = g.roundFrames / 20;
      if (cur.b[o] === null && f.bombs >= 6) cur.b[o] = t;
      if (cur.p[o] === null && f.blast >= 6) cur.p[o] = t;
      if (cur.s[o] === null && f.speed >= 3) cur.s[o] = t;
      if (cur.max[o] === null && f.bombs >= 6 && f.blast >= 6 && f.speed >= 3) cur.max[o] = t;
    }
  }
  perRound.push({ round: roundSeen, b: cur.b, p: cur.p, s: cur.s, max: cur.max });
  agents.forEach(a => a.kill());
  return { seed, roundLog: g.roundLog, perRound };
}

async function main() {
  const args = parseArgs(process.argv);
  const count = parseInt(args.count || '6', 10), seed0 = parseInt(args.seed || '1', 10);
  let all = [];
  for (let i = 0; i < count; i++) {
    const r = await playMatch(seed0 + i, args.a, args.b);
    if (!r) { console.log('tech', seed0 + i); continue; }
    for (let k = 0; k < r.roundLog.length; k++) {
      const rl = r.roundLog[k], pr = r.perRound[k] || {};
      const maxs = (pr.max || [null, null]);
      const winner = rl.winner;
      all.push({ len: rl.frames / 20, winner, max: maxs, eq: rl.fighters });
      console.log(`seed ${seed0 + i} R${rl.round}: ${(winner || 'draw').padEnd(6)} len ${(rl.frames / 20).toFixed(0)}s  maxA=${maxs[0] === null ? '-' : maxs[0].toFixed(0)} maxB=${maxs[1] === null ? '-' : maxs[1].toFixed(0)}  end=A[${rl.fighters[0].bombs}/${rl.fighters[0].blast}/${rl.fighters[0].speed}${rl.fighters[0].alive ? '' : 'X'}] B[${rl.fighters[1].bombs}/${rl.fighters[1].blast}/${rl.fighters[1].speed}${rl.fighters[1].alive ? '' : 'X'}]`);
    }
  }
  // correlation: did the side that maxed first win?
  let firstMaxWon = 0, firstMaxLost = 0, neither = 0;
  const maxTimes = [];
  for (const r of all) {
    if (r.max[0] !== null) maxTimes.push(r.max[0]);
    if (r.max[1] !== null) maxTimes.push(r.max[1]);
    if (r.max[0] === null && r.max[1] === null) { neither++; continue; }
    let first = (r.max[0] !== null && (r.max[1] === null || r.max[0] <= r.max[1])) ? 0 : 1;
    if (r.winner === null) continue;
    const won = (r.winner === 'A' && first === 0) || (r.winner === 'B' && first === 1);
    if (won) firstMaxWon++; else firstMaxLost++;
  }
  maxTimes.sort((a, b) => a - b);
  console.log(`\nmax-out time: median ${maxTimes.length ? maxTimes[Math.floor(maxTimes.length / 2)].toFixed(1) : '-'}s  n=${maxTimes.length}`);
  console.log(`first-to-max won ${firstMaxWon} / lost ${firstMaxLost}  (never maxed by either: ${neither})`);
}
main();
