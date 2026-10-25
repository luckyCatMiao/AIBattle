'use strict';
/* 反事实测试：我的 agent（子进程） vs 对手在真实对局里记录的输入（开环重放）。
 * 用法: node replay_opponent.js [agentPath]
 * 只读取公开回放的 windows 输入，不读取对手代码。 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { spawn } = require('child_process');
const sim = require(path.join(__dirname, 'simulation.js'));

const RUN = path.resolve(__dirname, '..', '..');
const AGENT = path.resolve(__dirname, process.argv[2] || 'agent.py');
const PY = process.env.PYTHON || 'python';

class AgentProc {
  constructor() {
    this.p = spawn(PY, [AGENT], { stdio: ['pipe', 'pipe', 'pipe'], cwd: __dirname });
    this.buf = ''; this.waiters = []; this.stderr = '';
    this.p.stdout.on('data', d => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        const w = this.waiters.shift(); if (w) w(line);
      }
    });
    this.p.stderr.on('data', d => { this.stderr += d.toString(); });
  }
  call(obs) {
    return new Promise((resolve, reject) => {
      const t0 = process.hrtime.bigint();
      const timer = setTimeout(() => reject(new Error('agent timeout')), 5000);
      this.waiters.push(line => {
        clearTimeout(timer);
        try { resolve({ out: JSON.parse(line), ms: Number(process.hrtime.bigint() - t0) / 1e6 }); }
        catch (e) { reject(e); }
      });
      this.p.stdin.write(JSON.stringify(obs) + '\n');
    });
  }
  kill() { try { this.p.kill(); } catch (e) {} }
}

async function runOne(file, myTeam) {
  const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RUN, file))).toString('utf8'));
  const g = sim.createMatch({
    id: d.id + '-' + AGENT.split(/[\/]/).pop(),
    seed: d.seed,
    players: d.seats.map(name => ({ name, kind: 'api' })),
  });
  const agent = new AgentProc();
  const stats = { maxMs: 0, sumMs: 0, calls: 0, error: null };
  const rounds = [], pushes = [], respawns = [];
  let wi = 0, guard = 0;
  try {
    while (g.status === 'playing' && wi < d.windows.length && guard++ < 5000) {
      const obs = sim.view(g, myTeam);
      let win;
      try {
        const r = await agent.call(obs);
        win = r.out;
        stats.maxMs = Math.max(stats.maxMs, r.ms); stats.sumMs += r.ms; stats.calls++;
        if (!win || !Array.isArray(win.inputs) || win.inputs.length !== 5) throw Error('bad window');
      } catch (e) { stats.error = String(e.message || e); break; }
      const myWin = sim.submitWindow(g, myTeam, win.inputs);
      const oppWin = sim.submitWindow(g, 1 - myTeam, d.windows[wi].inputs[1 - myTeam]);
      const windows = []; windows[myTeam] = myWin; windows[1 - myTeam] = oppWin;
      const evBefore = g.events.length;
      const goalBefore = g.goalX;
      sim.advanceWindow(g, windows);
      for (let k = evBefore; k < g.events.length; k++) {
        const e = g.events[k];
        if (e.type === 'round') rounds.push({ round: e.round, winner: e.team, reason: e.reason, dur: e.frame / 20, goalX: goalBefore });
        if (e.type === 'push') pushes.push(e);
        if (e.type === 'respawn') respawns.push(e);
      }
      wi++;
    }
  } finally { agent.kill(); }
  return { game: d.id, myTeam, agent: path.basename(AGENT), wins: [...g.wins], winner: g.winner, status: g.status,
           rounds, pushes, respawns, stats, finalX: g.runners.map(r => r.maxX), resets: g.resetCount || 0 };
}

(async () => {
  const out = [];
  for (const file of ['r1-g1.json.gz', 'r1-g2.json.gz']) {
    // 真实对局里我所在的座位
    const d = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(RUN, file))).toString('utf8'));
    const myTeam = d.seats.indexOf('deepseek-flash');
    out.push(await runOne(file, myTeam));
  }
  for (const r of out) {
    console.log(JSON.stringify({ game: r.game, myTeam: r.myTeam, wins: r.wins, winner: r.winner,
      rounds: r.rounds.map(x => ({ round: x.round, winner: x.winner, goalX: x.goalX, dur: +x.dur.toFixed(2) })),
      pushes: r.pushes.map(p => ({ t: p.t, from: p.from, to: p.to, x: p.x })),
      myDeaths: r.respawns.filter(e => e.team === r.myTeam).length,
      oppDeaths: r.respawns.filter(e => e.team !== r.myTeam).length,
      avgMs: +(r.stats.sumMs / Math.max(1, r.stats.calls)).toFixed(1),
      maxMs: +r.stats.maxMs.toFixed(0), err: r.stats.error }));
  }
})();
