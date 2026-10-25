'use strict';
const sim = require('../../../../../../simulation.js');
const seed = 5021;
const g = sim.createMatch({ id: 'm', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
for (let i = 0; i < 20; i++) { g.runners[0].held = { move: 0, jump: false }; g.runners[1].held = { move: 0, jump: false }; sim.step(g); }
const L = sim.generateLevel(seed * 131 + 977);
// 在连续平地上放怪
g.monsters = [{ id: 'm1', x: 30, y: 3, dir: 1, alive: true }];
g.monsterTimer = 1e9;
const rec = [];
for (let i = 0; i < 120; i++) {
  g.runners[0].held = { move: 0, jump: false }; g.runners[1].held = { move: 0, jump: false };
  sim.step(g);
  const m = g.monsters[0];
  rec.push(m ? [m.x, m.dir] : null);
}
console.log(JSON.stringify({ geom: { w: L.w, h: L.h, tiles: Array.from(L.tiles) }, start: [30, 3, 1], rec }));
