// 用真实录像重放，同时把观察喂给 agent.py，比较「带 catalog」与「不带 catalog」两种观察下的输出。
const fs = require('fs'), zlib = require('zlib');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');

const file = process.argv[2];
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const g = sim.createMatch({ id: d.id, players: d.names.map((name, i) => ({ name, kind: 'api', team: d.teams[i] })), seed: d.seed });
// 真实裁判：observe() 会 delete catalog
const realObs = (g, owner) => { const s = sim.snapshot(g, owner); delete s.catalog; return s; };

function startAgent(extra) {
  const p = spawn('python', ['agent.py'], { cwd: '..' });
  let buf = '';
  const waiters = [];
  p.stdout.on('data', c => {
    buf += c.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      const w = waiters.shift(); if (w) w(line);
    }
  });
  p.stderr.on('data', c => process.stderr.write('[agent] ' + c));
  return { ask(o) { return new Promise(res => { waiters.push(res); p.stdin.write(JSON.stringify(o) + '\n'); }); }, kill() { p.kill(); } };
}

(async () => {
  const a = startAgent();
  for (const withCat of [false, true]) {
    const obs = realObs(g, 0);
    if (withCat) obs.catalog = require('./catalog.patched.js');
    obs.decisionWindows = true; obs.framesPerWindow = 15;
    const out = JSON.parse(await a.ask(obs));
    const dirs = out.inputs.map(x => x.dir + '/' + (x.btn || '-')).join(' ');
    console.log(withCat ? 'WITH catalog:' : 'NO catalog  :', dirs, '| note:', out.note);
  }
  // 用录像里第 1 个窗口的观察（若 g 已在 frame0）+ 逐窗口喂，看前 6 个窗口
  const g2 = sim.createMatch({ id: d.id, players: d.names.map((name, i) => ({ name, kind: 'api', team: d.teams[i] })), seed: d.seed });
  for (let wi = 0; wi < 6; wi++) {
    const obs = realObs(g2, 0);
    obs.decisionWindows = true; obs.framesPerWindow = 15;
    const out = JSON.parse(await a.ask(obs));
    const rec = d.windows[wi].inputs[0];
    console.log('window', wi, 'f', obs.frame, 'mine:', out.note, '| out:', out.inputs.map(x => x.dir + (x.btn ? '/' + x.btn : '')).join(','), '| recorded:', rec.map(x => x.dir + (x.btn ? '/' + x.btn : '')).join(','));
    sim.advanceWindow(g2, [rec, d.windows[wi].inputs[1]]);
  }
  a.kill();
})();
