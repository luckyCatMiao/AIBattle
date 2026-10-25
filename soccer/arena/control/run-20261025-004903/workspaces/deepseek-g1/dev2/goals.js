'use strict';
/* 打印一局的进球/关键事件时间线：node dev2/goals.js --a py:agent_core.py --b py:agent.py --seed 5 --size 5 */
const path = require('path');
const { runMatch, PyAgent, sim } = require('../dev/arena.js');
const bots = Object.assign({}, require('../dev/bots.js'), require('../dev/bots2.js'), require('../dev2/opps.js'));
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }

function mk(spec, tag) {
  if (spec.startsWith('py:')) {
    const ag = new PyAgent(PY, spec.slice(3), ROOT, tag);
    return { fn: async v => JSON.parse(await ag.ask(v)).inputs, ag };
  }
  const f = bots[spec];
  if (!f) throw new Error('unknown ' + spec);
  return { fn: async v => f(v), ag: null };
}

(async () => {
  const A = arg('a', 'py:agent_core.py'), B = arg('b', 'solid');
  const seed = Number(arg('seed', 5)), size = Number(arg('size', 5));
  const swap = process.argv.includes('--swap');
  const a = mk(A, 'a'), b = mk(B, 'b');
  const g = await runMatch({
    seed, teamSize: size,
    agentA: swap ? b.fn : a.fn, agentB: swap ? a.fn : b.fn,
  });
  const mine = swap ? g.score[1] : g.score[0];
  const other = swap ? g.score[0] : g.score[1];
  console.log(`${A} vs ${B} seed=${seed} n=${g.teamSize} swap=${swap} => ${mine}:${other} (${g.reason}) frames=${g.frame}`);
  const mi = swap ? 1 : 0;
  console.log(`stats mine kicks=${g.stats[mi].kicks} poss=${g.stats[mi].possession} fouls=${g.stats[mi].fouls} | opp kicks=${g.stats[1 - mi].kicks} poss=${g.stats[1 - mi].possession} fouls=${g.stats[1 - mi].fouls}`);
  for (const e of g.events) {
    if (['goal', 'half', 'golden', 'end', 'foul', 'save', 'tackle'].includes(e.type)) {
      if (e.type === 'tackle') continue;
      console.log(`  f${String(e.frame).padStart(4)} t=${e.t} ${e.type} ${e.text || ''}${e.team !== undefined ? ' team=' + e.team : ''}`);
    }
  }
  a.ag && a.ag.kill(); b.ag && b.ag.kill();
})();
