'use strict';
/* Aggregate benchmark: plays "our" external agent against a sparring spec at
 * every team size, both seats, over a fixed seed list, and reports W-D-L /
 * GF-GA from our perspective. Not part of the submission.
 *
 * usage: node tools/arena.js --agent "python agent.py" --opp "bot:pro"
 *        [--sizes 1,2,3,4,5,6] [--seeds 5] [--seed0 100]
 */
const { playGame } = require('./harness');

function parseArgs(argv) {
  const o = { agent: 'python agent.py', opp: 'bot:pro', sizes: [1, 2, 3, 4, 5, 6], seeds: 5, seed0: 100, verbose: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--agent') o.agent = argv[++i];
    else if (a === '--opp') o.opp = argv[++i];
    else if (a === '--sizes') o.sizes = argv[++i].split(',').map(Number);
    else if (a === '--seeds') o.seeds = +argv[++i];
    else if (a === '--seed0') o.seed0 = +argv[++i];
    else if (a === '--verbose') o.verbose = true;
  }
  return o;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  const per = new Map(); // size -> {w,d,l,gf,ga}
  let W = 0, D = 0, L = 0, GF = 0, GA = 0;
  const lines = [];
  for (const n of o.sizes) {
    const row = { w: 0, d: 0, l: 0, gf: 0, ga: 0 };
    for (let k = 0; k < o.seeds; k++) {
      const seed = o.seed0 + k * 7 + n;
      for (const seat of [0, 1]) {
        const p0 = seat === 0 ? o.agent : o.opp;
        const p1 = seat === 0 ? o.opp : o.agent;
        const g = await playGame({ seed, teamSize: n, p0, p1 });
        const mine = g.score[seat], theirs = g.score[1 - seat];
        row.gf += mine; row.ga += theirs;
        const win = g.winner === seat ? 'W' : (g.winner === null ? 'D' : 'L');
        if (win === 'W') row.w++; else if (win === 'D') row.d++; else row.l++;
        lines.push(`n=${n} seed=${seed} seat=${seat} ${mine}:${theirs} ${win} (${g.reason}) kicks=${g.stats[seat].kicks}/${g.stats[1 - seat].kicks} pos=${g.stats[seat].possession}/${g.stats[1 - seat].possession} saves=${g.events.filter(e => e.type === 'save' && e.team === seat).length}`);
      }
    }
    per.set(n, row);
    W += row.w; D += row.d; L += row.l; GF += row.gf; GA += row.ga;
    console.log(`n=${n}: W-D-L ${row.w}-${row.d}-${row.l}  GF-GA ${row.gf}-${row.ga}`);
  }
  console.log(`TOTAL: W-D-L ${W}-${D}-${L}  GF-GA ${GF}-${GA}`);
  if (o.verbose) console.log(lines.join('\n'));
}

main().catch(e => { console.error(e); process.exit(1); });
