'use strict';
/* 发球方防守扫描：发球后，站在 P 位置，在绝对帧 Sabs 起拍。
 * 判断我方触球是否发生在对方击球之后（合法防守）。 */
const sim = require('../engine.js');
const brain = require('../brain.js');

function run(P, Jabs, Sabs, delayMs = 0) {
  const g = sim.createMatch({ id: 'x', seed: 1, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  for (let w = 0; w < 10; w++) {
    const o0 = sim.view(g, 0); o0.yourPlayer = 0;
    const o1 = sim.view(g, 1); o1.yourPlayer = 1;
    let f0;
    if (g.server === 0 && g.rally <= 1 && g.frame < 46 && (g.phase === 'serve' || g.phase === 'rally')) {
      const seq = brain.moveSeq(g.batsmen[0], P, 10);
      f0 = Array.from({ length: 10 }, (_, i) => {
        const f = g.frame + i;
        const sw = f === Sabs ? 1 : 0;
        return { move: sw ? 0 : seq[i], jump: f === Jabs, swing: sw };
      });
    } else {
      f0 = brain.decide(o0).frames;
    }
    const f1 = brain.decide(o1).frames;
    sim.advanceWindow(g, [sim.submitWindow(g, 0, f0), sim.submitWindow(g, 1, f1)]);
    if (g.score[0] + g.score[1] > 0) break;
  }
  const hits = g.events.filter(e => e.type === 'hit');
  return { score: g.score.slice(), hits: hits.map(e => ({ t: e.team, f: e.frame, x: e.x, y: e.y, k: e.kind })), point: g.lastPoint };
}

if (require.main === module) {
  const out = [];
  for (const P of [2.6, 3.0, 3.35, 3.7, 4.1, 4.5, 4.9, 5.3, 5.8, 6.35]) {
    for (const J of [-999, 18, 20, 22, 24, 26]) {
      for (let S = 16; S <= 38; S++) {
        const r = run(P, J, S);
        const h = r.hits;
        const i1 = h.findIndex(x => x.t === 1), i0 = h.findIndex(x => x.t === 0);
        if (i0 >= 0 && i1 >= 0 && i0 > i1) out.push({ P, J, S, win: r.score[0] > r.score[1], hits: h.map(x => x.t + ':' + x.k + '@' + x.x + '/' + x.f).join('>') });
      }
    }
  }
  console.log('合法防守数', out.length, ' 我方得分', out.filter(o => o.win).length);
  const byP = {};
  for (const o of out) { byP[o.P] = byP[o.P] || []; byP[o.P].push(o.S + (o.J === -999 ? '' : 'J' + o.J)); }
  console.log(JSON.stringify(byP, null, 0));
  console.log('样例', JSON.stringify(out.slice(0, 8), null, 0));
}
module.exports = { run };
