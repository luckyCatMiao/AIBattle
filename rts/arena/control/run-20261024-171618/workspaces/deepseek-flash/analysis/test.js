'use strict';
const {runMatch} = require('./sim.js');
const {makeBot, makeSol, dist} = require('./bots.js');

function play(cfgA, cfgB, opts = {}) {
  // seat 0: A, seat 1: B
  const A = makeBot(cfgA), B = makeBot(cfgB);
  const r = runMatch(A, B, opts);
  return r;
}

function report(name, r) {
  console.log(name, 'winner', r.winner, 'dur', r.duration.toFixed(1), 'scores', r.scores,
    'stats', JSON.stringify(r.stats));
}

if (require.main === module) {
  const solCfg = {};
  const meCfg = JSON.parse(process.argv[2] || '{}');
  for (const seat of [0, 1]) {
    const me = makeBot(meCfg), sol = makeSol(solCfg);
    const r = seat === 0 ? runMatch(me, sol, {}) : runMatch(sol, me, {});
    report('me@' + seat, r);
  }
}
module.exports = {play, report};
