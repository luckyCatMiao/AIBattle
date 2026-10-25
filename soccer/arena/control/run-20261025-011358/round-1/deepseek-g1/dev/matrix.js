'use strict';
/* 全量自测：my agent vs 多个机器人，覆盖 1..6 人、两个座位、多个种子。 */
const { runMatch, PyAgent, sim } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path = require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');

// 找出每个 teamSize 对应的种子
const bySize = {};
for (let s = 1; s < 4000 && Object.keys(bySize).length < 6; s++) {
  const n = sim.createMatch({ players: [{ name: 'a', kind: 'api' }, { name: 'b', kind: 'api' }], seed: s }).teamSize;
  if (!bySize[n]) bySize[n] = s;
}
console.log('每个 size 的代表种子:', JSON.stringify(bySize));

const opps = (process.argv[2] || 'botBlock,botRush,botKeeper,botChase,botSmart').split(',');

(async () => {
  const total = { w: 0, l: 0, d: 0, gf: 0, ga: 0, fouls: 0, ofouls: 0 };
  const perSize = {};
  const t0 = Date.now();
  for (const oppName of opps) {
    let w = 0, l = 0, d = 0, gf = 0, ga = 0, myFoul = 0, oppFoul = 0;
    const perOpp = {}; const perSeat = {0:{w:0,l:0,d:0},1:{w:0,l:0,d:0}};
    for (const n of [1, 2, 3, 4, 5, 6]) {
      for (let k = 0; k < 3; k++) {
        const seed = bySize[n] + k * 6 + Number(process.env.SEEDOFF || 0);   // 同 size 的其它种子
        for (const swap of [false, true]) {
          const A = new PyAgent(PY, 'agent.py', ROOT, 'me');
          const f = async v => bots[oppName](v);
          let g;
          try {
            g = await runMatch({ seed, agentA: swap ? f : async v => JSON.parse(await A.ask(v)).inputs,
              agentB: swap ? async v => JSON.parse(await A.ask(v)).inputs : f });
          } catch (e) { console.log('ERR', oppName, seed, e.message, A.err.slice(-300)); A.kill(); l++; continue; }
          const myScore = swap ? g.score[1] : g.score[0];
          const opScore = swap ? g.score[0] : g.score[1];
          const myIdx = swap ? 1 : 0;
          gf += myScore; ga += opScore;
          myFoul += g.stats[myIdx].fouls; oppFoul += g.stats[1 - myIdx].fouls;
          if (myScore > opScore) w++; else if (myScore < opScore) l++; else d++;
          const key = n;
          perSize[key] = perSize[key] || { w: 0, l: 0, d: 0, gf: 0, ga: 0 };
          perSize[key].w += (myScore > opScore ? 1 : 0); perSize[key].l += (myScore < opScore ? 1 : 0);
          perSize[key].d += (myScore === opScore ? 1 : 0);
          perSize[key].gf += myScore; perSize[key].ga += opScore;
          perOpp[key] = perOpp[key] || { w: 0, l: 0, d: 0, gf: 0 };
          perOpp[key].w += (myScore > opScore ? 1 : 0); perOpp[key].l += (myScore < opScore ? 1 : 0); perOpp[key].d += (myScore === opScore ? 1 : 0); perOpp[key].gf += myScore;
          const ps = perSeat[swap?1:0]; ps.w += (myScore>opScore?1:0); ps.l += (myScore<opScore?1:0); ps.d += (myScore===opScore?1:0);
          A.kill();
        }
      }
    }
    console.log('   seat:', JSON.stringify(perSeat));
    console.log('   perSize:', JSON.stringify(Object.fromEntries(Object.entries(perOpp).map(([k,v])=>[k,`${v.w}-${v.l}-${v.d} g${v.gf}`]))));
    console.log(`${oppName.padEnd(10)} W${w} L${l} D${d}  胜率 ${(100 * w / (w + l + d)).toFixed(1)}%  进${gf} 失${ga}  我方犯规${myFoul} 对方犯规${oppFoul}`);
    total.w += w; total.l += l; total.d += d; total.gf += gf; total.ga += ga; total.fouls += myFoul; total.ofouls += oppFoul;
  }
  console.log(`\n总计 W${total.w} L${total.l} D${total.d} 胜率 ${(100 * total.w / (total.w + total.l + total.d)).toFixed(1)}% 进${total.gf} 失${total.ga} 我方犯规${total.fouls} 对方犯规${total.ofouls}`);
  console.log('分人数:', JSON.stringify(perSize));
  console.log('耗时', ((Date.now() - t0) / 1000).toFixed(1), 's');
})();
