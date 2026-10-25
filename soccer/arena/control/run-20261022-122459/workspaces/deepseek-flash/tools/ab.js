'use strict';
/* Offline A/B harness: plays A vs B, alternating seats, and aggregates from A's
 * perspective. Not part of the submission. */
const { playGame } = require('./harness');

function parse(argv) {
  const o = { a: 'python3 tools/agent_round1.py', b: 'bot:balanced', seeds: [1401], sizes: [1, 2, 3], quiet: false, trail: 0, start: 0 };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--a') o.a = argv[++i];
    else if (k === '--b') o.b = argv[++i];
    else if (k === '--seed') o.seeds = argv[++i].split(',').map(Number);
    else if (k === '--sizes') o.sizes = argv[++i].split(',').map(Number);
    else if (k === '--trail') o.trail = +argv[++i];
    else if (k === '--start') o.start = +argv[++i];
    else if (k === '--quiet') o.quiet = true;
  }
  return o;
}

async function main() {
  const o = parse(process.argv.slice(2));
  let aw = 0, ad = 0, al = 0, agf = 0, aga = 0, games = 0;
  const perSize = {};
  for (const n of o.sizes) {
    perSize[n] = { w: 0, d: 0, l: 0, gf: 0, ga: 0, games: 0 };
  }
  for (const seed of o.seeds) {
    for (const n of o.sizes) {
      for (const seat of [0, 1]) {
        const p0 = seat === 0 ? o.a : o.b;
        const p1 = seat === 0 ? o.b : o.a;
        const handicap = o.trail ? (seat === 0 ? [0, o.trail] : [o.trail, 0]) : null;
        const g = await playGame({ seed, teamSize: n, p0, p1, handicap, startFrame: o.start });
        const aGoals = seat === 0 ? g.score[0] : g.score[1];
        const bGoals = seat === 0 ? g.score[1] : g.score[0];
        const gf = aGoals, ga = bGoals;
        const res = gf > ga ? 'W' : (gf === ga ? 'D' : 'L');
        games++; agf += gf; aga += ga;
        const s = perSize[n]; s.games++; s.gf += gf; s.ga += ga;
        if (res === 'W') { aw++; s.w++; } else if (res === 'D') { ad++; s.d++; } else { al++; s.l++; }
        if (!o.quiet) {
          console.log(`seed=${seed} n=${n} A_seat=${seat} ${gf}:${ga} ${res} winner=${g.winner} (${g.reason}) frames=${g.frame}`);
        }
      }
    }
  }
  const fmt = (s) => `${s.w}/${s.d}/${s.l} gf=${s.gf} ga=${s.ga} gd=${s.gf - s.ga} (${s.games}g)`;
  console.log(`A=${o.a} vs B=${o.b}`);
  for (const n of o.sizes) console.log(`  n=${n}: ${fmt(perSize[n])}`);
  console.log(`TOTAL: ${aw}W ${ad}D ${al}L gf=${agf} ga=${aga} gd=${agf - aga} games=${games}`);
}

main().catch(e => { console.error(e); process.exit(1); });
