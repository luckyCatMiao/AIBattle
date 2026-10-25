// 跑 N 场自测：agent.py vs 各种假想对手，统计胜率。
const path = require('path');
const { makeProc, playMatch } = require('./harness.js');
const sim = require('./simulation.patched.js');

const WS = path.resolve(__dirname, '..');
const PY = process.env.PY || 'python';

function teamFor(name) {
  return name.split(',');
}

async function one(seed, teamA, oppStyle, oppTeam, seatSwap) {
  const a = makeProc(PY, [path.join(WS, 'agent.py')], WS);
  const b = makeProc(PY, [path.join(__dirname, 'bot.py'), oppStyle], __dirname);
  a.proc.stderr.on('data', d => process.stderr.write('AERR:' + d));
  b.proc.stderr.on('data', d => process.stderr.write('BERR:' + d));
  const tA = seatSwap ? teamA : teamA;
  let r;
  try {
    r = await playMatch(a, b, teamA, teamFor(oppTeam), seed);
  } finally {
    a.kill(); b.kill();
  }
  const g = r.g;
  return {
    winner: g.winner, reason: g.reason, errors: r.errors,
    rounds: g.roundLog.length, frames: g.frames,
    log: g.roundLog.map(x => `${x.winnerChar}(${x.winnerHp}) beat ${x.loserChar}(${x.loserHp}) ${x.reason} in ${x.frames}f`),
    aWins: g.players[0].wins, bWins: g.players[1].wins,
    aScore: g.players[0].damageDealt, bScore: g.players[1].damageDealt,
  };
}

async function main() {
  const teamA = teamFor(process.argv[2] || 'vex,kestrel,aegis');
  const styles = (process.argv[3] || 'rush,turtle,zone,random,smart').split(',');
  const n = parseInt(process.argv[4] || '4', 10);
  const oppTeams = ['kestrel,vex,aegis', 'aegis,vex,kestrel', 'torv,nyx,sable', 'sable,nyx,torv'];
  let tot = 0, win = 0;
  for (const st of styles) {
    let w = 0, t = 0, errs = 0;
    const details = [];
    for (let i = 0; i < n; i++) {
      const oppTeam = oppTeams[i % oppTeams.length];
      const r = await one(100 + i * 37, teamA, st, oppTeam, false);
      t++;
      if (r.errors) errs++;
      if (r.winner === 0) w++;
      details.push(`${r.winner === 0 ? 'W' : (r.winner === null ? 'D' : 'L')}(${r.frames}f ${r.aWins}-${r.bWins})`);
    }
    tot += t; win += w;
    console.log(`${st.padEnd(8)} win ${w}/${t}  ${details.join(' ')}`);
  }
  console.log(`TOTAL ${win}/${tot} = ${(100 * win / tot).toFixed(1)}%`);
}

main();
