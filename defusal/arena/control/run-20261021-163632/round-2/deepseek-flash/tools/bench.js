'use strict';
/* 并行基准：真引擎 + 两个 agent 进程。按“进攻/防守”分别统计回合胜负。
 * 用法: node tools/bench.js --seeds 1-20 --agentA 'python3 -u agent.py' --agentB 'python3 -u agent.py'
 *       [--envA 'K=V,K2=V2'] [--envB '...'] [--jobs 8] [--json out.json]
 * 输出:
 *   side0 attack (rounds 1-3): atkWins/defWins （team0 进攻胜 = team0 回合胜）
 *   side0 defend (rounds 4-6): ...
 *   atk 总胜率 = (team0 进攻回合胜 + team1 进攻回合胜) / 全部回合
 */
const { spawn } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'simulation.js'));

function parseEnv(s) {
  const out = {};
  if (!s) return out;
  for (const kv of String(s).split(',')) {
    if (!kv) continue; const i = kv.indexOf('=');
    if (i < 0) out[kv] = '1'; else out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
}
function makeAgent(cmd, extraEnv) {
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } });
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
let seeds = [1], cmdA = 'python3 -u agent.py', cmdB = 'python3 -u agent.py';
let envA = {}, envB = {}, jobs = 8, jsonOut = null;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seeds') seeds = parseSeeds(args[++i]);
  else if (args[i] === '--agentA') cmdA = args[++i];
  else if (args[i] === '--agentB') cmdB = args[++i];
  else if (args[i] === '--envA') envA = parseEnv(args[++i]);
  else if (args[i] === '--envB') envB = parseEnv(args[++i]);
  else if (args[i] === '--jobs') jobs = +args[++i];
  else if (args[i] === '--json') jsonOut = args[++i];
}

async function runGame(seed) {
  const g = sim.createMatch({ id: 'bn' + seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [makeAgent(cmdA.split(' '), envA), makeAgent(cmdB.split(' '), envB)];
  const rounds = [];
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
        let w0, w1;
        try { w0 = sim.submitWindow(g, 0, (dec[0] && dec[0].inputs) || []); }
        catch (e) { throw new Error('A bad window: ' + e.message); }
        try { w1 = sim.submitWindow(g, 1, (dec[1] && dec[1].inputs) || []); }
        catch (e) { throw new Error('B bad window: ' + e.message); }
        sim.advanceWindow(g, { 0: w0, 1: w1 });
        if (g.round !== rn || g.status !== 'playing') {
          const log = g.roundLog[g.roundLog.length - 1];
          if (log && log.round === rn) {
            const atkTeam = side0 === 'attack' ? 0 : 1;
            rounds.push({ round: rn, side0, atkTeam, winnerTeam: log.winnerTeam, reason: log.reason,
              frames: log.frames, bomb: log.bomb, plant: log.bomb && log.bomb.site ? 1 : 0 });
          }
        }
      } else break;
    }
  } finally { agents.forEach(a => a.close()); }
  return { seed, roundWins: g.roundWins, winner: g.winner, rounds, bad: agents.map(a => a.bad()), stderr: agents.map(a => a.stderr()) };
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let idx = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  }));
  return out;
}

(async () => {
  const results = await pool(seeds, jobs, async (seed) => {
    try { return await runGame(seed); }
    catch (e) { return { seed, error: String(e && e.message || e), rounds: [] }; }
  });
  const agg = {
    games: results.length, errors: results.filter(r => r.error).length,
    aWins: 0, bWins: 0, draws: 0,
    // team0 进攻回合（rounds 1-3）：team0/team1 回合胜
    t0atk: { atk: 0, def: 0 }, t0def: { atk: 0, def: 0 },
    reasons: {}, plant: { atk: 0, def: 0 },
  };
  for (const r of results) {
    if (r.error) continue;
    if (r.winner === 0) agg.aWins++; else if (r.winner === 1) agg.bWins++; else agg.draws++;
    for (const x of r.rounds) {
      const key = r.seed + ':' + x.round;
      const side0 = x.side0;
      const bucket = side0 === 'attack' ? agg.t0atk : agg.t0def;
      // 桶里的 atk/def 表示“进攻方/防守方”回合胜（与队伍无关）
      const atkWon = x.winnerTeam === x.atkTeam;
      if (atkWon) { bucket.atk++; agg.plant.atk += x.plant; }
      else { bucket.def++; agg.plant.def += x.plant; }
      const rk = x.reason;
      agg.reasons[rk] = (agg.reasons[rk] || 0) + 1;
    }
  }
  const totAtk = agg.t0atk.atk + agg.t0def.atk;
  const totDef = agg.t0atk.def + agg.t0def.def;
  agg.attackWinRate = +(totAtk / (totAtk + totDef || 1)).toFixed(4);
  agg.defenseWinRate = +(totDef / (totAtk + totDef || 1)).toFixed(4);
  agg.plantRate = +((agg.plant.atk + agg.plant.def) / (totAtk + totDef || 1)).toFixed(4);
  console.log(JSON.stringify(agg, null, 1));
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(results, null, 1));
  const bad = results.reduce((s, r) => s + (r.bad ? r.bad.reduce((a, b) => a + b, 0) : 0), 0);
  if (bad) console.log('BAD_WINDOWS', bad);
  for (const r of results) if (r.error) console.log('ERR', r.seed, r.error);
})();
