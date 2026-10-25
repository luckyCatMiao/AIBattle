// 把录像回放中每个窗口开始时的观察（真实裁判形状：无 catalog）导出为 NDJSON。
const fs = require('fs'), zlib = require('zlib');
const sim = require('./simulation.patched.js');
const file = process.argv[2], out = process.argv[3], seat = Number(process.argv[4] || 0);
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const g = sim.createMatch({ id: d.id, players: d.names.map((name, i) => ({ name, kind: 'api', team: d.teams[i] })), seed: d.seed });
const lines = [];
for (const w of d.windows) {
  const obs = sim.snapshot(g, seat);
  delete obs.catalog;
  obs.decisionWindows = true; obs.framesPerWindow = 15;
  lines.push(JSON.stringify(obs));
  sim.advanceWindow(g, [w.inputs[0], w.inputs[1]]);
}
fs.writeFileSync(out, lines.join('\n') + '\n');
console.log('wrote', lines.length, 'observations to', out);
