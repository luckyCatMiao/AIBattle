'use strict';
// 离线实验：在自造平地上测试不同宽度地刺能否跳过。
const sim = require('../simulation.js');
const { rules } = require('../catalog.js');

function buildLevel(w, h) {
  const tiles = new Uint8Array(w * h);
  const put = (x, y, t) => { if (x >= 0 && x < w && y >= 0 && y < h) tiles[y * w + x] = t; };
  for (let x = 0; x < w; x++) for (let y = rules.groundY; y < h; y++) put(x, y, 1);
  return tiles;
}

function trial(spikeStart, spikeWidth, jumpDelay, approachFrom) {
  const g = sim.createMatch({ id: 't', seed: 1, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  const w = 60, h = 16;
  g.w = w; g.h = h; g.tiles = buildLevel(w, h);
  g.goalX = w - 4; g.startX = 2.5;
  g.platforms = []; g.plants = []; g.saws = []; g.platformRects = []; g.plantStates = []; g.sawStates = [];
  g.crumbleTimers = new Map(); g.gone = new Map();
  g.monsters = []; g.phase = 'race'; g.freezeLeft = 0; g.roundLeft = 90; g.time = 0;
  // 放地刺：行 groundY-1
  for (let k = 0; k < spikeWidth; k++) g.tiles[(rules.groundY - 1) * w + spikeStart + k] = 3;
  const a = g.runners[0], b = g.runners[1];
  a.x = approachFrom; a.y = 3; a.vx = rules.moveSpeed; a.vy = 0; a.onGround = true;
  b.x = approachFrom - 5; b.y = 3; b.vx = 0; b.vy = 0; b.onGround = true;
  let jumped = false;
  for (let f = 0; f < 200 && g.phase === 'race'; f++) {
    let jump = false;
    if (f === jumpDelay && a.onGround) { jump = true; jumped = true; }
    a.held = { move: 1, jump };
    b.held = { move: 0, jump: false };
    sim.step(g);
    if (a.deaths > 0) return { ok: false, deaths: 1, x: a.x };
    if (a.x > spikeStart + spikeWidth + 2) return { ok: true };
  }
  return { ok: false, reason: 'no pass', x: a.x };
}

for (const wSpike of [1, 2, 3]) {
  const results = [];
  for (let d = 0; d < 80; d++) {
    const r = trial(20, wSpike, d, 10);
    if (r.ok) results.push(d);
  }
  console.log('spike width', wSpike, 'working jump delays:', results.length ? `${results[0]}..${results[results.length - 1]} (${results.length})` : 'NONE');
}
