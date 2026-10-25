// 真实裁判形状的评测台：观察中【不含 catalog】（与第 1 轮实际裁判一致），
// 我方是在独立进程里跑的 agent.py，对手是进程内的 SolClone（可带 seed 抖动）。
// 用法: node duel_clone.js <mySeat 0|1> <seed> <myTeam> [oppTeam] [optsJSON] [agentFile]
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');
const { SolClone } = require('./solclone.js');

const mySeat = Number(process.argv[2] || 0);
const seed = Number(process.argv[3] || 1);
const myTeam = (process.argv[4] || 'vex,kestrel,aegis').split(',');
const oppTeam = (process.argv[5] || 'kestrel,aegis,vex').split(',');
let opts = {};
const rawOpt = process.argv[6] || '{}';
try {
  if (rawOpt.trim().startsWith('{')) opts = JSON.parse(rawOpt);
  else for (const kv of rawOpt.split(',')) { const [k, v] = kv.split('='); if (k && v !== undefined) opts[k] = Number(v); }
} catch (e) {}
const agentFile = process.argv[7] || 'agent.py';
const teams = mySeat === 0 ? [myTeam, oppTeam] : [oppTeam, myTeam];
const g = sim.createMatch({
  id: 'duelc-' + seed,
  players: [{ name: 'P0', kind: 'api', team: teams[0] }, { name: 'P1', kind: 'api', team: teams[1] }],
  seed,
});

function startAgent() {
  const p = spawn(process.env.PY || 'python', [path.resolve(__dirname, '..', agentFile)], { cwd: path.resolve(__dirname, '..') });
  let buf = ''; const waiters = [];
  p.stdout.on('data', c => {
    buf += c.toString(); let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const l = buf.slice(0, i); buf = buf.slice(i + 1);
      const w = waiters.shift(); if (w) w(l);
    }
  });
  p.stderr.on('data', c => process.stderr.write('[agent] ' + c));
  return { ask(o) { return new Promise(r => { waiters.push(r); p.stdin.write(JSON.stringify(o) + '\n'); }); }, kill() { try { p.kill(); } catch (e) {} } };
}

(async () => {
  const a = startAgent();
  const bot = new SolClone(1 - mySeat, seed, opts);
  const t0 = Date.now();
  let windows = 0;
  while (g.status === 'playing' && windows < 4000) {
    const obs = sim.snapshot(g, mySeat);
    delete obs.catalog;                      // 真实裁判 observe() 的行为
    obs.decisionWindows = true; obs.framesPerWindow = 15; obs.yourTeam = teams[mySeat];
    let out;
    try { out = JSON.parse(await a.ask(obs)); } catch (e) { out = { inputs: [], note: 'parse-error' }; }
    const mine = (out.inputs || []).slice(0, 15).map(x => ({ dir: x.dir || 'N', btn: x.btn || null }));
    while (mine.length < 15) mine.push({ dir: 'N', btn: null });
    const theirs = bot.win(g);
    sim.advanceWindow(g, mySeat === 0 ? [mine, theirs] : [theirs, mine]);
    windows++;
  }
  a.kill();
  const me = g.players[mySeat], op = g.players[1 - mySeat];
  const win = g.winner === mySeat;
  console.log(JSON.stringify({
    seat: mySeat, seed, winner: g.winner === null ? 'draw' : (win ? 'ME' : 'OPP'), reason: g.reason,
    simSeconds: +(g.tick / 20).toFixed(1), wallSeconds: +((Date.now() - t0) / 1000).toFixed(1), windows,
    rounds: g.roundLog.map(r => r.winner === me.name ? 'W' : (r.winner ? 'L' : 'D')).join(''),
    roundsDetail: g.roundLog,
    myDmg: me.damageDealt, myHits: me.hits, myBlocks: me.blocks, oppDmg: op.damageDealt, oppHits: op.hits,
    final: g.fighters.map(f => f.char + ':' + Math.round(f.hp)).join(','),
  }));
  process.exit(0);
})();
