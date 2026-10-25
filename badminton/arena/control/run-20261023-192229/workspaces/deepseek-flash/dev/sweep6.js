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
  return o => {
    const r = b.decide(o);
    return Array.isArray(r) ? r : (r && r.frames) ? r.frames : r.inputs;
  };
}
const ours = {
  autoB: mk('s6_autoB', { serveStyle: 'auto', autoDefault: 'block' }),
  autoR: mk('s6_autoR', { serveStyle: 'auto', autoDefault: 'rush' }),
  rush: mk('s6_rush', { serveStyle: 'rush' }),
  block: mk('s6_block', {}),
};
const opps = {
  brain: load('./dev/variants/s5_none.js'),
  simple: load('./dev/bots/simple.js'),
  late: load('./dev/bots/late.js'),
  deepsmash: load('./dev/bots/deepsmash.js'),
  block: load('./dev/variants/s5_block.js'),
};
for (const [on, ofn] of Object.entries(opps)) {
  for (const [mn, mfn] of Object.entries(ours)) {
    let holds = 0, serves = 0, pts = 0, opp = 0, frames = 0;
    for (const seat of [0, 1]) {
      const A = seat === 0 ? mfn : ofn, B = seat === 0 ? ofn : mfn;
      const r = play([A, B], 1, ['me', 'opp']);
      const mine = seat === 0 ? r.score[0] : r.score[1];
      const theirs = seat === 0 ? r.score[1] : r.score[0];
      pts += mine; opp += theirs; frames += r.frames;
      for (const p of r.points) {
        if (p.server === seat) { serves++; if (p.winner === seat) holds++; }
      }
    }
    console.log(('vs ' + on).padEnd(13), mn.padEnd(6), 'pts', pts + ':' + opp,
      'holds', holds + '/' + serves, 'frames', frames);
  }
}
