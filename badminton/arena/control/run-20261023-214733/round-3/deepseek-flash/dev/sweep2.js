'use strict';
/* 参数扫描：给 brain.js 打不同 TUNE 变体，互相对战。 */
const fs = require('fs'), path = require('path');
const { play } = require('./analyze.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'brain.js'), 'utf8');

function mk(name, tune) {
  let s = src.replace("require('./engine.js')", "require('../../engine.js')")
             .replace("require('./core.js')", "require('../../core.js')")
             .replace("require('./catalog.js')", "require('../../catalog.js')");
  for (const [k, v] of Object.entries(tune)) {
    const re = new RegExp('(\\b' + k + ':\\s*)[^,\\n]+');
    if (!re.test(s)) throw new Error('no tune ' + k);
    s = s.replace(re, '$1' + JSON.stringify(v));
  }
  const f = path.join(__dirname, 'variants', name + '.js');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
  delete require.cache[require.resolve(f)];
  const mod = require(f);
  return { decide: o => mod.decide(o).frames, _mod: mod };
}

const configs = {
  base: {},
  nojump: { allowJump: false },
  cost30: { jumpCostHigh: 30, jumpCostLow: 45 },
  ready30: { readyOff: 3.0 },
  ready38: { readyOff: 3.8 },
  lead1: { serveDefLead: 1 },
  lead3: { serveDefLead: 3 },
  nodef: { serveDef: false },
};
const bots = {};
for (const [n, t] of Object.entries(configs)) bots[n] = mk('s2_' + n, t);

function game(a, b) {
  const r = play([bots[a].decide, bots[b].decide], 1, ['A', 'B']);
  const whiffs = [r.st[0].swings - r.st[0].hits, r.st[1].swings - r.st[1].hits];
  let holds = [0, 0], serves = [0, 0];
  for (const p of r.points) { serves[p.server]++; if (p.winner === p.server) holds[p.server]++; }
  return {
    score: r.score, winner: r.winner, frames: r.frames, whiffs,
    jumps: [r.st[0].jumps, r.st[1].jumps], holds, serves,
  };
}
const names = Object.keys(configs);
const rows = [];
for (const a of names) {
  let w = 0, l = 0, d = 0, pts = 0, opp = 0, n = 0;
  for (const b of names) {
    if (a === b) continue;
    for (const pair of [[a, b], [b, a]]) {
      const r = game(pair[0], pair[1]);
      n++; pts += r.score[0]; opp += r.score[1];
      if (r.winner === 0) w++; else if (r.winner === 1) l++; else d++;
    }
  }
  rows.push({ a, w, l, d, pts, opp, games: n });
  console.log(a, 'W', w, 'L', l, 'D', d, 'pts', pts + ':' + opp);
}
rows.sort((x, y) => (y.w - x.w) || ((y.pts - y.opp) - (x.pts - x.opp)));
console.log('BEST', rows.map(r => r.a + ':' + r.w + '/' + (r.w + r.l + r.d)).join(' '));
