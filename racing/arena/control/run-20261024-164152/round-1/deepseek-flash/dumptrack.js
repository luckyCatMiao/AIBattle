'use strict';
const catalog = require('./catalog.js');
const seeds = process.argv.slice(2).map(Number);
const out = {};
for (const seed of seeds) {
  const t = catalog.buildTrack(seed);
  out[seed] = { width:128, height:88, tiles:Array.from(t.tiles), points:t.points,
    halfWidth:t.halfWidth, length:t.length, checkpoints:t.checkpoints,
    start:t.start, grid:t.grid, audit:t.audit };
}
console.log(JSON.stringify(out));
