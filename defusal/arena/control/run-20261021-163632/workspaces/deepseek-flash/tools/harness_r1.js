'use strict';
/* 本地对局驱动器：用 simulation.js 真引擎，驱动两个 agent.py 进程对打。 */
const { spawn } = require('child_process');
const readline = require('readline');
const sim = require('./simulation.js');

function makeAgent(cmd) {
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'inherit'] });
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [];
  const waiters = [];
  rl.on('line', (line) => {
    const v = JSON.parse(line);
    if (waiters.length) waiters.shift()(v); else queue.push(v);
  });
  p.on('exit', () => { while (waiters.length) waiters.shift()(null); });
  return {
    proc: p,
    ask(obs) {
      p.stdin.write(JSON.stringify(obs) + '\n');
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('agent timeout')), 5000);
        const done = (v) => { clearTimeout(t); res(v); };
        if (queue.length) done(queue.shift()); else waiters.push(done);
      });
    },
    close() { try { p.kill(); } catch (e) {} },
  };
}

async function runGame(seed, verbose) {
  const g = sim.createMatch({
    id: 'test' + seed,
    players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }],
    seed,
  });
  const cmdA = (process.env.AGENT_A || 'python3 -u agent.py').split(' ');
  const cmdB = (process.env.AGENT_B || 'python3 -u agent.py').split(' ');
  const agents = [makeAgent(cmdA), makeAgent(cmdB)];
  let steps = 0;
  const rounds = [];
  try {
    while (g.status === 'playing' && steps < 200000) {
      steps++;
      if (g.phase === 'buy') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const buys = await Promise.all([agents[0].ask(views[0]), agents[1].ask(views[1])]);
        sim.submitBuys(g, 0, (buys[0] && buys[0].buys) || []);
        sim.submitBuys(g, 1, (buys[1] && buys[1].buys) || []);
        if (verbose) {
          console.log(`r${g.round} buy`, JSON.stringify((buys[0] && buys[0].buys) || []));
        }
      } else if (g.phase === 'live') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const dec = await Promise.all([agents[0].ask(views[0]), agents[1].ask(views[1])]);
        let w0, w1;
        try { w0 = sim.submitWindow(g, 0, (dec[0] && dec[0].inputs) || []); }
        catch (e) { throw new Error('A bad window: ' + e.message); }
        try { w1 = sim.submitWindow(g, 1, (dec[1] && dec[1].inputs) || []); }
        catch (e) { throw new Error('B bad window: ' + e.message); }
        sim.advanceWindow(g, { 0: w0, 1: w1 });
      } else {
        break;
      }
    }
  } finally {
    agents.forEach(a => a.close());
  }
  rounds.push(...g.roundLog.map(r => ({ round: r.round, winnerTeam: r.winnerTeam, reason: r.reason, bomb: r.bomb })));
  return {
    seed, roundWins: g.roundWins, winner: g.winner, reason: g.reason,
    audit: g.mapAudit, rounds,
  };
}

(async () => {
  const seeds = process.argv.slice(2).map(Number);
  if (!seeds.length) seeds.push(1, 2, 3);
  let aWins = 0, bWins = 0, draws = 0;
  for (const seed of seeds) {
    const t0 = Date.now();
    const r = await runGame(seed, seeds.length === 1);
    if (r.winner === 0) aWins++; else if (r.winner === 1) bWins++; else draws++;
    console.log(JSON.stringify({
      seed, wins: r.roundWins, winner: r.winner, reason: r.reason,
      ms: Date.now() - t0,
      rounds: r.rounds.map(x => `${x.round}:${x.winnerTeam}:${x.reason}${x.bomb && x.bomb.site ? '@' + x.bomb.site : ''}`),
    }));
  }
  console.log(`TOTAL A=${aWins} B=${bWins} draw=${draws}`);
})();
