'use strict';
/* 记录一整局的观察与双方输入，供 python 侧逐窗口重放校验。
 * node dev2/dumpgame.js --me py:agent_core.py --opp py:agent.py --seed 5 --size 5 --out dev2/g5.jsonl */
const fs = require('fs');
const path = require('path');
const sim = require(path.resolve(__dirname, '..', 'simulation.js'));
const { PyAgent } = require('../dev/arena.js');
const bots = Object.assign({}, require('../dev/bots.js'), require('../dev/bots2.js'), require('../dev2/opps.js'));
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i >= 0 ? process.argv[i + 1] : d; }
function mk(spec, tag) {
  if (spec.startsWith('py:')) { const ag = new PyAgent(PY, spec.slice(3), ROOT, tag); return { fn: async v => JSON.parse(await ag.ask(v)).inputs, ag }; }
  const f = bots[spec]; if (!f) throw new Error('unknown ' + spec); return { fn: async v => f(v), ag: null };
}
const raw = g => ({
  frame: g.frame, freeze: g.freeze, score: [...g.score], status: g.status, half: g.half,
  golden: g.golden, goldenEnd: g.goldenEnd, kickoffTeam: g.kickoffTeam,
  units: g.units.map(u => ({ team: u.team, index: u.index, x: u.x, y: u.y, fx: u.facing.x, fy: u.facing.y, kickCd: u.kickCd, controlLock: u.controlLock, stealLock: u.stealLock, foulLock: u.foulLock })),
  ball: { x: g.ball.x, y: g.ball.y, vx: g.ball.vx, vy: g.ball.vy, owner: g.ball.owner },
});

(async () => {
  const A = arg('me', 'py:agent_core.py'), B = arg('opp', 'py:agent.py');
  const seed = Number(arg('seed', 5)), size = Number(arg('size', 5));
  const out = arg('out', 'dev2/game.jsonl');
  const swap = process.argv.includes('--swap');
  const a = mk(A, 'a'), b = mk(B, 'b');
  const g = sim.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed, teamSize: size });
  const lines = [JSON.stringify({ state: raw(g), obs0: sim.view(g, 0), obs1: sim.view(g, 1) })];
  let wi = 0;
  while (g.status === 'playing' && wi < 200) {
    const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
    let w0, w1;
    [w0, w1] = await Promise.all([(swap ? b : a).fn(v0), (swap ? a : b).fn(v1)]);
    const A0 = sim.submitWindow(g, 0, w0), B0 = sim.submitWindow(g, 1, w1);
    sim.advanceWindow(g, [A0, B0]);
    wi++;
    lines.push(JSON.stringify({ w0, w1, state: raw(g), obs0: sim.view(g, 0), obs1: sim.view(g, 1) }));
  }
  fs.writeFileSync(out, lines.join('\n') + '\n');
  console.log('wrote', lines.length, 'records to', out, 'score', g.score.join(':'), 'n', g.teamSize);
  a.ag && a.ag.kill(); b.ag && b.ag.kill();
})();
