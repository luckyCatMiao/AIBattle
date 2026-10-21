'use strict';
// Mirror self-play over seeds: counts attack-side and defence-side round wins.
// Usage: node tools/mirror.js <seedsCsv>
const { runMatch, PyAgent } = require('./run_match');

async function main() {
  const seeds = (process.argv[2] || '1,2,3,4,5,6').split(',').map(Number);
  let atkW = 0, atkN = 0, defW = 0, defN = 0;
  for (const seed of seeds) {
    const a = new PyAgent(['python3', '/workspace/agent.py'], 'a');
    const b = new PyAgent(['python3', '/workspace/agent.py'], 'b');
    let r;
    try { r = await runMatch(a, b, seed, { n0: 'A', n1: 'B' }); } finally { a.kill(); b.kill(); }
    let line = '';
    for (const l of r.roundLog) {
      // team0 attacks rounds 1..3, defends 4..6
      const atkWin = l.winnerTeam === 0;
      if (l.round <= 3) { atkN++; if (atkWin) atkW++; }
      else { defN++; if (atkWin) defW++; }
      line += `${l.round <= 3 ? 'A' : 'D'}${atkWin ? '+' : '-'}${l.reason} `;
    }
    console.log(`s${seed} ${r.roundWins.join(':')} | ${line}`);
  }
  console.log(`ATTACK ${atkW}/${atkN} = ${(atkW / atkN * 100).toFixed(0)}%  DEFENCE ${defW}/${defN} = ${(defW / defN * 100).toFixed(0)}%`);
}
main().catch(e => { console.error(e); process.exit(1); });
