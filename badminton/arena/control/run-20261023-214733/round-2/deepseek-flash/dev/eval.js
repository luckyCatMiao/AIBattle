'use strict';
/* 生成 brain 的若干变体并做交叉评测 */
const fs = require('fs');
const path = require('path');
const { playGame } = require('./arena.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'brain.js'), 'utf8');
function variant(name, transform) {
  let s = transform(src);
  s = s.replace("require('./engine.js')", "require('../../engine.js')")
       .replace("require('./core.js')", "require('../../core.js')")
       .replace("require('./catalog.js')", "require('../../catalog.js')");
  const file = path.join(__dirname, 'variants', name + '.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s);
  delete require.cache[require.resolve(file)];
  return require(file);
}

const V = {
  noAnt: variant('noAnt', s => s.replace('function anticipate(g, team, opts) {', 'function anticipate(g, team, opts) { if (true) return null;')),
  weak: variant('weak', s => s.replace('function anticipate(g, team, opts) {', 'function anticipate(g, team, opts) { if (true) return null;')
    .replace(/const FREE_SPEED = [\d.]+;/, 'const FREE_SPEED = 3.7;')),
  noBlockOnly: variant('noBlockOnly', s => s.replace('function anticipate(g, team, opts) {', 'function anticipate(g, team, opts) { if (true) return null;')),
};

const bots = {
  mine: { decide: o => require('../brain.js').decide(o).frames },
  noAnt: { decide: o => V.noAnt.decide(o).frames },
  weak: { decide: o => V.weak.decide(o).frames },
  simple: require('./bots/simple.js')(),
  simpleU: require('./bots/simple.js')({ prefer: 'under' }),
};

const names = process.argv.slice(2);
const pairs = names.length ? names : ['mine:noAnt', 'mine:simple', 'mine:simpleU', 'noAnt:mine', 'simple:mine', 'simpleU:mine'];
for (const p of pairs) {
  const [a, b] = p.split(':');
  const r = playGame(bots[a], bots[b], 1, [a, b]);
  console.log(p.padEnd(18), 'score', r.score.join(':'), 'frames', r.frames, 'hits', JSON.stringify(r.stats.hits), 'smashes', JSON.stringify(r.stats.smashes));
}
