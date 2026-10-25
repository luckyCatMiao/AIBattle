'use strict';
const fs = require('fs');
const sim = require('./simulation.js');
const spec = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const g = sim.createMatch({ id: 'xcheck', seed: spec.seed, players: [
  { name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
const snapshots = [];
for (const win of spec.windows) {
  if (g.status !== 'playing') break;
  sim.advanceWindow(g, [win[0].map(f => [f[0]]), win[1].map(f => [f[0]])]);
  snapshots.push(sim.view(g, 0));
}
fs.writeFileSync(process.argv[3], JSON.stringify({ snapshots }));
console.log('wrote', snapshots.length, 'snapshots seed', spec.seed, 'net', g.netHeight);
