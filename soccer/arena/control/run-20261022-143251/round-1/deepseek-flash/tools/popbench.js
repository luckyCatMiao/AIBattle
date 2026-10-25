'use strict';
/* Population benchmark: candidate A against a list of opponents B, all sizes,
 * both seats (covers both kickoff parities via seed parity), aggregated from
 * A's perspective. Tooling only.
 *
 *   node tools/popbench.js --a "python3 agent_v3.py" \
 *      --opponents "python3 agent.py;;python3 tools/agent_v1_solo2.py;;bot:balanced" \
 *      --seeds 8001,8002 --sizes 1,2,3,4,5,6 --parallel 10
 */
const { playGame } = require('./harness');

function parseSeeds(s) {
  const out = [];
  for (const part of s.split(',')) {
    if (part.includes('-')) { const [a, b] = part.split('-').map(Number); for (let i = a; i <= b; i++) out.push(i); }
    else out.push(Number(part));
  }
  return out;
}
const args = process.argv.slice(2);
const o = { a: 'python3 agent.py', opponents: ['python3 agent.py'], seeds: parseSeeds('8001,8002'), sizes: [1, 2, 3, 4, 5, 6], parallel: 10, verbose: false };
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--a') o.a = args[++i];
  else if (k === '--opponents') o.opponents = args[++i].split(';;').filter(Boolean);
  else if (k === '--seeds') o.seeds = parseSeeds(args[++i]);
  else if (k === '--sizes') o.sizes = args[++i].split(',').map(Number);
  else if (k === '--parallel') o.parallel = +args[++i];
  else if (k === '--verbose') o.verbose = true;
}

async function main() {
  const jobs = [];
  for (const opp of o.opponents) {
    for (const seed of o.seeds) {
      for (const n of o.sizes) {
        for (const seat of [0, 1]) jobs.push({ opp, seed, n, seat });
      }
    }
  }
  const perOpp = {};
  for (const opp of o.opponents) perOpp[opp] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, games: 0, perSize: {} };
  for (const opp of o.opponents) for (const n of o.sizes) perOpp[opp].perSize[n] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, games: 0 };
  let idx = 0;
  const errors = [];
  async function worker() {
    while (true) {
      const j = jobs[idx++];
      if (!j) return;
      const p0 = j.seat === 0 ? o.a : j.opp;
      const p1 = j.seat === 0 ? j.opp : o.a;
      let g;
      try { g = await playGame({ seed: j.seed, teamSize: j.n, p0, p1 }); }
      catch (e) { errors.push(String(e)); continue; }
      const gf = j.seat === 0 ? g.score[0] : g.score[1];
      const ga = j.seat === 0 ? g.score[1] : g.score[0];
      const res = gf > ga ? 'W' : (gf === ga ? 'D' : 'L');
      const rec = perOpp[j.opp]; const rs = rec.perSize[j.n];
      rec.games++; rec.gf += gf; rec.ga += ga; rs.games++; rs.gf += gf; rs.ga += ga;
      if (res === 'W') { rec.w++; rs.w++; } else if (res === 'D') { rec.d++; rs.d++; } else { rec.l++; rs.l++; }
      if (o.verbose) console.log(`opp=${j.opp} seed=${j.seed} n=${j.n} seat=${j.seat} ${gf}:${ga} ${res} (${g.reason}) f=${g.frame}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(o.parallel, jobs.length) }, worker));
  if (errors.length) console.log('ERRORS', errors.length, errors.slice(0, 2));
  let W = 0, D = 0, L = 0, GF = 0, GA = 0;
  for (const opp of o.opponents) {
    const r = perOpp[opp];
    W += r.w; D += r.d; L += r.l; GF += r.gf; GA += r.ga;
    const sz = o.sizes.map(n => { const s = r.perSize[n]; return `${n}:${s.w}/${s.d}/${s.l} ${s.gf}-${s.ga}`; }).join('  ');
    console.log(`OPP ${opp}\n    ${r.w}W ${r.d}D ${r.l}L  gf=${r.gf} ga=${r.ga} gd=${r.gf - r.ga}  | ${sz}`);
  }
  console.log(`TOTAL A=${o.a}: ${W}W ${D}D ${L}L  gf=${GF} ga=${GA} gd=${GF - GA}  games=${jobs.length}`);
}
main().catch(e => { console.error(e); process.exit(1); });
