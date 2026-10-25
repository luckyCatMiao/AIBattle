// 统计双方超必杀的发动/命中，专门看「双方满气」时是否会被 Sol 反杀。
// 用法: node trace_super.js <mySeat> <seed> [optsJSON]
const path = require('path');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');
const { SolClone } = require('./solclone.js');

const mySeat = Number(process.argv[2] || 0);
const seed = Number(process.argv[3] || 1);
const opts = JSON.parse(process.argv[4] || '{}');
const myTeam = ['vex', 'kestrel', 'aegis'], oppTeam = ['kestrel', 'aegis', 'vex'];
const teams = mySeat === 0 ? [myTeam, oppTeam] : [oppTeam, myTeam];
const g = sim.createMatch({ id: 'ts', players: [{ name: 'P0', kind: 'api', team: teams[0] }, { name: 'P1', kind: 'api', team: teams[1] }], seed });
const WS = path.resolve(__dirname, '..');
const p = spawn(process.env.PY || 'python', [path.join(WS, 'agent.py')], { cwd: WS });
let buf = ''; const waiters = [];
p.stdout.on('data', c => { buf += c.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(l); } });
p.stderr.on('data', () => {});
function ask(o) { return new Promise(r => { waiters.push(r); p.stdin.write(JSON.stringify(o) + '\n'); }); }
const bot = new SolClone(1 - mySeat, seed, opts);

(async () => {
  let prevId = 0;
  const evs = [];
  const snaps = [];
  let windows = 0;
  while (g.status === 'playing' && windows < 4000) {
    for (const e of g.events) if (e.id > prevId) { prevId = e.id; evs.push({ ...e }); }
    const obs = sim.snapshot(g, mySeat);
    delete obs.catalog;
    const out = JSON.parse(await ask(obs));
    const mine = (out.inputs || []).slice(0, 15).map(x => ({ dir: x.dir || 'N', btn: x.btn || null }));
    while (mine.length < 15) mine.push({ dir: 'N', btn: null });
    const theirs = bot.win(g);
    const pre = { frame: g.frames, round: g.round, myChar: g.fighters[mySeat].char, opChar: g.fighters[1 - mySeat].char, myMeter: g.fighters[mySeat].meter, opMeter: g.fighters[1 - mySeat].meter, dx: Math.abs(g.fighters[0].x - g.fighters[1].x), myState: g.fighters[mySeat].state, opState: g.fighters[1 - mySeat].state, myHp: g.fighters[mySeat].hp, opHp: g.fighters[1 - mySeat].hp, myMove: g.fighters[mySeat].move && g.fighters[mySeat].move.name };
    snaps.push(pre);
    sim.advanceWindow(g, mySeat === 0 ? [mine, theirs] : [theirs, mine]);
    windows++;
  }
  for (const e of g.events) if (e.id > prevId) { prevId = e.id; evs.push({ ...e }); }
  p.kill();
  const mySupers = evs.filter(e => e.type === 'super' && e.owner === mySeat);
  const opSupers = evs.filter(e => e.type === 'super' && e.owner === 1 - mySeat);
  function outcome(e, owner) {
    // 找 e 之后 120 帧内、对手 hp 下降或 block 事件
    const after = evs.filter(x => x.frame >= e.frame && x.frame <= e.frame + 120);
    const hits = after.filter(x => x.type === 'hit' && x.owner === owner);
    const blocks = after.filter(x => x.type === 'block' && x.owner !== owner);
    return { hits: hits.length, dmg: hits.reduce((a, x) => a + (x.damage || 0), 0), blocks: blocks.length };
  }
  function ctx(e) {
    let best = null;
    for (const s of snaps) if (s.frame <= e.frame && (!best || s.frame > best.frame)) best = s;
    return best;
  }
  console.log(JSON.stringify({
    seat: mySeat, seed, winner: g.winner, rounds: g.roundLog.map(r => r.winner),
    mySupers: mySupers.map(e => ({ f: e.frame, ...outcome(e, mySeat), ctx: ctx(e) })),
    opSupers: opSupers.map(e => ({ f: e.frame, ...outcome(e, 1 - mySeat), ctx: ctx(e) })),
  }));
  process.exit(0);
})();
