'use strict';
const sim = require('../simulation');
const { Bot } = require('./bot');
const { PyAgent } = require('./run_match');


async function main() {
  const seed = Number(process.argv[2] || 1);
  const style = process.argv[3] || 'mixed';
  const myTeam = Number(process.argv[4] || 1);
  const py = new PyAgent();
  const bot = new Bot(style);
  const ctrls = myTeam === 0 ? [py, { buy: async v => bot.buy(v), live: async v => bot.makeWindow(v) }]
                             : [{ buy: async v => bot.buy(v), live: async v => bot.makeWindow(v) }, py];
  const g = sim.createMatch({ id: 'dbg', players: [{ name: 'P0', kind: 'api' }, { name: 'P1', kind: 'api' }], seed });
  let guard = 0, lastRound = 0;
  while (g.status === 'playing' && guard++ < 5000) {
    if (g.phase === 'buy') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [b0, b1] = await Promise.all([ctrls[0].buy(v0), ctrls[1].buy(v1)]);
      sim.submitBuys(g, 0, b0.buys || []); sim.submitBuys(g, 1, b1.buys || []);
    } else if (g.phase === 'live') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [i0, i1] = await Promise.all([ctrls[0].live(v0), ctrls[1].live(v1)]);
      const w0 = sim.submitWindow(g, 0, i0.inputs), w1 = sim.submitWindow(g, 1, i1.inputs);
      const before = g.events.length;
      sim.advanceWindow(g, [w0, w1]);
      for (const e of g.events.slice(before)) {
        if (e.type === 'death') { const k = g.units.find(u=>u.id===e.killer); const t = g.units.find(u=>u.id===e.target); console.log(`  t=${e.t} DEATH ${e.target}@(${t.x.toFixed(1)},${t.y.toFixed(1)}) by ${e.killer}@(${k?k.x.toFixed(1):'?'},${k?k.y.toFixed(1):'?'})`); }
        if (e.type === 'plant' || e.type === 'defuse' || e.type === 'explode' || e.type === 'bombDrop') console.log(`  t=${e.t} ${e.type} ${JSON.stringify(e)}`);
      }
    } else break;
    if (g.round !== lastRound) { lastRound = g.round; console.log(`ROUND ${g.round} sides=${JSON.stringify(g.sides)}`); }
  }
  console.log(g.roundLog.map(r => `R${r.round}: ${r.winner} ${r.reason} ${r.bomb.state}`).join('\n'));
  py.kill();
}
main().catch(e => { console.error(e); process.exit(1); });
