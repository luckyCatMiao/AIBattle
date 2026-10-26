'use strict';
/* 护球的反制实验：对手「故意冲进我方禁区」制造犯规，
 * 看能不能靠犯规后产生的禁区外活球抢回球权并射门进球。 */
const sim = require('../simulation.js');
const { DIRV } = require('../dev/arena.js');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
const N = Number(arg('n', 3));
const SECS = Number(arg('secs', 40));
const HX = Number(arg('holdx', 8.5));
const HY = Number(arg('holdy', 13));
const MODE = arg('mode', 'foul');      // foul | wait
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function dirOf(dx, dy) {
  if (!dx && !dy) return 'N';
  const l = Math.hypot(dx, dy); dx /= l; dy /= l;
  let best = 'N', bd = -2;
  for (const k in DIRV) { const v = DIRV[k]; const d = v[0] * dx + v[1] * dy; if (d > bd) { bd = d; best = k; } }
  return best;
}

const g = sim.createMatch({ id: 'p', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: 2, teamSize: N });
g.units.length = 0;
function mk(team, index, x, y, fx) {
  const u = { id: 't' + team + 'u' + index, team, index, name: 'x', x, y, facing: { x: fx, y: 0 }, held: {}, inputHistory: [], kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0, goals: 0, kicks: 0, touches: 0 };
  g.units.push(u); return u;
}
const holderIdx = N > 1 ? 1 : 0;
for (let i = 0; i < N; i++) {
  if (i === holderIdx) mk(0, i, HX, HY, -1);
  else if (i === 0) mk(0, 0, 2.0, 13, 1);
  else mk(0, i, 6 + i * 1.5, 7 + i * 3, 1);
}
for (let i = 0; i < N; i++) mk(1, i, 16 + i * 2, 5 + i * 5, -1);
g.teamSize = N;
g.ball = { x: HX - 0.62, y: HY, vx: 0, vy: 0, owner: 't0u' + holderIdx, lastTouch: 't0u' + holderIdx, lastTeam: 0 };
g.score = [1, 0];
const ev0 = g.events.length;
const maxFrames = SECS * 20;
for (let f = 0; f < maxFrames && g.status === 'playing'; f++) {
  for (const u of g.units) {
    if (u.team === 0) {
      u.held = { dir: 'N', aim: null, kick: false };
    } else if (MODE === 'foul') {
      // 无脑冲向球（会跨进我方禁区 -> 犯规）
      u.held = { dir: dirOf(g.ball.x - u.x, g.ball.y - u.y), aim: null, kick: false };
    } else {
      // 停在禁区外等
      const tx = Math.max(10.05, g.ball.x);
      u.held = { dir: dirOf(tx - u.x, g.ball.y - u.y), aim: null, kick: false };
    }
    u.inputHistory.push(u.held); if (u.inputHistory.length > 8) u.inputHistory.shift();
  }
  sim.step(g);
}
const ev = g.events.slice(ev0);
console.log(JSON.stringify({
  mode: MODE, n: N, secs: SECS, hold: [HX, HY], frames: g.frame, score: g.score,
  fouls: ev.filter(e => e.type === 'foul').length,
  goals: ev.filter(e => e.type === 'goal').map(e => ({ t: e.team, own: e.ownGoal, f: e.frame })),
  tackles: ev.filter(e => e.type === 'tackle').length,
  ball: [Number(g.ball.x.toFixed(2)), Number(g.ball.y.toFixed(2))], owner: g.ball.owner,
}));
