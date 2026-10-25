#!/usr/bin/env node
// 用真实引擎按回放输入重放两场，导出全部 push / respawn / monster / round 事件。
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const sim = require('../simulation.js');

const RUN = path.resolve(__dirname, '../../..');
for (const fn of ['r3-g1.json.gz', 'r3-g2.json.gz']) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RUN, fn))).toString('utf8'));
  const g = sim.createMatch({
    id: d.id,
    players: [{ name: d.seats[0], kind: 'api' }, { name: d.seats[1], kind: 'api' }],
    seed: d.seed,
  });
  for (const w of d.windows) {
    sim.advanceWindow(g, [w.inputs[0], w.inputs[1]]);
    if (g.status === 'finished') break;
  }
  console.log('='.repeat(90));
  console.log(fn, 'seats', d.seats, 'status', g.status, 'wins', g.wins, 'winner', g.winner, 'reason', g.reason,
    'frame', g.frame);
  const byType = {};
  for (const e of g.events) byType[e.type] = (byType[e.type] || 0) + 1;
  console.log('event counts', byType);
  for (const e of g.events) {
    if (e.type === 'push' || e.type === 'respawn' || e.type === 'round' || e.type === 'finish') {
      const f = e.frame;
      const round = d.frames[f] ? d.frames[f].round : '?';
      if (e.type === 'push') console.log(`  PUSH R${round} f=${f} ${d.seats[e.from]} -> ${d.seats[e.to]} x=${e.x}`);
      else console.log(`  ${e.type.toUpperCase()} R${round} f=${f}`, JSON.stringify(e));
    }
  }
}
