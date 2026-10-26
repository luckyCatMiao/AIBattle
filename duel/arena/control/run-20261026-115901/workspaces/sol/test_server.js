'use strict';
const readline = require('readline');
const sim = require('./simulation');
let game;
readline.createInterface({input: process.stdin}).on('line', line => {
  try {
    const cmd = JSON.parse(line);
    if (cmd.init) game = sim.createMatch({id: 'test-' + cmd.seed, seed: cmd.seed, players: [{name:'sol'}, {name:'test'}]});
    else sim.advanceWindow(game, cmd.inputs.map((a, i) => sim.submitWindow(game, i, a)));
    console.log(JSON.stringify(sim.snapshot(game, 0)));
  } catch (e) { console.error(e.stack); process.exit(1); }
});
