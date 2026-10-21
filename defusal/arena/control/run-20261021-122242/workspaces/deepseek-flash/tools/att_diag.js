'use strict';
// Attack-round diagnostics: for each seed, rounds 1-3 of attacker(team0, env) vs defender(variant).
const sim = require('../simulation');
const { PyAgent } = require('./run_match');

async function main() {
  const seeds = (process.argv[2] || '1,2,3').split(',').map(Number);
  const variant = process.argv[3] || 'C';
  const attEnv = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  for (const seed of seeds) {
    const a = new PyAgent(['python3', '/workspace/agent.py'], 'atk', attEnv);
    const b = new PyAgent(['python3', '/workspace/agent.py'], 'def', { AGENT_VARIANT: variant });
    const g = sim.createMatch({ id: 'd', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
    let guard = 0; const log = [];
    while (g.status === 'playing' && guard++ < 5000) {
      if (g.phase === 'buy') {
        const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
        const [b0, b1] = await Promise.all([a.buy(v0), b.buy(v1)]);
        sim.submitBuys(g, 0, b0.buys || []); sim.submitBuys(g, 1, b1.buys || []);
        if (g.round <= 3) log.push(`R${g.round} buy A=${JSON.stringify((b0.buys || []).map(x => x.weapon || 'A'))}`);
      } else if (g.phase === 'live') {
        const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
        const [i0, i1] = await Promise.all([a.live(v0), b.live(v1)]);
        const w0 = sim.submitWindow(g, 0, i0.inputs), w1 = sim.submitWindow(g, 1, i1.inputs);
        const be = g.events.length;
        sim.advanceWindow(g, [w0, w1]);
        if (g.round <= 3) for (const e of g.events.slice(be)) {
          if (['death', 'plant', 'defuse', 'explode', 'bombDrop'].includes(e.type))
            log.push(`  ${e.type}@${e.t.toFixed(2)} ${e.target || ''}${e.killer ? ' by ' + e.killer : ''}${e.site ? ' site=' + e.site : ''}`);
        }
      } else break;
    }
    console.log(`seed ${seed}: ${g.roundWins.join(':')}`);
    for (const l of g.roundLog) if (l.round <= 3) {
      const alive = [0, 0]; for (const u of l.units) if (u.alive) alive[u.team]++;
      console.log(`  R${l.round} ${l.winnerTeam === 0 ? 'WIN ' : 'LOSS'} ${l.reason} bomb=${l.bomb.state}${l.bomb.site || ''} frames=${l.frames} alive t0=${alive[0]} t1=${alive[1]}`);
    }
    console.log(log.filter(l => l.startsWith('R') || l.includes('plant') || l.includes('bombDrop') || l.includes('death')).join('\n'));
    a.kill(); b.kill();
  }
}
main().catch(e => { console.error(e); process.exit(1); });
