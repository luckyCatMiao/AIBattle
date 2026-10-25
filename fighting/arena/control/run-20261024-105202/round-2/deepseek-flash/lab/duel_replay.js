// 反事实对战：我方跑当前 agent.py，另一方直接复读录像里 Sol 的逐窗口输入。
// 用途：在「Sol 输入完全按录像」的假设下，衡量改动前后的第一局走势（不是对 Sol 真实策略的证明）。
const fs = require('fs'), zlib = require('zlib');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');
const file = process.argv[2];
const agentSeat = Number(process.argv[3] || 0); // 我方在录像中的席位
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const solSeat = 1 - agentSeat;
const g = sim.createMatch({
  id: d.id + '-cf',
  players: d.names.map((name, i) => ({ name, kind: 'api', team: d.teams[i] })),
  seed: d.seed,
});

function startAgent() {
  const p = spawn('python', ['agent.py'], { cwd: '..' });
  let buf = ''; const waiters = [];
  p.stdout.on('data', c => { buf += c.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(l); } });
  p.stderr.on('data', c => process.stderr.write('[agent] ' + c));
  return { ask(o) { return new Promise(r => { waiters.push(r); p.stdin.write(JSON.stringify(o) + '\n'); }); }, kill() { p.kill(); } };
}
const notes = new Map();
(async () => {
  const a = startAgent();
  let wi = 0;
  const roundEnds = [];
  while (g.status === 'playing' && wi < d.windows.length + 100) {
    const obs = sim.snapshot(g, agentSeat);
    delete obs.catalog;
    obs.decisionWindows = true; obs.framesPerWindow = 15; obs.yourTeam = d.teams[agentSeat];
    const out = JSON.parse(await a.ask(obs));
    const mine = (out.inputs || []).slice(0, 15).map(x => ({ dir: x.dir || 'N', btn: x.btn || null }));
    while (mine.length < 15) mine.push({ dir: 'N', btn: null });
    notes.set(out.note, (notes.get(out.note) || 1) + 1);
    const theirs = wi < d.windows.length ? d.windows[wi].inputs[solSeat] : Array.from({ length: 15 }, () => ({ dir: 'N', btn: null }));
    const before = g.round;
    const beforeLog = g.roundLog.length;
    sim.advanceWindow(g, agentSeat === 0 ? [mine, theirs] : [theirs, mine]);
    if (g.roundLog.length > beforeLog) roundEnds.push(g.roundLog[g.roundLog.length - 1]);
    wi++;
  }
  a.kill();
  const me = g.players[agentSeat], op = g.players[solSeat];
  console.log('===', d.id, 'agentSeat', agentSeat, '===');
  console.log('result:', g.status, 'winner', g.winner, 'reason', g.reason, 'tick', g.tick, 'seconds', (g.tick / 20).toFixed(2), 'windows', wi);
  console.log('rounds:', JSON.stringify(g.roundLog));
  console.log('agent dmgDealt', me.damageDealt, 'hits', me.hits, 'blocks', me.blocks, 'score', sim.score(g, me));
  console.log('opp   dmgDealt', op.damageDealt, 'hits', op.hits, 'blocks', op.blocks, 'score', sim.score(g, op));
  console.log('notes:', [...notes].sort((x, y) => y[1] - x[1]).slice(0, 15).map(x => x.join('x')).join('  '));
  console.log('final fighters:', g.fighters.map(f => `${f.char} hp${Math.round(f.hp)}`).join(' | '));
})();
