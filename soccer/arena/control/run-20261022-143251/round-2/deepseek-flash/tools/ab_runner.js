'use strict';
/* Aggregate A/B runner for offline soccer tests.
 * Usage: node tools/ab_runner.js --p0 "python agent.py" --p1 "python agent_candidate.py" \
 *        --n 2 --seeds 4011-4016 [--no-swap]
 * Prints one line per game and a summary from each spec's perspective.
 */
const { playGame } = require('./harness.js');

function parseSeeds(s) {
  const out = [];
  for (const part of s.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) out.push(i);
    } else if (part) out.push(Number(part));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { p0: 'python agent.py', p1: 'python agent_candidate.py', n: 2, seeds: '4011-4016', swap: true };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--p0') opt.p0 = args[++i];
    else if (a === '--p1') opt.p1 = args[++i];
    else if (a === '--n') opt.n = Number(args[++i]);
    else if (a === '--seeds') opt.seeds = args[++i];
    else if (a === '--no-swap') opt.swap = false;
  }
  const seeds = parseSeeds(opt.seeds);
  const rows = [];
  for (const seed of seeds) {
    const layouts = opt.swap ? [[opt.p0, opt.p1], [opt.p1, opt.p0]] : [[opt.p0, opt.p1]];
    for (let li = 0; li < layouts.length; li++) {
      const [a, b] = layouts[li];
      const g = await playGame({ seed, teamSize: opt.n, p0: a, p1: b });
      const kicks0 = g.stats[0].kicks, kicks1 = g.stats[1].kicks;
      const poss0 = g.stats[0].possession, poss1 = g.stats[1].possession;
      rows.push({ seed, a, b, score: g.score.slice(), kicks: [kicks0, kicks1], poss: [poss0, poss1],
        saves: g.events.filter(e => e.type === 'save').length, fouls: g.stats.map(s => s.fouls) });
      console.log(`seed=${seed} ${a} (t0) vs ${b} (t1) -> ${g.score[0]}:${g.score[1]} kicks=${kicks0}/${kicks1} poss=${poss0}/${poss1}`);
    }
  }
  // Aggregate each spec over all games it played.
  const specs = [...new Set([opt.p0, opt.p1])];
  for (const spec of specs) {
    let w = 0, d = 0, l = 0, gf = 0, ga = 0, games = 0;
    for (const r of rows) {
      let team = -1;
      if (r.a === spec) team = 0; else if (r.b === spec) team = 1; else continue;
      games++;
      const mine = r.score[team], theirs = r.score[1 - team];
      gf += mine; ga += theirs;
      if (mine > theirs) w++; else if (mine < theirs) l++; else d++;
    }
    console.log(`SUMMARY ${spec}: games=${games} W-D-L=${w}-${d}-${l} GF-GA=${gf}-${ga} GD=${gf - ga}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
