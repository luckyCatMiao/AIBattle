'use strict';
/* Paired config comparison: same seeds for every config, report mean finish,
 * mean offroad%, and paired delta vs the first config. */
const { runGame } = require('./harness.js');
const baseSeed = Number(process.argv[2] || 4000);
const n = Number(process.argv[3] || 30);
const cfgs = JSON.parse(process.argv[4] || '[{}]');
const seeds = Array.from({ length: n }, (_, i) => baseSeed + i);

const base = [];
const results = [];
for (let ci = 0; ci < cfgs.length; ci++) {
  const rows = seeds.map(s => runGame(s, { cfg: cfgs[ci] }));
  const fin = rows.filter(r => r.finishTime != null);
  const mean = fin.reduce((a, r) => a + r.finishTime, 0) / Math.max(1, fin.length);
  const meanBest = fin.reduce((a, r) => a + r.bestLap, 0) / Math.max(1, fin.length);
  const off = rows.reduce((a, r) => a + r.offroadPct, 0) / rows.length;
  const cpRec = rows.reduce((a, r) => a + (r.stats ? r.stats.cpRecEvents : 0), 0);
  const cpBad = rows.filter(r => r.stats && r.stats.cpRecEvents > 0).length;
  const cmp = [];
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].finishTime != null && base[i] != null) cmp.push(rows[i].finishTime - base[i]);
  }
  if (ci === 0) for (let i = 0; i < rows.length; i++) base[i] = rows[i].finishTime;
  const wins = cmp.filter(d => d < 0).length, losses = cmp.filter(d => d > 0).length;
  const sd = Math.sqrt(cmp.reduce((a, d) => a + d * d, 0) / Math.max(1, cmp.length) - Math.pow(cmp.reduce((a, d) => a + d, 0) / Math.max(1, cmp.length), 2));
  results.push({
    cfg: cfgs[ci], fin: `${fin.length}/${n}`, mean: +mean.toFixed(2), meanBest: +meanBest.toFixed(2),
    off: +off.toFixed(2), cpRec, cpBad, dMean: ci === 0 ? 0 : +(cmp.reduce((a, b) => a + b, 0) / cmp.length).toFixed(3),
    wl: `${wins}/${losses}`, sd: +(sd || 0).toFixed(2), worst: +Math.max(0, ...rows.map(r => r.finishTime == null ? 999 : r.finishTime)).toFixed(1),
  });
}
for (const r of results) console.log(JSON.stringify(r));
