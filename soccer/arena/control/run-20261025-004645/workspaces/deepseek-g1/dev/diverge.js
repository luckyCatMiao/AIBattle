'use strict';
const { runMatch, PyAgent, sim } = require('./arena.js');
const { NodeAgent } = require('./jsagent.js');
const path = require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const SOL_DIR = path.resolve(ROOT, '..', 'sol');
async function play(my, swap) {
  const me = new PyAgent(PY, my, ROOT, 'me');
  const sol = new NodeAgent('agent.js', SOL_DIR, 'sol');
  const meFn = async v => JSON.parse(await me.ask(v)).inputs;
  const solFn = async v => JSON.parse(await sol.ask(v)).inputs;
  // 手动推进，记录每窗口状态
  const players = [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }];
  const g = sim.createMatch({ id: 'm', players, seed: 4012, teamSize: 1 });
  const traj = [];
  let wi = 0;
  while (g.status === 'playing' && wi < 220) {
    const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
    let w0 = swap ? await solFn(v1) : await meFn(v0);
    let w1 = swap ? await meFn(v1) : await solFn(v0);
    w0 = sim.submitWindow(g, 0, w0); w1 = sim.submitWindow(g, 1, w1);
    sim.advanceWindow(g, [w0, w1]);
    traj.push(`w${wi} t${(g.frame/20).toFixed(0)} ball(${g.ball.x.toFixed(2)},${g.ball.y.toFixed(2)}) u0(${g.units[0].x.toFixed(2)},${g.units[0].y.toFixed(2)}) u1(${g.units[1].x.toFixed(2)},${g.units[1].y.toFixed(2)})`);
    wi++;
  }
  me.kill(); sol.kill();
  return { score: g.score, traj, stats: g.stats };
}
(async () => {
  const a = await play('dev/_old_agent.py', true);
  const b = await play('dev/v_soloclean.py', true);
  console.log('old   score', a.score, 'clean score', b.score);
  let first = -1;
  for (let i = 0; i < Math.min(a.traj.length, b.traj.length); i++) {
    if (a.traj[i] !== b.traj[i]) { first = i; break; }
  }
  console.log('首个分歧窗口:', first);
  if (first >= 0) for (let i = Math.max(0, first - 1); i < first + 3; i++) console.log(' old ', a.traj[i], '\n new ', b.traj[i]);
})();
