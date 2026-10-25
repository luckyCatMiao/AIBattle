'use strict';
/* Kick/shot profile for a single game. Tooling only. */
const { playGame } = require('../tools/harness');

const args = process.argv.slice(2);
const o = { seed: 9001, n: 3, p0: 'python3 agent.py', p1: 'python3 lab/agent_aim.py', verbose: false };
for (let i = 0; i < args.length; i++) {
  const k = args[i];
  if (k === '--seed') o.seed = +args[++i];
  else if (k === '--n') o.n = +args[++i];
  else if (k === '--p0') o.p0 = args[++i];
  else if (k === '--p1') o.p1 = args[++i];
  else if (k === '--verbose') o.verbose = true;
}

function angleTo(ax, ay, bx, by) {
  return Math.atan2(by - ay, bx - ax) * 180 / Math.PI;
}
function angDiff(a, b) {
  let d = ((a - b + 540) % 360) - 180;
  return Math.abs(d);
}

(async () => {
  const g = await playGame({ seed: o.seed, teamSize: o.n, p0: o.p0, p1: o.p1 });
  const kicks = g.events.filter(e => e.type === 'kick');
  const goals = g.events.filter(e => e.type === 'goal');
  const per = [0, 1].map(t => {
    const ks = kicks.filter(e => e.team === t);
    let shots = 0, onTarget = 0, close = 0;
    for (const e of ks) {
      const gx = t === 0 ? 43 : 0;
      const ad = angDiff(e.angle * 180 / Math.PI, angleTo(e.x, e.y, gx, 13));
      const dist = Math.hypot(gx - e.x, 13 - e.y);
      if (dist < 25 && ad < 22) shots++;
      if (dist < 25 && ad < 10) close++;
      if (e.x > 20 === (t === 0) || e.x < 24 === (t === 0)) { /* noop */ }
    }
    return { kicks: ks.length, shots, close };
  });
  console.log(`seed=${o.seed} n=${o.n} p0=${o.p0} p1=${o.p1} score=${g.score.join(':')} reason=${g.reason} frames=${g.frame}`);
  console.log(`  kicks t0=${per[0].kicks} t1=${per[1].kicks}  shots(~) t0=${per[0].shots} t1=${per[1].shots}  close t0=${per[0].close} t1=${per[1].close}`);
  console.log(`  goals t0=${g.score[0]} t1=${g.score[1]}  fouls=${g.stats[0].fouls}/${g.stats[1].fouls} saves=${g.stats[0].saves}/${g.stats[1].saves}`);
  if (o.verbose) {
    for (const e of kicks) {
      const gx = e.team === 0 ? 43 : 0;
      const ad = angDiff(e.angle * 180 / Math.PI, angleTo(e.x, e.y, gx, 13)).toFixed(1);
      console.log(`  f=${String(e.frame).padStart(4)} ${e.unit} x=${e.x} y=${e.y} ang=${e.angle} toGoalDiff=${ad}`);
    }
  }
})();
