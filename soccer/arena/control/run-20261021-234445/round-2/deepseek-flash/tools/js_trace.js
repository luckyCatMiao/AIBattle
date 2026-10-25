'use strict';
/* Validate the Python port against the real public engine.
 * Usage: node tools/js_trace.js <seed> <teamSize> <windows> <outfile>
 * Produces a JSON trace: initial state + for each frame the inputs and resulting state.
 */
const fs = require('fs');
const sim = require('../simulation');

const seed = Number(process.argv[2] || 1);
const teamSize = Number(process.argv[3] || 3);
const windows = Number(process.argv[4] || 3);
const outFile = process.argv[5] || 'trace.json';

const g = sim.createMatch({ id: 'v', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], seed, teamSize });
const n = g.teamSize;
const DIRS = ['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'];

let rngState = 12345 + seed * 7919 + teamSize;
function rnd() { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; }
function randInput() {
  const r = rnd();
  let dir = 'N';
  if (r < 0.75) dir = DIRS[Math.floor(rnd() * 9)];
  let aim = null;
  const a = rnd();
  if (a < 0.3) aim = DIRS[Math.floor(rnd() * 8)];
  else if (a < 0.6) aim = Math.floor(rnd() * 360);
  return { dir, aim, kick: rnd() < 0.25 };
}
function makeFrames() {
  const fr = [];
  for (let i = 0; i < sim.rules.decisionFrames; i++) {
    const f = [];
    for (let u = 0; u < n; u++) f.push(randInput());
    fr.push(f);
  }
  return fr;
}

function dumpUnit(u) {
  return { id: u.id, team: u.team, index: u.index, x: u.x, y: u.y, fx: u.facing.x, fy: u.facing.y,
    kickCd: u.kickCd, controlLock: u.controlLock, stealLock: u.stealLock, foulLock: u.foulLock,
    held: u.held };
}

const trace = { n, seed, initial: null, frames: [] };
trace.initial = {
  frame: g.frame, half: g.half, score: [...g.score], freeze: g.freeze, status: g.status,
  ball: { ...g.ball }, units: g.units.map(dumpUnit), kickoffTeam: g.kickoffTeam,
  golden: g.golden, goldenEnd: g.goldenEnd,
};

for (let w = 0; w < windows; w++) {
  if (g.status !== 'playing') break;
  const f0 = sim.submitWindow(g, 0, makeFrames());
  const f1 = sim.submitWindow(g, 1, makeFrames());
  for (let i = 0; i < sim.rules.decisionFrames && g.status === 'playing'; i++) {
    for (const u of g.units) {
      const frame = (u.team === 0 ? f0 : f1)[i];
      u.held = (frame && frame[u.index]) || { dir: 'N', aim: null, kick: false };
      u.inputHistory.push(u.held);
      if (u.inputHistory.length > 8) u.inputHistory.shift();
    }
    const before = { ball: { ...g.ball } };
    sim.step(g);
    trace.frames.push({
      w, i,
      inputs: { 0: f0[i], 1: f1[i] },
      state: {
        frame: g.frame, half: g.half, score: [...g.score], freeze: g.freeze, status: g.status,
        ball: { ...g.ball }, units: g.units.map(dumpUnit), kickoffTeam: g.kickoffTeam,
        golden: g.golden, goldenEnd: g.goldenEnd,
      },
    });
  }
}
fs.writeFileSync(outFile, JSON.stringify(trace));
console.log('wrote', outFile, 'frames', trace.frames.length, 'score', g.score.join(':'));
