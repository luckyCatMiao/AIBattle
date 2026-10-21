'use strict';
// Summary analytics for a single match: per-round kill timeline + plant state.
const sim = require('../simulation');
const { runMatch, PyAgent, JsBot } = require('./run_match');

async function main() {
  const seed = Number(process.argv[2] || 1);
  const style = process.argv[3] || 'mirror0';
  const isMirror = style.startsWith('mirror');
  const mv = style.match(/^mirror(\w*)$/);
  const a = isMirror ? new PyAgent(['python3', '/workspace/agent.py'], 'a') : new JsBot(style);
  const b = isMirror ? new PyAgent(['python3', '/workspace/agent.py'], 'b', mv && mv[1] ? { AGENT_VARIANT: mv[1] } : null) : new JsBot(style);
  const r = await runMatch(a, b, seed, { n0: 'P0', n1: 'P1' });
  console.log('result', r.roundWins, r.winner);
  for (const l of r.roundLog) {
    const u = l.units;
    const alive = [0, 0];
    for (const x of u) if (x.alive) alive[x.team]++;
    console.log(`round ${l.round} winner=t${l.winnerTeam} reason='${l.reason}' bomb=${l.bomb.state}${l.bomb.site || ''} frames=${l.frames} aliveAtEnd t0=${alive[0]} t1=${alive[1]} kills=${u.map(x => x.kills).join(',')} weapons=${u.map(x => x.weapon[0]).join('')}`);
  }
  a.kill(); b.kill();
}
main().catch(e => { console.error(e); process.exit(1); });
