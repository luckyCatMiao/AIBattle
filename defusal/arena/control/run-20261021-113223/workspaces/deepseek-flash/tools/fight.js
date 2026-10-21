'use strict';
// Full (unfiltered) event log for one round of a self-play match.
// Usage: node tools/fight.js <seed> <variant> <targetRound>
const sim = require('../simulation');
const { PyAgent } = require('./run_match');

async function main() {
  const seed = Number(process.argv[2] || 1);
  const variant = process.argv[3] || '0';
  const target = Number(process.argv[4] || 1);
  const a = new PyAgent(['python3', '/workspace/agent.py'], 't0');
  const b = new PyAgent(['python3', '/workspace/agent.py'], 't1', { AGENT_VARIANT: variant });
  const g = sim.createMatch({ id: 'f', players: [{ name: 'P0', kind: 'api' }, { name: 'P1', kind: 'api' }], seed });
  let guard = 0, seen = 0;
  while (g.status === 'playing' && guard++ < 5000) {
    if (g.phase === 'buy') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [b0, b1] = await Promise.all([a.buy(v0), b.buy(v1)]);
      sim.submitBuys(g, 0, b0.buys || []); sim.submitBuys(g, 1, b1.buys || []);
    } else if (g.phase === 'live') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [i0, i1] = await Promise.all([a.live(v0), b.live(v1)]);
      const w0 = sim.submitWindow(g, 0, i0.inputs), w1 = sim.submitWindow(g, 1, i1.inputs);
      const be = g.events.length;
      sim.advanceWindow(g, [w0, w1]);
      if (g.round === target) {
        for (const e of g.events.slice(be)) {
          if (e.type === 'shot') continue;
          if (e.type === 'hit') { console.log(`  hit@${e.t.toFixed(2)} ${e.target} -${e.damage} hp=${e.hp} byT${e.owner}`); continue; }
          if (['death', 'plant', 'defuse', 'explode', 'bombDrop', 'bombPickup'].includes(e.type))
            console.log(`  ${e.type}@${e.t.toFixed(2)} ${e.target || ''}${e.killer ? ' by ' + e.killer : ''}${e.site ? ' site=' + e.site : ''}`);
        }
      }
    } else break;
  }
  console.log(g.roundLog.map(r => `R${r.round}: t${r.winnerTeam} ${r.reason} ${r.bomb.state}`).join('\n'));
  a.kill(); b.kill();
}
main().catch(e => { console.error(e); process.exit(1); });
