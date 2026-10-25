'use strict';
const sim = require('../simulation.js');
const seed = parseInt(process.argv[2], 10);
const L = sim.generateLevel(seed);
console.log(JSON.stringify({
  w: L.w, h: L.h, tiles: Array.from(L.tiles), goalX: L.goalX, startX: L.startX,
  platforms: L.platforms.map(p => ({ fromx: p.from.x, fromy: p.from.y, tox: p.to.x, toy: p.to.y, w: p.w, h: p.h, period: p.period, phase: p.phase })),
  plants: L.plants.map(p => ({ x: p.x, y: p.y, period: p.period, phase: p.phase })),
  saws: L.saws.map(s => ({ fromx: s.from.x, fromy: s.from.y, tox: s.to.x, toy: s.to.y, r: s.r, period: s.period, phase: s.phase })),
}));
