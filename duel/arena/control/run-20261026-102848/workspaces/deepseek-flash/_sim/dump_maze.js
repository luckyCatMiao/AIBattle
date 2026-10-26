// 自测用：用真·catalog.js 导出若干 seed 的迷宫，便于与 Python 复刻比对。
const path = require('path');
const WS = path.resolve(__dirname, '..');
const c = require(path.join(WS, 'catalog.js'));
const seeds = [1, 2, 7001, 12345, 99999];
for (const s of seeds) {
  const t = c.buildMaze(s);
  console.log(JSON.stringify({ seed: s, tiles: Array.from(t) }));
}
