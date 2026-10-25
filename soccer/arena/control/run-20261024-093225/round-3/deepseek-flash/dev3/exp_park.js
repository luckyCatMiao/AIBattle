'use strict';
/* 领先护球实验：我方 1:0 领先，把球控在本方禁区深处；对手是真实 agent 进程。
 * 看对手能不能把球抢走 / 进球。 */
const sim = require('../simulation.js');
const { PyAgent } = require('../dev/arena.js');

function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
const PY = process.env.PYEXE || 'python';
const OPP = arg('opp', 'dev3/opps/search_def.py');
const HX = Number(arg('holdx', 9.0));
const HY = Number(arg('holdy', 13.0));
const N = Number(arg('n', 3));
const SECS = Number(arg('secs', 30));
const ROOT = require('path').resolve(__dirname, '..');

function mkUnit(g, team, index, x, y, fx) {
  const u = {
    id: 't' + team + 'u' + index, team, index, name: 'x', x, y,
    facing: { x: fx, y: 0 }, held: {}, inputHistory: [],
    kickCd: 0, controlLock: 0, stealLock: 0, foulLock: 0, goals: 0, kicks: 0, touches: 0,
  };
  g.units.push(u); return u;
}

(async () => {
  const g = sim.createMatch({ id: 'p', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: 2, teamSize: N });
  g.units.length = 0;
  // 我方 = team 0，守左门 x=0，此时 1:0 领先
  const holderIdx = 1 < N ? 1 : 0;
  for (let i = 0; i < N; i++) {
    if (i === holderIdx) mkUnit(g, 0, i, HX, HY, -1);
    else if (i === 0) mkUnit(g, 0, 0, 2.0, 13, 1);
    else mkUnit(g, 0, i, 12 + i, 6 + i * 4, 1);
  }
  for (let i = 0; i < N; i++) mkUnit(g, 1, i, 30 + i * 2, 5 + i * 5, -1);
  g.teamSize = N;
  g.ball = { x: HX - 0.62, y: HY, vx: 0, vy: 0, owner: 't0u' + holderIdx, lastTouch: 't0u' + holderIdx, lastTeam: 0 };
  g.score = [1, 0];
  g.freeze = 0;

  const op = new PyAgent(PY, OPP, ROOT, 'opp');
  const ev0 = g.events.length;
  const maxFrames = SECS * 20;
  let wi = 0;
  while (g.status === 'playing' && g.frame < maxFrames && wi < 200) {
    const v1 = sim.view(g, 1);
    let w1;
    try { w1 = JSON.parse(await op.ask(v1)).inputs; } catch (e) { w1 = null; }
    // 我方：护球（全员不动）
    const w0 = [];
    for (let f = 0; f < 20; f++) {
      const fr = [];
      for (let i = 0; i < N; i++) fr.push({ dir: 'N', aim: null, kick: false });
      w0.push(fr);
    }
    const A = sim.submitWindow(g, 0, w1 ? w0 : w0);
    const B = sim.submitWindow(g, 1, w1 || w0);
    sim.advanceWindow(g, [A, B]);
    wi++;
  }
  const ev = g.events.slice(ev0);
  op.kill();
  const fouls = ev.filter(e => e.type === 'foul');
  const goals = ev.filter(e => e.type === 'goal');
  console.log(JSON.stringify({
    hold: [HX, HY], n: N, frames: g.frame, score: g.score, status: g.status,
    fouls: fouls.length, foulTeams: fouls.map(e => e.team),
    goals: goals.map(e => ({ t: e.team, own: e.ownGoal, f: e.frame })),
    ballNow: [g.ball.x, g.ball.y], owner: g.ball.owner,
  }));
})();
