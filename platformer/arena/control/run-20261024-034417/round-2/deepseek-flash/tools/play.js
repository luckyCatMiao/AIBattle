'use strict';
/* 本地对局测试：Python agent vs JS 练习机器人 / 自身 / 挂机。 */
const path = require('node:path');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const sim = require('../../../../../../simulation.js');
const { rules } = require('../../../../../../catalog.js');

const WS = path.resolve(__dirname, '..');

class PyAgent {
  constructor() {
    this.proc = spawn('python', ['agent.py'], { cwd: WS, stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.waiters = [];
    this.lines = [];
    this.rl.on('line', l => {
      if (this.waiters.length) this.waiters.shift()(l);
      else this.lines.push(l);
    });
    this.stderr = '';
    this.proc.stderr.on('data', d => { this.stderr += d.toString(); if (this.stderr.length > 200000) this.stderr = this.stderr.slice(-100000); });
  }
  ask(obs) {
    const t0 = Date.now();
    this.proc.stdin.write(JSON.stringify(obs) + '\n');
    return new Promise((resolve, reject) => {
      const done = l => {
        try { resolve({ reply: JSON.parse(l), ms: Date.now() - t0 }); }
        catch (e) { reject(new Error('bad json: ' + l.slice(0, 200))); }
      };
      if (this.lines.length) done(this.lines.shift());
      else this.waiters.push(done);
    });
  }
  close() { try { this.proc.stdin.end(); } catch (e) {} try { this.proc.kill(); } catch (e) {} }
}

class JsBot {
  constructor(g) { this.g = g; }
  async ask(obs) {
    const g = this.g;
    const seat = obs.yourPlayer;
    const frames = [];
    for (let i = 0; i < 5; i++) {
      const inp = sim.botInput ? sim.botInput(g, g.runners[seat]) : { move: 1, jump: false };
      frames.push([{ move: inp.move, jump: inp.jump }]);
    }
    return { reply: { inputs: frames }, ms: 0 };
  }
  close() {}
}

class IdleBot {
  async ask() { return { reply: { inputs: [[{ move: 0, jump: false }], [{ move: 0, jump: false }], [{ move: 0, jump: false }], [{ move: 0, jump: false }], [{ move: 0, jump: false }]] }, ms: 0 }; }
  close() {}
}

function normWindow(raw) {
  let frames = raw;
  if (!Array.isArray(frames) || frames.length === 0) throw new Error('bad window');
  const out = [];
  for (let i = 0; i < 5; i++) {
    const f = frames[i];
    if (Array.isArray(f)) out.push([{ move: Number(f[0]?.move) || 0, jump: !!f[0]?.jump }]);
    else if (f && typeof f === 'object') out.push([{ move: Number(f.move) || 0, jump: !!f.jump }]);
    else out.push([{ move: 0, jump: false }]);
  }
  return out;
}

async function playGame({ seed, seatOfAgent = 0, opp = 'bot', maxWindows = 1500 }) {
  const g = sim.createMatch({
    id: 'test', seed,
    players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }],
  });
  const controllers = [null, null];
  const py = seatOfAgent === 0 ? new PyAgent() : null;
  const py2 = seatOfAgent === 1 ? new PyAgent() : null;
  for (let s = 0; s < 2; s++) {
    if (s === seatOfAgent) controllers[s] = (py || py2);
    else if (opp === 'agent') controllers[s] = new PyAgent();
    else if (opp === 'idle') controllers[s] = new IdleBot();
    else controllers[s] = new JsBot(g);
  }
  let windows = 0, maxMs = 0, sumMs = 0, nMs = 0;
  try {
    while (g.status === 'playing' && windows < maxWindows) {
      const views = [sim.view(g, 0), sim.view(g, 1)];
      const answers = [];
      for (let s = 0; s < 2; s++) {
        const obs = Object.assign({}, views[s]);
        obs.yourPlayer = s;
        obs.decisionWindows = true;
        obs.framesPerWindow = 5;
        const r = await controllers[s].ask(obs);
        if (process.env.DUMP_OBS && (s === seatOfAgent)) {
          const fsx = require('node:fs');
          fsx.appendFileSync(process.env.DUMP_OBS, JSON.stringify({ seat: s, obs: { time: obs.time, frame: obs.frame, round: obs.round, runners: obs.runners, monsters: obs.monsters, platforms: obs.platforms, plants: obs.plants, saws: obs.saws, crumbling: obs.crumbling, gone: obs.gone }, reply: r.reply }) + "\n");
        }
        if (s === seatOfAgent || opp === 'agent') { maxMs = Math.max(maxMs, r.ms); sumMs += r.ms; nMs++; }
        const raw = r.reply && r.reply.inputs !== undefined ? r.reply.inputs : r.reply;
        answers[s] = normWindow(raw);
        if (process.env.LOG_INPUTS && s === seatOfAgent) {
          require('node:fs').appendFileSync(process.env.LOG_INPUTS, JSON.stringify({ f: obs.frame, t: obs.time, x: obs.runners[s].x, in: answers[s] }) + "\n");
        }
      }
      const w = [sim.submitWindow(g, 0, answers[0]), sim.submitWindow(g, 1, answers[1])];
      sim.advanceWindow(g, w);
      windows++;
    }
  } finally {
    controllers.forEach(c => c && c.close());
  }
  const pushes = [0, 0];
  for (const e of g.events) if (e.type === 'push') pushes[e.from] = (pushes[e.from] || 0) + 1;
  const respawns = [0, 0];
  for (const e of g.events) if (e.type === 'respawn') respawns[e.team] = (respawns[e.team] || 0) + 1;
  const events = g.events.filter(e => ['round', 'finish', 'go', 'respawn', 'push'].includes(e.type));
  return {
    winner: g.winner, wins: [...g.wins], status: g.status, rounds: g.round,
    events: events.map(e => ({ type: e.type, round: e.round, team: e.team, reason: e.reason, t: e.t, winst: e.wins })),
    runners: g.runners.map(r => ({ team: r.team, deaths: r.deaths, maxX: Math.round(r.maxX * 10) / 10, finished: r.finished })),
    pushes, respawns,
    maxMs, avgMs: nMs ? Math.round(sumMs / nMs) : 0, windows,
    agentStderr: (py || py2) ? ((py || py2).stderr || '') : '',
  };
}

async function main() {
  const seeds = (process.argv[2] || '1,2,3').split(',').map(Number);
  const fs = require('node:fs');
  const dump = process.env.DUMP_STDERR || null;
  const opp = process.argv[3] || 'bot';
  const seat = process.argv[4] != null ? Number(process.argv[4]) : 0;
  let aWins = 0, bWins = 0, draws = 0;
  for (const seed of seeds) {
    const r = await playGame({ seed, seatOfAgent: seat, opp });
    const aw = r.winner === seat ? 1 : 0;
    if (r.winner === seat) aWins++; else if (r.winner == null) draws++; else bWins++;
    console.log(JSON.stringify({ seed, winner: r.winner, seat, wins: r.wins, rounds: r.rounds, pushes: r.pushes, respawns: r.respawns, runners: r.runners, maxMs: r.maxMs, avgMs: r.avgMs, windows: r.windows, events: r.events.filter(e => e.type === 'round'), respawnEvents: r.events.filter(e => e.type === 'respawn').map(e => ({t: e.t, team: e.team, reasonHex: Buffer.from(e.reason || '', 'utf8').toString('hex')})) }));
    if (r.agentStderr) {
      console.error('  stderr tail:', r.agentStderr.split('\n').slice(-4).join(' | '));
      if (dump) fs.appendFileSync(dump, r.agentStderr);
    }
  }
  console.log(`SUMMARY opp=${opp} seat=${seat} agentwins=${aWins} oppwins=${bWins} draws=${draws}`);
}

main().catch(e => { console.error(e); process.exit(1); });
