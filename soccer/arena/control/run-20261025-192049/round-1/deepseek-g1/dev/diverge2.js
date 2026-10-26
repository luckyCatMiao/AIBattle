'use strict';
const { PyAgent, sim } = require('./arena.js');
const { NodeAgent } = require('./jsagent.js');
const path = require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const SOL_DIR = path.resolve(ROOT, '..', 'sol');
async function play(my) {
  const me = new PyAgent(PY, my, ROOT, 'me');
  const sol = new NodeAgent('agent.js', SOL_DIR, 'sol');
  const g = sim.createMatch({ id: 'm', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed: 4012, teamSize: 1 });
  const log = [];
  let wi = 0;
  while (g.status === 'playing' && wi < 220) {
    const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
    const raw = await me.ask(v1);                 // 我方(team1)的原始输出
    const w0 = sim.submitWindow(g, 0, JSON.parse(await sol.ask(v0)).inputs);
    const w1 = sim.submitWindow(g, 1, JSON.parse(raw).inputs);
    sim.advanceWindow(g, [w0, w1]);
    log.push({ wi, frame: g.frame, raw, ball: [g.ball.x.toFixed(3), g.ball.y.toFixed(3)], u1: [g.units[1].x.toFixed(3), g.units[1].y.toFixed(3)] });
    wi++;
  }
  me.kill(); sol.kill();
  return { log, score: g.score };
}
(async () => {
  const a = await play('dev/_old_agent.py');
  const b = await play('dev/v_soloclean.py');
  console.log('scores', a.score, b.score, 'windows', a.log.length, b.log.length);
  let n = 0;
  for (let i = 0; i < Math.min(a.log.length, b.log.length); i++) {
    if (a.log[i].raw !== b.log[i].raw) {
      if (n < 4) console.log(`窗口${i} (frame ${a.log[i].frame})\n  ball old ${a.log[i].ball} u1 ${a.log[i].u1}\n  old ${a.log[i].raw.slice(0, 110)}\n  new ${b.log[i].raw.slice(0, 110)}`);
      n++;
    }
  }
  console.log('输入不同的窗口数:', n);
})();
