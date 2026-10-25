'use strict';
// 批量对战：node tools/bench.js --agent "python3 /workspace/agent.py" --opp "python3 /workspace/agents/baseline.py" --seeds 1-12 --sides both
const { spawn } = require('child_process');
function arg(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }
const agent = arg('agent', 'python3 /workspace/agent.py');
const opp = arg('opp', 'python3 /workspace/agents/baseline.py');
const seedsArg = arg('seeds', '1-12');
const sides = arg('sides', 'both');
let seeds = [];
if (seedsArg.includes('-')) { const [a, b] = seedsArg.split('-').map(Number); for (let s = a; s <= b; s++) seeds.push(s); }
else seeds = seedsArg.split(',').map(Number);
const teamSizeArg = arg('teamSize', null);
const par = Number(arg('par', '4'));
function runOne(seed, side) {
  return new Promise(res => {
    const a = side === 'a' ? agent : opp, b = side === 'a' ? opp : agent;
    const args = ['/workspace/tools/match.js', '--seed', String(seed), '--a', a, '--b', b];
    if (teamSizeArg) args.push('--teamSize', teamSizeArg);
    const p = spawn('node', args);
    let out = '', err = '';
    p.stdout.on('data', d => out += d); p.stderr.on('data', d => err += d);
    p.on('close', () => {
      try { const r = JSON.parse(out.trim().split('\n').pop()); r.side = side; res(r); }
      catch (e) { res({ seed, side, error: 'badout', raw: out.slice(0, 200), err: err.slice(0, 300) }); }
    });
  });
}
(async () => {
  const jobs = [];
  for (const s of seeds) for (const side of (sides === 'both' ? ['a', 'b'] : [sides])) jobs.push([s, side]);
  const results = [];
  let idx = 0;
  async function worker() { while (idx < jobs.length) { const [s, side] = jobs[idx++]; results.push(await runOne(s, side)); } }
  await Promise.all(Array.from({ length: Math.min(par, jobs.length) }, worker));
  results.sort((x, y) => x.seed - y.seed || x.side.localeCompare(y.side));
  let gf = 0, ga = 0, w = 0, d = 0, l = 0;
  for (const r of results) {
    if (r.error) { console.log('ERR', JSON.stringify(r)); continue; }
    const myGoals = r.side === 'a' ? r.score[0] : r.score[1];
    const oppGoals = r.side === 'a' ? r.score[1] : r.score[0];
    gf += myGoals; ga += oppGoals;
    if (myGoals > oppGoals) w++; else if (myGoals === oppGoals) d++; else l++;
    console.log(`seed=${r.seed} n=${r.teamSize} side=${r.side} ${myGoals}:${oppGoals} ${r.reason}${r.errors && (r.errors.a.length || r.errors.b.length) ? ' ERRORS ' + JSON.stringify(r.errors) : ''} goals=${JSON.stringify(r.goals)}`);
  }
  console.log(`TOTAL W${w} D${d} L${l}  GF${gf} GA${ga}  (${results.length} games)`);
})();
