// 我方 agent.py（真实裁判观察：无 catalog） vs 进程内 SolBot（Kestrel 压制风格）。
// 用法: node duel_sol.js <我方席位0|1> [seed] [myTeam] [oppTeam]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');
const { SolBot } = require('./solbot.js');

const mySeat = Number(process.argv[2] || 0);
const seed = Number(process.argv[3] || 1);
const myTeam = (process.argv[4] || 'vex,kestrel,aegis').split(',');
const oppTeam = (process.argv[5] || 'kestrel,aegis,vex').split(',');
const agentFile = process.argv[6] || 'agent.py';
const teams = mySeat === 0 ? [myTeam, oppTeam] : [oppTeam, myTeam];
const g = sim.createMatch({
  id: 'duel-' + seed,
  players: [{ name: 'P0', kind: 'api', team: teams[0] }, { name: 'P1', kind: 'api', team: teams[1] }],
  seed,
});

function startAgent() {
  const p = spawn('python', [path.resolve(__dirname, '..', agentFile)], { cwd: path.resolve(__dirname, '..') });
  let buf = ''; const waiters = [];
  p.stdout.on('data', c => { buf += c.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(l); } });
  p.stderr.on('data', c => process.stderr.write('[agent] ' + c));
  return { ask(o) { return new Promise(r => { waiters.push(r); p.stdin.write(JSON.stringify(o) + '\n'); }); }, kill() { try { p.kill(); } catch (e) {} } };
}

const notes = new Map();
(async () => {
  const a = startAgent();
  const bot = new SolBot(1 - mySeat);
  const t0 = Date.now();
  let windows = 0;
  while (g.status === 'playing' && windows < 3000) {
    const obs = sim.snapshot(g, mySeat);
    delete obs.catalog;
    obs.decisionWindows = true; obs.framesPerWindow = 15; obs.yourTeam = teams[mySeat];
    const out = JSON.parse(await a.ask(obs));
    const mine = (out.inputs || []).slice(0, 15).map(x => ({ dir: x.dir || 'N', btn: x.btn || null }));
    while (mine.length < 15) mine.push({ dir: 'N', btn: null });
    notes.set(out.note, (notes.get(out.note) || 0) + 1);
    const theirs = bot.window(g);
    sim.advanceWindow(g, mySeat === 0 ? [mine, theirs] : [theirs, mine]);
    windows++;
  }
  a.kill();
  const me = g.players[mySeat], op = g.players[1 - mySeat];
  const win = g.winner === mySeat;
  console.log(JSON.stringify({
    seat: mySeat, seed, winner: g.winner === null ? 'draw' : (win ? 'ME' : 'OPP'), reason: g.reason,
    tick: g.tick, simSeconds: +(g.tick / 20).toFixed(2), wallSeconds: +((Date.now() - t0) / 1000).toFixed(2), windows,
    rounds: g.roundLog.map(r => r.winner === (mySeat === 0 ? 'P0' : 'P1') ? 'W' : (r.winner ? 'L' : 'D')).join(''),
    roundsDetail: g.roundLog,
    myDmg: me.damageDealt, myHits: me.hits, myBlocks: me.blocks, myScore: sim.score(g, me),
    oppDmg: op.damageDealt, oppHits: op.hits, oppBlocks: op.blocks, oppScore: sim.score(g, op),
    final: g.fighters.map(f => f.char + ':' + Math.round(f.hp)).join(','),
    topNotes: [...notes].sort((x, y) => y[1] - x[1]).slice(0, 12),
  }, null, 1));
  process.exit(0);
})();
