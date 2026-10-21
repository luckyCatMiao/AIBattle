'use strict';
/* 批量对局实验：AGENT_A / AGENT_B 两个命令，跑一组种子，统计双方胜负与比赛细节。
 * 用法: AGENT_A='python3 -u agent.py' AGENT_B='python3 -u tools/agent_r1.py' \
 *       node tools/exp.js --seeds 1-20 [--envA k=v,k=v] [--envB k=v] [--verbose]
 *
 * 统计口径：team0 (A) 前 3 回合进攻、后 3 回合防守（与正式一致）。
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'simulation.js'));

function parseEnv(s) {
  const out = {};
  if (!s) return out;
  for (const kv of String(s).split(',')) {
    if (!kv) continue;
    const i = kv.indexOf('=');
    if (i < 0) out[kv] = '1';
    else out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}

function makeAgent(cmd, extraEnv) {
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } });
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [];
  const waiters = [];
  let stderr = '';
  let bad = 0;
  p.stderr.on('data', d => { stderr += String(d); });
  rl.on('line', (line) => {
    let v;
    try { v = JSON.parse(line); } catch (e) { v = null; bad++; }
    if (waiters.length) waiters.shift()(v); else queue.push(v);
  });
  p.on('exit', () => { while (waiters.length) waiters.shift()(null); });
  return {
    proc: p,
    stderr: () => stderr,
    badLines: () => bad,
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

function parseSeeds(spec) {
  const out = [];
  for (const part of String(spec).split(',')) {
    const m = part.match(/^(\d+)-(\d+)$/);
    if (m) { for (let i = +m[1]; i <= +m[2]; i++) out.push(i); }
    else if (part.trim()) out.push(+part);
  }
  return out;
}

async function runGame(seed, opts) {
  const g = sim.createMatch({
    id: 'exp' + seed + '_' + Math.random().toString(36).slice(2, 7),
    players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }],
    seed,
  });
  const cmdA = (process.env.AGENT_A || 'python3 -u agent.py').split(' ');
  const cmdB = (process.env.AGENT_B || 'python3 -u tools/agent_r1.py').split(' ');
  const agents = [makeAgent(cmdA, opts.envA), makeAgent(cmdB, opts.envB)];
  let steps = 0;
  const sites = [];
  try {
    while (g.status === 'playing' && steps < 200000) {
      steps++;
      if (g.phase === 'buy') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const buys = await Promise.all([agents[0].ask(views[0]), agents[1].ask(views[1])]);
        sim.submitBuys(g, 0, (buys[0] && buys[0].buys) || []);
        sim.submitBuys(g, 1, (buys[1] && buys[1].buys) || []);
      } else if (g.phase === 'live') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const dec = await Promise.all([agents[0].ask(views[0]), agents[1].ask(views[1])]);
        let w0, w1;
        try { w0 = sim.submitWindow(g, 0, (dec[0] && dec[0].inputs) || []); }
        catch (e) { throw new Error('A bad window: ' + e.message); }
        try { w1 = sim.submitWindow(g, 1, (dec[1] && dec[1].inputs) || []); }
        catch (e) { throw new Error('B bad window: ' + e.message); }
        sim.advanceWindow(g, { 0: w0, 1: w1 });
      } else break;
    }
  } finally {
    agents.forEach(a => a.close());
  }
  return {
    seed, roundWins: g.roundWins, winner: g.winner, reason: g.reason,
    badA: agents[0].badLines(), badB: agents[1].badLines(),
    rounds: g.roundLog.map(r => ({
      round: r.round, winnerTeam: r.winnerTeam, reason: r.reason,
      frames: r.frames, bomb: r.bomb,
      units: r.units.map(u => ({ team: u.team, index: u.index, hp: u.hp, alive: u.alive, weapon: u.weapon, kills: u.kills, money: u.money })),
    })),
  };
}

(async () => {
  const args = process.argv.slice(2);
  let seeds = [1];
  let verbose = false;
  const opts = { envA: {}, envB: {} };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seeds') seeds = parseSeeds(args[++i]);
    else if (args[i] === '--verbose') verbose = true;
    else if (args[i] === '--envA') opts.envA = parseEnv(args[++i]);
    else if (args[i] === '--envB') opts.envB = parseEnv(args[++i]);
    else if (args[i] === '--agentA') process.env.AGENT_A = args[++i];
    else if (args[i] === '--agentB') process.env.AGENT_B = args[++i];
  }
  const games = [];
  const t0 = Date.now();
  let aWin = 0, bWin = 0, draw = 0;
  for (const seed of seeds) {
    const r = await runGame(seed, opts);
    games.push(r);
    if (r.winner === 0) aWin++; else if (r.winner === 1) bWin++; else draw++;
    if (verbose) console.log(JSON.stringify({
      seed, wins: r.roundWins, winner: r.winner,
      rounds: r.rounds.map(x => `${x.round}:T${x.winnerTeam}:${x.reason}${x.bomb && x.bomb.site ? '@' + x.bomb.site : ''}`),
    }));
  }
  // 统计：A 前3回合进攻、后3回合防守
  let aAtk = 0, aAtkW = 0, aDef = 0, aDefW = 0;
  let atkPlanted = 0, atkRounds = 0;
  const siteStat = {}; // site -> {rounds, atkWins}
  const reasons = {};
  for (const r of games) {
    for (const x of r.rounds) {
      const aIsAttack = x.round <= 3;
      const attackerTeam = aIsAttack ? 0 : 1;
      const atkWon = x.winnerTeam === attackerTeam;
      if (aIsAttack) { aAtk++; if (atkWon) aAtkW++; } else { aDef++; if (!atkWon) aDefW++; }
      atkRounds++;
      reasons[x.reason] = (reasons[x.reason] || 0) + 1;
      const site = x.bomb && x.bomb.site ? x.bomb.site : '-';
      const planted = x.bomb && ['planted', 'defused', 'exploded'].includes(x.bomb.state);
      if (planted) atkPlanted++;
      const key = (aIsAttack ? 'ourAtk@' : 'oppAtk@') + site;
      siteStat[key] = siteStat[key] || { rounds: 0, atkWins: 0, planted: 0 };
      siteStat[key].rounds++;
      if (atkWon) siteStat[key].atkWins++;
      if (planted) siteStat[key].planted++;
    }
  }
  const out = {
    games: games.length, aWin, bWin, draw,
    aAttackRounds: aAtk, aAttackWins: aAtkW, aAttackRate: aAtk ? +(aAtkW / aAtk).toFixed(3) : null,
    aDefendRounds: aDef, aDefendWins: aDefW, aDefendRate: aDef ? +(aDefW / aDef).toFixed(3) : null,
    attackPlantRate: atkRounds ? +(atkPlanted / atkRounds).toFixed(3) : null,
    siteStat, reasons, badA: games.reduce((s, r) => s + r.badA, 0), badB: games.reduce((s, r) => s + r.badB, 0),
    ms: Date.now() - t0,
  };
  console.log(JSON.stringify(out));
})();
