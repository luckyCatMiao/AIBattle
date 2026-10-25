'use strict';
/* 最终配置评估：我方(s6_autoB 同源) 对若干对手，两个座位各一局。 */
const fs = require('fs'), path = require('path');
const { play } = require('./analyze.js');
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
for (const [name, of] of Object.entries(opps)) {
  const games = [];
  for (const seat of [0, 1]) {
    const r = play(seat === 0 ? [me, of] : [of, me], 1, ['me', 'opp']);
    const mine = seat === 0 ? r.score[0] : r.score[1];
    const theirs = seat === 0 ? r.score[1] : r.score[0];
    let holds = 0, serves = 0;
    for (const p of r.points) if (p.server === seat) { serves++; if (p.winner === seat) holds++; }
    const st = r.st[seat];
    games.push({ seat, score: mine + ':' + theirs, holds: holds + '/' + serves, frames: r.frames,
      whiffs: st.swings - st.hits, jumps: st.jumps,
      endStamina: r.points.length ? r.points[r.points.length - 1].staminaNow[seat] : null });
  }
  console.log(name.padEnd(11), JSON.stringify(games));
}
