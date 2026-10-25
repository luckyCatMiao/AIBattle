'use strict';
/* Evaluate one or more agent configs on the same seeds; write per-seed rows.
 * usage: node tools/evalcfg.js <baseSeed> <n> '<cfgjson>' [outfile] [--bot]
 * Prints a compact summary line per config and dumps rows to outfile (default eval_last.json). */
const fs = require('fs');
const { runGame } = require('./harness.js');
const baseSeed = Number(process.argv[2] || 8000);
const n = Number(process.argv[3] || 50);
const cfg = JSON.parse(process.argv[4] || '{}');
const outfile = process.argv[5] || 'eval_last.json';
const bot = process.argv.includes('--bot');

const rows = [];
for (let i = 0; i < n; i++) {
  const s = baseSeed + i;
  const r = runGame(s, { cfg, bot });
  rows.push({
    seed: s, fin: r.finishTime, lap: r.lap, progress: +r.progress.toFixed(1),
    best: r.bestLap, off: +r.offroadPct.toFixed(2), avg: +r.avgSpeed.toFixed(2),
    maxSp: +r.maxSpeed.toFixed(2), boosts: r.boosts, drift: +r.driftTime.toFixed(1),
    coll: r.collisions, cpRec: r.stats ? r.stats.cpRecEvents : 0,
    cpEvents: r.stats ? (r.stats.cpEvents || []) : [],
    stuck: r.stats ? r.stats.stuckEvents : 0, planMs: r.maxPlanMs,
  });
}
const fin = rows.filter(r => r.fin != null);
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
const summary = {
  n, finished: `${fin.length}/${n}`,
  mean: +mean(fin.map(r => r.fin)).toFixed(2),
  median: (() => { const a = fin.map(r => r.fin).sort((x, y) => x - y); return a.length ? +a[a.length >> 1].toFixed(2) : null; })(),
  meanBest: +mean(fin.map(r => r.best)).toFixed(2),
  off: +mean(rows.map(r => r.off)).toFixed(2),
  avg: +mean(rows.map(r => r.avg)).toFixed(2),
  maxSp: +mean(rows.map(r => r.maxSp)).toFixed(2),
  cpRecGames: rows.filter(r => r.cpRec > 0).length,
  cpRecEvents: rows.reduce((a, r) => a + r.cpRec, 0),
  stuckGames: rows.filter(r => r.stuck > 0).length,
  worst: +Math.max(...rows.map(r => r.fin == null ? 999 : r.fin)).toFixed(1),
  planMsMax: Math.max(...rows.map(r => r.planMs)),
  cfg,
};
fs.writeFileSync(outfile, JSON.stringify({ summary, rows }, null, 0));
console.log(JSON.stringify(summary));
