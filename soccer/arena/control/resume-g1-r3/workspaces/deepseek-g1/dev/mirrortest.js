'use strict';
/* 把同一份观察镜像后喂给 agent，检查输出是否严格镜像 —— 找出座位偏置。 */
const { PyAgent } = require('./arena.js');
const path = require('path');
const fs = require('fs');
const PY = process.env.PYEXE || 'C:/Users/Admin/AppData/Local/Programs/Python/Python314/python';
const ROOT = path.resolve(__dirname, '..');

function mirrorObs(o) {
  const m = JSON.parse(JSON.stringify(o));
  m.yourTeam = 1 - o.yourTeam;
  m.score = [o.score[1], o.score[0]];
  m.stats = [o.stats[1], o.stats[0]];
  for (const u of m.units) { u.team = 1 - u.team; u.x = 44 - u.x; u.facing.x = -u.facing.x; }
  m.ball.x = 44 - o.ball.x; m.ball.vx = -o.ball.vx;
  if (m.ball.owner) { const i = o.units.findIndex(u => u.id === o.ball.owner); m.ball.owner = m.units[i].id; }
  if (m.ball.lastTouch) { const i = o.units.findIndex(u => u.id === o.ball.lastTouch); m.ball.lastTouch = m.units[i].id; }
  return m;
}

function unmirrorWindow(w) {
  // 把 team1 视角的窗口镜像回 team0 坐标系
  return w.map(fr => fr.map(u => {
    const map = { N: 'N', U: 'U', D: 'D', L: 'R', R: 'L', UL: 'UR', UR: 'UL', DL: 'DR', DR: 'DL' };
    return { dir: map[u.dir], aim: u.aim === null || u.aim === undefined ? u.aim : ((180 - u.aim) % 360 + 360) % 360, kick: u.kick };
  }));
}

(async () => {
  const ex = JSON.parse(fs.readFileSync(path.join(ROOT, 'example.json'), 'utf8'));
  const obs = JSON.parse(JSON.stringify(ex));
  delete obs.exampleWindow; delete obs.catalog;
  const ag = new PyAgent(PY, 'agent.py', ROOT, 'mirror');
  const w0 = JSON.parse(await ag.ask(obs)).inputs;
  const w1 = JSON.parse(await ag.ask(mirrorObs(obs))).inputs;
  const w1m = unmirrorWindow(w1);
  let bad = 0;
  for (let f = 0; f < 20; f++) {
    for (let i = 0; i < w0[f].length; i++) {
      const a = w0[f][i], b = w1m[f][i];
      const da = a.aim === null || a.aim === undefined ? null : Math.round(a.aim);
      const db = b.aim === null || b.aim === undefined ? null : Math.round(b.aim);
      const same = a.dir === b.dir && da === db && a.kick === b.kick;
      if (!same) { bad++; if (bad < 12) console.log(`frame${f} unit${i}: team0 ${JSON.stringify(a)} vs mirrored ${JSON.stringify(b)}`); }
    }
  }
  console.log('mismatches:', bad, '/', 20 * w0[0].length);
  ag.kill();
})();
