'use strict';
// Evaluate attack side (team0, rounds 1-3) against defender variants.
// Usage: node tools/att_eval.js <seedsCsv> <variantsCsv> [attackerEnvJson]
const { runMatch, PyAgent } = require('./run_match');

async function main() {
  const seeds = (process.argv[2] || '1,2,3,4,5,6').split(',').map(Number);
  const variants = (process.argv[3] || 'C').split(',');
  const attEnv = process.argv[4] ? JSON.parse(process.argv[4]) : {};
  const defEnv = process.argv[5] ? JSON.parse(process.argv[5]) : {};
  let totW = 0, totN = 0;
  const perVariant = {};
  const byRound = [0, 0, 0], byRoundN = [0, 0, 0];
  for (const v of variants) {
    let w = 0, n = 0; const reasons = {};
    for (const seed of seeds) {
      const atk = new PyAgent(['python3', '/workspace/agent.py'], 'atk', attEnv);
      const def = new PyAgent(['python3', '/workspace/agent.py'], 'def', Object.assign({ AGENT_VARIANT: v }, defEnv));
      let r;
      try { r = await runMatch(atk, def, seed, { n0: 'ATK', n1: 'DEF' }); } finally { atk.kill(); def.kill(); }
      for (const l of r.roundLog) {
        if (l.round > 3) continue;
        n++;
        byRoundN[l.round - 1]++;
        if (l.winnerTeam === 0) { w++; byRound[l.round - 1]++; reasons['WIN:' + l.reason] = (reasons['WIN:' + l.reason] || 0) + 1; }
        else { reasons['LOSS:' + l.reason] = (reasons['LOSS:' + l.reason] || 0) + 1; }
      }
    }
    perVariant[v] = { w, n, reasons };
    totW += w; totN += n;
    console.log(`def variant ${v}: ATTACK ${w}/${n} = ${(w / n * 100).toFixed(0)}%  ${JSON.stringify(reasons)}`);
  }
  console.log(`TOTAL ATTACK ${totW}/${totN} = ${(totW / totN * 100).toFixed(0)}%`);
  console.log(`BY ROUND: R1 ${byRound[0]}/${byRoundN[0]}  R2 ${byRound[1]}/${byRoundN[1]}  R3 ${byRound[2]}/${byRoundN[2]}`);
}
main().catch(e => { console.error(e); process.exit(1); });
