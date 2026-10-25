// Cross-check the JS reference engine against the Python port.
// Reads dev/inputs.json: {seed, windows: [ [10 x [2 inputs]], ... ] } (team0/team1)
// Writes dev/ref_out.json: snapshots after each window.
'use strict';
const fs = require('fs');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'engine.js'));

const spec = JSON.parse(fs.readFileSync(path.join(__dirname, 'inputs.json'), 'utf8'));
const g = sim.createMatch({ id: 'xcheck', seed: spec.seed, players: [
  { name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });

const snapshots = [];
for (const win of spec.windows) {
  if (g.status !== 'playing') break;
  const w0 = win[0].map(f => [f[0]]);
  const w1 = win[1].map(f => [f[0]]);
  sim.advanceWindow(g, [w0, w1]);
  snapshots.push(sim.view(g, 0));
}
fs.writeFileSync(path.join(__dirname, 'ref_out.json'), JSON.stringify({ snapshots }));
console.log('wrote', snapshots.length, 'snapshots');
