'use strict';
/* 逐回合分析：真引擎 + 两个 agent 进程。
 * 用法: node tools/analyze.js --seeds 1-20 [--agentA ..] [--agentB ..] [--json out.json]
 * 输出每个回合：阵营/胜负/原因/帧数/是否下包/下包时间/我方存活。
 */
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'simulation.js'));

function makeAgent(cmd, extraEnv) {
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...(extraEnv || {}) } });
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [], waiters = [];
  let bad = 0, stderr = '';
  p.stderr.on('data', d => { stderr += String(d); });
  rl.on('line', (line) => { let v = null; try { v = JSON.parse(line); } catch (e) { bad++; } if (waiters.length) waiters.shift()(v); else queue.push(v); });
  p.on('exit', () => { while (waiters.length) waiters.shift()(null); });
  return {
    ask(obs) {
      p.stdin.write(JSON.stringify(obs) + '\n');
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout')), 5000);
        const done = v => { clearTimeout(t); res(v); };
        if (queue.length) done(queue.shift()); else waiters.push(done);
      });
    },
    bad: () => bad, stderr: () => stderr,
    close() { try { p.kill(); } catch (e) {} },
  };
}

function parseSeeds(s) {
  const out = [];
  for (const part of String(s).split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part);
  }
  return out;
}
const args = process.argv.slice(2);
let seeds = [1], cmdA = 'python3 -u agent.py', cmdB = 'python3 -u tools/agent_r2.py', jsonOut = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seeds') seeds = parseSeeds(args[++i]);
  else if (args[i] === '--agentA') cmdA = args[++i];
  else if (args[i] === '--agentB') cmdB = args[++i];
  else if (args[i] === '--json') jsonOut = args[++i];
}

async function runGame(seed) {
  const g = sim.createMatch({ id: 'an' + seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [makeAgent(cmdA.split(' ')), makeAgent(cmdB.split(' '))];
  const rounds = [];
  const plantFrameByRound = {};
  try {
    while (g.status === 'playing') {
      if (g.phase === 'buy') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const buys = await Promise.all([agents[0].ask(views[0]), agents[1].ask(views[1])]);
        sim.submitBuys(g, 0, (buys[0] && buys[0].buys) || []);
        sim.submitBuys(g, 1, (buys[1] && buys[1].buys) || []);
      } else if (g.phase === 'live') {
        const rn = g.round, side0 = g.sides[0];
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const dec = await Promise.all([agents[0].ask(views[0]), agents[1].ask(views[1])]);
        const w0 = sim.submitWindow(g, 0, (dec[0] && dec[0].inputs) || []);
        const w1 = sim.submitWindow(g, 1, (dec[1] && dec[1].inputs) || []);
        const before = g.events.length;
        sim.advanceWindow(g, { 0: w0, 1: w1 });
        for (const e of g.events.slice(before)) {
          if (e.type === 'plant' && plantFrameByRound[rn] === undefined) plantFrameByRound[rn] = e.frame;
        }
        if (g.round !== rn || g.status !== 'playing') {
          const log = g.roundLog[g.roundLog.length - 1];
          if (log && log.round === rn) {
            rounds.push({
              round: rn, side0, winnerTeam: log.winnerTeam, reason: log.reason,
              frames: log.frames, bomb: log.bomb,
              plantFrame: plantFrameByRound[rn] === undefined ? null : plantFrameByRound[rn],
              u0: log.units.filter(u => u.team === 0).map(u => u.alive ? 1 : 0),
              u1: log.units.filter(u => u.team === 1).map(u => u.alive ? 1 : 0),
            });
          }
        }
      } else break;
    }
  } finally { agents.forEach(a => a.close()); }
  return { seed, roundWins: g.roundWins, winner: g.winner, rounds, bad: agents.map(a => a.bad()), stderr: agents.map(a => a.stderr()).slice(0, 2) };
}

(async () => {
  const out = [];
  for (const seed of seeds) {
    const r = await runGame(seed);
    out.push(r);
    console.log(JSON.stringify({
      seed, rw: r.roundWins, winner: r.winner,
      rounds: r.rounds.map(x => `r${x.round}:side0=${x.side0}:T${x.winnerTeam}:${x.reason}:f${x.frames}:plant${x.plantFrame === null ? '-' : x.plantFrame}:${x.bomb.state}${x.bomb.site ? '@' + x.bomb.site : ''}`),
    }));
  }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(out, null, 1));
})();
