// 复盘：用真实录像里的双方逐窗口输入，在本地引擎重放，取逐帧状态做统计。
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const sim = require('./simulation.patched.js');

const file = process.argv[2];
const dump = process.argv.includes('--dump');
const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
const g = sim.createMatch({
  id: d.id,
  players: d.names.map((name, i) => ({ name, kind: 'api', team: d.teams[i] })),
  seed: d.seed,
});

const frames = [sim.snapshot(g, null)];
for (const w of d.windows) {
  for (let i = 0; i < 15 && g.status === 'playing'; i++) {
    sim.stepFrame(g, [w.inputs[0][i], w.inputs[1][i]]);
    frames.push(sim.snapshot(g, null));
  }
}
const last = frames[frames.length - 1];
fs.writeFileSync(path.join(__dirname, 'replay_dump_' + d.id + '.json'), JSON.stringify({ windows: d.windows.length, frames }));
console.log(d.id, 'replay final tick', d.final.tick, 'local tick', last.tick, 'frame', last.frame, 'status', last.status, 'winner', last.winner);
console.log('replay final roundLog', JSON.stringify(d.final.roundLog));
console.log('local  final roundLog', JSON.stringify(last.roundLog));
console.log('local players', JSON.stringify(last.players));
console.log('local fighters', JSON.stringify(last.fighters));

// ---- 统计 ----
let hitsOn = [0, 0], dmgOn = [0, 0], moves = [new Map(), new Map()], inputs = [new Map(), new Map()];
let supers = [0, 0], hitsByMove = [new Map(), new Map()];
const seen = new Set();
for (let i = 1; i < frames.length; i++) {
  const f = frames[i], prev = frames[i - 1];
  for (const e of f.events) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    if (e.type === 'hit' || e.type === 'block') {
      // event 不带 owner：用 hp 变化与 combo 判断
    }
  }
  for (const o of [0, 1]) {
    const a = prev.fighters[o], b = f.fighters[o];
    const dhp = a.hp - b.hp;
    if (dhp > 0.01) { hitsOn[o]++; dmgOn[o] += dhp; }
  }
  for (const o of [0, 1]) {
    const a = prev.fighters[o], b = f.fighters[o];
    if (b.move && (!a.move || a.move.name !== b.move.name || b.move.frame < a.move.frame)) {
      const m = moves[o];
      m.set(b.move.name, (m.get(b.move.name) || 0) + 1);
      if (b.move.kind === 'super') supers[o]++;
    }
    const inp = d.windows.find(w => w.frame === f.frame);
  }
}
// 输入分布
for (const w of d.windows) {
  for (const o of [0, 1]) {
    const m = inputs[o];
    for (const x of w.inputs[o]) {
      const k = x.dir + '/' + (x.btn || '-');
      m.set(k, (m.get(k) || 0) + 1);
    }
  }
}
console.log('damage received by owner:', dmgOn, 'hit count:', hitsOn);
console.log('move starts owner0:', [...moves[0]].sort((a, b) => b[1] - a[1]).map(x => x.join('x')).join(' '));
console.log('move starts owner1:', [...moves[1]].sort((a, b) => b[1] - a[1]).map(x => x.join('x')).join(' '));
console.log('supers:', supers);
for (const o of [0, 1]) console.log('top inputs owner' + o + ':', [...inputs[o]].sort((a, b) => b[1] - a[1]).slice(0, 10).map(x => x.join('=')).join('  '));
