// Regenerate patched engine copies from THIS run's protected sources (originals untouched).
const fs = require('fs'), path = require('path');
const WS = path.resolve(__dirname, '..');
let cat = fs.readFileSync(path.join(WS, 'catalog.js'), 'utf8');
let sim = fs.readFileSync(path.join(WS, 'simulation.js'), 'utf8');
sim = sim.replace("const catalog = require('./catalog');", "const catalog = require('./catalog.patched.js');");
sim = sim.replace("snapshot, score, emit, normalizeInput, bot,", "snapshot, score, emit, normalizeInput,");
fs.writeFileSync(path.join(__dirname, 'catalog.patched.js'), cat);
fs.writeFileSync(path.join(__dirname, 'simulation.patched.js'), sim);
console.log('regenerated from current sources');
