'use strict';
/* A/B 对局台：两个 Python agent 对打，逐局统计。
   用法：node tools/ab.js <seeds> <agentA> <agentB> [seatA=0|both] */
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const sim = require(path.resolve(__dirname, '../../../../../../simulation.js'));
const WS = path.resolve(__dirname, '..');

class PyAgent {
  constructor(script) {
    this.script = script;
    this.proc = spawn('python', ['-I', script], { cwd: WS, stdio: ['pipe','pipe','pipe'] });
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.waiters = []; this.lines = [];
    this.rl.on('line', l => { if (this.waiters.length) this.waiters.shift()(l); else this.lines.push(l); });
    this.stderr = '';
    this.proc.stderr.on('data', d => { this.stderr += d.toString(); if (this.stderr.length > 300000) this.stderr = this.stderr.slice(-150000); });
  }
  ask(obs) {
    const t0 = Date.now();
    this.proc.stdin.write(JSON.stringify(obs) + '\n');
    return new Promise((res, rej) => {
      const done = l => { try { res({ reply: JSON.parse(l), ms: Date.now() - t0 }); } catch (e) { rej(new Error(this.script + ': ' + l.slice(0,150))); } };
      if (this.lines.length) done(this.lines.shift()); else this.waiters.push(done);
    });
  }
  close() { try { this.proc.stdin.end(); } catch (e) {} try { this.proc.kill(); } catch (e) {} }
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

async function playGame({ seed, seatA, scriptA, scriptB, maxWindows = 1600, profile }) {
  const g = sim.createMatch({ id: 'ab', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  const A = new PyAgent(scriptA), B = new PyAgent(scriptB);
  const ctr = [seatA === 0 ? A : B, seatA === 0 ? B : A];
  let maxMs = 0, sumMs = 0, nMs = 0, windows = 0;
  const prof = [];
  try {
    while (g.status === 'playing' && windows < maxWindows) {
      const ans = [];
      for (let s = 0; s < 2; s++) {
        const obs = Object.assign({}, sim.view(g, s)); obs.yourPlayer = s;
        const o = g.runners[1-s];
        const before = { x: g.runners[s].x, t: g.time, deaths: g.runners[s].deaths, phase: g.phase, frame: g.frame, vx: g.runners[s].vx, og: g.runners[s].onGround, oppx: o.x, oppvx: o.vx, oppy: o.y };
        const r = await ctr[s].ask(obs);
        if (ctr[s] === A) { maxMs = Math.max(maxMs, r.ms); sumMs += r.ms; nMs++; }
        ans[s] = normWindow(r.reply && r.reply.inputs !== undefined ? r.reply.inputs : r.reply);
        if (profile && s === seatA) prof.push(before);
      }
      const w = [sim.submitWindow(g, 0, ans[0]), sim.submitWindow(g, 1, ans[1])];
      sim.advanceWindow(g, w);
      if (profile) {
        const ps = prof[prof.length - 1];
        ps.dx = g.runners[seatA].x - ps.x;
        ps.dead = g.runners[seatA].deaths > ps.deaths;
        ps.race = ps.phase === 'race';
        ps.dt = g.time - ps.t;
        ps.round = g.round;
        ps.nx = g.runners[seatA].x; ps.nvx = g.runners[seatA].vx; ps.nog = g.runners[seatA].onGround;
        ps.noppx = g.runners[1-seatA].x; ps.noppvx = g.runners[1-seatA].vx;
      }
      windows++;
    }
  } finally { A.close(); B.close(); }
  const pushes = [0, 0], respawns = [0, 0];
  for (const e of g.events) { if (e.type === 'push') pushes[e.from]++; if (e.type === 'respawn') respawns[e.team]++; }
  const rounds = g.events.filter(e => e.type === 'round').map(e => ({ round: e.round, winner: e.team, reason: e.reason, wins: e.wins, t: e.t }));
  return { seed, seatA, winner: g.winner, wins: [...g.wins], rounds, pushes, respawns,
    maxX: g.runners.map(r => +r.maxX.toFixed(1)), finished: g.runners.map(r => r.finished),
    maxMs, avgMs: nMs ? Math.round(sumMs / nMs) : 0, windows, prof, stdoutErr: A.stderr };
}

(async () => {
  const seeds = (process.argv[2] || '1,2,3').split(',').map(Number);
  const scriptA = process.argv[3] || 'agent.py';
  const scriptB = process.argv[4] || 'tools/agent_r1.py';
  const seatMode = process.argv[5] || 'both';
  const profile = !!process.env.PROFILE;
  const out = [];
  let aw = 0, bw = 0, dr = 0;
  for (const seed of seeds) {
    const seats = seatMode === 'both' ? [0, 1] : [Number(seatMode)];
    for (const seatA of seats) {
      const r = await playGame({ seed, seatA, scriptA, scriptB, profile });
      const winA = r.winner === seatA;
      const oppSeat = 1 - seatA;
      const winB = r.winner === oppSeat;
      aw += winA ? 1 : 0; bw += winB ? 1 : 0; dr += (r.winner == null) ? 1 : 0;
      const roundsA = r.rounds.map(x => x.winner === null ? 'D' : (x.winner === seatA ? 'W' : 'L')).join('');
      const line = { seed, seatA, result: winA ? 'A' : winB ? 'B' : 'D', rounds: roundsA,
        roundReasons: r.rounds.map(x => x.reason), wins: r.wins, maxX: r.maxX,
        pushes: r.pushes, respawns: r.respawns, maxMs: r.maxMs, avgMs: r.avgMs, windows: r.windows };
      if (r.stdoutErr) line.err = r.stdoutErr.split('\n').slice(-2).join(' | ');
      console.log(JSON.stringify(line));
      out.push({ ...r, prof: undefined });
      if (profile) fs.writeFileSync(`tools/profile_${scriptA.replace(/[^a-z0-9.]/gi,'_')}_${seed}_${seatA}.json`, JSON.stringify(r.prof));
    }
  }
  console.log(`SUMMARY A=${scriptA} vs B=${scriptB} Awin=${aw} Bwin=${bw} draw=${dr}`);
  fs.writeFileSync('tools/ab_last.json', JSON.stringify(out, null, 1));
})();
