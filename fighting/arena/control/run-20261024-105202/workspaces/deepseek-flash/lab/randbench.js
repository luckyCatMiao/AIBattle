// node randbench.js <myAgent> <myTeam> [seeds] [opp]
// 随机化对手评测：每个 seed 派生一个不同打法的对手，跑满 6 队 × 2 席位。
const path = require('path');
const { makeProc, playMatch } = require('./harness.js');
const WS = path.resolve(__dirname, '..');
const PY = process.env.PY || 'python';
const MY = process.argv[2] || 'agent.py';
const myTeam = (process.argv[3] || 'vex,kestrel,aegis').split(',');
const NSEED = parseInt(process.argv[4] || '8', 10);
const OPP = process.argv[5] || 'randbot.py';
const CONC = parseInt(process.env.CONC || '8', 10);

const TEAMS = [
  ['torv', 'nyx', 'sable'], ['kestrel', 'vex', 'aegis'], ['aegis', 'torv', 'nyx'],
  ['nyx', 'sable', 'vex'], ['sable', 'kestrel', 'torv'], ['vex', 'nyx', 'torv'],
];

async function one(seed, oppTeam, swap) {
  const a = makeProc(PY, [path.join(WS, MY)], WS);
  const b = makeProc(PY, [path.join(__dirname, OPP)], __dirname);
  let r;
  try { r = swap ? await playMatch(b, a, oppTeam, myTeam, seed) : await playMatch(a, b, myTeam, oppTeam, seed); }
  finally { a.kill(); b.kill(); }
  const g = r.g; const myIdx = swap ? 1 : 0;
  return { win: (g.winner === myIdx) ? 1 : (g.winner === null ? 0.5 : 0), err: r.errors, frames: g.frames,
    dmg: g.players[myIdx].damageDealt, taken: g.players[1 - myIdx].damageDealt };
}

async function main() {
  const jobs = [];
  for (let s = 0; s < NSEED; s++)
    for (const t of TEAMS) for (const swap of [false, true])
      jobs.push({ seed: 1000 + s * 13, team: t, swap });
  let idx = 0, w = 0, t = 0, err = 0, f = 0, d = 0, tk = 0;
  const perTeam = {};
  async function worker() {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      const r = await one(j.seed, j.team, j.swap);
      w += r.win; t++; f += r.frames; d += r.dmg; tk += r.taken; if (r.err) err++;
      const k = j.team.join(',');
      perTeam[k] = perTeam[k] || { w: 0, t: 0 };
      perTeam[k].w += r.win; perTeam[k].t++;
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  for (const k of Object.keys(perTeam)) {
    const v = perTeam[k];
    console.log(`team ${k.padEnd(20)} ${v.w}/${v.t} ${(100 * v.w / v.t).toFixed(0)}%`);
  }
  console.log(`TOTAL ${w}/${t} = ${(100 * w / t).toFixed(1)}%  avgF=${Math.round(f / t)} dmg=${Math.round(d / t)}/${Math.round(tk / t)} err=${err}`);
}
main();
