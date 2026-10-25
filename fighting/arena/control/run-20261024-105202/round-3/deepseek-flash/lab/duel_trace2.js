// 逐帧追踪：记录每次我被命中时，我的 state/held/当前招式与对手招式。
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
const g = sim.createMatch({ id: 't', players: [{ name: 'P0', kind: 'api', team: teams[0] }, { name: 'P1', kind: 'api', team: teams[1] }], seed });
function startAgent() {
  const p = spawn(process.env.PY || 'python', [path.resolve(__dirname, '..', 'agent.py')], { cwd: path.resolve(__dirname, '..') });
  let buf = ''; const waiters = [];
  p.stdout.on('data', c => { buf += c.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(l); } });
  p.stderr.on('data', c => process.stderr.write('[agent] ' + c));
  return { ask(o) { return new Promise(r => { waiters.push(r); p.stdin.write(JSON.stringify(o) + '\n'); }); }, kill() { try { p.kill(); } catch (e) {} } };
}
(async () => {
  const a = startAgent(); const bot = new SolClone(1 - mySeat, seed, opts);
  const seen = new Set(); const rows = []; let windows = 0;
  while (g.status === 'playing' && windows < 4000) {
    const obs = sim.snapshot(g, mySeat); delete obs.catalog; obs.decisionWindows = true; obs.framesPerWindow = 15;
    let out; try { out = JSON.parse(await a.ask(obs)); } catch (e) { out = { inputs: [] }; }
    const mine = (out.inputs || []).slice(0, 15).map(x => ({ dir: x.dir || 'N', btn: x.btn || null }));
    while (mine.length < 15) mine.push({ dir: 'N', btn: null });
    const theirs = bot.win(g);
    const note = out.note || '';
    for (let i = 0; i < 15 && g.status === 'playing'; i++) {
      const myInput = mySeat === 0 ? mine[i] : theirs[i];
      const oppInput = mySeat === 0 ? theirs[i] : mine[i];
      const beforeMe = g.fighters[mySeat], beforeOp = g.fighters[1 - mySeat];
      const pre = { myState: beforeMe.state, myMove: beforeMe.move && beforeMe.move.name, myHeld: { ...beforeMe.held }, opState: beforeOp.state, opMove: beforeOp.move && beforeOp.move.name, opHeld: { ...beforeOp.held } };
      sim.stepFrame(g, [myInput, oppInput]);
      for (const e of g.events) {
        if (seen.has(e.id)) continue; seen.add(e.id);
        if (e.type === 'hit' && e.owner === 1 - mySeat) {
          // 命中事件发生在 step 内：victim 已转为 hitstun；用 pre 的状态与 held
          rows.push({ f: e.frame, dmg: e.damage, note, pre, opFrame: beforeOp.move && beforeOp.move.frame });
        }
      }
    }
    windows++;
  }
  a.kill();
  console.log(JSON.stringify({ winner: g.winner, rounds: g.roundLog.map(r => r.winner + ':' + r.winnerChar + '>' + r.loserChar + '(' + r.frames + 'f)'), final: g.fighters.map(f => f.char + ':' + Math.round(f.hp)) }, null, 1));
  const agg = new Map();
  for (const r of rows) {
    const k = `${r.pre.opState}:${r.pre.opMove || '-'} -> me ${r.pre.myState}:${r.pre.myMove || '-'} held ${r.pre.myHeld.dir}/${r.pre.myHeld.btn || '-'} | ${r.note}`;
    agg.set(k, (agg.get(k) || 0) + 1);
  }
  for (const [k, n] of [...agg].sort((a, b) => b[1] - a[1]).slice(0, 40)) console.log(n, k);
  console.log('total hits on me', rows.length, 'dmg', rows.reduce((s, r) => s + r.dmg, 0));
  process.exit(0);
})();
