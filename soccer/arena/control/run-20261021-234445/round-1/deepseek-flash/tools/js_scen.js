'use strict';
/* Scenario runner: sets an explicit match state, applies explicit per-frame inputs,
 * and dumps a trace for cross-checking the Python port.
 * Usage: node tools/js_scen.js <scenario.json> <out.json>
 */
const fs = require('fs');
const sim = require('../simulation');

const sc = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const outFile = process.argv[3] || 'scen_trace.json';
const g = sim.createMatch({ id: 's', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }],
  seed: sc.seed || 1, teamSize: sc.teamSize });
function dumpUnit(u) {
  return { id: u.id, team: u.team, index: u.index, x: u.x, y: u.y, fx: u.facing.x, fy: u.facing.y,
    kickCd: u.kickCd, controlLock: u.controlLock, stealLock: u.stealLock, foulLock: u.foulLock, held: u.held };
}
for (const su of sc.units || []) {
  const u = g.units.find(x => x.team === su.team && x.index === su.index);
  Object.assign(u, { x: su.x, y: su.y, kickCd: su.kickCd || 0, controlLock: su.controlLock || 0,
    stealLock: su.stealLock || 0, foulLock: su.foulLock || 0 });
  if (su.fx != null) u.facing = { x: su.fx, y: su.fy };
  if (su.dir) u.held = { dir: su.dir, aim: su.aim == null ? null : su.aim, kick: !!su.kick };
}
if (sc.ball) {
  g.ball = { x: sc.ball.x, y: sc.ball.y, vx: sc.ball.vx || 0, vy: sc.ball.vy || 0,
    owner: sc.ball.owner || null, lastTouch: sc.ball.lastTouch || null, lastTeam: sc.ball.lastTeam == null ? null : sc.ball.lastTeam };
}
if (sc.freeze != null) g.freeze = sc.freeze;
if (sc.frame != null) g.frame = sc.frame;
if (sc.half != null) g.half = sc.half;
if (sc.score) g.score = [...sc.score];
if (sc.kickoffTeam != null) g.kickoffTeam = sc.kickoffTeam;
if (sc.golden) { g.golden = true; g.goldenEnd = (sc.frame || 0) + (sc.goldenLeft || 400); }

const trace = { n: g.teamSize, seed: g.seed, initial: null, frames: [] };
trace.initial = {
  frame: g.frame, half: g.half, score: [...g.score], freeze: g.freeze, status: g.status,
  ball: { ...g.ball }, units: g.units.map(dumpUnit), kickoffTeam: g.kickoffTeam,
  golden: g.golden, goldenEnd: g.goldenEnd,
};
for (let i = 0; i < sc.frames.length && g.status === 'playing'; i++) {
  const fr = sc.frames[i];
  for (const u of g.units) {
    const inp = (fr[u.team] && fr[u.team][u.index]) || { dir: 'N', aim: null, kick: false };
    u.held = { dir: inp.dir == null ? 'N' : inp.dir, aim: inp.aim == null ? null : inp.aim, kick: !!inp.kick };
    u.inputHistory.push(u.held);
    if (u.inputHistory.length > 8) u.inputHistory.shift();
  }
  sim.step(g);
  trace.frames.push({ w: 0, i, inputs: { 0: fr[0] || [], 1: fr[1] || [] },
    state: {
      frame: g.frame, half: g.half, score: [...g.score], freeze: g.freeze, status: g.status,
      ball: { ...g.ball }, units: g.units.map(dumpUnit), kickoffTeam: g.kickoffTeam,
      golden: g.golden, goldenEnd: g.goldenEnd,
    } });
}
fs.writeFileSync(outFile, JSON.stringify(trace));
console.log('wrote', outFile, 'frames', trace.frames.length, 'score', g.score.join(':'),
  'events', g.events.map(e => e.type).join(','));
