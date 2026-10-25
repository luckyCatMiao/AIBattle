'use strict';
/* 用真实 simulation.js 重放第 1 轮两局，导出包含 push 在内的全部事件与分轮关卡。 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const sim = require(path.join(__dirname, '..', '..', '..', '..', '..', 'simulation.js'));

const run = path.resolve(__dirname, '..', '..');
const files = ['r1-g1.json.gz', 'r1-g2.json.gz'];
const out = {};
for (const f of files) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(run, f))).toString('utf8'));
  const g = sim.createMatch({ id: d.id, seed: d.seed, players: d.seats.map((name) => ({ name, kind: 'api' })) });
  // createMatch 已生成第 1 轮地图
  const levels = [];
  const snapLevel = () => levels.push({ round: g.round, width: g.w, goalX: g.goalX });
  snapLevel();
  for (const w of d.windows) {
    if (g.status !== 'playing') break;
    const before = g.round;
    sim.advanceWindow(g, w.inputs);
    if (g.round !== before) snapLevel();
  }
  // 再取一次最终轮（若最后一轮未触发新 setup）
  if (levels[levels.length - 1].round !== g.round) snapLevel();
  const pushes = g.events.filter(e => e.type === 'push');
  const monsters = g.events.filter(e => e.type === 'monster');
  const respawns = g.events.filter(e => e.type === 'respawn');
  const rounds = g.events.filter(e => e.type === 'round');
  out[d.id] = {
    seed: d.seed, seats: d.seats,
    levels,
    finalFrame: g.frame, status: g.status, wins: g.wins,
    rounds: rounds.map(e => ({ round: e.round, team: e.team, t: e.t, frame: e.frame, reason: e.reason })),
    pushCount: pushes.length,
    pushes,
    monsters,
    respawns,
    eventCounts: g.events.reduce((a, e) => (a[e.type] = (a[e.type] || 0) + 1, a), {}),
  };
}
fs.writeFileSync(path.join(__dirname, 'round1_events.json'), JSON.stringify(out, null, 2), 'utf8');
for (const [id, o] of Object.entries(out)) {
  console.log('='.repeat(80));
  console.log(id, 'seed', o.seed, 'levels', JSON.stringify(o.levels), 'wins', o.wins, 'finalFrame', o.finalFrame);
  console.log('eventCounts', o.eventCounts);
  console.log('rounds', o.rounds);
  console.log('pushes', o.pushCount);
  for (const p of o.pushes) console.log('  push t=%s frame=%d from=%d to=%d x=%s', p.t, p.frame, p.from, p.to, p.x);
  console.log('monsters');
  for (const m of o.monsters) console.log('  spawn t=%s frame=%d x=%s', m.t, m.frame, m.x);
  console.log('respawns', o.respawns.length);
}
