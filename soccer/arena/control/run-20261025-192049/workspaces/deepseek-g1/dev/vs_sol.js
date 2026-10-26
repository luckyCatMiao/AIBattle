'use strict';
/* 用 solbot 当对手，按人数 1..6、双方座位、多种子对比「改动前/后」的 agent.py。
 * 用法: node dev/vs_sol.js [agentPath] [sizes] [seeds]
 */
const { runMatch, PyAgent, sim } = require('./arena.js');
const { solWing } = require('./solbot.js');
const path = require('path');

const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const AGENT = process.argv[2] || 'agent.py';
const SIZES = (process.argv[3] || '1,2,3,4,5,6').split(',').map(Number);
const SEEDS = (process.argv[4] || '1,2,3').split(',').map(Number);

// 每个 teamSize 找一个代表种子
const bySize = {};
for (let s = 1; s < 6000 && Object.keys(bySize).length < 6; s++) {
  const n = sim.createMatch({ players: [{ name: 'a', kind: 'api' }, { name: 'b', kind: 'api' }], seed: s }).teamSize;
  if (!bySize[n]) bySize[n] = s;
}

(async () => {
  let W = 0, L = 0, D = 0, gf = 0, ga = 0;
  const per = {};
  for (const n of SIZES) {
    const key = n;
    per[key] = per[key] || { w: 0, l: 0, d: 0, gf: 0, ga: 0 };
    for (const k of SEEDS) {
      const seed = bySize[n] + k * 6;
      for (const swap of [false, true]) {
        const A = new PyAgent(PY, AGENT, ROOT, 'me');
        const f = async v => solWing(v);
        let g;
        try {
          g = await runMatch({
            seed,
            agentA: swap ? f : async v => JSON.parse(await A.ask(v)).inputs,
            agentB: swap ? async v => JSON.parse(await A.ask(v)).inputs : f,
          });
        } catch (e) { console.log('ERR', n, seed, e.message, A.err.slice(-300)); A.kill(); L++; continue; }
        const mine = swap ? g.score[1] : g.score[0];
        const opp = swap ? g.score[0] : g.score[1];
        gf += mine; ga += opp;
        if (mine > opp) { W++; per[key].w++; } else if (mine < opp) { L++; per[key].l++; } else { D++; per[key].d++; }
        per[key].gf += mine; per[key].ga += opp;
        A.kill();
      }
    }
  }
  for (const n of SIZES) {
    const p = per[n];
    console.log(`  n=${n}: ${p.w}-${p.l}-${p.d}  进${p.gf} 失${p.ga}`);
  }
  console.log(`${AGENT} vs solWing:  W${W} L${L} D${D}  (${W + L + D} 局)  胜率 ${(100 * W / (W + L + D)).toFixed(1)}%  进${gf} 失${ga}`);
})();
