// 统计 SolClone 在对局中的出招分布 / 频率，与真实录像对比（验证陪练的保真度）。
const path = require('path');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');
const { SolClone } = require('./solclone.js');
const mySeat = Number(process.argv[2] || 0);
const seed = Number(process.argv[3] || 1);
const myTeam = (process.argv[4] || 'vex,kestrel,aegis').split(',');
const oppTeam = (process.argv[5] || 'kestrel,aegis,vex').split(',');
let opts = {}; try { opts = JSON.parse(process.argv[6] || '{}'); } catch (e) {}
const teams = mySeat === 0 ? [myTeam, oppTeam] : [oppTeam, myTeam];
const g = sim.createMatch({ id: 's', players: [{ name: 'P0', kind: 'api', team: teams[0] }, { name: 'P1', kind: 'api', team: teams[1] }], seed });
const p = spawn(process.env.PY || 'python', [path.resolve(__dirname, '..', 'agent.py')], { cwd: path.resolve(__dirname, '..') });
let buf = ''; const waiters = [];
p.stdout.on('data', c => { buf += c.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(l); } });
p.stderr.on('data', () => {});
const ask = o => new Promise(r => { waiters.push(r); p.stdin.write(JSON.stringify(o) + '\n'); });
(async () => {
  const bot = new SolClone(1 - mySeat, seed, opts);
  const seen = new Set(); const moves = {}; let jumps = 0, supers = 0, wins = 0, frames = 0;
  while (g.status === 'playing' && wins < 3000) {
    const obs = sim.snapshot(g, mySeat); delete obs.catalog; obs.decisionWindows = true;
    let out; try { out = JSON.parse(await ask(obs)); } catch (e) { out = { inputs: [] }; }
    const mine = (out.inputs || []).slice(0, 15); while (mine.length < 15) mine.push({ dir: 'N', btn: null });
    sim.advanceWindow(g, mySeat === 0 ? [mine, bot.win(g)] : [bot.win(g), mine]);
    for (const e of g.events) {
      if (seen.has(e.id)) continue; seen.add(e.id);
      if (e.owner === 1 - mySeat) {
        if (e.type === 'move') moves[e.name] = (moves[e.name] || 0) + 1;
        if (e.type === 'jump') jumps++;
        if (e.type === 'super') supers++;
      }
    }
    wins++;
  }
  p.kill(); frames = g.frames;
  console.log(JSON.stringify({ frames, moves, jumps, supers, per1000: +(Object.values(moves).reduce((a, b) => a + b, 0) / frames * 1000).toFixed(1), winner: g.winner, rounds: g.roundLog.map(r => r.winnerChar + '>' + r.loserChar) }, null, 1));
  process.exit(0);
})();
