'use strict';
/* Parallel A/B bench: many games, alternating seats, aggregated from A's view.
 * Tooling only. Usage:
 *   node tools/bench.js --a "python3 agent_v2.py" --b "python3 agent.py" \
 *      --seeds 8001-8020 --sizes 1,2,3,4,5,6 --parallel 8
 */
const { playGame } = require('./harness');

function parseSeeds(s) {
  const out = [];
  for (const part of s.split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) out.push(i);
    } else out.push(Number(part));
  }
  return out;
}
const args = process.argv.slice(2);
const o = { a: 'python3 agent_v2.py', b: 'python3 agent.py', seeds: parseSeeds('8001-8010'), sizes: [1, 2, 3, 4, 5, 6], parallel: 8, quiet: true };
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--a') o.a = args[++i];
  else if (k === '--b') o.b = args[++i];
  else if (k === '--seeds') o.seeds = parseSeeds(args[++i]);
  else if (k === '--sizes') o.sizes = args[++i].split(',').map(Number);
  else if (k === '--parallel') o.parallel = +args[++i];
  else if (k === '--verbose') o.quiet = false;
}

async function main() {
  const jobs = [];
  for (const seed of o.seeds) {
    for (const n of o.sizes) {
      for (const seat of [0, 1]) jobs.push({ seed, n, seat });
    }
  }
  const perSize = {};
  for (const n of o.sizes) perSize[n] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, games: 0 };
  let aw = 0, ad = 0, al = 0, agf = 0, aga = 0, idx = 0;
  const results = [];
  async function worker() {
    while (true) {
      const j = jobs[idx++];
      if (!j) return;
      const p0 = j.seat === 0 ? o.a : o.b;
      const p1 = j.seat === 0 ? o.b : o.a;
      let g;
      try {
        g = await playGame({ seed: j.seed, teamSize: j.n, p0, p1 });
      } catch (e) {
        results.push({ ...j, error: String(e) });
        continue;
      }
      const aGoals = j.seat === 0 ? g.score[0] : g.score[1];
      const bGoals = j.seat === 0 ? g.score[1] : g.score[0];
      const res = aGoals > bGoals ? 'W' : (aGoals === bGoals ? 'D' : 'L');
      const s = perSize[j.n];
      s.games++; s.gf += aGoals; s.ga += bGoals;
      if (res === 'W') { aw++; s.w++; } else if (res === 'D') { ad++; s.d++; } else { al++; s.l++; }
      agf += aGoals; aga += bGoals;
      results.push({ ...j, gf: aGoals, ga: bGoals, res, frames: g.frame, reason: g.reason });
      if (!o.quiet) console.log(`seed=${j.seed} n=${j.n} seat=${j.seat} ${aGoals}:${bGoals} ${res} (${g.reason}) f=${g.frame}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(o.parallel, jobs.length) }, worker));
  const errs = results.filter(r => r.error);
  if (errs.length) console.log('ERRORS', errs.length, errs.slice(0, 3));
  console.log(`A=${o.a}  B=${o.b}  games=${jobs.length}`);
  for (const n of o.sizes) {
    const s = perSize[n];
    console.log(`  n=${n}: ${s.w}W ${s.d}D ${s.l}L  gf=${s.gf} ga=${s.ga} gd=${s.gf - s.ga}`);
  }
  console.log(`TOTAL: ${aw}W ${ad}D ${al}L  gf=${agf} ga=${aga} gd=${agf - aga}`);
  // per-seed sums for sanity
  const bySeed = {};
  for (const r of results) {
    if (r.error) continue;
    bySeed[r.seed] = bySeed[r.seed] || { gf: 0, ga: 0, n: 0 };
    bySeed[r.seed].gf += r.gf; bySeed[r.seed].ga += r.ga; bySeed[r.seed].n++;
  }
  const seeds = Object.keys(bySeed).sort();
  const line = seeds.map(s => `${s}:${bySeed[s].gf}-${bySeed[s].ga}`).join(' ');
  console.log('by seed:', line);
}
main().catch(e => { console.error(e); process.exit(1); });
