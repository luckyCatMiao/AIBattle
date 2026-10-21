'use strict';
// Dump deterministic states from the reference simulator for cross-checking the Python port.
const path = '/workspace/simulation.js';
const sim = require(path);
const { createMatch, step } = sim;

const DIRS = ['N','U','D','L','R','UL','UR','DL','DR'];
function inp(f, i, t) {
  return {
    dir: DIRS[(f * 3 + i * 2 + t) % 9],
    aim: ((f + i) % 3 === 0) ? null : ((f * 37 + i * 61 + t * 113) % 360),
    kick: ((f + i) % 11 === 0),
  };
}

const g = createMatch({ id: 'x', players: [{name:'A',kind:'bot'},{name:'B',kind:'bot'}], seed: 1 });
const out = [];
const NF = 80;
for (let f = 0; f < NF; f++) {
  for (const u of g.units) u.held = inp(f, u.index, u.team);
  step(g);
  out.push({
    frame: g.frame, score: g.score.slice(), freeze: g.freeze, status: g.status,
    units: g.units.map(u => ({id:u.id, x:u.x, y:u.y, fx:u.facing.x, fy:u.facing.y,
      cd:u.kickCd, cl:u.controlLock, sl:u.stealLock, touches:u.touches, kicks:u.kicks})),
    ball: {x:g.ball.x, y:g.ball.y, vx:g.ball.vx, vy:g.ball.vy, owner:g.ball.owner,
      lastTouch:g.ball.lastTouch},
  });
}
process.stdout.write(JSON.stringify(out));
