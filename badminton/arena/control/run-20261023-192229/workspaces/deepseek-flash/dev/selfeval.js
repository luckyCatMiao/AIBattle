'use strict';
/* 终版自测汇总：双方座位各一局，输出比分/保发/空挥/起跳/下网/终局体力。 */
const path = require('path');
const { play } = require('./analyze.js');
const sim = require('../engine.js');
function load(p) {
  const m = require(path.resolve(p));
  const b = typeof m === 'function' ? m() : m;
  return o => { const r = b.decide(o); return Array.isArray(r) ? r : (r && r.frames) ? r.frames : r.inputs; };
}
const me = load('./dev/variants/s6_autoB.js');
const opps = {
  brainEarly: load('./dev/variants/s5_none.js'),
  simple: load('./dev/bots/simple.js'),
  late: load('./dev/bots/late.js'),
  deepsmash: load('./dev/bots/deepsmash.js'),
  mirror: me,
};
// 重新打一遍并统计 net 事件（analyze 不返回 events，这里单独跑）
function replay(decA, decB, seat) {
  const g = sim.createMatch({ id: 's', seed: 1, players: [{ name: 'a', kind: 'api' }, { name: 'b', kind: 'api' }] });
  const dec = seat === 0 ? [decA, decB] : [decB, decA];
  let netsMe = 0, netsOpp = 0;
  while (g.status === 'playing') {
    const wins = [];
    for (let t = 0; t < 2; t++) { const o = sim.view(g, t); o.yourPlayer = t; wins.push(dec[t](o)); }
    const before = g.events.length;
    sim.advanceWindow(g, [sim.submitWindow(g, 0, wins[0]), sim.submitWindow(g, 1, wins[1])]);
    for (const e of g.events.slice(before)) if (e.type === 'net') { if (e.team === seat) netsMe++; else netsOpp++; }
  }
  return { score: g.score.join(':'), netsMe, netsOpp };
}
for (const [name, of] of Object.entries(opps)) {
  for (const seat of [0, 1]) {
    const r = play(seat === 0 ? [me, of] : [of, me], 1, ['me', 'opp']);
    const mine = seat === 0 ? r.score[0] : r.score[1];
    const theirs = seat === 0 ? r.score[1] : r.score[0];
    let holds = 0, serves = 0;
    for (const p of r.points) if (p.server === seat) { serves++; if (p.winner === seat) holds++; }
    const st = r.st[seat];
    const gn = replay(me, of, seat);
    console.log(`${name.padEnd(11)} seat${seat}  ${String(mine + ':' + theirs).padEnd(6)} holds ${holds}/${serves}` +
      `  whiffs ${st.swings - st.hits}  jumps ${st.jumps}  nets ${gn.netsMe}  endStam ${r.points.length ? r.points[r.points.length - 1].staminaNow[seat] : '-'}` +
      `  frames ${r.frames}`);
  }
}
