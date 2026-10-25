'use strict';
/* 本机对战台：用公开引擎跑完整对局，两个 bot 各占一个座位。
 * 用法：node dev/arena.js <botA> <botB> [局数] [seed]
 * bot 模块需导出 decide(obs) -> 10 帧输入数组（或 {inputs: [...]}) */
const path = require('path');
const sim = require('../engine.js');

function toWindow(raw) {
  if (!raw || typeof raw !== 'object') throw new Error('bad reply');
  const arr = Array.isArray(raw) ? raw : raw.inputs;
  if (!Array.isArray(arr)) throw new Error('bad reply inputs');
  return arr.slice(0, 10).map(f => {
    const o = Array.isArray(f) ? f[0] : f;
    return [{
      move: Math.max(-1, Math.min(1, Number(o && o.move) || 0)),
      jump: !!(o && o.jump),
      swing: (o && Number(o.swing) > 0.1) ? 1 : (o && Number(o.swing) < -0.1) ? -1 : 0,
      charge: !!(o && o.charge),
      sprint: !!(o && o.sprint),
    }];
  });
}

function playGame(botA, botB, seed, names) {
  const g = sim.createMatch({ id: 'local', seed, players: [{ name: names[0], kind: 'api' }, { name: names[1], kind: 'api' }] });
  const bots = [botA, botB];
  const stats = { hits: [0, 0], smashes: [0, 0], kinds: [{}, {}], errors: 0, windows: 0 };
  const log = [];
  let guard = 0;
  while (g.status === 'playing' && guard++ < 520) {
    const windows = [];
    for (let t = 0; t < 2; t++) {
      const obs = sim.view(g, t);
      obs.yourPlayer = t;
      windows.push(toWindow(bots[t].decide(obs)));
    }
    const before = g.events.length;
    sim.advanceWindow(g, windows.map((w, t) => sim.submitWindow(g, t, w)));
    stats.windows++;
    for (const e of g.events.slice(before)) {
      if (e.type === 'hit') { stats.kinds[e.team][e.kind] = (stats.kinds[e.team][e.kind] || 0) + 1; log.push(e); }
      else if (e.type === 'point') log.push(e);
      else if (e.type === 'net') log.push(e);
    }
  }
  for (let t = 0; t < 2; t++) { stats.hits[t] = g.batsmen[t].hits; stats.smashes[t] = g.batsmen[t].smashes; }
  return { score: g.score.slice(), winner: g.winner, reason: g.reason, frames: g.frame, stats, log, batsmen: g.batsmen.map(b => ({ hits: b.hits, smashes: b.smashes, points: b.points })) };
}

module.exports = { playGame, toWindow };

if (require.main === module) {
  const a = require(path.resolve(process.argv[2] || './dev/bots/chaser.js'));
  const b = require(path.resolve(process.argv[3] || './dev/bots/chaser.js'));
  const n = parseInt(process.argv[4] || '1', 10);
  const seed = parseInt(process.argv[5] || '1', 10);
  for (let i = 0; i < n; i++) {
    const r = playGame(a, b, seed + i, ['A', 'B']);
    console.log(JSON.stringify({ game: i, seed: seed + i, score: r.score, winner: r.winner, reason: r.reason, frames: r.frames, hits: r.stats.hits, smashes: r.stats.smashes, kinds: r.stats.kinds }));
  }
}
