'use strict';
/* Local exact-physics harness for the ricochet duel.
 * usage: node dev/harness.js --p0 ext:python --p1 idle --games 3 --seconds 120 --dump out.jsonl
 * Player specs: idle | dodge | random | ext:<executable>  (agent.py invoked with cwd = workspace)
 */
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require('../simulation.js');
const catalog = require('../catalog.js');

const ROOT = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const a = { p0: 'idle', p1: 'idle', games: 1, seconds: 120, dump: null, seed0: 7001, quiet: false, env0: null, env1: null, stats: false, vary: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--p0') { a.p0 = v; i++; }
    else if (k === '--p1') { a.p1 = v; i++; }
    else if (k === '--games') { a.games = parseInt(v); i++; }
    else if (k === '--seconds') { a.seconds = parseFloat(v); i++; }
    else if (k === '--dump') { a.dump = v; i++; }
    else if (k === '--seed') { a.seed0 = parseInt(v); i++; }
    else if (k === '--env0') { a.env0 = v; i++; }
    else if (k === '--env1') { a.env1 = v; i++; }
    else if (k === '--stats') { a.stats = true; }
    else if (k === '--vary') { a.vary = true; }
    else if (k === '--quiet') { a.quiet = true; }
  }
  return a;
}

// ------------------------------------------------------------------ bots
const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};
const MOVE = ['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'];
const AIM8 = ['U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'];

function vecToDir(x, y) {
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return 'N';
  let best = 'N', bd = -Infinity;
  for (const k of MOVE) {
    if (k === 'N') continue;
    const [dx, dy] = DIRS[k];
    const l = Math.hypot(dx, dy);
    const dot = (x * dx + y * dy) / (Math.hypot(x, y) * l);
    if (dot > bd) { bd = dot; best = k; }
  }
  return best;
}

function stepPos(x, y, dk) {
  const [dx, dy] = DIRS[dk];
  const sp = 13 * 0.05;
  let nx = x, ny = y;
  const tx = x + dx * sp;
  if (!catalog.circleHitsWall(tx, y, 0.45)) nx = tx;
  const ty = y + dy * sp;
  if (!catalog.circleHitsWall(nx, ty, 0.45)) ny = ty;
  return [nx, ny];
}

function predictBulletLinear(b, frames) {
  // moderately exact: assume no bounces in the next few frames? do exact substeps
  let { x, y, vx, vy } = b;
  const out = [];
  for (let f = 0; f < frames; f++) {
    for (let s = 0; s < 3; s++) {
      const nx = x + vx / 60, ny = y + vy / 60;
      if (catalog.tileAt(nx, y) === 1) vx = -vx; else x = nx;
      if (catalog.tileAt(x, ny) === 1) vy = -vy; else y = ny;
    }
    out.push([x, y]);
  }
  return out;
}

class IdleBot {
  constructor() { this.name = 'idle'; }
  decide(snap) {
    const mi = snap.yourPlayer, me = snap.players[mi], op = snap.players[1 - mi];
    const aim = vecToDir(op.x - me.x, op.y - me.y);
    return [{ dir: 'N', aim, fire: true }, { dir: 'N', aim, fire: true }, { dir: 'N', aim, fire: true }];
  }
}

class RandomBot {
  constructor(seed) { this.name = 'random'; this.s = seed || 1; }
  rnd() { this.s = (this.s * 1103515245 + 12345) & 0x7fffffff; return this.s / 0x7fffffff; }
  decide(snap) {
    const mv = MOVE[Math.floor(this.rnd() * MOVE.length)];
    const aim = AIM8[Math.floor(this.rnd() * AIM8.length)];
    return [0, 1, 2].map(() => ({ dir: mv, aim, fire: true }));
  }
}

class DodgeBot {
  constructor(name) { this.name = name || 'dodge'; }
  decide(snap) {
    const mi = snap.yourPlayer, me = snap.players[mi], op = snap.players[1 - mi];
    const enemies = snap.bullets.filter(b => b.owner !== mi);
    // score candidate straight-line 3-frame paths
    let best = null, bestScore = -Infinity;
    for (const dk of MOVE) {
      let [x, y] = [me.x, me.y];
      let score = 0;
      const path = [];
      for (let f = 0; f < 3; f++) {
        [x, y] = stepPos(x, y, dk);
        path.push([x, y]);
      }
      for (const b of enemies) {
        const pts = predictBulletLinear(b, 3);
        for (let f = 0; f < 3; f++) {
          const d = Math.hypot(path[f][0] - pts[f][0], path[f][1] - pts[f][1]);
          if (d < 0.9) score -= 1000;
          else score += Math.min(d, 4) - 0.35 * f;
        }
      }
      // avoid walls
      if (catalog.circleHitsWall(x, y, 0.7)) score -= 50;
      score -= 0.15 * Math.abs(Math.hypot(x - op.x, y - op.y) - 9);
      if (score > bestScore) { bestScore = score; best = dk; }
    }
    const aim = vecToDir(op.x - me.x, op.y - me.y);
    return [0, 1, 2].map(() => ({ dir: best || 'N', aim, fire: true }));
  }
}

class ProcBot {
  constructor(exe, label, env, seed, vary) {
    this.name = label || exe;
    this.exe = exe;
    this.env = env || {};
    this.seed = seed;
    this.vary = !!vary;
    this.proc = null;
    this.rl = null;
    this.pending = null;
    this.times = [];
  }
  start() {
    const env = Object.assign({}, process.env, this.env);
    if (this.vary && env.DUEL_SEED === undefined) env.DUEL_SEED = String(this.seed);
    this.proc = spawn(this.exe, ['agent.py'], { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => {
      if (!this.pending) return;
      const p = this.pending;
      this.pending = null;
      if (p.timer) clearTimeout(p.timer);
      try { p.resolve(JSON.parse(line)); } catch (e) { p.reject(new Error('bad json: ' + line.slice(0, 200))); }
    });
    this.proc.stderr.on('data', (d) => { if (process.env.HARNESS_DEBUG) process.stderr.write('[agent] ' + d); });
    this.proc.on('exit', (code) => {
      if (this.pending) { const p = this.pending; this.pending = null; if (p.timer) clearTimeout(p.timer); p.reject(new Error('agent exited ' + code)); }
    });
  }
  decide(snap) {
    return new Promise((resolve, reject) => {
      if (!this.proc) this.start();
      const t0 = Date.now();
      const timer = setTimeout(() => {
        if (this.pending) { this.pending = null; reject(new Error('timeout >5s')); }
      }, 5000);
      this.pending = { resolve: (v) => { this.times.push(Date.now() - t0); resolve(v); }, reject, timer };
      this.proc.stdin.write(JSON.stringify(snap) + '\n');
    });
  }
  stop() { try { this.proc.stdin.end(); this.proc.kill(); } catch (e) { } }
}

function parseEnv(s) {
  const e = {};
  if (!s) return e;
  for (const kv of s.split(',')) {
    const i = kv.indexOf('=');
    if (i > 0) e[kv.slice(0, i).trim()] = kv.slice(i + 1).trim();
  }
  return e;
}

function makeBot(spec, seed, env, vary) {
  if (spec === 'idle') return new IdleBot();
  if (spec === 'random') return new RandomBot(seed);
  if (spec === 'dodge') return new DodgeBot();
  if (spec.startsWith('ext:')) return new ProcBot(spec.slice(4), spec, env, seed, vary);
  throw new Error('unknown bot ' + spec);
}

async function playGame(bot0, bot1, seed, dumpStream, quiet, wantStats) {
  const g = sim.createMatch({ id: 'g' + seed, seed, players: [{ name: 'P0' }, { name: 'P1' }] });
  const stats = { seed, frames: 0, windows: 0, decisions: [0, 0] };
  const shotMap = new Map();
  const shotList = [];
  const minFoe = [Infinity, Infinity];
  const wallStats = [0, 1].map(() => ({ n: 0, near22: 0, near15: 0, minWall: 9, readyN: 0, readyNear: 0 }));
  const tick = () => {
    for (let i = 0; i < 2; i++) {
      const p = g.players[i], foe = g.players[1 - i];
      const e = Math.min(p.x - 1, 39 - p.x, p.y - 1, 29 - p.y);
      const ws = wallStats[i];
      ws.n++;
      if (e < 2.2) ws.near22++;
      if (e < 1.5) ws.near15++;
      if (e < ws.minWall) ws.minWall = e;
      if (foe.cooldown <= 6) {
        ws.readyN++;
        if (e < 2.2) ws.readyNear++;
      }
    }
    for (const b of g.bullets) {
      let tr = shotMap.get(b.id);
      if (!tr) {
        const foe = g.players[1 - b.owner];
        tr = { id: b.id, owner: b.owner, bornFrame: g.frame, fireDist: +Math.hypot(foe.x - b.x, foe.y - b.y).toFixed(2), min: Infinity };
        shotMap.set(b.id, tr);
        shotList.push(tr);
      }
      const foe = g.players[1 - tr.owner];
      const d = Math.hypot(foe.x - b.x, foe.y - b.y);
      if (d < tr.min) tr.min = d;
    }
    for (let i = 0; i < 2; i++) {
      const p = g.players[i];
      let m = Infinity;
      for (const b of g.bullets) {
        if (b.owner === i) continue;
        const d = Math.hypot(p.x - b.x, p.y - b.y);
        if (d < m) m = d;
      }
      if (m < minFoe[i]) minFoe[i] = m;
    }
  };
  while (g.status === 'playing') {
    const wins = [];
    for (let owner = 0; owner < 2; owner++) {
      const bot = owner === 0 ? bot0 : bot1;
      const snap = sim.snapshot(g, owner);
      const t0 = Date.now();
      let raw;
      try { raw = await bot.decide(JSON.parse(JSON.stringify(snap))); }
      catch (e) { return { error: String(e), winner: 1 - owner, reason: 'agent failure' }; }
      stats.decisions[owner] += Date.now() - t0;
      let win;
      const rawInputs = (raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.inputs)) ? raw.inputs : raw;
      try { win = sim.submitWindow(g, owner, rawInputs); }
      catch (e) { return { error: String(e), winner: 1 - owner, reason: 'illegal input: ' + e.message }; }
      wins.push(win);
      if (dumpStream) dumpStream.write(JSON.stringify({ kind: 'window', seed, frame: g.frame, owner, snap, raw }) + '\n');
    }
    const before = g.frame;
    for (let f = 0; f < 3 && g.status === 'playing'; f++) {
      for (let o = 0; o < 2; o++) {
        const p = g.players[o];
        if (!p || !p.alive) continue;
        const w = wins[o];
        const inp = w && w[f] ? w[f] : { dir: 'N', aim: null, fire: false };
        p.held = inp;
        p.inputHistory.push(inp);
        if (p.inputHistory.length > 8) p.inputHistory.shift();
      }
      sim.step(g);
      if (wantStats) tick();
    }
    stats.windows += 1;
    stats.frames = g.frame;
    if (g.frame === before) break;
  }
  const shotStats = (owner) => {
    const arr = shotList.filter(s => s.owner === owner).map(s => s.min).filter(Number.isFinite).sort((a, b) => a - b);
    const q = (p) => arr.length ? +arr[Math.floor(arr.length * p)].toFixed(3) : null;
    return {
      n: arr.length, min: q(0), p10: q(0.1), median: q(0.5),
      under1_0: arr.filter(v => v < 1.0).length,
      under1_5: arr.filter(v => v < 1.5).length,
      under2_0: arr.filter(v => v < 2.0).length,
    };
  };
  return {
    seed, winner: g.winner, reason: g.reason, frames: g.frame, shots: g.players.map(p => p.shots),
    windows: stats.windows,
    stats: wantStats ? {
      shotQuality: [shotStats(0), shotStats(1)],
      minEnemyDist: minFoe.map(v => +v.toFixed(3)),
      wall: wallStats.map(s => ({
        near22: +(100 * s.near22 / Math.max(1, s.n)).toFixed(1),
        near15: +(100 * s.near15 / Math.max(1, s.n)).toFixed(1),
        min: +s.minWall.toFixed(2),
        readyNear: +(100 * s.readyNear / Math.max(1, s.readyN)).toFixed(1),
      })),
    } : null,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.seconds && args.seconds !== 120) sim.rules.matchSeconds = args.seconds;
  const dumpStream = args.dump ? fs.createWriteStream(args.dump) : null;
  let wins = [0, 0, 0]; // p0, p1, draw
  const lastBots = [null, null];
  for (let i = 0; i < args.games; i++) {
    const seed = args.seed0 + i;
    const b0 = makeBot(args.p0, seed * 2 + 1, parseEnv(args.env0), args.vary);
    const b1 = makeBot(args.p1, seed * 2 + 2, parseEnv(args.env1), args.vary);
    lastBots[0] = b0; lastBots[1] = b1;
    if (b0.start && args.p0.startsWith('ext:')) b0.start();
    if (b1.start && args.p1.startsWith('ext:')) b1.start();
    const t0 = Date.now();
    const r = await playGame(b0, b1, seed, dumpStream, args.quiet, args.stats);
    const dt = Date.now() - t0;
    if (b0.stop) b0.stop();
    if (b1.stop) b1.stop();
    if (r.error) {
      console.log(`seed ${seed}: ERROR ${r.error}`);
      wins[1 - (r.winner || 0)]++;
    } else {
      if (r.winner === 0) wins[0]++;
      else if (r.winner === 1) wins[1]++;
      else wins[2]++;
      if (!args.quiet) {
        console.log(`seed ${seed}: winner=${r.winner} reason=${r.reason} frames=${r.frames} shots=${r.shots} wall=${dt}ms`);
        if (r.stats) console.log(`STATS seed=${seed} ${JSON.stringify(r.stats)}`);
      }
    }
  }
  console.log(`SUMMARY p0=${args.p0} p1=${args.p1} games=${args.games} -> p0 ${wins[0]} / p1 ${wins[1]} / draw ${wins[2]}`);
  if (dumpStream) await new Promise((res) => dumpStream.end(res));
  for (const [name, bot] of [['p0', lastBots[0]], ['p1', lastBots[1]]]) {
    if (bot && bot.times && bot.times.length) {
      const t = bot.times.slice().sort((a, b) => a - b);
      const sum = t.reduce((a, b) => a + b, 0);
      console.log(`TIMING ${name} n=${t.length} avg=${(sum / t.length).toFixed(1)}ms p95=${t[Math.floor(t.length * 0.95)]}ms max=${t[t.length - 1]}ms`);
    }
  }
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
