'use strict';
/* node dev/trace.js --a py --b botChase --seed 1 --swap 0 -v
 * 跑一局并打印事件流（进球/扑救/犯规/踢球）。 */
const { runMatch, PyAgent } = require('./arena.js');
const bots = Object.assign({}, require('./bots.js'), require('./bots2.js'));
const path = require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }

function mk(name, py, tag) {
  if (name === 'py') { const ag = new PyAgent(PY, py || 'agent.py', ROOT, tag); return { fn: async v => JSON.parse(await ag.ask(v)).inputs, ag }; }
  const f = bots[name]; if (!f) throw new Error('unknown bot ' + name);
  return { fn: async v => f(v), ag: null };
}

(async () => {
  const a = arg('a', 'py'), b = arg('b', 'botChase'), seed = Number(arg('seed', 1));
  const swap = arg('swap', '0') === '1';
  const A = mk(swap ? b : a, arg('py', null), 'A');
  const B = mk(swap ? a : b, arg('py', null), 'B');
  const g = await runMatch({ seed, agentA: A.fn, agentB: B.fn });
  console.log(`seed=${seed} n=${g.teamSize} score=${g.score} reason=${g.reason}`);
  console.log('stats', JSON.stringify(g.stats));
  const keep = new Set(['goal', 'save', 'foul', 'half', 'golden', 'end']);
  for (const e of g.events) if (keep.has(e.type)) console.log(`  t=${e.t} ${e.type} ${e.text || ''}`);
  if (A.ag && A.ag.err) console.log('A stderr:', A.ag.err.slice(-800));
  if (B.ag && B.ag.err) console.log('B stderr:', B.ag.err.slice(-800));
  A.ag && A.ag.kill(); B.ag && B.ag.kill();
})();
