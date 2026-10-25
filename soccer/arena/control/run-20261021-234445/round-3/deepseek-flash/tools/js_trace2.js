'use strict';
/* Scenario trace generator: drives the real engine with a scripted chase policy,
 * so the Python port can be validated on possession/kicks/goals/fouls.
 * Usage: node tools/js_trace2.js <seed> <teamSize> <windows> <outfile> [mode]
 */
const fs = require('fs');
const sim = require('../simulation');
const c = require('../catalog');

const seed = Number(process.argv[2] || 1);
const teamSize = Number(process.argv[3] || 3);
const windows = Number(process.argv[4] || 6);
const outFile = process.argv[5] || 'trace.json';
const mode = process.argv[6] || 'chase';

const g = sim.createMatch({ id: 'v', players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }], seed, teamSize });
const n = g.teamSize;
const DIRS = ['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR'];
const V = { N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0], UL: [-1, -1], UR: [1, -1], DL: [-1, 1], DR: [1, 1] };

let rngState = 987654321 + seed * 7919 + teamSize;
function rnd() { rngState = (rngState * 1664525 + 1013904223) >>> 0; return rngState / 4294967296; }

function dirTo(dx, dy) {
  if (Math.abs(dx) < 1e-9 && Math.abs(dy) < 1e-9) return 'N';
  let best = 'N', bd = -2;
  for (const k of DIRS) {
    if (k === 'N') continue;
    const l = Math.hypot(V[k][0], V[k][1]);
    const d = (V[k][0] * dx + V[k][1] * dy) / l / (Math.hypot(dx, dy) || 1);
    if (d > bd) { bd = d; best = k; }
  }
  return best;
}

// scripted policy for one unit, from true state
function policy(u) {
  const b = g.ball;
  const ownGoalX = u.team === 0 ? 1 : 43;
  const oppGoalX = u.team === 0 ? 43 : 1;
  const isOwner = b.owner === u.id;
  let tx, ty;
  if (mode === 'chase') {
    tx = b.x; ty = b.y;
    if (u.index === 0) {
      // keeper: stay near own goal unless ball is close
      const dxg = b.x - ownGoalX;
      if (Math.abs(dxg) > 12) { tx = ownGoalX + (u.team === 0 ? 2 : -2); ty = 13; }
    }
    if (isOwner && rnd() < 0.12) {
      // kick at opponent goal
      const ang = Math.atan2(13 - u.y, oppGoalX - u.x) * 180 / Math.PI;
      return { dir: dirTo(oppGoalX - u.x, 13 - u.y), aim: ang, kick: true };
    }
    // deliberately dribble into opponent box sometimes, to trigger fouls
    if (isOwner && rnd() < 0.02) {
      tx = (u.team === 0 ? 38 : 6); ty = 13;
    }
  } else {
    // random walk but anchored
    tx = 22 + (rnd() - 0.5) * 40; ty = 13 + (rnd() - 0.5) * 22;
    if (isOwner && rnd() < 0.2) return { dir: 'N', aim: Math.floor(rnd() * 360), kick: true };
  }
  const dx = tx - u.x, dy = ty - u.y;
  const d = Math.hypot(dx, dy);
  let dir = dirTo(dx, dy);
  let aim = null;
  if (isOwner) aim = Math.atan2(dy, dx) * 180 / Math.PI;
  if (u.index === 0 && !isOwner && b.owner && Math.hypot(b.x - u.x, b.y - u.y) < 1.4) {
    // keeper sweep
    dir = dirTo(b.x - u.x, b.y - u.y);
  }
  return { dir, aim, kick: false };
}

function dumpUnit(u) {
  return { id: u.id, team: u.team, index: u.index, x: u.x, y: u.y, fx: u.facing.x, fy: u.facing.y,
    kickCd: u.kickCd, controlLock: u.controlLock, stealLock: u.stealLock, foulLock: u.foulLock, held: u.held };
}

const trace = { n, seed, initial: null, frames: [] };
trace.initial = {
  frame: g.frame, half: g.half, score: [...g.score], freeze: g.freeze, status: g.status,
  ball: { ...g.ball }, units: g.units.map(dumpUnit), kickoffTeam: g.kickoffTeam,
  golden: g.golden, goldenEnd: g.goldenEnd,
};

for (let w = 0; w < windows; w++) {
  if (g.status !== 'playing') break;
  for (let i = 0; i < sim.rules.decisionFrames && g.status === 'playing'; i++) {
    const inputs = { 0: [], 1: [] };
    for (const u of g.units) inputs[u.team][u.index] = policy(u);
    for (const u of g.units) {
      u.held = inputs[u.team][u.index];
      u.inputHistory.push(u.held);
      if (u.inputHistory.length > 8) u.inputHistory.shift();
    }
    sim.step(g);
    trace.frames.push({
      w, i, inputs: { 0: inputs[0].map(x => ({ ...x })), 1: inputs[1].map(x => ({ ...x })) },
      state: {
        frame: g.frame, half: g.half, score: [...g.score], freeze: g.freeze, status: g.status,
        ball: { ...g.ball }, units: g.units.map(dumpUnit), kickoffTeam: g.kickoffTeam,
        golden: g.golden, goldenEnd: g.goldenEnd,
      },
    });
  }
}
fs.writeFileSync(outFile, JSON.stringify(trace));
console.log('wrote', outFile, 'frames', trace.frames.length, 'score', g.score.join(':'),
  'events', g.events.map(e => e.type).join(','));
