'use strict';
/* 并行对战台：一次跑很多局，输出汇总 + JSONL 明细。
 * node dev3/batch.js --me agent.py --opp py:dev2/opp_search.py --sizes 1,2,3,4,5,6 \
 *   --seeds 1-10 --swap both --jobs 10 --out dev3/runs/x.jsonl
 * spec:  <file.py>（相对工作区）或 py:<file.py> 或 JS 机器人名（dev/bots*.js, dev2/opps.js）
 */
const fs = require('fs');
const path = require('path');
const sim = require('../simulation.js');
const { PyAgent } = require('../dev/arena.js');
const bots = Object.assign({}, require('../dev/bots.js'), require('../dev/bots2.js'), require('../dev2/opps.js'));

const PY = process.env.PYEXE || 'python';
const ROOT = path.resolve(__dirname, '..');

function arg(name, def) {
  const i = process.argv.indexOf('--' + name);
  return i >= 0 ? process.argv[i + 1] : def;
}

function parseSeeds(s) {
  if (!s) return [1];
  if (s.includes('-')) { const [a, b] = s.split('-').map(Number); const r = []; for (let i = a; i <= b; i++) r.push(i); return r; }
  return s.split(',').map(Number);
}

const ME = arg('me', 'agent.py');
const OPP = arg('opp', 'solid');
const SEEDS = parseSeeds(arg('seeds', '1-6'));
const SIZES = arg('sizes', '0').split(',').map(Number);
const SWAP = arg('swap', 'both');
const JOBS = Number(arg('jobs', '8'));
const OUT = arg('out', '');
const VERBOSE = process.argv.includes('-v');

function mk(spec, tag) {
  if (spec.startsWith('py:')) {
    const ag = new PyAgent(PY, spec.slice(3), ROOT, tag);
    return { fn: async v => JSON.parse(await ag.ask(v)).inputs, ag };
  }
  if (spec.endsWith('.py')) {
    const ag = new PyAgent(PY, spec, ROOT, tag);
    return { fn: async v => JSON.parse(await ag.ask(v)).inputs, ag };
  }
  const f = bots[spec];
  if (!f) throw new Error('unknown bot ' + spec);
  return { fn: async v => f(v), ag: null };
}

async function runOne(job) {
  const { seed, size, swap } = job;
  const me = mk(ME, 'me');
  const op = mk(OPP, 'opp');
  const players = [{ name: 'X', kind: 'api' }, { name: 'Y', kind: 'api' }];
  const g = sim.createMatch({ id: 'm', players, seed, teamSize: size || undefined });
  const goals = [], fouls = [], saves = [], kicks = [];
  const meTeam = swap ? 1 : 0;
  let wi = 0, err = null;
  const t0 = Date.now();
  try {
    while (g.status === 'playing' && wi < 240) {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [w0, w1] = await Promise.all([swap ? op.fn(v0) : me.fn(v0), swap ? me.fn(v1) : op.fn(v1)]);
      const A = sim.submitWindow(g, 0, (w0 && w0.inputs) || w0);
      const B = sim.submitWindow(g, 1, (w1 && w1.inputs) || w1);
      sim.advanceWindow(g, [A, B]);
      wi++;
    }
  } catch (e) {
    err = e.message + ' | ' + (me.err || '').slice(-300) + ' | ' + ((op.ag && op.ag.err) || '').slice(-300);
  }
  for (const e of g.events) {
    if (e.type === 'goal') goals.push({ f: e.frame, team: e.team, own: !!e.ownGoal, scorer: e.scorer });
    if (e.type === 'foul') fouls.push({ f: e.frame, team: e.team });
    if (e.type === 'save') saves.push({ f: e.frame, team: e.team });
    if (e.type === 'kick') kicks.push({ f: e.frame, team: e.team, unit: e.unit, x: e.x, y: e.y, a: e.angle });
  }
  // 每个进球前最后一次起脚
  const goalKicks = goals.map(go => {
    const prev = kicks.filter(k => k.f < go.f).pop() || null;
    return { goalTeam: go.team, own: go.own, f: go.f, shot: prev };
  });
  const res = {
    seed, n: g.teamSize, swap, meTeam,
    score: [g.score[0], g.score[1]],
    mine: swap ? g.score[1] : g.score[0],
    other: swap ? g.score[0] : g.score[1],
    reason: g.reason, frames: g.frame, ms: Date.now() - t0,
    goals, fouls, saves, kicks, goalKicks, err,
    stats: g.stats,
  };
  if (me.ag) me.ag.kill();
  if (op.ag) op.ag.kill();
  return res;
}

(async () => {
  const jobs = [];
  const swaps = SWAP === 'both' ? [false, true] : [SWAP === 'true'];
  for (const size of SIZES) for (const seed of SEEDS) for (const swap of swaps) jobs.push({ seed, size, swap });
  const results = [];
  let idx = 0;
  async function worker() {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      let r;
      try { r = await runOne(j); } catch (e) { r = { seed: j.seed, n: j.size, swap: j.swap, mine: 0, other: 0, err: String(e.message || e) }; }
      results.push(r);
      if (VERBOSE) console.log(`seed=${r.seed} n=${r.n} swap=${r.swap ? 1 : 0} ${r.mine}:${r.other} ${r.reason} err=${r.err || ''}`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, worker));
  // summary
  const per = {};
  let W = 0, L = 0, D = 0, GF = 0, GA = 0, errs = 0, og = 0;
  for (const r of results.sort((a, b) => (a.n - b.n) || (a.seed - b.seed) || (a.swap - b.swap))) {
    const k = r.n;
    per[k] = per[k] || { w: 0, l: 0, d: 0, gf: 0, ga: 0 };
    GF += r.mine; GA += r.other;
    if (r.err) errs++;
    og += (r.goals || []).filter(x => x.own && x.team !== r.meTeam).length;
    if (r.mine > r.other) { W++; per[k].w++; } else if (r.mine < r.other) { L++; per[k].l++; } else { D++; per[k].d++; }
    per[k].gf += r.mine; per[k].ga += r.other;
  }
  const tot = W + L + D;
  console.log(`SUMMARY ${W} ${L} ${D} ${GF} ${GA} ${errs}`);
  console.log(`\n[${path.basename(ME)} vs ${OPP}] W${W} L${L} D${D}  胜率 ${(100 * W / Math.max(1, tot)).toFixed(1)}%  进${GF} 失${GA}  乌龙送礼${og} err=${errs}`);
  console.log('   perSize: ' + Object.entries(per).map(([k, v]) => `${k}:${v.w}-${v.l}-${v.d} g${v.gf}:${v.ga}`).join('  '));
  if (OUT) {
    fs.mkdirSync(path.dirname(path.resolve(ROOT, OUT)), { recursive: true });
    fs.writeFileSync(path.resolve(ROOT, OUT), results.map(r => JSON.stringify(r)).join('\n') + '\n');
    console.log('   wrote ' + OUT);
  }
})();
