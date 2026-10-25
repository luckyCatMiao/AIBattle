'use strict';
/* 对局测试台：真实 simulation.js + 我的 agent.py(python 子进程) + 可配置对手 bot。
 * 用法: node match_test.js <seeds> [opp] [--verbose]
 */
const sim = require('./simulation.js');
const { spawn } = require('child_process');
const path = require('path');

const fs = require('fs');
const PY = process.env.PYTHON || 'python';

/* ---------------- 对手 bot ---------------- */
function groundTop(g, x) {
  for (let y = 6; y >= 0; y--) if (sim.solidWorld(g, x, y + 0.5)) return y + 1;
  return null;
}

function botPolicy(name) {
  if (name === 'idle') return () => ({ move: 0, jump: false });

  // 通用：向右跑，前方有坑/台阶/怪就跳
  const runPolicy = (g, team, frame, cfg) => {
    const p = g.runners[team];
    const half = 0.36;
    if (!p.onGround) return { move: 1, jump: false };
    const look = p.x + half;
    let jump = false;
    // 地形
    for (let d = cfg.gapLook; d >= 0.35; d -= 0.25) {
      const c = look + d;
      const top = groundTop(g, c);
      if (top === null) { jump = true; break; }
      if (top > p.y + 0.5) { jump = true; break; }
    }
    // 怪
    if (!jump) {
      for (const m of g.monsters) {
        const dd = m.x - p.x;
        if (dd > 0.6 && dd < cfg.monLook) { jump = true; break; }
      }
    }
    if (cfg.jitter && Math.random() < cfg.jitter) jump = !jump;
    return { move: 1, jump };
  };
  if (name === 'runner') return (g, t, f) => runPolicy(g, t, f, { gapLook: 1.5, monLook: 2.4 });
  if (name === 'runner2') return (g, t, f) => runPolicy(g, t, f, { gapLook: 2.2, monLook: 3.2 });
  if (name === 'sloppy') return (g, t, f) => runPolicy(g, t, f, { gapLook: 1.2, monLook: 1.8, jitter: 0.06 });
  return () => ({ move: 1, jump: false });
}

/* ---------------- agent 子进程 ---------------- */
class AgentProc {
  constructor() {
    this.p = spawn(PY, [path.join(__dirname, 'agent.py')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      cwd: __dirname,
    });
    this.buf = '';
    this.waiters = [];
    this.stderr = '';
    this.p.stdout.on('data', d => {
      this.buf += d.toString();
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i);
        this.buf = this.buf.slice(i + 1);
        const w = this.waiters.shift();
        if (w) w(line);
      }
    });
    this.p.stderr.on('data', d => {
      const t = d.toString();
      this.stderr += t;
      if (process.env.CAPTURE_STDERR) fs.appendFileSync(process.env.CAPTURE_STDERR, t);
    });
  }
  call(obs) {
    return new Promise((resolve, reject) => {
      const t0 = process.hrtime.bigint();
      const timer = setTimeout(() => reject(new Error('agent timeout 5s')), 5000);
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

/* ---------------- 一局 ---------------- */
async function runMatch(seed, myTeam, oppName, verbose) {
  const g = sim.createMatch({
    id: 'm' + seed, seed,
    players: [
      { name: myTeam === 0 ? 'me' : 'opp', kind: myTeam === 0 ? 'api' : 'bot' },
      { name: myTeam === 1 ? 'me' : 'opp', kind: myTeam === 1 ? 'api' : 'bot' },
    ],
  });
  const agent = new AgentProc();
  const selfPlay = oppName === 'self';
  const agent2 = selfPlay ? new AgentProc() : null;
  const bot = selfPlay ? null : botPolicy(oppName);
  const stats = { maxMs: 0, sumMs: 0, calls: 0, myDeaths: 0, oppDeaths: 0, error: null };
  const rounds = [];
  const deaths_ = [];
  let roundStart = g.frame;
  const ring = [];
  try {
    let guard = 0;
    while (g.status === 'playing' && guard++ < 20000) {
      const obs = sim.view(g, myTeam);
      let win;
      try {
        const r = await agent.call(obs);
        win = r.out;
        stats.maxMs = Math.max(stats.maxMs, r.ms);
        stats.sumMs += r.ms; stats.calls++;
        if (!win || !Array.isArray(win.inputs) || win.inputs.length !== 5) {
          throw new Error('bad window ' + JSON.stringify(win).slice(0, 120));
        }
      } catch (e) {
        stats.error = String(e && e.message || e);
        break;
      }
      const myWin = sim.submitWindow(g, myTeam, win.inputs);
      let oppWin;
      if (selfPlay) {
        const r2 = await agent2.call(sim.view(g, 1 - myTeam));
        oppWin = sim.submitWindow(g, 1 - myTeam, r2.out.inputs);
      } else {
        const oppFrames = [];
        for (let i = 0; i < 5; i++) oppFrames.push([bot(g, 1 - myTeam, g.frame + i)]);
        oppWin = sim.submitWindow(g, 1 - myTeam, oppFrames);
      }
      const windows = [];
      windows[myTeam] = myWin;
      windows[1 - myTeam] = oppWin;
      ring.push({ obs, win, raw: { x: g.runners[myTeam].x, y: g.runners[myTeam].y,
                                   vx: g.runners[myTeam].vx, vy: g.runners[myTeam].vy,
                                   og: g.runners[myTeam].onGround },
                  rawOther: { x: g.runners[1 - myTeam].x, y: g.runners[1 - myTeam].y,
                              vx: g.runners[1 - myTeam].vx, vy: g.runners[1 - myTeam].vy,
                              og: g.runners[1 - myTeam].onGround } });
      if (ring.length > 4) ring.shift();
      const evBefore = g.events.length;
      const goalBefore = g.goalX;
      const xBefore = [g.runners[0].x, g.runners[1].x];
      sim.advanceWindow(g, windows);
      for (let k = evBefore; k < g.events.length; k++) {
        const ev = g.events[k];
        if (ev.type === 'respawn') {
          const isMine = ev.team === myTeam;
          deaths_.push({ team: ev.team, reason: ev.reason, x: ev.x, y: ev.y, frame: ev.frame,
                         round: g.round, isMine, lastX: xBefore[ev.team] });
          if (isMine && process.env.DUMP_DEATH) {
            try {
              fs.writeFileSync(`_t/death_${seed}_${myTeam}_${g.round}_${ev.frame}.json`,
                JSON.stringify({ seed, myTeam, round: g.round, reason: ev.reason,
                  lastX: xBefore[ev.team], xOther: xBefore[1 - ev.team], ring }, null, 1));
            } catch (e) {}
          }
        }
        if (ev.type === 'round') {
          rounds.push({ round: ev.round, winner: ev.team, reason: ev.reason, wins: ev.wins.slice(),
                        dur: (ev.frame - roundStart) / 20, goalX: goalBefore });
          roundStart = ev.frame;
        }
      }
    }
    stats.replans = (agent.stderr.match(/\[replan\]/g) || []).length;
    stats.myDeaths = deaths_.filter(d => d.isMine).length;
    stats.oppDeaths = deaths_.filter(d => !d.isMine).length;
  } finally {
    agent.kill();
    if (agent2) agent2.kill();
  }
  return {
    seed, myTeam, winner: g.winner, wins: [...g.wins], status: g.status, reason: g.reason,
    rounds, deaths_, stats, finalMaxX: [g.runners[0].maxX, g.runners[1].maxX],
    goalX: g.goalX,
  };
}

/* ---------------- main ---------------- */
(async () => {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const verbose = process.argv.includes('--verbose');
  const n = Number(args[0] || 4);
  const oppName = args[1] || 'runner';
  const startSeed = Number(args[2] || 5000);
  let win = 0, loss = 0, draw = 0, err = 0;
  let myDeaths = 0, oppDeaths = 0, replans = 0, maxMs = 0, sumMs = 0, calls = 0;
  const t0 = Date.now();
  for (let i = 0; i < n; i++) {
    const seed = startSeed + i * 37;
    for (const team of [0, 1]) {
      const r = await runMatch(seed, team, oppName, verbose);
      if (r.stats.error) { err++; console.log('ERROR seed', seed, 'team', team, r.stats.error); continue; }
      const my = r.myTeam, op = 1 - my;
      const outcome = r.winner === my ? 'WIN' : (r.winner === op ? 'LOSS' : 'DRAW');
      if (outcome === 'WIN') win++; else if (outcome === 'LOSS') loss++; else draw++;
      myDeaths += r.stats.myDeaths; oppDeaths += r.stats.oppDeaths; replans += (r.stats.replans || 0);
      maxMs = Math.max(maxMs, r.stats.maxMs); sumMs += r.stats.sumMs; calls += r.stats.calls;
      if (verbose) {
        console.log(`seed=${seed} team=${my} ${outcome} wins=${r.wins.join(':')} reason=${r.reason} ` +
          `myDeaths=${r.stats.myDeaths} replans=${r.stats.replans} ` +
          `maxX=${r.finalMaxX.map(v => v.toFixed(1)).join('/')} goal=${r.goalX} avgMs=${(r.stats.sumMs / Math.max(1, r.stats.calls)).toFixed(0)}`);
        for (const dd of r.deaths_) console.log('   DEATH team', dd.team, 'mine=' + dd.isMine, dd.reason, 'lastX=' + (dd.lastX !== undefined ? dd.lastX.toFixed(2) : '?'), 'round', dd.round);
        for (const rd of r.rounds) console.log('   round', rd.round, 'winner', rd.winner, rd.reason, 'wins', rd.wins.join(':'), 'dur', rd.dur.toFixed(2) + 's', 'goal', rd.goalX, 'ideal', (rd.goalX / 6.8).toFixed(2) + 's');
      }
    }
  }
  console.log(`\n=== opp=${oppName} games=${n * 2} WIN=${win} LOSS=${loss} DRAW=${draw} ERR=${err}`);
  console.log(`myDeaths=${myDeaths} oppDeaths=${oppDeaths} replans=${replans} agentLatency avg=${(sumMs / Math.max(1, calls)).toFixed(1)}ms max=${maxMs.toFixed(0)}ms wall=${((Date.now() - t0) / 1000).toFixed(1)}s`);
})();
