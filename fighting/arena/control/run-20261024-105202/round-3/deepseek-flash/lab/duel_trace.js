// 与 duel_clone.js 相同，但输出逐局统计：伤害来源招式、被打时自己的状态、被挡/命中。
// 用法: node duel_trace.js <mySeat> <seed> <myTeam> [oppTeam] [optsJSON]
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
const seen = new Set();
const dmgOnMe = new Map();  // 对手招式 -> 总伤害/次数
const myBadStates = new Map();
const myHitSources = new Map();
(async () => {
  const a = startAgent();
  const bot = new SolClone(1 - mySeat, seed, opts);
  let windows = 0;
  while (g.status === 'playing' && windows < 4000) {
    const before = g.fighters[mySeat].state;
    const oppMoveBefore = g.fighters[1 - mySeat].move && g.fighters[1 - mySeat].move.name;
    const obs = sim.snapshot(g, mySeat); delete obs.catalog;
    obs.decisionWindows = true; obs.framesPerWindow = 15;
    let out; try { out = JSON.parse(await a.ask(obs)); } catch (e) { out = { inputs: [] }; }
    const mine = (out.inputs || []).slice(0, 15).map(x => ({ dir: x.dir || 'N', btn: x.btn || null }));
    while (mine.length < 15) mine.push({ dir: 'N', btn: null });
    const theirs = bot.win(g);
    sim.advanceWindow(g, mySeat === 0 ? [mine, theirs] : [theirs, mine]);
    // 统计本窗口新事件
    for (const e of g.events) {
      if (seen.has(e.id)) continue; seen.add(e.id);
      if (e.type === 'hit' && e.owner === 1 - mySeat) {
        // 对手命中我：找攻击者当时的招式
        const om = g.fighters[1 - mySeat].move;
        const key = (om ? om.name : '?') + '/' + before;
        dmgOnMe.set(key, (dmgOnMe.get(key) || 0) + (e.damage || 0));
        myBadStates.set(before, (myBadStates.get(before) || 0) + 1);
      }
      if (e.type === 'hit' && e.owner === mySeat) {
        const mm = g.fighters[mySeat].move;
        const k = mm ? mm.name : '?';
        myHitSources.set(k, (myHitSources.get(k) || 0) + (e.damage || 0));
      }
    }
    windows++;
  }
  a.kill();
  console.log(JSON.stringify({ winner: g.winner, rounds: g.roundLog.map(r => r.winner + ':' + r.winnerChar + '>' + r.loserChar + '(' + r.frames + 'f)'), final: g.fighters.map(f => f.char + ':' + Math.round(f.hp)) }, null, 1));
  console.log('我被打时状态:', [...myBadStates].sort((a, b) => b[1] - a[1]));
  console.log('对手命中我的招式/我被打前状态:', [...dmgOnMe].sort((a, b) => b[1] - a[1]).slice(0, 20));
  console.log('我的伤害来源:', [...myHitSources].sort((a, b) => b[1] - a[1]).slice(0, 20));
  process.exit(0);
})();
