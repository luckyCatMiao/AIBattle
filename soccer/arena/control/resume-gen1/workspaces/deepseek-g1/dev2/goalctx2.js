'use strict';
/* 详细复盘：把每个进球前后 3 秒的 kick / tackle 事件与关键位置打出来。 */
const path = require('path');
const { runMatch, PyAgent, sim } = require('../dev/arena.js');
const bots = Object.assign({}, require('../dev/bots.js'), require('../dev/bots2.js'), require('../dev2/opps.js'));
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
function mk(spec, tag) {
  if (spec.startsWith('py:')) { const ag = new PyAgent(PY, spec.slice(3), ROOT, tag); return { fn: async v => JSON.parse(await ag.ask(v)).inputs, ag }; }
  const f = bots[spec]; if (!f) throw new Error('unknown ' + spec); return { fn: async v => f(v), ag: null };
}

(async () => {
  const A = arg('a', 'py:agent_core.py'), B = arg('b', 'solid');
  const seed = Number(arg('seed', 5)), size = Number(arg('size', 5));
  const swap = process.argv.includes('--swap');
  const a = mk(A, 'a'), b = mk(B, 'b');
  const g = await runMatch({ seed, teamSize: size, agentA: swap ? b.fn : a.fn, agentB: swap ? a.fn : b.fn });
  const mi = swap ? 1 : 0;
  console.log(`${A} vs ${B} seed=${seed} n=${g.teamSize} swap=${swap} => ${g.score[mi]}:${g.score[1 - mi]} (${g.reason})`);
  const evs = g.events.filter(e => ['goal', 'kick', 'tackle', 'save', 'foul'].includes(e.type));
  for (const e of evs) {
    if (e.type === 'goal') {
      console.log(`\n=== GOAL f${e.frame} (${(e.frame / 20).toFixed(2)}s) team=${e.team} ${e.ownGoal ? 'OWN' : ''} score=${e.score}`);
      const ctx = evs.filter(x => x.frame >= e.frame - 90 && x.frame <= e.frame && x.type !== 'goal');
      for (const c of ctx) console.log(`    f${String(c.frame).padStart(4)} ${c.type} team=${c.team} unit=${c.unit || ''} ${c.from ? 'from=' + c.from : ''} ${c.x !== undefined ? `(${c.x},${c.y}) ang=${c.angle}` : ''}`);
    }
  }
  a.ag && a.ag.kill(); b.ag && b.ag.kill();
})();
