// node detail.js <myAgent> <myTeam> <oppSpec> [seeds]
const path = require('path');
const { makeProc, playMatch } = require('./harness.js');
const WS = path.resolve(__dirname, '..');
const PY = process.env.PY || 'python';
const MY = process.argv[2] || 'agent.py';
const myTeam = (process.argv[3] || 'vex,kestrel,aegis').split(',');
const oppSpec = (process.argv[4] || 'py:bot2.py:walk').split(':');
const TEAMS = [
  ['torv', 'nyx', 'sable'], ['kestrel', 'vex', 'aegis'], ['aegis', 'torv', 'nyx'],
  ['nyx', 'sable', 'vex'], ['sable', 'kestrel', 'torv'], ['vex', 'nyx', 'torv'],
];
async function one(seed, oppTeam, swap) {
  const a = makeProc(PY, [path.join(WS, MY)], WS);
  const b = makeProc(PY, [path.join(__dirname, oppSpec[1]), ...oppSpec.slice(2)], __dirname);
  let r;
  try { r = swap ? await playMatch(b, a, oppTeam, myTeam, seed) : await playMatch(a, b, myTeam, oppTeam, seed); }
  finally { a.kill(); b.kill(); }
  const g = r.g; const myIdx = swap ? 1 : 0;
  return { win: (g.winner === myIdx) ? 1 : (g.winner === null ? 0.5 : 0), err: r.errors, frames: g.frames,
    wins: g.players[myIdx].wins, dmg: g.players[myIdx].damageDealt, taken: g.players[1 - myIdx].damageDealt,
    rounds: g.roundLog.map(x => `${x.winnerChar}(hp${x.winnerHp})>${x.loserChar}(${x.frames}f)`).join(' ') };
}
async function main() {
  let w = 0, t = 0;
  for (const team of TEAMS) for (const swap of [false, true]) {
    const r = await one(100, team, swap);
    w += r.win; t++;
    console.log(`${swap ? 'seat1' : 'seat0'} opp=${team.join(',')} ${r.win === 1 ? 'W' : (r.win === 0.5 ? 'D' : 'L')} ${r.wins}win ${r.frames}f dmg${Math.round(r.dmg)}/${Math.round(r.taken)} | ${r.rounds}`);
  }
  console.log(`TOTAL ${w}/${t} = ${(100 * w / t).toFixed(1)}%`);
}
main();
