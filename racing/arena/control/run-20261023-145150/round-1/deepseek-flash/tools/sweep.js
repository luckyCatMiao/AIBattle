'use strict';
const { runGame } = require('./harness.js');
const seeds = (process.env.SEEDS || '1000,1001,1002,1003,1004,1005').split(',').map(Number);
function evaluate(cfg, opts={}) {
  let tot=0, n=0, off=0, lapRatio=0, fin=0;
  const rows=[];
  for (const seed of seeds) {
    const r = runGame(seed, { cfg, ...opts });
    rows.push(r);
    if (r.finishTime != null) {
      fin++;
      const L = r.progress/3; // approx lap length in progress units
      // use track length from final state? approximate using bestLap
      tot += r.finishTime; n++;
      lapRatio += r.bestLap;
    }
    off += r.offroadPct;
  }
  return { fin, n, meanFin: n?tot/n:null, meanBest: n?lapRatio/n:null, meanOff: off/seeds.length, rows };
}
const configs = JSON.parse(process.argv[2] || '[]');
const base = process.argv[3] ? JSON.parse(process.argv[3]) : {};
for (const c of configs.length?configs:[{}]) {
  const cfg = Object.assign({}, base, c);
  const e = evaluate(cfg);
  console.log(JSON.stringify(c), '=> meanFin', e.meanFin?e.meanFin.toFixed(2):'DNF', 'meanBest', e.meanBest?e.meanBest.toFixed(2):'-', 'off', e.meanOff.toFixed(2), 'fin', e.fin+'/'+seeds.length,
    '| per-seed best:', e.rows.map(r=>r.bestLap?r.bestLap.toFixed(1):'x').join(','));
}
