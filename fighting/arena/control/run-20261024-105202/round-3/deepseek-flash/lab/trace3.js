// node trace3.js <myTeam> <oppSpec> <oppTeam> <seed> <fLo> <fHi>
const path = require('path');
const { makeProc, playMatch } = require('./harness.js');
const sim = require('./simulation.patched.js');
const WS = path.resolve(__dirname, '..');
const PY = process.env.PY || 'python';
const myTeam = (process.argv[2] || 'kestrel,vex,aegis').split(',');
const oppSpec = (process.argv[3] || 'py:bot.py:smart').split(':');
const oppTeam = (process.argv[4] || 'torv,nyx,sable').split(',');
const seed = parseInt(process.argv[5] || '100', 10);
const fLo = parseInt(process.argv[6] || '560', 10);
const fHi = parseInt(process.argv[7] || '640', 10);

const origStep = sim.step;
sim.step = function (g, dt) {
  const r = origStep(g, dt);
  if (g.frames >= fLo && g.frames <= fHi) {
    const f = g.fighters.map(x => `${x.char}@${x.x.toFixed(0)} hp${Math.round(x.hp)} ${x.state}${x.move ? '[' + x.move.name + ' f' + x.move.frame + ' hd' + x.move.hitsDone + '/' + x.move.hitsConsumed + ']' : ''}`);
    console.log(`f${String(g.frames).padStart(5)} hs${g.hitstop} | ${f.join('  ||  ')}`);
  }
  return r;
};
async function main() {
  const a = makeProc(PY, [path.join(WS, 'agent.py')], WS);
  const b = makeProc(PY, [path.join(__dirname, oppSpec[1]), ...oppSpec.slice(2)], __dirname);
  const r = await playMatch(a, b, myTeam, oppTeam, seed);
  a.kill(); b.kill();
  console.log('winner', r.g.winner, 'reason', r.g.reason);
}
main();
