'use strict';
const fs = require('fs'), path = require('path');
const { play } = require('./analyze.js');
const src = fs.readFileSync(path.join(__dirname, '..', 'brain.js'), 'utf8');
function mk(name, tune) {
  let s = src.replace("require('./engine.js')", "require('../../engine.js')")
             .replace("require('./core.js')", "require('../../core.js')")
             .replace("require('./catalog.js')", "require('../../catalog.js')");
  for (const [k, v] of Object.entries(tune)) {
    const re = new RegExp('(\\b' + k + ':\\s*)[^,\\n]+');
    if (!re.test(s)) throw new Error('no tune ' + k);
    s = s.replace(re, '$1' + JSON.stringify(v));
  }
  const f = path.join(__dirname, 'variants', name + '.js');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, s);
  delete require.cache[require.resolve(f)];
  const mod = require(f);
  return { decide: o => mod.decide(o).frames };
}
const cfgs = {
  block: { counterDef: false },
  blockC: { counterDef: true },
  rush: { serveStyle: 'rush', counterDef: false },
  rushC: { serveStyle: 'rush', counterDef: true },
  rushCnj: { serveStyle: 'rush', counterDef: true, allowJump: false },
  rushL0: { serveStyle: 'rush', counterDef: false, rushLead: 0 },
  rushL2: { serveStyle: 'rush', counterDef: false, rushLead: 2 },
  none: { serveDef: false, counterDef: false },
};
const bots = {};
for (const [n, t] of Object.entries(cfgs)) bots[n] = mk('s5_' + n, t);
function game(a, b) {
  const r = play([bots[a].decide, bots[b].decide], 1, ['A', 'B']);
  let holds = [0, 0], serves = [0, 0];
  for (const p of r.points) { serves[p.server]++; if (p.winner === p.server) holds[p.server]++; }
  return { r, holds, serves };
}
const names = Object.keys(cfgs);
for (const a of names) {
  let w = 0, l = 0, pts = 0, opp = 0, holds = 0, serves = 0, jumps = 0, whiffs = 0, frames = 0;
  for (const b of names) {
    if (a === b) continue;
    for (const [x, y] of [[a, b], [b, a]]) {
      const g = game(x, y); const r = g.r;
      if (r.winner === 0) w++; else l++;
      pts += r.score[0]; opp += r.score[1];
      holds += g.holds[0]; serves += g.serves[0];
      jumps += r.st[0].jumps; whiffs += r.st[0].swings - r.st[0].hits; frames += r.frames;
    }
  }
  console.log(a.padEnd(9), 'W' + w, 'L' + l, 'pts', pts + ':' + opp, 'holds', holds + '/' + serves,
    'jumps', jumps, 'whiffs', whiffs, 'frames', frames);
}
