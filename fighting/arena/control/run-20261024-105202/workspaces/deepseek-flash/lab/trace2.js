// node trace2.js <myTeam> <oppSpec> <oppTeam> <seed> [swap]
const path = require('path');
const { makeProc, playMatch } = require('./harness.js');
const WS = path.resolve(__dirname, '..');
const PY = process.env.PY || 'python';
const myTeam = (process.argv[2] || 'kestrel,vex,aegis').split(',');
const oppSpec = (process.argv[3] || 'py:bot.py:smart').split(':');
const oppTeam = (process.argv[4] || 'torv,nyx,sable').split(',');
const seed = parseInt(process.argv[5] || '100', 10);
const swap = process.argv[6] === 'swap';
async function main() {
  const a = makeProc(PY, [path.join(WS, 'agent.py')], WS);
  const b = makeProc(PY, [path.join(__dirname, oppSpec[1]), ...oppSpec.slice(2)], __dirname);
  a.proc.stderr.on('data', d => process.stderr.write('AERR:' + d));
  b.proc.stderr.on('data', d => process.stderr.write('BERR:' + d));
  const r = swap ? await playMatch(b, a, oppTeam, myTeam, seed) : await playMatch(a, b, myTeam, oppTeam, seed);
  a.kill(); b.kill();
  const g = r.g; const myIdx = swap ? 1 : 0;
  console.log('winner', g.winner, 'myIdx', myIdx, 'frames', g.frames, 'reason', g.reason);
  console.log('rounds:', JSON.stringify(g.roundLog));
  const ev = g.events;
  // print events with frame, filtering to interesting
  let last = -100;
  for (const e of ev) {
    if (e.type === 'hit' || e.type === 'block' || e.type === 'move' || e.type === 'round' || e.type === 'roundEnd' || e.type === 'ko' || e.type === 'guardBreak' || e.type === 'super') {
      const who = e.owner === myIdx ? 'ME' : 'OP';
      console.log(`f${String(e.frame).padStart(5)} ${e.type.padEnd(10)} ${who} ${e.text || ''} ${e.damage || ''}`);
    }
  }
}
main();
