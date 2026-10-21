'use strict';
// Variant (via AGENT_VARIANT env) vs scripted JsBot, both orientations, per-side win counts.
// Usage: node tools/exp_bot.js <seedsCsv> <stylesCsv>
const { runMatch, PyAgent, JsBot } = require('./run_match');

async function main() {
  const seeds = (process.argv[2] || '1,2,3').split(',').map(Number);
  const styles = (process.argv[3] || 'mixed').split(',');
  const variant = process.env.AGENT_VARIANT || '(default)';
  let defW = 0, defN = 0, atkW = 0, atkN = 0;
  for (const style of styles) {
    for (const seed of seeds) {
      for (const myTeam of [0, 1]) {
        const py = new PyAgent(['python3', '/workspace/agent.py'], 'mine');
        const bot = new JsBot(style);
        let r;
        try { r = await runMatch(myTeam === 0 ? py : bot, myTeam === 0 ? bot : py, seed, { n0: 'A', n1: 'B' }); }
        finally { py.kill(); bot.kill(); }
        for (const l of r.roundLog) {
          const iDefend = (l.round <= 3) ? (myTeam === 1) : (myTeam === 0);
          const won = l.winnerTeam === myTeam;
          if (iDefend) { defN++; if (won) defW++; } else { atkN++; if (won) atkW++; }
        }
        const line = r.roundLog.map(l => `${l.round <= 3 ? (myTeam === 0 ? 'atk' : 'def') : (myTeam === 0 ? 'def' : 'atk')}:${l.winnerTeam === myTeam ? 'W' : 'L'}`).join(' ');
        console.log(`${style} s${seed} team${myTeam} ${r.roundWins.join(':')} | ${line}`);
      }
    }
  }
  console.log(`VARIANT=${variant} vs bot: DEFENCE ${defW}/${defN} = ${(defW / defN * 100).toFixed(0)}%  ATTACK ${atkW}/${atkN} = ${(atkW / atkN * 100).toFixed(0)}%`);
}
main().catch(e => { console.error(e); process.exit(1); });
