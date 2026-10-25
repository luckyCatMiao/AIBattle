'use strict';
/* Offline match harness: plays simulation.js matches between internal bots
 * and/or external line-JSON agents (python3 agent.py). Not part of the submission. */

const path = require('path');
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require(process.env.SIM_DEBUG ? path.join(__dirname, 'sim_debug.js') : path.join(__dirname, '..', 'simulation.js'));

const DIRS = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};
const dirName = (dx, dy) => {
  const a = Math.atan2(dy, dx);
  const names = ['R', 'DR', 'D', 'DL', 'L', 'UL', 'U', 'UR'];
  let i = Math.round(a / (Math.PI / 4));
  i = ((i % 8) + 8) % 8;
  return names[i];
};

/* ---------------- internal bots ---------------- */
function botInputs(view, style = 'balanced') {
  const n = view.teamSize, t = view.yourTeam;
  const att = t === 0 ? 1 : -1;
  const goalX = t === 0 ? 43 : 0;
  const mine = view.units.filter(u => u.team === t);
  const foes = view.units.filter(u => u.team !== t);
  const b = view.ball;
  const frames = [];
  for (let f = 0; f < 20; f++) {
    const row = [];
    for (const u of mine) {
      let dir = 'N', aim = null, kick = false;
      const isKeeper = u.index === 0 && n >= 2;
      if (u.hasBall) {
        // shoot at a corner away from their keeper
        const fk = foes.find(x => x.index === 0) || { y: 13 };
        let ty = fk.y > 13 ? view.map.goals[t].y1 + 1.2 : view.map.goals[t].y2 - 1.2;
        if (style === 'chaser') ty = 13;
        const bx = b.x, by = b.y;
        const ang = Math.atan2(ty - by, goalX - bx) * 180 / Math.PI;
        aim = ang; kick = true; dir = 'N';
      } else if (isKeeper) {
        // stay near own goal, track ball y
        const ownX = t === 0 ? 2.0 : 41.0;
        const ty = Math.max(6.5, Math.min(19.5, b.y));
        const dx = ownX - u.x, dy = ty - u.y;
        dir = (Math.abs(dx) < 0.3 && Math.abs(dy) < 0.3) ? 'N' : dirName(dx, dy);
      } else {
        // chase ball
        const dx = b.x - u.x, dy = b.y - u.y;
        dir = (Math.abs(dx) < 0.05 && Math.abs(dy) < 0.05) ? 'N' : dirName(dx, dy);
      }
      row.push({ dir, aim, kick });
    }
    frames.push(row);
  }
  return frames;
}

/* ---------------- external process agent ---------------- */
class ProcAgent {
  constructor(name, cmd) {
    this.name = name;
    this.cmd = cmd;
    this.child = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = readline.createInterface({ input: this.child.stdout });
    this.queue = [];
    this.waiters = [];
    this.rl.on('line', line => {
      if (this.waiters.length) this.waiters.shift()(line);
      else this.queue.push(line);
    });
    this.child.stderr.on('data', d => {
      if (process.env.HARNESS_VERBOSE) process.stderr.write(`[${name} err] ${d}`);
    });
    this.child.on('exit', code => {
      while (this.waiters.length) this.waiters.shift()(null);
    });
  }
  request(obs) {
    return new Promise((resolve, reject) => {
      const line = JSON.stringify(obs);
      this.child.stdin.write(line + '\n');
      const timer = setTimeout(() => reject(new Error(`${this.name} timeout`)), 5000);
      const take = (l) => {
        clearTimeout(timer);
        if (l == null) return reject(new Error(`${this.name} died`));
        try { resolve(JSON.parse(l)); } catch (e) { reject(new Error(`${this.name} bad json: ${l.slice(0, 200)}`)); }
      };
      if (this.queue.length) take(this.queue.shift());
      else this.waiters.push(take);
    });
  }
  close() { try { this.child.stdin.end(); this.child.kill(); } catch (e) {} }
}

function mkAgent(spec, name) {
  if (spec.startsWith('bot:')) {
    const style = spec.slice(4);
    return { name, ext: false, request: async (obs) => ({ inputs: botInputs(obs, style) }) };
  }
  return new ProcAgent(name, spec.split(' '));
}

async function playGame({ seed, teamSize, p0, p1, verbose, handicap = null, startFrame = 0 }) {
  const agents = [mkAgent(p0, 'p0'), mkAgent(p1, 'p1')];
  const fs = require('fs');
  const dump = process.env.HARNESS_DUMP ? fs.createWriteStream(process.env.HARNESS_DUMP) : null;
  const g = sim.createMatch({
    id: 'h' + seed, seed,
    players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }],
    teamSize,
  });
  if (handicap) g.score = handicap.slice();
  if (startFrame) {
    g.frame = startFrame;
    g.tick = startFrame;
    if (startFrame >= 1200) g.half = 2;
  }
  let windows = 0;
  try {
    while (g.status === 'playing' && windows < 200) {
      const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
      const [r0, r1] = await Promise.all([agents[0].request(v0), agents[1].request(v1)]);
      const w0 = sim.submitWindow(g, 0, r0.inputs);
      const w1 = sim.submitWindow(g, 1, r1.inputs);
      if (dump) dump.write(JSON.stringify({
        frame: g.frame, score: g.score.slice(),
        ball: { x: g.ball.x, y: g.ball.y, vx: g.ball.vx, vy: g.ball.vy, owner: g.ball.owner },
        units: g.units.map(u => ({ id: u.id, x: u.x, y: u.y, fx: u.facing.x, fy: u.facing.y, held: u.held })),
        w0, w1,
      }) + '\n');
      sim.advanceWindow(g, [w0, w1]);
      windows++;
      if (verbose) process.stderr.write(`f=${g.frame} score=${g.score.join(':')}\n`);
    }
  } finally {
    agents.forEach(a => a.close && a.close());
    if (dump) dump.end();
  }
  return g;
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { seed: 1, teamSize: 3, p0: 'bot:balanced', p1: 'bot:balanced', games: 1, swap: true, verbose: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--seed') opt.seed = +args[++i];
    else if (a === '--teamSize') opt.teamSize = +args[++i];
    else if (a === '--p0') opt.p0 = args[++i];
    else if (a === '--p1') opt.p1 = args[++i];
    else if (a === '--games') opt.games = +args[++i];
    else if (a === '--no-swap') opt.swap = false;
    else if (a === '--verbose') opt.verbose = true;
  }
  const results = [];
  for (let i = 0; i < opt.games; i++) {
    const seed = opt.seed + i;
    const ts = opt.teamSize > 0 ? opt.teamSize : 1 + ((seed * 2654435761 >>> 0) % 6);
    const a = i % 2 === 1 && opt.swap ? opt.p1 : opt.p0;
    const b = i % 2 === 1 && opt.swap ? opt.p0 : opt.p1;
    const g = await playGame({ seed, teamSize: ts, p0: a, p1: b, verbose: opt.verbose });
    const goals = g.events.filter(e => e.type === 'goal').length;
    const fouls = g.events.filter(e => e.type === 'foul').length;
    const saves = g.events.filter(e => e.type === 'save').length;
    results.push({ seed, ts, score: g.score.slice(), winner: g.winner, reason: g.reason, goals, fouls, saves, weather: g.players.map(p => p.name) });
    console.log(`seed=${seed} n=${ts} p0=${a} p1=${b} -> ${g.score[0]}:${g.score[1]} winner=${g.winner} (${g.reason}) goals=${goals} fouls=${fouls}(t0=${g.stats[0].fouls},t1=${g.stats[1].fouls}) saves=${saves} kicks=${g.stats[0].kicks}/${g.stats[1].kicks} frames=${g.frame}`);
    if (process.env.HARNESS_EVENTS) {
      for (const e of g.events) {
        if (['goal', 'foul', 'save', 'half', 'golden', 'end'].includes(e.type))
          console.log(`  #${e.id} f=${e.frame} t=${e.t} ${e.type} ${JSON.stringify(e)}`);
      }
    }
  }
  // summary from perspective of p0 spec (seat composition alternates)
  let w0 = 0, d = 0, l = 0, gf = 0, ga = 0;
  for (const r of results) {
    // identify whether spec p0 was team 0 in this game
    // results order alternates; recompute
  }
  console.log('DONE');
}

if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
module.exports = { playGame, botInputs };
