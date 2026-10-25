'use strict';
/* 镜像对局：team1 使用 team0 决策的镜像。若一切对称，整局状态应始终保持镜像。
 * 任何偏差都说明 agent 或裁判存在座位偏置。 */
const { PyAgent, sim } = require('./arena.js');
const path = require('path');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');
const DMAP = { N: 'N', U: 'U', D: 'D', L: 'R', R: 'L', UL: 'UR', UR: 'UL', DL: 'DR', DR: 'DL' };
const DMIR = w => w.map(fr => fr.map(u => ({
  dir: DMAP[u.dir],
  aim: (u.aim === null || u.aim === undefined) ? u.aim : ((180 - u.aim) % 360 + 360) % 360,
  kick: u.kick,
})));
function mirrorObs(o) {
  const m = JSON.parse(JSON.stringify(o));
  m.yourTeam = 1 - o.yourTeam;
  m.score = [o.score[1], o.score[0]];
  for (const u of m.units) { u.team = 1 - u.team; u.x = 44 - u.x; u.facing.x = -u.facing.x; }
  m.ball.x = 44 - o.ball.x; m.ball.vx = -o.ball.vx;
  // id 不随镜像改变
  return m;
}
(async () => {
  const seed = Number(process.argv[2] || 1);
  const ag = new PyAgent(PY, 'agent.py', ROOT, 'mirror');
  const players = [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }];
  const g = sim.createMatch({ id: 'm', players, seed });
  let wi = 0, worst = null;
  while (g.status === 'playing' && wi < 220) {
    const v0 = sim.view(g, 0);
    const w0 = JSON.parse(await ag.ask(v0)).inputs;
    const vm = mirrorObs(v0);
    const w1raw = JSON.parse(await ag.ask(vm)).inputs;
    const w1 = DMIR(w1raw);
    // 比较
    for (let f = 0; f < 20; f++) for (let i = 0; i < w0[f].length; i++) {
      const a = w0[f][i], b = w1[f][i];
      const da = a.aim == null ? null : Math.round(a.aim), db = b.aim == null ? null : Math.round(b.aim);
      if (a.dir !== b.dir || da !== db || a.kick !== b.kick) {
        if (!worst) worst = `win${wi} f${f} u${i}: A=${JSON.stringify(a)} B=${JSON.stringify(b)}`;
      }
    }
    sim.advanceWindow(g, [sim.submitWindow(g, 0, w0), sim.submitWindow(g, 1, w1)]);
    // 检查镜像性
    wi++;
  }
  console.log(`seed=${seed} n=${g.teamSize} score=${g.score} reason=${g.reason} windows=${wi}`);
  console.log('first decision mismatch:', worst || 'none');
  console.log('stderr:', ag.err.slice(-500));
  ag.kill();
})();
