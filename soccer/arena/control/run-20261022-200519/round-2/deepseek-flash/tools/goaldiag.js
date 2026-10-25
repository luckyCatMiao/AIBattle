'use strict';
const { playGame } = require('./harness.js');
async function main() {
  const [a, b, n, seed] = process.argv.slice(2);
  const g = await playGame({ seed: +seed, teamSize: +n, p0: a, p1: b });
  const kicks = g.events.filter(e => e.type === 'kick');
  console.log(`score ${g.score.join(':')} n=${n} seed=${seed}`);
  for (const e of g.events) {
    if (e.type === 'goal') {
      const before = kicks.filter(k => k.frame <= e.frame).slice(-3);
      console.log(`GOAL f=${e.frame} team=${e.team} scorer=${e.scorer} own=${e.ownGoal}`);
      for (const k of before) console.log(`   kick f=${k.frame} team=${k.team} from (${k.x.toFixed(1)},${k.y.toFixed(1)}) ang=${k.angle}`);
    }
  }
}
main().catch(e => { console.error(e); process.exit(1); });
