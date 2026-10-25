'use strict';
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
  return o => mod.decide(o).frames;
}
function load(p) {
  const m = require(path.resolve(p));
  const b = typeof m === 'function' ? m() : m;
  return o => { const r = b.decide(o); return Array.isArray(r) ? r : r.frames; };
}
const base = load('./dev/variants/s6_autoB.js');
const vars = { op232: mk('r232', { oppReachY: 2.32 }), op255: mk('r255', { oppReachY: 2.55 }), op285: mk('r285', { oppReachY: 2.85 }) };
for (const [name, v] of Object.entries(vars)) {
  const out = [];
  for (const seat of [0, 1]) {
    const r = play(seat === 0 ? [v, base] : [base, v], 1, ['v', 'base']);
    const mine = seat === 0 ? r.score[0] : r.score[1];
    const theirs = seat === 0 ? r.score[1] : r.score[0];
    let holds = 0, serves = 0, breaks = 0, oppServes = 0;
    for (const p of r.points) {
      if (p.server === seat) { serves++; if (p.winner === seat) holds++; }
      else { oppServes++; if (p.winner === seat) breaks++; }
    }
    out.push({ seat, score: mine + ':' + theirs, holds: `${holds}/${serves}`, breaks: `${breaks}/${oppServes}`, frames: r.frames });
  }
  console.log(name, JSON.stringify(out));
}
