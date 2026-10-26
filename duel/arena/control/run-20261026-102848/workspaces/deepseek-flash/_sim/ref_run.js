// 自测用：用真·simulation.js 跑一段给定输入，逐帧导出状态，供 Python 复刻比对。
const fs = require('fs');
const path = require('path');
const WS = path.resolve(__dirname, '..');
const sim = require(path.join(WS, 'simulation.js'));

const inputsPath = process.argv[2];
const seed = Number(process.argv[3]);
const outPath = process.argv[4];
const inputs = JSON.parse(fs.readFileSync(inputsPath, 'utf8'));

function snap(g) {
  return {
    frame: g.frame, now: g.now, status: g.status, winner: g.winner,
    p: g.players.map(p => ({ x: p.x, y: p.y, fx: p.facing.x, fy: p.facing.y,
                             alive: p.alive, cooldown: p.cooldown, shots: p.shots })),
    b: g.bullets.map(b => ({ id: b.id, owner: b.owner, x: b.x, y: b.y, vx: b.vx, vy: b.vy, bounces: b.bounces })),
  };
}

const g = sim.createMatch({ id: 'ref', seed, players: [{ name: 'A' }, { name: 'B' }] });
const out = [JSON.stringify(snap(g))];
for (const win of inputs) {
  const w = [sim.submitWindow(g, 0, win[0]), sim.submitWindow(g, 1, win[1])];
  for (let k = 0; k < 3 && g.status === 'playing'; k++) {
    for (let i = 0; i < 2; i++) { const p = g.players[i]; if (p.alive) p.held = w[i][k]; }
    sim.step(g);
    out.push(JSON.stringify(snap(g)));
  }
  if (g.status !== 'playing') break;
}
fs.writeFileSync(outPath, out.join('\n'), 'utf8');
console.log('frames', out.length, 'status', g.status, 'winner', g.winner, 'reason', g.reason);
