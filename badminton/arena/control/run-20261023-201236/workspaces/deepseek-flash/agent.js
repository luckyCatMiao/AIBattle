'use strict';
/* 比赛入口：stdin 每行一个观察 JSON，stdout 每行一个 10 帧窗口。 */
const readline = require('node:readline');
const brain = require('./brain.js');

const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });

function sanitize(f) {
  const move = Number(f && f.move);
  const swing = f && f.swing;
  return {
    move: Number.isFinite(move) ? Math.max(-1, Math.min(1, move)) : 0,
    jump: !!(f && f.jump),
    swing: swing === 1 || swing === -1 ? swing : 0,
    charge: !!(f && f.charge),
    sprint: !!(f && f.sprint),
  };
}

rl.on('line', line => {
  if (!line.trim()) return;
  let out;
  try {
    const obs = JSON.parse(line);
    const res = brain.decide(obs);
    const frames = (res && res.frames) || [];
    out = { inputs: Array.from({ length: 10 }, (_, i) => [sanitize(frames[i])]) };
    if (process.env.BADMINTON_DEBUG) process.stderr.write(JSON.stringify(res.debug) + '\n');
  } catch (err) {
    process.stderr.write('decide error: ' + (err && err.stack || err) + '\n');
    out = { inputs: Array.from({ length: 10 }, () => [{ move: 0, jump: false, swing: 0, charge: false, sprint: false }]) };
  }
  process.stdout.write(JSON.stringify(out) + '\n');
});
