'use strict';
/* Death-context analyser: plays A vs B frame-by-frame and reports, for every death,
 * what the victim looked like at the moment the fatal bomb was *placed*.
 * usage: node dev/analyze.js --count 10 --seed 5000 --a "python agent.py" --b "python agent.py"
 */
const { spawn } = require('child_process');
const path = require('path');
const engine = require('./engine_an.js');
const W = 19, H = 17;

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i]; const nxt = argv[i + 1];
    if (nxt === undefined || nxt.startsWith('--')) a[k.slice(2)] = true;
    else { a[k.slice(2)] = nxt; i++; }
  }
  return a;
}
const window20 = []; for (let i = 0; i < 20; i++) window20.push({ dir: 'N', btn: null });

class Agent {
  constructor(cmd) {
    const p = cmd.split(' ');
    this.proc = spawn(p[0], p.slice(1), { cwd: path.resolve(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = ''; this.lines = []; this.waiters = []; this.dead = false; this.err = '';
    this.proc.stdout.on('data', d => {
      this.buf += d.toString(); let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (line) this.lines.push(line);
      }
      while (this.lines.length && this.waiters.length) this.waiters.shift()(this.lines.shift());
    });
    this.proc.stderr.on('data', d => { this.err += d.toString(); if (this.err.length > 2000) this.err = this.err.slice(-2000); });
    this.proc.on('close', () => { this.dead = true; while (this.waiters.length) this.waiters.shift()(null); });
  }
  next(ms = 5000) {
    if (this.lines.length) return Promise.resolve(this.lines.shift());
    if (this.dead) return Promise.resolve(null);
    return new Promise(res => { const t = setTimeout(() => res(null), ms); this.waiters.push(l => { clearTimeout(t); res(l); }); });
  }
  send(o) { this.proc.stdin.write(JSON.stringify(o) + '\n'); }
  kill() { try { this.proc.kill(); } catch (e) { } }
}

const walk = (g, x, y, bombs) => x >= 0 && y >= 0 && x < W && y < H && g.tiles[y * W + x] === 0 && !bombs.some(b => b.x === x && b.y === y);
function exits(g, x, y, bombs) {
  let n = 0; const ax = [];
  for (const [dx, dy, name] of [[1, 0, 'H'], [-1, 0, 'H'], [0, 1, 'V'], [0, -1, 'V']]) {
    if (walk(g, x + dx, y + dy, bombs)) { n++; ax.push(name); }
  }
  return { n, hasH: ax.includes('H'), hasV: ax.includes('V') };
}
function regionSize(g, x, y, bombs, limit) {
  const seen = new Set([x + ',' + y]); let q = [[x, y, 0]];
  while (q.length) {
    const [cx, cy, d] = q.shift();
    if (d >= limit) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = cx + dx, ny = cy + dy, k = nx + ',' + ny;
      if (seen.has(k) || !walk(g, nx, ny, bombs)) continue;
      seen.add(k); q.push([nx, ny, d + 1]);
    }
  }
  return seen.size;
}

function snap(g) {
  return {
    f: g.fighters.map(f => ({ x: f.x, y: f.y, alive: f.alive, bombs: f.bombs, blast: f.blast, speed: f.speed })),
    b: g.bombs.map(b => ({ x: b.x, y: b.y, fuse: b.fuse, blast: b.blast, owner: b.owner })),
    drops: g.drops.length,
  };
}

async function playMatch(seed, cmdA, cmdB) {
  const g = engine.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [new Agent(cmdA), new Agent(cmdB)];
  const hist = [];              // per-frame snapshots, reset per round
  const deaths = [];
  let roundKey = 1, w = 0;
  const allDeaths = [];
  let bombEvents = [];          // {frame, owner, x, y, blast}
  let perFrameLog = [];
  while (g.status === 'playing' && w < 800) {
    w++;
    const obs = [0, 1].map(owner => { const s = engine.snapshot(g, owner); s.lastErrors = []; s.decisionWindows = true; s.framesPerWindow = 20; s.exampleWindow = window20; return s; });
    agents.forEach((a, i) => a.send(obs[i]));
    const replies = await Promise.all(agents.map(a => a.next()));
    const wins = [null, null];
    for (let i = 0; i < 2; i++) {
      if (replies[i] === null) { agents.forEach(a => a.kill()); return { seed, tech: true, deaths }; }
      wins[i] = engine.submitWindow(g, i, JSON.parse(replies[i]).inputs);
    }
    for (let fr = 0; fr < 20 && g.status === 'playing'; fr++) {
      if (g.round !== roundKey) { roundKey = g.round; }
      const before = g.fighters.map(f => f.alive);
      const roundBefore = g.round;
      const nEvents = g.events.length;
      for (let o = 0; o < 2; o++) { const f = g.fighters[o]; if (f && f.alive) { const wi = wins[o]; f.inputHistory.push(wi && wi[fr] ? wi[fr] : { dir: 'N', btn: null }); if (f.inputHistory.length > 8) f.inputHistory.shift(); f.held = f.inputHistory[f.inputHistory.length - 1]; } }
      const preBombs = g.bombs.map(b => ({ x: b.x, y: b.y, blast: b.blast, owner: b.owner }));
      const preF = g.fighters.map(f => ({ x: f.x, y: f.y, alive: f.alive, bombs: f.bombs, blast: f.blast, speed: f.speed }));
      const bs = preBombs.map(b => ({ x: b.x, y: b.y }));
      const perFrame = g.fighters.map(f => ({ x: f.x, y: f.y, alive: f.alive, bombs: f.bombs, blast: f.blast, speed: f.speed,
        exits: exits(g, f.x, f.y, bs).n, region: regionSize(g, f.x, f.y, bs, 3) }));
      perFrameLog.push({ round: g.round, frame: g.roundFrames, f: perFrame });
      engine.step(g);
      // newly placed bombs
      for (const b of g.bombs) {
        if (!preBombs.some(p => p.x === b.x && p.y === b.y)) bombEvents.push({ frame: g.roundFrames, round: g.round, owner: b.owner, x: b.x, y: b.y, blast: b.blast, fuse: b.fuse });
      }
      for (let o = 0; o < 2; o++) {
        const dev = g.events.slice(nEvents).find(e => e.type === 'death' && e.owner === o);
        if (before[o] && dev) {
          const pre = { x: dev.x, y: dev.y };
          const owner = (dev.blastOwners && dev.blastOwners.length) ? dev.blastOwners[0] : null;
          const dFrame = dev.frame;
          let fatal = null;
          for (let i = bombEvents.length - 1; i >= 0; i--) {
            const be = bombEvents[i];
            if (be.round !== roundBefore) break;
            if (be.owner === owner && be.frame <= dFrame && be.frame >= dFrame - 60) { fatal = be; break; }
          }
          const victimCell = [pre.x, pre.y];
          let ctx = null;
          if (fatal) {
            // reconstruct exit/region structure at placement time is approximated by current map
            const ex = exits(g, fatal.x, fatal.y, []);
            ctx = {
              bomb: [fatal.x, fatal.y], blast: fatal.blast, owner, fuseAge: dFrame - fatal.frame,
              victimCell, dist: Math.abs(fatal.x - pre.x) + Math.abs(fatal.y - pre.y),
              victimExits: 0, victimRegion: 0,
              atPlace: (perFrameLog.find(p => p.round === fatal.round && p.frame === fatal.frame) || { f: [] }).f[o] || null,
              sameRow: fatal.y === pre.y, sameCol: fatal.x === pre.x,
            };
          }
          deaths.push({
            seed, round: roundBefore, frame: dFrame, victim: o, killer: owner,
            selfKill: owner === o, cause: '被炸死', victimCell, victimEq: preF[o],
            ctx,
          });
        }
      }
    }
  }
  agents.forEach(a => a.kill());
  return { seed, status: g.status, winner: g.winner, roundLog: g.roundLog, deaths };
}

async function main() {
  const args = parseArgs(process.argv);
  const count = parseInt(args.count || '10', 10), seed0 = parseInt(args.seed || '1', 10);
  const all = []; const rounds = [];
  for (let i = 0; i < count; i++) {
    const r = await playMatch(seed0 + i, args.a, args.b);
    if (r.tech) { console.log('TECH at seed', r.seed); continue; }
    for (const d of r.deaths) all.push(d);
    for (const rl of r.roundLog) rounds.push(rl);
  }
  let self = 0, other = 0, unknown = 0;
  const victExits = {};
  for (const d of all) {
    if (d.killer === null) unknown++;
    else if (d.selfKill) self++;
    else other++;
    if (d.ctx) { const k = d.ctx.victimExits; victExits[k] = (victExits[k] || 0) + 1; }
  }
  console.log(`rounds ${rounds.length}: draws ${rounds.filter(r => !r.winner).length} avgLen ${(rounds.reduce((a, r) => a + r.frames, 0) / 20 / Math.max(1, rounds.length)).toFixed(1)}s`);
  console.log(`deaths ${all.length}: selfKill ${self} killedByOpponent ${other} unknown ${unknown}`);
  console.log('victim walkable-exits at death cell:', victExits);
  // corridor deaths: victim had only H or only V neighbours
  let corridor = 0, openBoth = 0, dead0 = 0;
  for (const d of all) if (d.ctx) { if (d.ctx.victimExits === 0) dead0++; else if (d.ctx.victimExits >= 2) openBoth++; }
  console.log(`victim cell exits: 0=${dead0} >=2=${openBoth} total ${all.filter(d => d.ctx).length}`);
  // what did the victim look like WHEN the fatal bomb was placed?
  const placeEx = {}, placeReg = {}, moved = [];
  for (const d of all) {
    if (!d.ctx || !d.ctx.atPlace) continue;
    const ap = d.ctx.atPlace;
    placeEx[ap.exits] = (placeEx[ap.exits] || 0) + 1;
    placeReg[ap.region] = (placeReg[ap.region] || 0) + 1;
    moved.push(d.ctx.atPlace.x + ',' + d.ctx.atPlace.y);
  }
  console.log('victim exits when fatal bomb placed:', placeEx);
  console.log('victim region<=3 when fatal bomb placed:', placeReg);
  const fuseAges = {};
  for (const d of all) if (d.ctx) fuseAges[d.ctx.fuseAge] = (fuseAges[d.ctx.fuseAge] || 0) + 1;
  console.log('fuse age at death:', fuseAges);
  const dists = {};
  for (const d of all) if (d.ctx) dists[d.ctx.dist] = (dists[d.ctx.dist] || 0) + 1;
  console.log('victim distance to fatal bomb:', dists);
  if (args.verbose) for (const d of all.slice(0, 40)) console.log(JSON.stringify(d));
}
main();
