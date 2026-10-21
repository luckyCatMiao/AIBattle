'use strict';
const sim = require('../simulation');
const { Bot } = require('./bot');
const { PyAgent } = require('./run_match');

async function main() {
  const seed = Number(process.argv[2] || 1);
  const style = process.argv[3] || 'mixed';
  const myTeam = Number(process.argv[4] || 1);
  const target = Number(process.argv[5] || 4);
  const py = new PyAgent();
  const bot = new Bot(style);
  const mk = (o) => ({ buy: async v => o.buy(v), live: async v => o.live === undefined ? o.makeWindow(v) : o.live(v) });
  const ctrls = myTeam === 0 ? [py, mk(bot)] : [mk(bot), py];
  const g = sim.createMatch({ id: 'dbg', players: [{ name: 'P0', kind: 'api' }, { name: 'P1', kind: 'api' }], seed });
  let guard = 0;
  while (g.status === 'playing' && guard++ < 5000) {
    if (g.phase === 'buy') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [b0, b1] = await Promise.all([ctrls[0].buy(v0), ctrls[1].buy(v1)]);
      sim.submitBuys(g, 0, b0.buys || []); sim.submitBuys(g, 1, b1.buys || []);
    } else if (g.phase === 'live') {
      if (g.round === target) {
        console.log(`-- r${g.round} t=${g.now.toFixed(2)} ` + g.units.map(u => `${u.id}(${u.x.toFixed(1)},${u.y.toFixed(1)})${u.alive ? '' : 'X'}`).join(' '));
      }
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [i0, i1] = await Promise.all([ctrls[0].live(v0), ctrls[1].live(v1)]);
      const w0 = sim.submitWindow(g, 0, i0.inputs), w1 = sim.submitWindow(g, 1, i1.inputs);
      sim.advanceWindow(g, [w0, w1]);
    } else break;
  }
  py.kill();
}
main().catch(e => { console.error(e); process.exit(1); });
