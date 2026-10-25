'use strict';
/* 用 sol 的真实程序 (workspaces/sol/agent.js) 当对手，复跑第 1 轮的实际种子。
 * 用法: node dev/vs_solreal.js <myAgent.py> [seed:size,...]
 * 默认复跑 r1-g1(seed 4011,n=2) 与 r1-g2(seed 4012,n=1)，两个座位各一局。
 * 官方 train.py: seed = seed_base + iteration*10 + game_number，seed_base=4000；
 * 人数 = random.Random(4000).shuffle([1..6]) 的第 (iteration-1)*2+game 项 = [2,1,...]。
 */
const { runMatch, PyAgent } = require('./arena.js');
const { NodeAgent } = require('./jsagent.js');
const path = require('path');

const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const SOL_DIR = path.resolve(ROOT, '..', 'sol');
const MY = process.argv[2] || 'agent.py';
const PAIRS = (process.argv[3] || '4011:2,4012:1').split(',').map(s => {
  const [seed, size] = s.split(':');
  return { seed: Number(seed), size: size ? Number(size) : undefined };
});

(async () => {
  let W = 0, L = 0, D = 0, gf = 0, ga = 0;
  for (const { seed, size } of PAIRS) {
    for (const swap of [false, true]) {
      const me = new PyAgent(PY, MY, ROOT, 'me');
      const sol = new NodeAgent('agent.js', SOL_DIR, 'sol');
      const meFn = async v => JSON.parse(await me.ask(v)).inputs;
      const solFn = async v => JSON.parse(await sol.ask(v)).inputs;
      let g;
      try {
        g = await runMatch({ seed, teamSize: size, agentA: swap ? solFn : meFn, agentB: swap ? meFn : solFn });
      } catch (e) {
        console.log(`seed=${seed} n=${size} swap=${swap} ERROR ${e.message}`);
        console.log('  sol stderr:', sol.err.slice(-400));
        me.kill(); sol.kill(); L++; continue;
      }
      const mine = swap ? g.score[1] : g.score[0];
      const opp = swap ? g.score[0] : g.score[1];
      gf += mine; ga += opp;
      if (mine > opp) W++; else if (mine < opp) L++; else D++;
      const mi = swap ? 1 : 0;
      console.log(`seed=${seed} n=${g.teamSize} swap=${swap} 我${mine}:${opp}sol  ${g.reason}  我射门kicks=${g.stats[mi].kicks} 控球=${g.stats[mi].possession} 犯规=${g.stats[mi].fouls}`);
      me.kill(); sol.kill();
    }
  }
  console.log(`\n${MY} vs sol(real):  W${W} L${L} D${D}  进${gf} 失${ga}`);
})();
