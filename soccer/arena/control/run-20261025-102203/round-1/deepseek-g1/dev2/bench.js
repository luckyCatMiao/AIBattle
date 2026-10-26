'use strict';
/* 通用对战台：node dev2/bench.js --me agent.py --opp solid --seeds 1,2,3 --sizes 1,2,3 --swap both
 * --opp 可为 dev/bots.js|dev/bots2.js|dev2/opps.js 里的机器人名，或 py:<脚本> 走 python 进程。 */
const path = require('path');
const { runMatch, PyAgent } = require('../dev/arena.js');
const bots = Object.assign({}, require('../dev/bots.js'), require('../dev/bots2.js'), require('../dev2/opps.js'));

const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

const ME = arg('me', 'agent.py');
const OPP = arg('opp', 'solid');
const SEEDS = arg('seeds', '1,2,3').split(',').map(Number);
const SIZES = arg('sizes', '0').split(',').map(Number);   // 0 = 用种子的随机人数
const SWAP = arg('swap', 'both');
const VERBOSE = process.argv.includes('-v');

function makeOpp() {
  if (OPP.startsWith('py:')) {
    const ag = new PyAgent(PY, OPP.slice(3), ROOT, 'opp');
    return { fn: async v => JSON.parse(await ag.ask(v)).inputs, ag };
  }
  const f = bots[OPP];
  if (!f) throw new Error('unknown bot ' + OPP);
  return { fn: async v => f(v), ag: null };
}

(async () => {
  const t0 = Date.now();
  let W = 0, L = 0, D = 0, gf = 0, ga = 0, err = 0;
  const perSize = {};
  const swaps = SWAP === 'both' ? [false, true] : [SWAP === 'true'];
  for (const size of SIZES) {
    for (const seed of SEEDS) {
      for (const swap of swaps) {
        const me = new PyAgent(PY, ME, ROOT, 'me');
        const op = makeOpp();
        const meFn = async v => JSON.parse(await me.ask(v)).inputs;
        let g;
        try {
          g = await runMatch({
            seed, teamSize: size || undefined,
            agentA: swap ? op.fn : meFn,
            agentB: swap ? meFn : op.fn,
          });
        } catch (e) {
          console.log(`seed=${seed} n=${size} swap=${swap} ERROR ${e.message}`);
          console.log('   me stderr:', me.err.slice(-300));
          me.kill(); if (op.ag) op.ag.kill();
          err++; L++; continue;
        }
        const mine = swap ? g.score[1] : g.score[0];
        const other = swap ? g.score[0] : g.score[1];
        gf += mine; ga += other;
        let r;
        if (mine > other) { W++; r = 'W'; } else if (mine < other) { L++; r = 'L'; } else { D++; r = 'D'; }
        const key = g.teamSize;
        perSize[key] = perSize[key] || { w: 0, l: 0, d: 0, gf: 0, ga: 0 };
        perSize[key].w += (mine > other ? 1 : 0); perSize[key].l += (mine < other ? 1 : 0);
        perSize[key].d += (mine === other ? 1 : 0);
        perSize[key].gf += mine; perSize[key].ga += other;
        if (VERBOSE) console.log(`  seed=${seed} n=${g.teamSize} swap=${swap ? 1 : 0} ${mine}:${other} ${r} ${g.reason} kicks=${g.stats[swap ? 1 : 0].kicks} poss=${g.stats[swap ? 1 : 0].possession} foul=${g.stats[swap ? 1 : 0].fouls} save=${g.events.filter(e => e.type === 'save').length}`);
        me.kill(); if (op.ag) op.ag.kill();
      }
    }
  }
  const tot = W + L + D;
  console.log(`\n[${path.basename(ME)} vs ${OPP}] W${W} L${L} D${D} 胜率 ${(100 * W / tot).toFixed(1)}% 进${gf} 失${ga} err=${err} 用时${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log('   perSize:', JSON.stringify(Object.fromEntries(Object.entries(perSize).map(([k, v]) => [k, `${v.w}-${v.l}-${v.d} g${v.gf}:${v.ga}`]))));
})();
