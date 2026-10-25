const path = require('path');
const { makeProc, playMatch } = require('./harness.js');
const WS = path.resolve(__dirname, '..');
const PY = process.env.PY || 'python';
const MY = process.argv[2] || 'agent.py';
const myTeam = (process.argv[3] || 'vex,kestrel,aegis').split(',');
const TEAMS = [['torv','nyx','sable'],['kestrel','vex','aegis'],['aegis','torv','nyx'],['nyx','sable','vex'],['sable','kestrel','torv'],['vex','nyx','torv']];
const OPPS = [['rush','bot.py','rush'],['turtle','bot.py','turtle'],['zone','bot.py','zone'],['random','bot.py','random'],['smart','bot.py','smart'],['block','bot2.py','block'],['blockdb','bot2.py','blockdb'],['walk','bot2.py','walk'],['super','bot2.py','super'],['old','old_agent.py']];
async function one(seed, opp, oppTeam, swap) {
  const a = makeProc(PY, [path.join(WS, MY)], WS);
  const b = makeProc(PY, [path.join(__dirname, opp[1]), ...opp.slice(2)], __dirname);
  let r; try { r = swap ? await playMatch(b, a, oppTeam, myTeam, seed) : await playMatch(a, b, myTeam, oppTeam, seed); } finally { a.kill(); b.kill(); }
  const g = r.g; const myIdx = swap ? 1 : 0;
  return { win: (g.winner === myIdx) ? 1 : (g.winner === null ? 0.5 : 0), err: r.errors };
}
(async () => {
  let s0w=0,s0t=0,s1w=0,s1t=0;
  for (const opp of OPPS) for (const t of TEAMS) for (const swap of [false,true]) {
    const r = await one(100, opp, t, swap);
    if (swap) { s1w += r.win; s1t++; } else { s0w += r.win; s0t++; }
  }
  console.log(`seat0 ${s0w}/${s0t} = ${(100*s0w/s0t).toFixed(1)}%   seat1 ${s1w}/${s1t} = ${(100*s1w/s1t).toFixed(1)}%   total ${(100*(s0w+s1w)/(s0t+s1t)).toFixed(1)}%`);
})();
