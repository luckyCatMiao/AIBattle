'use strict';
/* 参数扫描：预判提前量与站位 */
const fs = require('fs');
const path = require('path');
const { playGame } = require('./arena.js');

const src = fs.readFileSync(path.join(__dirname, '..', 'brain.js'), 'utf8');

function make(name, T, off, freeSpeed) {
  let s = src.replace("require('./engine.js')", "require('../../engine.js')")
             .replace("require('./core.js')", "require('../../core.js')")
             .replace("require('./catalog.js')", "require('../../catalog.js')")
             .replace(/const READY_OFF = [\d.]+;/, `const READY_OFF = ${off};`)
             .replace(/if \(ph\.frameRel > \d+\) return null;/, `if (ph.frameRel > ${T}) return null;`)
             .replace(/const FREE_SPEED = [\d.]+;/, `const FREE_SPEED = ${freeSpeed};`);
  const file = path.join(__dirname, 'variants', name + '.js');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, s);
  delete require.cache[require.resolve(file)];
  return require(file);
}

const opJ = make('mk_noAnt', 8, 3.15, 3.18);
const noAnt = (() => {
  let s = src.replace("require('./engine.js')", "require('../../engine.js')")
             .replace("require('./core.js')", "require('../../core.js')")
             .replace("require('./catalog.js')", "require('../../catalog.js')")
             .replace('function anticipate(g, team, opts) {', 'function anticipate(g, team, opts) { if (true) return null;');
  const f = path.join(__dirname, 'variants', 'noAntX.js');
  fs.writeFileSync(f, s);
  delete require.cache[require.resolve(f)];
  return require(f);
})();

const simple = require('./bots/simple.js')();
const simpleU = require('./bots/simple.js')({ prefer: 'under' });

function evalConfig(T, off, fs2) {
  const v = make(`c_${T}_${off}_${fs2}`, T, off, fs2);
  const bot = { decide: o => v.decide(o).frames };
  const nA = { decide: o => noAnt.decide(o).frames };
  const res = [];
  // 我方作为 team0 / team1 各打三种对手
  for (const [opp, name] of [[nA, 'noAnt'], [simple, 'simple'], [simpleU, 'simpleU']]) {
    const a = playGame(bot, opp, 1, ['x', 'y']);
    const b = playGame(opp, bot, 1, ['x', 'y']);
    res.push({ name, asT0: a.score[0] > a.score[1], s0: a.score.join(':'), asT1: b.score[1] > b.score[0], s1: b.score.join(':') });
  }
  const wins = res.reduce((n, r) => n + (r.asT0 ? 1 : 0) + (r.asT1 ? 1 : 0), 0);
  return { T, off, fs2, wins, res };
}

const rows = [];
for (const T of [8, 12, 16, 22]) {
  for (const off of [2.8, 3.15, 3.6, 4.0]) {
    rows.push(evalConfig(T, off, 3.18));
  }
}
rows.sort((a, b) => b.wins - a.wins);
for (const r of rows.slice(0, 12)) {
  console.log(`T=${r.T} off=${r.off} wins=${r.wins}/6  ` + r.res.map(x => `${x.name}[${x.s0}|${x.s1}]`).join(' '));
}
