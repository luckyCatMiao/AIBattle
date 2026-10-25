'use strict';
/* 双变体对局调试：node dev/dbg2.js <botA> <botB> [nwin] */
const sim = require('../engine.js');
const path = require('path');
function load(p) {
  const m = require(path.resolve(p));
  const mod = typeof m === 'function' ? m() : m;
  return { decide: o => (mod.decide ? mod.decide(o) : mod) };
}
const A = load(process.argv[2] || './dev/variants/s3_deepM.js');
const B = load(process.argv[3] || './dev/variants/s3_base.js');
const g = sim.createMatch({ id: 'd', seed: 1, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
const maxW = parseInt(process.argv[4] || '6', 10);
for (let w = 0; w < maxW && g.status === 'playing'; w++) {
  const wins = [];
  for (let t = 0; t < 2; t++) {
    const o = sim.view(g, t); o.yourPlayer = t;
    const bot = t === 0 ? A : B;
    const r = bot.decide(o);
    const frames = Array.isArray(r) ? r : r.frames;
    wins.push(frames);
    if (t === 0 && r.debug) console.log(' f' + o.frame, 'team0', JSON.stringify(r.debug), 'me', g.batsmen[0].x.toFixed(2), 'opp', g.batsmen[1].x.toFixed(2));
  }
  const before = g.events.length;
  sim.advanceWindow(g, [sim.submitWindow(g, 0, wins[0]), sim.submitWindow(g, 1, wins[1])]);
  for (const e of g.events.slice(before)) if (e.type !== 'ready') console.log('  EV', JSON.stringify(e));
  console.log(' frame', g.frame, 'score', g.score, 'shuttle', g.shuttle ? `${g.shuttle.x.toFixed(2)},${g.shuttle.y.toFixed(2)} v${g.shuttle.vx.toFixed(1)},${g.shuttle.vy.toFixed(1)} last${g.shuttle.lastTeam}` : '-');
}
