'use strict';
// Evaluate a variant's defence / attack win-rate against the default agent.
// Usage: node tools/exp.js <variant> <seedsCsv>
const { runMatch, PyAgent } = require('./run_match');

async function main() {
  const variant = process.argv[2] || '0';
  const seeds = (process.argv[3] || '1,2,3,4,5,6').split(',').map(Number);
  let defW = 0, defN = 0, atkW = 0, atkN = 0;
  const detail = [];
  for (const seed of seeds) {
    // match 1: variant is team0 (attacks r1-3, defends r4-6)
    let v = new PyAgent(['python3', '/workspace/agent.py'], 'var', { AGENT_VARIANT: variant });
    let b = new PyAgent(['python3', '/workspace/agent.py'], 'base');
    let r = await runMatch(v, b, seed, { n0: 'V', n1: 'B' });
    v.kill(); b.kill();
    let d1 = '', a1 = '';
    for (const l of r.roundLog) {
      if (l.round <= 3) { atkN++; if (l.winnerTeam === 0) { atkW++; a1 += 'A'; } else a1 += 'x'; }
      else { defN++; if (l.winnerTeam === 0) { defW++; d1 += 'D'; } else d1 += 'x'; }
    }
    // match 2: variant is team1 (defends r1-3, attacks r4-6)
    v = new PyAgent(['python3', '/workspace/agent.py'], 'var', { AGENT_VARIANT: variant });
    b = new PyAgent(['python3', '/workspace/agent.py'], 'base');
    r = await runMatch(b, v, seed, { n0: 'B', n1: 'V' });
    v.kill(); b.kill();
    let d2 = '', a2 = '';
    for (const l of r.roundLog) {
      if (l.round <= 3) { defN++; if (l.winnerTeam === 1) { defW++; d2 += 'D'; } else d2 += 'x'; }
      else { atkN++; if (l.winnerTeam === 1) { atkW++; a2 += 'A'; } else a2 += 'x'; }
    }
    detail.push(`s${seed} def=${d1}${d2} atk=${a1}${a2}`);
  }
  console.log(detail.join('\n'));
  console.log(`variant ${variant}: DEFENCE ${defW}/${defN} = ${(defW / defN * 100).toFixed(0)}%   ATTACK ${atkW}/${atkN} = ${(atkW / atkN * 100).toFixed(0)}%`);
}
main().catch(e => { console.error(e); process.exit(1); });
