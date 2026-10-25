'use strict';
/* Offline harness: drives our agent in-process against the REAL simulation.js.
 * Metrics are collected per physics frame. */
const sim = require('../simulation.js');
const { Agent } = require('../agent.js');

const neutral = () => ({ throttle: 0, steer: 0, drift: false, boost: false });
const neutralWindow = () => Array.from({ length: 20 }, () => [neutral()]);

function runGame(seed, opts = {}) {
  const cfg = opts.cfg || {};
  const agent = new Agent(cfg);
  const g = sim.createMatch({
    id: 'test' + seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed,
  });
  const park = () => { const c = g.cars[1]; c.x = 2; c.y = 2; c.vx = 0; c.vy = 0; };
  if (!opts.oppCfg) park();
  const agent2 = opts.selfPlay ? new Agent(cfg) : (opts.oppCfg ? new Agent(opts.oppCfg) : null);

  let windows = 0;
  let frames = 0, offroadFrames = 0, maxSpeed = 0, sumSpeed = 0;
  let stuckFrames = 0, maxStuck = 0, pathLen = 0, tLow = 0, tHigh = 0, boostFrames = 0;
  let lastX = g.cars[0].x, lastY = g.cars[0].y, lastProg = g.cars[0].progress, wraps = 0;
  const trace = [];
  const t0 = Date.now();
  let maxPlanMs = 0;

  while (g.status === 'playing' && windows < 340) {
    const obs = sim.view(g, 0);
    obs.decisionWindows = true; obs.framesPerWindow = 20;
    const ta = Date.now();
    const reply = agent.plan(obs);
    const dt = Date.now() - ta;
    if (dt > maxPlanMs) maxPlanMs = dt;
    const w0 = sim.submitWindow(g, 0, reply.inputs);
    let w1;
    if (opts.selfPlay || opts.oppCfg) {
      const obs2 = sim.view(g, 1);
      const rep2 = agent2.plan(obs2);
      w1 = sim.submitWindow(g, 1, rep2.inputs);
    } else if (opts.bot) {
      w1 = sim.submitWindow(g, 1, botWindow(g, opts.bot));
    } else {
      w1 = sim.submitWindow(g, 1, neutralWindow());
    }
    // manual advance so we can measure each physics frame
    for (let i = 0; i < 20 && g.status === 'playing'; i++) {
      g.cars[0].held = w0[i][0];
      g.cars[1].held = w1[i][0];
      sim.step(g);
      if (!opts.selfPlay && !opts.oppCfg) park();
      if (g.phase !== 'live') continue;
      const c = g.cars[0];
      const sp = Math.hypot(c.vx, c.vy);
      frames++;
      if (sp > maxSpeed) maxSpeed = sp;
      sumSpeed += sp;
      if (c.offRoad) offroadFrames++;
      if (c.boosting) boostFrames++;
      const moved = Math.hypot(c.x - lastX, c.y - lastY);
      pathLen += moved;
      if (sp < 12) tLow++;
      if (sp > 15) tHigh++;
      if (moved < 0.06) { stuckFrames++; if (stuckFrames > maxStuck) maxStuck = stuckFrames; } else stuckFrames = 0;
      lastX = c.x; lastY = c.y;
      if (c.progress < lastProg - g.track.length * 0.5) wraps++;
      lastProg = c.progress;
      if (opts.trace) trace.push({ f: g.frame, x: c.x, y: c.y, sp, s: c.progress, off: c.offRoad, be: c.boostEnergy });
    }
    windows++;
  }
  const c = g.cars[0];
  return {
    seed, status: g.status, winner: g.winner, reason: g.reason,
    finishTime: c.finishTime, lap: c.lap, nextCp: c.nextCp,
    bestLap: c.bestLap, progress: c.progress,
    offroadPct: frames ? (offroadFrames / frames * 100) : 0,
    boostPct: frames ? (boostFrames / frames * 100) : 0,
    avgSpeed: frames ? sumSpeed / frames : 0,
    maxSpeed, boosts: c.boosts, driftTime: c.driftTime, collisions: c.collisions,
    offroadFrames, frames, maxStuck, pathLen, tLow, tHigh, wraps, wallMs: Date.now() - t0, maxPlanMs, trace,
    endFrame: g.frame,
  };
}

/* simple opponent: follows the centerline with pure pursuit, no drift/boost */
function botWindow(g, strength = 1) {
  const c = g.cars[1];
  const pts = g.track.points;
  let best = 0, bd = Infinity;
  for (let i = 0; i < pts.length; i++) {
    const dx = pts[i].x - c.x, dy = pts[i].y - c.y, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; best = i; }
  }
  const n = pts.length;
  let idx = best, arc = 0;
  while (arc < 4.5) { idx = (idx + 1) % n; arc += Math.hypot(pts[(idx + 1) % n].x - pts[idx].x, pts[(idx + 1) % n].y - pts[idx].y); }
  const tgt = pts[idx];
  const v = Math.hypot(c.vx, c.vy);
  const psi = v > 0.5 ? Math.atan2(c.vy, c.vx) : c.angle;
  const alpha = ((Math.atan2(tgt.y - c.y, tgt.x - c.x) - psi + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  const steer = Math.max(-1, Math.min(1, alpha * 1.6));
  const acc = clampf(alpha * 1.2, -0.5, 1);
  const out = [];
  for (let i = 0; i < 20; i++) out.push([{ throttle: acc * strength, steer, drift: false, boost: false }]);
  return out;
}
function clampf(v, a, b) { return v < a ? a : v > b ? b : v; }

module.exports = { runGame };

if (require.main === module) {
  const args = process.argv.slice(2);
  const nSeed = Number(args[0] || 5);
  const baseSeed = Number(args[1] || 1000);
  const cfg = {};
  if (args[2]) Object.assign(cfg, JSON.parse(args[2]));
  let finished = 0, times = [];
  for (let i = 0; i < nSeed; i++) {
    const r = runGame(baseSeed + i, { cfg, bot: args.includes('--bot') });
    if (r.finishTime != null) { finished++; times.push(r.finishTime); }
    console.log(JSON.stringify({
      seed: r.seed, fin: r.finishTime, lap: r.lap, prog: +r.progress.toFixed(1),
      best: r.bestLap ? +r.bestLap.toFixed(1) : null,
      offPct: +r.offroadPct.toFixed(2), boostPct: +r.boostPct.toFixed(1), avg: +r.avgSpeed.toFixed(1),
      boosts: r.boosts, drift: +r.driftTime.toFixed(1), coll: r.collisions, stuck: r.maxStuck,
      planMs: r.maxPlanMs, wall: (r.wallMs / 1000).toFixed(1),
    }));
  }
  console.log(`finished ${finished}/${nSeed}  meanTime=${times.length ? (times.reduce((a, b) => a + b, 0) / times.length).toFixed(2) : '-'}`);
}
