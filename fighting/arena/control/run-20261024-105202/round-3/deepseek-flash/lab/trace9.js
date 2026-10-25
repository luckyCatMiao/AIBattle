// node trace4.js <myTeam> <oppSpec> <oppTeam> <seed> <fLo> <fHi>
// 自建对局循环，便于逐帧观测。
const path = require('path');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');
const cat = require('./catalog.patched.js');
const WS = path.resolve(__dirname, '..');
const PY = process.env.PY || 'python';
const myTeam = (process.argv[2] || 'kestrel,vex,aegis').split(',');
const oppSpec = (process.argv[3] || 'py:bot.py:smart').split(':');
const oppTeam = (process.argv[4] || 'torv,nyx,sable').split(',');
const seed = parseInt(process.argv[5] || '100', 10);
const fLo = parseInt(process.argv[6] || '560', 10);
const fHi = parseInt(process.argv[7] || '640', 10);
const SWAP = process.argv[8] === 'swap';

function makeProc(cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = ''; const waiters = [];
  p.stdout.on('data', (d) => { buf += d.toString(); let i;
    while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(l); } });
  p.stderr.on('data', () => {});
  return { send(line) { return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 5000);
      waiters.push((l) => { clearTimeout(t); res(l); }); p.stdin.write(line + '\n'); }); },
    kill() { try { p.kill(); } catch (e) {} } };
}
function normalize(list) { const o = []; for (let i = 0; i < 15; i++) o.push(list[i] === undefined ? { dir: 'N', btn: null } : sim.normalizeInput(list[i])); return o; }

async function main() {
  const g = sim.createMatch({ id: 'm', players: SWAP ? [{ name: 'A', kind: 'api', team: oppTeam }, { name: 'B', kind: 'api', team: myTeam }] : [{ name: 'A', kind: 'api', team: myTeam }, { name: 'B', kind: 'api', team: oppTeam }], seed });
  const mine = makeProc(PY, [path.join(WS, 'agent.py')], WS);
  const theirs = makeProc(PY, [path.join(__dirname, oppSpec[1]), ...oppSpec.slice(2)], __dirname);
  const procs = SWAP ? [theirs, mine] : [mine, theirs];
  let w = 0;
  while (g.status === 'playing' && w < 3000) {
    const reqs = [];
    for (let o = 0; o < 2; o++) {
      const snap = sim.snapshot(g, o);
      snap.catalog = { rules: cat.rules, characters: snap.catalog };
      reqs.push(procs[o].send(JSON.stringify(snap)));
    }
    const lines = await Promise.all(reqs);
    const notes = lines.map(l => (JSON.parse(l).note) || '');
    const ins = lines.map(l => normalize(JSON.parse(l).inputs));
    const before = g.frames;
    sim.advanceWindow(g, ins);
    // 打印窗口内关键帧
    if (g.frames >= fLo - 14 && before <= fHi) {
      for (let fr = before + 1; fr <= g.frames; fr++) {
        if (fr >= fLo && fr <= fHi) {
          // 重新计算：无法回看，改成窗口开始时快照
        }
      }
      const f = g.fighters.map((x,i) => (i===0&&SWAP?'OP':'ME')+(i===1&&!SWAP?'OP':'ME')+`${x.char}@${x.x.toFixed(0)} hp${Math.round(x.hp)} mt${Math.round(x.meter)} ${x.state}${x.move ? '[' + x.move.name + ' f' + x.move.frame + ']' : ''}`);
      if ((notes[SWAP?1:0]||'').indexOf('err') >= 0) console.log('AGENTERR at f'+g.frames);
      console.log(`W${w} f${g.frames} dx${Math.abs(g.fighters[0].x-g.fighters[1].x).toFixed(0)} | ${f.join('  ||  ')} | ME:${SWAP?notes[1]:notes[0]} OP:${SWAP?notes[0]:notes[1]}`);
    }
    w++;
  }
  procs.forEach(p => p.kill());
  console.log('winner', g.winner, 'reason', g.reason);
}
main();
