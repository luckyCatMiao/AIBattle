'use strict';
// Clean A/B.  Base agent always uses AGENT_BASE_* knobs (default variant 0/stack);
// the variant agent uses AGENT_VARIANT / AGENT_ATK.
// Match 1: variant (team0) attacks base (team1) -> attack sample.
// Match 2: variant (team1) defends base (team0) -> defence sample.
// Rounds 1-3 only, so both samples start from a fresh half.
// Usage: node tools/exp2.js <seedsCsv> <tag>
const { runMatch, PyAgent } = require('./run_match');

function knobs(prefix) {
  const e = {};
  for (const k of ['VARIANT', 'ATK', 'OLDKEY', 'NOROUTE']) {
    const v = process.env[prefix + k];
    if (v !== undefined) e['AGENT_' + k] = v;
  }
  if (e.AGENT_VARIANT === undefined) e.AGENT_VARIANT = '0';
  if (e.AGENT_ATK === undefined) e.AGENT_ATK = 'stack';
  return e;
}

async function main() {
  const seeds = (process.argv[2] || '1,2,3,4,5,6').split(',').map(Number);
  const tag = process.argv[3] || '';
  const baseEnv = knobs('AGENT_BASE_');
  const varEnv = knobs('AGENT_');
  let atkW = 0, atkN = 0, defW = 0, defN = 0;
  for (const seed of seeds) {
    let v = new PyAgent(['python3', '/workspace/agent.py'], 'var', varEnv);
    let b = new PyAgent(['python3', '/workspace/agent.py'], 'base', baseEnv);
    let r = await runMatch(v, b, seed, { n0: 'V', n1: 'B' });
    v.kill(); b.kill();
    let a = '';
    for (const l of r.roundLog) if (l.round <= 3) { atkN++; if (l.winnerTeam === 0) { atkW++; a += '+'; } else a += '-'; }
    v = new PyAgent(['python3', '/workspace/agent.py'], 'var', varEnv);
    b = new PyAgent(['python3', '/workspace/agent.py'], 'base', baseEnv);
    r = await runMatch(b, v, seed, { n0: 'B', n1: 'V' });
    v.kill(); b.kill();
    let d = '';
    for (const l of r.roundLog) if (l.round <= 3) { defN++; if (l.winnerTeam === 1) { defW++; d += '+'; } else d += '-'; }
    console.log(`s${seed} atk=${a} def=${d}`);
  }
  console.log(`${tag} ATTACK ${atkW}/${atkN} = ${(atkW / atkN * 100).toFixed(0)}%  DEFENCE ${defW}/${defN} = ${(defW / defN * 100).toFixed(0)}%`);
}
main().catch(e => { console.error(e); process.exit(1); });
