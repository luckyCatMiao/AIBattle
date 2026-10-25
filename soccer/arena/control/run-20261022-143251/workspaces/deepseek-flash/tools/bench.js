'use strict';
/* Quick benchmark: one agent vs a list of sparring opponents over n=1..6.
 * Usage: node tools/bench.js --agent "python agent_lab.py" [--ns 1-6]
 *        [--seeds 5001-5003] [--opponents "bot:pro,bot:pro?shootRange=20,python agent.py"]
 * Prints one line per (opponent, n): W-D-L and goals for/against from the
 * agent's seat, alternating seats over the seed list.
 */
const { playGame } = require('./harness.js');

function parseRange(s) {
  const out = [];
  for (const part of String(s).split(',')) {
    if (part.includes('-')) {
      const [a, b] = part.split('-').map(Number);
      for (let i = a; i <= b; i++) out.push(i);
    } else if (part) out.push(Number(part));
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = {
    agent: 'python agent_lab.py',
    ns: '1-6',
    seeds: '5001-5003',
    opponents: 'bot:pro,bot:pro?shootRange=22&laneClear=0.05,python agent.py',
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--agent') opt.agent = args[++i];
    else if (args[i] === '--ns') opt.ns = args[++i];
    else if (args[i] === '--seeds') opt.seeds = args[++i];
    else if (args[i] === '--opponents') opt.opponents = args[++i];
  }
  const seeds = parseRange(opt.seeds);
  const ns = parseRange(opt.ns);
  const opps = opt.opponents.split('|').filter(Boolean);
  let totW = 0, totD = 0, totL = 0, totGF = 0, totGA = 0, totG = 0;
  for (const opp of opps) {
    for (const n of ns) {
      let w = 0, d = 0, l = 0, gf = 0, ga = 0;
      for (const seed of seeds) {
        for (const seat of [0, 1]) {
          const p0 = seat === 0 ? opt.agent : opp;
          const p1 = seat === 0 ? opp : opt.agent;
          const g = await playGame({ seed, teamSize: n, p0, p1 });
          const mine = g.score[seat], theirs = g.score[1 - seat];
          gf += mine; ga += theirs;
          if (mine > theirs) w++; else if (mine < theirs) l++; else d++;
        }
      }
      totW += w; totD += d; totL += l; totGF += gf; totGA += ga; totG += w + d + l;
      console.log(`${String(n).padStart(2)}  vs ${opp.slice(0, 46).padEnd(46)} W-D-L ${w}-${d}-${l}  GF-GA ${gf}-${ga}`);
    }
  }
  console.log(`TOTAL games=${totG} W-D-L ${totW}-${totD}-${totL} GF-GA ${totGF}-${totGA}`);
}

main().catch(e => { console.error(e); process.exit(1); });
