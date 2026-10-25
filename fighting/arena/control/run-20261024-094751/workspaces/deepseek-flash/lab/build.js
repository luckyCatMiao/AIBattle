// Build patched, self-contained copies of the public engine into lab/ (originals untouched).
const fs=require('fs');
const WS='D:/extraProj/AIBattle/fighting/arena/control/run-20261024-094751/workspaces/deepseek-flash/';
let cat=fs.readFileSync(WS+'catalog.js','utf8');
let sim=fs.readFileSync(WS+'simulation.js','utf8');
sim=sim.replace("const catalog = require('./catalog');","const catalog = require('./catalog.patched.js');");
sim=sim.replace("snapshot, score, emit, normalizeInput, bot,","snapshot, score, emit, normalizeInput,");
sim=sim.replace("  DT, FRAMES_PER_DECISION, characters, rules,","  DT, FRAMES_PER_DECISION, characters, rules,");
fs.writeFileSync('catalog.patched.js',cat);
fs.writeFileSync('simulation.patched.js',sim);
console.log('ok', sim.length, cat.length);
