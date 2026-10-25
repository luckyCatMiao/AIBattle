// 细看某局的逐帧：我方按键、状态、距离、对手状态，以及每帧是否真的起招。
const fs = require('fs'), zlib = require('zlib');
const sim = require('./simulation.patched.js');
const file = process.argv[2];
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const g = sim.createMatch({ id: d.id, players: d.names.map((name, i) => ({ name, kind: 'api', team: d.teams[i] })), seed: d.seed });
const rows = [];
rows.push({ frame: 0, snap: sim.snapshot(g, null), inp: [{dir:'N',btn:null},{dir:'N',btn:null}], moveStart: [null,null] });
for (const w of d.windows) {
  for (let i = 0; i < 15 && g.status === 'playing'; i++) {
    const prevMoves = g.fighters.map(f => f.move && f.move.name);
    const prevStates = g.fighters.map(f => f.state);
    sim.stepFrame(g, [w.inputs[0][i], w.inputs[1][i]]);
    const s = sim.snapshot(g, null);
    const starts = g.fighters.map((f, o) => (f.move && f.move.name !== prevMoves[o] ? f.move.name : null));
    rows.push({ frame: s.frame, snap: s, inp: [w.inputs[0][i], w.inputs[1][i]], starts });
  }
}
const me = 0;
console.log('frame | myIn | myState | myPos | oppState | oppMove | dist | myMove | starts | hp me/opp | meter me/opp | guard me/opp');
for (const r of rows) {
  const [a, b] = r.snap.fighters;
  const st = r.starts || [null, null];
  if (st[0] || (r.inp[me].btn) || r.frame % 150 === 0 || r.snap.round !== (rows[rows.indexOf(r)-1]||{snap:{round:0}}).snap.round) {
    console.log([r.frame, r.inp[me].dir + '/' + (r.inp[me].btn||'-'),
      a.state + (a.move ? ':' + a.move.name + '#' + a.move.frame : ''), Math.round(a.x),
      b.state + (b.move ? ':' + b.move.name + '#' + b.move.frame : ''), b.move?b.move.name:'-',
      Math.round(Math.abs(b.x-a.x)), a.move?a.move.name:'-', st[0]||'', a.hp+'/'+b.hp, a.meter+'/'+b.meter, a.guard+'/'+b.guard,
      'round'+r.snap.round].join(' | '));
  }
}
