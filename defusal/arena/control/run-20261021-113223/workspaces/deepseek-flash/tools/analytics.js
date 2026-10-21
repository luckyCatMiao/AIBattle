'use strict';
// Per-round analytics: kill timeline, plant time, alive counts at plant.
const sim = require('../simulation');
const { PyAgent, JsBot } = require('./run_match');

async function main() {
  const seed = Number(process.argv[2] || 1);
  const style = process.argv[3] || 'mirror0';
  const isMirror = style.startsWith('mirror');
  const mv = style.match(/^mirror(\w*)$/);
  const a = isMirror ? new PyAgent(['python3', '/workspace/agent.py'], 'a') : new JsBot(style);
  const b = isMirror ? new PyAgent(['python3', '/workspace/agent.py'], 'b', mv && mv[1] ? { AGENT_VARIANT: mv[1] } : null) : new JsBot(style);
  const ctrls = [a, b];
  const g = sim.createMatch({ id: 'an', players: [{ name: 'P0', kind: 'api' }, { name: 'P1', kind: 'api' }], seed });
  let guard = 0, roundT0 = 0, plantInfo = null;
  while (g.status === 'playing' && guard++ < 5000) {
    if (g.phase === 'buy') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [b0, b1] = await Promise.all([ctrls[0].buy(v0), ctrls[1].buy(v1)]);
      sim.submitBuys(g, 0, b0.buys || []); sim.submitBuys(g, 1, b1.buys || []);
      console.log(`R${g.round} buy0=${JSON.stringify((b0.buys || []).map(x => x.weapon || (x.armor ? 'A' : '') + (x.kit ? 'K' : '')))} buy1=${JSON.stringify((b1.buys || []).map(x => x.weapon || (x.armor ? 'A' : '') + (x.kit ? 'K' : '')))}`);
      roundT0 = g.now; plantInfo = null;
    } else if (g.phase === 'live') {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [i0, i1] = await Promise.all([ctrls[0].live(v0), ctrls[1].live(v1)]);
      const w0 = sim.submitWindow(g, 0, i0.inputs), w1 = sim.submitWindow(g, 1, i1.inputs);
      const before = g.events.length;
      sim.advanceWindow(g, [w0, w1]);
      for (const e of g.events.slice(before)) {
        if (e.type === 'plant') {
          const alive = [0, 0];
          for (const u of g.units) if (u.alive) alive[u.team]++;
          console.log(`   PLANT@${e.t} site=${e.site} alive t0=${alive[0]} t1=${alive[1]}`);
        }
        if (e.type === 'death') console.log(`   death@${e.t} ${e.target} by ${e.killer}`);
        if (e.type === 'defuse' || e.type === 'explode') console.log(`   ${e.type}@${e.t}`);
      }
    } else break;
  }
  console.log(g.roundLog.map(r => `R${r.round}: t${r.winnerTeam} ${r.reason} ${r.bomb.state}`).join('\n'));
  a.kill(); b.kill();
}
main().catch(e => { console.error(e); process.exit(1); });
