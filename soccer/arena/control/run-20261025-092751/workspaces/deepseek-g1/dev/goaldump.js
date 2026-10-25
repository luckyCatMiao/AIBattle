'use strict';
/* 跑一局并打印所有进球事件 + 进球前 1 秒的球/球员位置。用法:
 * node dev/goaldump.js <myAgent.py> <seed:size> <swap 0|1>
 */
const { runMatch, PyAgent } = require('./arena.js');
const { NodeAgent } = require('./jsagent.js');
const path = require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const SOL_DIR = path.resolve(ROOT, '..', 'sol');
const MY = process.argv[2] || 'agent.py';
const [seedS, sizeS] = (process.argv[3] || '4011:2').split(':');
const swap = process.argv[4] === '1';

(async () => {
  const me = new PyAgent(PY, MY, ROOT, 'me');
  const sol = new NodeAgent('agent.js', SOL_DIR, 'sol');
  const meFn = async v => JSON.parse(await me.ask(v)).inputs;
  const solFn = async v => JSON.parse(await sol.ask(v)).inputs;
  const g = await runMatch({ seed: Number(seedS), teamSize: Number(sizeS), agentA: swap ? solFn : meFn, agentB: swap ? meFn : solFn });
  const myTeam = swap ? 1 : 0;
  console.log(`${MY} seed=${seedS} n=${g.teamSize} swap=${swap} 我(team${myTeam}) ${g.score[myTeam]}:${g.score[1 - myTeam]} ${g.reason}`);
  console.log(`kicks 我${g.stats[myTeam].kicks} 敌${g.stats[1 - myTeam].kicks} | 控球 我${g.stats[myTeam].possession} 敌${g.stats[1 - myTeam].possession} | 犯规 我${g.stats[myTeam].fouls} 敌${g.stats[1 - myTeam].fouls}`);
  const evs = (g.events || []);
  const key = e => ['goal','save','foul','tackle'].includes(e.type);
  console.log('事件:', evs.filter(key).map(e => `f${e.frame}:${e.type}${e.team !== undefined ? '(t' + e.team + ')' : ''}`).join(' '));
  me.kill(); sol.kill();
})();
