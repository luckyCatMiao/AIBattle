// 逐窗口记录：我方 note、双方状态/血量/气槽/距离，以及窗口内事件。
// 用法: node trace_win.js <seat> <seed> <oppTeam> [optsJSON] [agentFile]
const path = require('path');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');
const { SolClone } = require('./solclone.js');
const seat = Number(process.argv[2] || 0), seed = Number(process.argv[3] || 1);
const oppTeam = (process.argv[4] || 'kestrel,aegis,vex').split(',');
let opts = {}; try { opts = JSON.parse(process.argv[5] || '{}'); } catch (e) {}
const agentFile = process.argv[6] || 'agent.py';
const myTeam = ['vex', 'kestrel', 'aegis'];
const teams = seat === 0 ? [myTeam, oppTeam] : [oppTeam, myTeam];
const g = sim.createMatch({ id: 'tw', players: [{ name: 'P0', kind: 'api', team: teams[0] }, { name: 'P1', kind: 'api', team: teams[1] }], seed });
const WS = path.resolve(__dirname, '..');
const p = spawn(process.env.PY || 'python', [path.join(WS, agentFile)], { cwd: WS });
let buf = ''; const waiters = [];
p.stdout.on('data', c => { buf += c.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(l); } });
p.stderr.on('data', c => process.stderr.write('[agent] ' + c));
function ask(o) { return new Promise(r => { waiters.push(r); p.stdin.write(JSON.stringify(o) + '\n'); }); }
(async () => {
  const bot = new SolClone(1 - seat, seed, opts);
  const rows = []; let windows = 0; let prevId = 0;
  while (g.status === 'playing' && windows < 4000) {
    const obs = sim.snapshot(g, seat); delete obs.catalog;
    let out; try { out = JSON.parse(await ask(obs)); } catch (e) { out = { inputs: [], note: 'ERR' }; }
    const note = out.note || '';
    const me = g.fighters[seat], op = g.fighters[1 - seat];
    const pre = { w: windows, f: g.frames, round: g.round, note, myState: me.state, myMove: me.move && me.move.name, myHp: Math.round(me.hp), myMeter: Math.round(me.meter), myGuard: Math.round(me.guard), opState: op.state, opMove: op.move && op.move.name, opHp: Math.round(op.hp), opMeter: Math.round(op.meter), dx: Math.round(Math.abs(me.x - op.x)), inp: (out.inputs || []).slice(0, 15).map(x => x.dir + (x.btn || '')) };
    const evs = [];
    const mine = (out.inputs || []).slice(0, 15).map(x => ({ dir: x.dir || 'N', btn: x.btn || null }));
    while (mine.length < 15) mine.push({ dir: 'N', btn: null });
    const theirs = bot.win(g);
    sim.advanceWindow(g, seat === 0 ? [mine, theirs] : [theirs, mine]);
    for (const e of g.events) if (e.id > prevId) { prevId = e.id; evs.push(e.type + ':' + (e.owner === seat ? 'me' : 'op') + ':' + (e.name || '') + (e.damage ? ':' + e.damage : '')); }
    rows.push({ ...pre, evs });
    windows++;
  }
  p.kill();
  console.log(JSON.stringify({ winner: g.winner, seat, seed, rounds: g.roundLog, final: g.fighters.map(f => f.char + ':' + Math.round(f.hp)), rows }, null, 0));
  process.exit(0);
})();
