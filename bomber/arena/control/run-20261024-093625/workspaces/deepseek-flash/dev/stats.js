'use strict';
/* Per-round behaviour metrics for one agent against another.
 * usage: node dev/stats.js --count 8 --seed 6000 --a "python agent.py" --b "python dev/opps/greedy.py"
 * reports, per round: winner, length, my equipment, how long I sat in the 5-cell spawn pocket,
 * whether I ever bombed, and the death cause. */
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
for (let i = 0; i < 20; i++) EXAMPLE_WINDOW.push({ dir: 'N', btn: null });

class Agent {
  constructor(cmd, label) {
    this.label = label;
    const p = cmd.split(' ');
    this.proc = spawn(p[0], p.slice(1), { cwd: path.resolve(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = ''; this.lines = []; this.waiters = []; this.dead = false; this.err = '';
    this.proc.stdout.on('data', d => {
      this.buf += d.toString(); let i;
      while ((i = this.buf.indexOf('\n')) >= 0) { this.lines.push(this.buf.slice(0, i)); this.buf = this.buf.slice(i + 1); }
      while (this.waiters.length && this.lines.length) this.waiters.shift()(this.lines.shift());
    });
    this.proc.stderr.on('data', d => { this.err += d.toString(); });
    this.proc.on('close', () => { this.dead = true; while (this.waiters.length) this.waiters.shift()(null); });
  }
  next(timeoutMs = 5000) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (this.dead) return Promise.resolve(null);
    return new Promise(res => {
      const t = setTimeout(() => res(null), timeoutMs);
      this.waiters.push(l => { clearTimeout(t); res(l); });
    });
  }
  send(o) { this.proc.stdin.write(JSON.stringify(o) + '\n'); }
  kill() { try { this.proc.kill(); } catch (e) { } }
}

async function playMatch(seed, cmdA, cmdB) {
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [new Agent(cmdA, 'A'), new Agent(cmdB, 'B')];
  const rounds = [];   // metrics per round, index = round number - 1
  let w = 0;
  while (g.status === 'playing' && w < 800) {
    w++;
    const obs = [0, 1].map(owner => {
      const s = engine.snapshot(g, owner);
      s.lastErrors = []; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = EXAMPLE_WINDOW;
      return s;
    });
    const st = engine.snapshot(g, 0);
    const ri = (st.round || 1) - 1;
    if (!rounds[ri]) rounds[ri] = { round: ri + 1, pocketTicks: null, bombs: 0, full: null, firstBombTick: null, equipment: null };
    // track when my agent (A) leaves its 5-cell spawn pocket
    const fa = st.fighters[0];
    const spawn = st.spawns[0];
    const pocket = [[spawn[0], spawn[1]], [spawn[0] + 1, spawn[1]], [spawn[0] - 1, spawn[1]], [spawn[0], spawn[1] + 1], [spawn[0], spawn[1] - 1]];
    if (rounds[ri].pocketTicks === null && !pocket.some(c => c[0] === fa.x && c[1] === fa.y)) rounds[ri].pocketTicks = st.tick;
    const best = rounds[ri].best || (rounds[ri].best = { bombs: 1, blast: 1, speed: 0 });
    best.bombs = Math.max(best.bombs, fa.bombs); best.blast = Math.max(best.blast, fa.blast); best.speed = Math.max(best.speed, fa.speed);
    if (st.tick === 1200) rounds[ri].eq60 = `${fa.bombs}/${fa.blast}/${fa.speed}`;
    agents.forEach((a, i) => a.send(obs[i]));
    const replies = await Promise.all(agents.map(a => a.next()));
    const inputs = [null, null];
    for (let i = 0; i < 2; i++) {
      if (replies[i] === null) { agents.forEach(a => a.kill()); return { status: 'tech', seed, rounds }; }
      let parsed; try { parsed = JSON.parse(replies[i]); } catch (e) { agents.forEach(a => a.kill()); return { status: 'tech', seed, rounds }; }
      inputs[i] = parsed.inputs;
      for (const f of parsed.inputs) if (f.btn === 'BOMB') rounds[ri].bombs++;
    }
    engine.submitWindow(g, 0, inputs[0]);
    engine.submitWindow(g, 1, inputs[1]);
    engine.advanceWindow(g, [inputs[0], inputs[1]]);
  }
  agents.forEach(a => a.kill());
  const log = g.roundLog || [];
  log.forEach((rl, i) => {
    if (!rounds[i]) rounds[i] = { round: i + 1 };
    rounds[i].winner = rl.winner; rounds[i].frames = rl.frames; rounds[i].cause = rl.cause;
    rounds[i].mine = rl.fighters[0]; rounds[i].theirs = rl.fighters[1];
  });
  return { status: g.status, winner: g.winner, rounds };
}

async function main() {
  const args = parseArgs(process.argv);
  const count = parseInt(args.count || '1', 10);
  const seed0 = parseInt(args.seed || '1', 10);
  const cmdA = args.a || 'python agent.py', cmdB = args.b || 'python agent.py';
  let W = 0, L = 0, D = 0, gw = 0, gl = 0, gd = 0, games = 0;
  const pocket = [], equip = [], mybombs = [], bestBombs = [], bestBlast = [], bestSpeed = [];
  const eq60hist = {};
  for (let i = 0; i < count; i++) {
    const r = await playMatch(seed0 + i, cmdA, cmdB);
    if (r.status === 'tech') { console.log(`seed ${seed0 + i}: TECH`); continue; }
    if (r.winner === 0) W++; else if (r.winner === 1) L++; else D++;
    for (const rr of r.rounds) {
      games++;
      if (rr.winner === 'A') gw++; else if (rr.winner === 'B') gl++; else gd++;
      pocket.push(rr.pocketTicks === null ? 9999 : Math.round(rr.pocketTicks / 20));
      mybombs.push(rr.bombs || 0);
      if (rr.best) { bestBombs.push(rr.best.bombs); bestBlast.push(rr.best.blast); bestSpeed.push(rr.best.speed); }
      if (rr.eq60) eq60hist[rr.eq60] = (eq60hist[rr.eq60] || 0) + 1;
      if (rr.mine) equip.push(`${rr.mine.bombs}/${rr.mine.blast}/${rr.mine.speed}${rr.mine.alive ? '' : 'X'}`);
      if (args.verbose) console.log(`  seed ${seed0 + i} R${rr.round}: ${rr.winner === 'A' ? 'W' : rr.winner === 'B' ? 'L' : 'D'} ${Math.round(rr.frames / 20)}s cause=${rr.cause || '-'} me=${equip[equip.length - 1]} opp=${rr.theirs.bombs}/${rr.theirs.blast}/${rr.theirs.speed}${rr.theirs.alive ? '' : 'X'} leavePocket=${pocket[pocket.length - 1] === 9999 ? 'never' : pocket[pocket.length - 1] + 's'} myBombFrames=${rr.bombs}`);
    }
  }
  const avg = a => (a.reduce((x, y) => x + y, 0) / Math.max(1, a.length));
  const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : 0; };
  const stuck = pocket.filter(x => x === 9999).length;
  const full = equip.filter(e => e.startsWith('6/6/3')).length;
  const bests = r => 0;
  console.log(`\nA=${cmdA}\nB=${cmdB}`);
  console.log(`matches ${count}: A-wins ${W} (${(100 * W / count).toFixed(1)}%) B-wins ${L} draws ${D}`);
  console.log(`games ${games}: A ${gw} (${(100 * gw / Math.max(1, games)).toFixed(1)}%) B ${gl} draw ${gd}`);
  console.log(`A 离开出生口袋: 中位 ${med(pocket.filter(x => x !== 9999))}s  从未离开 ${stuck}/${games} 局`);
  console.log(`A 每局放弹帧数(上升沿): 中位 ${med(mybombs)} 均值 ${avg(mybombs).toFixed(1)}`);
  console.log(`A 终局装备 6/6/3 的局数: ${full}/${games}`);
  console.log(`A 本局达到过的最高装备(中位): b${med(bestBombs)}/f${med(bestBlast)}/s${med(bestSpeed)}   60s 时装备分布: ` + JSON.stringify(eq60hist));
  const hist = {};
  for (const e of equip) hist[e] = (hist[e] || 0) + 1;
  console.log('A 终局装备分布: ' + Object.entries(hist).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`).join(' '));
}

main();
