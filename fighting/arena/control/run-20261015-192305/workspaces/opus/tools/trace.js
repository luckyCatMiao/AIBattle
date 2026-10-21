const S = require('./loadsim');
const orig = S.advanceWindow;
// 包装：打印指定帧段
const [lo, hi] = [+process.env.LO, +process.env.HI];
S.advanceWindow = (g, w) => {
  if (g.frames >= lo - 15 && g.frames <= hi) console.error('WIN', g.frames, JSON.stringify(w.map(x => x.map(i => i.dir + (i.btn ? '+' + i.btn : '')).join(' '))));
  for (let i = 0; i < 15 && g.status === 'playing'; i++) {
    for (let o = 0; o < 2; o++) { const f = g.fighters[o]; if (f.hp > 0) { f.inputHistory.push(w[o][i]); if (f.inputHistory.length > 30) f.inputHistory.shift(); f.held = w[o][i]; } }
    S.step(g);
    if (g.frames >= lo && g.frames <= hi) console.error(g.frames, g.hitstop, g.fighters.map(f => `${f.char} x=${f.x.toFixed(0)} fc=${f.facing} ${f.state} hp=${f.hp} ${f.move ? f.move.name + '@' + f.move.frame : ''}`).join(' | '), g.projectiles.map(p => `p${p.owner}@${p.x.toFixed(0)}`).join(','));
  }
  return g;
};
require.cache[require.resolve('./loadsim')].exports = S;
require('./arena.js');
