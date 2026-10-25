// 行为克隆版 Sol：动作分布直接来自公开录象的「状态-动作」统计表。
// 它不是 Sol 的代码，只是用于检验我方策略对真实行为分布的稳健性。
const fs = require('fs');
const path = require('path');
const catalog = require('./catalog.patched.js');
const { characters } = catalog;

const TABLE = JSON.parse(fs.readFileSync(path.join(__dirname, 'solbc_table.json'), 'utf8')).table;
const MOT = { qcf: ['D', 'DF', 'F'], qcb: ['D', 'DB', 'B'], dp: ['F', 'D', 'DF'], hcb: ['F', 'DF', 'D', 'DB', 'B'] };
const D = (d, b = null) => ({ dir: d, btn: b });

class RNG {
  constructor(seed) { this.s = (seed >>> 0) || 1; }
  next() { this.s = (1664525 * this.s + 1013904223) >>> 0; return this.s / 4294967296; }
  int(n) { return Math.floor(this.next() * n); }
}

function distBucket(dx) {
  return dx < 70 ? '0-70' : dx < 110 ? '70-110' : dx < 150 ? '110-150' : dx < 200 ? '150-200'
    : dx < 280 ? '200-280' : dx < 380 ? '280-380' : '380+';
}

function pickWeighted(rng, counts) {
  const entries = Object.entries(counts);
  let total = 0;
  for (const [, c] of entries) total += c;
  let r = rng.next() * total;
  for (const [a, c] of entries) { r -= c; if (r <= 0) return a; }
  return entries[entries.length - 1][0];
}

function findMove(char, name) {
  const c = characters[char];
  if (!c) return null;
  for (const pool of ['normals', 'specials']) for (const m of Object.values(c[pool] || {})) if (m.name === name) return m;
  if (c.super && c.super.name === name) return c.super;
  return null;
}

class SolBC {
  constructor(seat, seed = 1, opts = {}) {
    this.seat = seat;
    this.rng = new RNG(seed * 2654435761 + 12345);
    this.temp = opts.temp === undefined ? 0.35 : opts.temp; // 平滑：给未观测动作一点概率
    this.jitter = opts.jitter === undefined ? 4 : opts.jitter;
    this.aggr = opts.aggr === undefined ? 1 : opts.aggr;
  }
  win(g) {
    const f = g.fighters[this.seat], o = g.fighters[1 - this.seat];
    this.C = characters[f.char]; this.f = f; this.o = o;
    this.plan = new Map();
    const put = (k, d, b = null) => { if (k >= 1 && k <= 15) this.plan.set(k, D(d, b)); };
    const fill = (d = 'N', b = null) => { for (let k = 1; k <= 15; k++) if (!this.plan.has(k)) this.plan.set(k, D(d, b)); };
    const now = g.frames;
    const dx = Math.abs(o.x - f.x);

    if (f.state === 'ko') { fill('N'); return this.out(); }
    if (['hitstun', 'down', 'wakeup', 'blockstun'].includes(f.state)) { fill('DB'); return this.out(); }
    if (f.state === 'attack' || f.state === 'stance') { fill('N'); return this.out(); }
    if (f.airborne || f.state === 'jump' || f.state === 'air') {
      if (f.state === 'jump' && !f.airMoveUsed && now - f.stateAt >= 2 && this.rng.next() < 0.75) {
        const btn = dx < 140 ? 'HK' : 'HP';
        put(1 + this.rng.int(3), 'N', btn);
      }
      fill('N');
      return this.out();
    }

    const meter = f.meter >= 100 ? 'FULL' : 'no';
    let key = [f.char, f.state, o.state, distBucket(dx), meter].join('|');
    let counts = TABLE[key];
    if (!counts) {
      key = [f.char, f.state, o.state, distBucket(dx), 'no'].join('|');
      counts = TABLE[key];
    }
    if (!counts) {
      const alt = Object.keys(TABLE).filter(k => k.startsWith(f.char + '|' + f.state + '|'));
      counts = {};
      for (const k of alt) for (const [a, c] of Object.entries(TABLE[k])) counts[a] = (counts[a] || 0) + c;
    }
    if (!counts || !Object.keys(counts).length) { fill(f.state === 'crouch' ? 'DB' : 'N'); return this.out(); }

    // 平滑 + 进攻性缩放
    const smoothed = {};
    for (const [a, c] of Object.entries(counts)) smoothed[a] = c + this.temp;
    if (this.aggr !== 1) for (const a of Object.keys(smoothed)) if (a !== '(none)') smoothed[a] *= this.aggr;

    const act = pickWeighted(this.rng, smoothed);
    const guard = f.state === 'crouch' ? 'D' : 'N';
    if (act === '(none)') { fill(guard); return this.out(); }
    if (act === 'jump') {
      const delay = this.rng.int(Math.max(1, this.jitter));
      put(1 + delay, 'UF');
      fill('DB');
      return this.out();
    }
    const md = findMove(f.char, act);
    if (!md) { fill(guard); return this.out(); }
    if (md.cost && f.meter < md.cost) { fill(guard); return this.out(); }
    const motion = md.motion;
    const btn = md.button || 'LP';
    if (motion) {
      const seq = MOT[motion] || MOT.qcf;
      const delay = this.rng.int(Math.max(1, 14 - seq.length));
      const t0 = 1 + delay;
      for (let i = 0; i < seq.length && t0 + i <= 15; i++) put(t0 + i, seq[i], i === seq.length - 1 ? btn : null);
      for (let j = 1; j <= 2 && t0 + seq.length - 1 + j <= 15; j++) put(t0 + seq.length - 1 + j, seq[seq.length - 1], btn);
    } else {
      const delay = this.rng.int(Math.max(1, this.jitter + 4));
      put(1 + delay, 'F', btn);
    }
    fill(guard);
    return this.out();
  }
  out() {
    const a = [];
    for (let k = 1; k <= 15; k++) a.push(this.plan.get(k) || D('N'));
    return a;
  }
}
module.exports = { SolBC };
