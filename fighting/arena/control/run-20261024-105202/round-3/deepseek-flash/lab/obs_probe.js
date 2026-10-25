// 在指定窗口比较「带/不带 catalog」的决策差异（两个独立 agent 进程，避免内部状态互相污染）。
const fs = require('fs'), zlib = require('zlib');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');
const file = process.argv[2], targets = process.argv.slice(3).map(Number);
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const realObs = (g, owner) => { const s = sim.snapshot(g, owner); delete s.catalog; return s; };
function startAgent() {
  const p = spawn('python', ['agent.py'], { cwd: '..' });
  let buf = ''; const waiters = [];
  p.stdout.on('data', c => { buf += c.toString(); let i; while ((i = buf.indexOf('\n')) >= 0) { const l = buf.slice(0, i); buf = buf.slice(i + 1); const w = waiters.shift(); if (w) w(l); } });
  p.stderr.on('data', c => process.stderr.write('[agent] ' + c));
  return { ask(o) { return new Promise(r => { waiters.push(r); p.stdin.write(JSON.stringify(o) + '\n'); }); }, kill() { p.kill(); } };
}
async function run(wantCat) {
  const g = sim.createMatch({ id: d.id, players: d.names.map((name, i) => ({ name, kind: 'api', team: d.teams[i] })), seed: d.seed });
  const a = startAgent();
  const log = [];
  for (const w of d.windows) {
    const obs = realObs(g, 0);
    if (wantCat) obs.catalog = require('./catalog.patched.js');
    obs.decisionWindows = true; obs.framesPerWindow = 15;
    const out = JSON.parse(await a.ask(obs));
    log.push({ frame: g.frames, dx: Math.abs(g.fighters[0].x - g.fighters[1].x), myState: g.fighters[0].state, oppState: g.fighters[1].state, oppMove: g.fighters[1].move ? g.fighters[1].move.name + '#' + g.fighters[1].move.frame : '', note: out.note, inputs: out.inputs.map(x => x.dir + (x.btn ? '/' + x.btn : '')).join(',') });
    sim.advanceWindow(g, [w.inputs[0], w.inputs[1]]);
  }
  a.kill();
  return log;
}
(async () => {
  const noCat = await run(false), withCat = await run(true);
  for (const target of targets) {
    const i = noCat.findIndex(x => x.frame >= target);
    if (i < 0) continue;
    console.log('frame', noCat[i].frame, 'dx', noCat[i].dx.toFixed(0), 'me', noCat[i].myState, 'opp', noCat[i].oppState, noCat[i].oppMove);
    console.log('  noCat  :', noCat[i].note, '|', noCat[i].inputs);
    console.log('  withCat:', withCat[i].note, '|', withCat[i].inputs);
  }
})();
