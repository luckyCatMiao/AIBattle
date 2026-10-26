'use strict';
/* Offline oracle analysis: for each shot fired by player 0, compare the
 * chosen aim direction with all 8 directions scored against the opponent's
 * ACTUAL future trajectory (perfect foresight).
 * usage: node dev/oracle_aim.js --p1 ext:python --games 1 --seed 7091 --seconds 60
 */
const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require('../simulation.js');
const catalog = require('../catalog.js');

const ROOT = path.resolve(__dirname, '..');
const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};
const AIM = ['U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'];
const V = 8.5;

function parseArgs(argv) {
  const a = { p0: 'ext:python', p1: 'ext:python', games: 1, seconds: 60, seed0: 7091, env0: null, env1: null, vary: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--p1') { a.p1 = v; i++; }
    else if (k === '--env1') { a.env1 = v; i++; }
    else if (k === '--p0') { a.p0 = v; i++; }
    else if (k === '--games') { a.games = parseInt(v); i++; }
    else if (k === '--seconds') { a.seconds = parseFloat(v); i++; }
    else if (k === '--seed') { a.seed0 = parseInt(v); i++; }
    else if (k === '--env0') { a.env0 = v; i++; }
    else if (k === '--env1') { a.env1 = v; i++; }
    else if (k === '--vary') { a.vary = true; }
  }
  return a;
}

class ProcBot {
  constructor(exe, env, seed, vary) {
    this.exe = exe; this.env = env || {}; this.seed = seed; this.vary = vary; this.proc = null;
  }
  start() {
    const env = Object.assign({}, process.env, this.env);
    if (this.vary && env.DUEL_SEED === undefined) env.DUEL_SEED = String(this.seed);
    this.proc = spawn(this.exe, ['agent.py'], { cwd: ROOT, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.rl.on('line', (line) => {
      if (!this.pending) return;
      const p = this.pending; this.pending = null;
      try { p.resolve(JSON.parse(line)); } catch (e) { p.reject(e); }
    });
    this.proc.stderr.on('data', () => {});
  }
  decide(snap) {
    return new Promise((resolve, reject) => {
      if (!this.proc) this.start();
      this.pending = { resolve, reject };
      this.proc.stdin.write(JSON.stringify(snap) + '\n');
    });
  }
  stop() { try { this.proc.stdin.end(); this.proc.kill(); } catch (e) {} }
}

function parseEnv(s) {
  const e = {};
  if (!s) return e;
  for (const kv of s.split(',')) { const i = kv.indexOf('='); if (i > 0) e[kv.slice(0, i).trim()] = kv.slice(i + 1).trim(); }
  return e;
}

// exact bullet advance copied from simulation.js semantics
function adv(x, y, vx, vy) {
  const SUB = 3, DT = 1 / 20;
  for (let s = 0; s < SUB; s++) {
    const nx = x + vx * DT / SUB, ny = y + vy * DT / SUB;
    if (catalog.tileAt(nx, y) === 1) vx = -vx; else x = nx;
    if (catalog.tileAt(x, ny) === 1) vy = -vy; else y = ny;
  }
  return [x, y, vx, vy];
}

function pathFor(px, py, ux, uy, nf) {
  let bx = px + ux * 0.79, by = py + uy * 0.79;
  if (catalog.tileAt(bx, by) === 1) return null;
  let vx = ux * V, vy = uy * V;
  const out = [];
  for (let f = 0; f < nf; f++) { [bx, by, vx, vy] = adv(bx, by, vx, vy); out.push([bx, by]); }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.seconds !== 120) sim.rules.matchSeconds = args.seconds;
  const all = [];
  for (let gi = 0; gi < args.games; gi++) {
    const seed = args.seed0 + gi;
    const b0 = new ProcBot('python', parseEnv(args.env0), seed * 2 + 1, args.vary);
    const b1 = new ProcBot('python', parseEnv(args.env1), seed * 2 + 2, args.vary);
    b0.start(); b1.start();
    const g = sim.createMatch({ id: 'g' + seed, seed, players: [{ name: 'P0' }, { name: 'P1' }] });
    const frames = [];   // per-frame: {f, p:[[x,y],[x,y]]}
    const fires = [];    // {frame, owner, x, y, ux, uy}
    const prevBullets = new Set();
    while (g.status === 'playing') {
      const wins = [];
      for (let owner = 0; owner < 2; owner++) {
        const snap = sim.snapshot(g, owner);
        const raw = await (owner === 0 ? b0 : b1).decide(snap);
        const rawInputs = raw && raw.inputs ? raw.inputs : raw;
        wins.push(sim.submitWindow(g, owner, rawInputs));
      }
      const f0 = g.frame;
      for (let f = 0; f < 3 && g.status === 'playing'; f++) {
        for (let o = 0; o < 2; o++) {
          const p = g.players[o];
          if (p && p.alive) p.held = wins[o][f];
        }
        sim.step(g);
        frames.push({ f: g.frame, p: g.players.map(p => [p.x, p.y]), alive: g.players.map(p => p.alive) });
        for (const b of g.bullets) {
          if (!prevBullets.has(b.id)) {
            prevBullets.add(b.id);
            const sp = Math.hypot(b.vx, b.vy);
            const pl = g.players[b.owner];
            fires.push({ frame: g.frame, prevFrame: f0, owner: b.owner, x: b.x, y: b.y, px: pl.x, py: pl.y, ux: b.vx / sp, uy: b.vy / sp });
          }
        }
      }
    }
    b0.stop(); b1.stop();
    console.log(`game seed=${seed} winner=${g.winner} reason=${g.reason} frames=${g.frame} shots=${g.players.map(p => p.shots)}`);
    // analyze p0 shots only
    const posByFrame = new Map(frames.map(fr => [fr.f, fr.p]));
    const rows = [];
    for (const s of fires.filter(f => f.owner === 0)) {
      const startFrame = s.frame; // bullet already advanced this frame; its position now
      const foe = 1;
      const travel = [];
      let bx = s.x, by = s.y, vx = s.ux * V, vy = s.uy * V;
      const NF = 140;
      const chosenPts = [];
      for (let f = 0; f < NF; f++) {
        [bx, by, vx, vy] = adv(bx, by, vx, vy);
        chosenPts.push([bx, by]);
      }
      const foePos = [];
      for (let f = 0; f < NF; f++) {
        const fp = posByFrame.get(startFrame + f + 1) || posByFrame.get(startFrame + f);
        foePos.push(fp ? fp[foe] : null);
      }
      const score = (pts, lim) => {
        let mind = Infinity, mindAt = 0;
        const top = lim || NF;
        for (let f = 0; f < top; f++) {
          if (!foePos[f] || !pts[f]) continue;
          const d = Math.hypot(pts[f][0] - foePos[f][0], pts[f][1] - foePos[f][1]);
          if (d < mind) { mind = d; mindAt = f; }
        }
        return [mind, mindAt];
      };
      const [cm, cat] = score(chosenPts);
      const [cm30] = score(chosenPts, 30);
      const [cm15] = score(chosenPts, 15);
      const [cm45] = score(chosenPts, 45);
      const [cm60] = score(chosenPts, 60);
      // oracle over 8 directions. The chosen direction may not align with an
      // 8-grid direction only if facing came from a null aim; in practice it does.
      let best = { d: Infinity };
      let best30 = { d: Infinity, dk: null }, best15 = { d: Infinity, dk: null };
      let best45 = { d: Infinity, dk: null }, best60 = { d: Infinity, dk: null };
      for (const dk of AIM) {
        const [ux, uy] = DIRS[dk];
        const pts = pathFor(s.px, s.py, ux, uy, NF);
        if (!pts) continue;
        const p2 = [[s.x, s.y], ...pts];
        const [d, at] = score(p2);
        if (d < best.d) best = { d, at, dk };
        const [d30] = score(p2, 30);
        if (d30 < best30.d) best30 = { d: d30, dk };
        const [d15] = score(p2, 15);
        if (d15 < best15.d) best15 = { d: d15, dk };
        const [d45] = score(p2, 45);
        if (d45 < best45.d) best45 = { d: d45, dk };
        const [d60] = score(p2, 60);
        if (d60 < best60.d) best60 = { d: d60, dk };
      }
      // distance to foe at fire time
      const fd = posByFrame.get(startFrame + 1);
      const fd0 = posByFrame.get(startFrame);
      const atFire = fd0 ? Math.hypot(fd0[foe][0] - s.x, fd0[foe][1] - s.y) : null;
      rows.push({ frame: startFrame, t: +(startFrame / 20).toFixed(2), fireDist: atFire && +atFire.toFixed(2), chosen: +cm.toFixed(3), chosenAt: cat, oracle: +best.d.toFixed(3), oracleAt: best.at, oracleDir: best.dk,
        chosen15: +cm15.toFixed(3), oracle15: +best15.d.toFixed(3), oracle15Dir: best15.dk,
        chosen45: +cm45.toFixed(3), oracle45: +best45.d.toFixed(3), oracle45Dir: best45.dk,
        chosen60: +cm60.toFixed(3), oracle60: +best60.d.toFixed(3), oracle60Dir: best60.dk,
        chosen30: +cm30.toFixed(3), oracle30: +best30.d.toFixed(3), oracle30Dir: best30.dk });
    }
    const ss = (key) => {
      const a = rows.map(r => r[key]).filter(Number.isFinite).sort((x, y) => x - y);
      const q = p => a.length ? a[Math.floor(a.length * p)] : null;
      return { n: a.length, min: q(0), p10: q(0.1), p25: q(0.25), median: q(0.5) };
    };
    // bucketed by fire distance
    const buckets = [[0, 4], [4, 7], [7, 12], [12, 100]];
    console.log('chosen', JSON.stringify(ss('chosen')));
    console.log('oracle', JSON.stringify(ss('oracle')));
    for (const [lo, hi] of buckets) {
      const rr = rows.filter(r => r.fireDist >= lo && r.fireDist < hi);
      const c = rr.map(r => r.chosen).sort((a, b) => a - b);
      const o = rr.map(r => r.oracle).sort((a, b) => a - b);
      const q = (a, p) => a.length ? +(a[Math.floor(a.length * p)]).toFixed(2) : null;
      console.log(`dist ${lo}-${hi}: n=${rr.length} chosen p10=${q(c, 0.1)} med=${q(c, 0.5)} | oracle med=${q(o, 0.5)} | oracle<0.67 ${o.filter(v => v < 0.67).length} chosen<0.67 ${c.filter(v => v < 0.67).length}`);
    }
    for (const r of rows) console.log('ROW ' + JSON.stringify(r));
    all.push(...rows);
  }
  const ss = (key) => {
    const a = all.map(r => r[key]).filter(Number.isFinite).sort((x, y) => x - y);
    const q = p => a.length ? a[Math.floor(a.length * p)] : null;
    return { n: a.length, min: q(0), p10: q(0.1), p25: q(0.25), median: q(0.5) };
  };
  console.log('ALL chosen', JSON.stringify(ss('chosen')), 'oracle', JSON.stringify(ss('oracle')));
}

main().catch(e => { console.error(e); process.exit(1); });
