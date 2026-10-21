'use strict';
/* 细粒度对局统计：逐回合记录下包时刻、双方存活、首窗口站位分布。
 * 用法: node tools/detail.js --seeds 1-20 [--agentA cmd] [--agentB cmd]
 * 输出每局一行 JSON（--verbose 时打印），最后一行汇总。
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
    if (i < 0) out[kv] = '1'; else out[kv.slice(0, i)] = kv.slice(i + 1);
  }
  return out;
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
function makeAgent(cmdline, extraEnv) {
  const cmd = Array.isArray(cmdline) ? cmdline : String(cmdline).split(' ');
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...extraEnv } });
  const rl = readline.createInterface({ input: p.stdout });
  const queue = [], waiters = [];
  let bad = 0, stderr = '';
  p.stderr.on('data', d => { stderr += String(d); });
  rl.on('line', line => {
    let v = null;
    try { v = JSON.parse(line); } catch (e) { bad++; }
    if (waiters.length) waiters.shift()(v); else queue.push(v);
  });
  p.on('exit', () => { while (waiters.length) waiters.shift()(null); });
  return {
    ask(obs) {
      p.stdin.write(JSON.stringify(obs) + '\n');
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout ' + cmd.join(' '))), 5000);
        const done = v => { clearTimeout(t); res(v); };
        if (queue.length) done(queue.shift()); else waiters.push(done);
      });
    },
    bad: () => bad, stderr: () => stderr,
    close() { try { p.kill(); } catch (e) {} },
  };
}

const siteOf = (p) => {
  for (const [name, s] of Object.entries(sim.rules ? require(path.join(__dirname, '..', 'catalog.js')).SITES : {})) {
    if (p.x >= s.x1 && p.x < s.x2 + 1 && p.y >= s.y1 && p.y < s.y2 + 1) return name;
  }
  return null;
};
const cat = require(path.join(__dirname, '..', 'catalog.js'));
function siteAtPoint(x, y) {
  for (const [name, s] of Object.entries(cat.SITES)) {
    if (x >= s.x1 && x < s.x2 + 1 && y >= s.y1 && y < s.y2 + 1) return name;
  }
  return null;
}

async function runGame(seed, opts) {
  const g = sim.createMatch({
    id: 'det' + seed + '_' + Math.random().toString(36).slice(2, 7),
    players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed,
  });
  const agents = [makeAgent(opts.cmdA, opts.envA), makeAgent(opts.cmdB, opts.envB)];
  let seenEvent = 0, startSnap = null;
  const roundInfo = {};
  let steps = 0;
  const cur = () => roundInfo[g.round] || (roundInfo[g.round] = { round: g.round, side0: g.sides[0], plants: [] });
  try {
    while (g.status === 'playing' && steps < 200000) {
      steps++;
      if (g.phase === 'buy') {
        const v = [sim.view(g, 0), sim.view(g, 1)];
        const b = await Promise.all([agents[0].ask(v[0]), agents[1].ask(v[1])]);
        sim.submitBuys(g, 0, (b[0] && b[0].buys) || []);
        sim.submitBuys(g, 1, (b[1] && b[1].buys) || []);
      } else if (g.phase === 'live') {
        if (!startSnap || startSnap.round !== g.round) {
          const i = cur();
          i.start = g.units.map(u => ({ team: u.team, idx: u.index, x: +u.x.toFixed(1), y: +u.y.toFixed(1), site: siteAtPoint(u.x, u.y) }));
        }
        const v = [sim.view(g, 0), sim.view(g, 1)];
        const d = await Promise.all([agents[0].ask(v[0]), agents[1].ask(v[1])]);
        const w0 = sim.submitWindow(g, 0, (d[0] && d[0].inputs) || []);
        const w1 = sim.submitWindow(g, 1, (d[1] && d[1].inputs) || []);
        sim.advanceWindow(g, { 0: w0, 1: w1 });
        for (const e of g.events) {
          if (e.id <= seenEvent) continue;
          seenEvent = e.id;
          if (e.type === 'plant') cur().plants.push({ frame: e.frame, site: e.site, x: e.x, y: e.y });
        }
        if (g.status !== 'playing' || g.phase !== 'live') { /* fallthrough */ }
      } else break;
    }
  } finally { agents.forEach(a => a.close()); }
  const rounds = g.roundLog.map(r => {
    const i = roundInfo[r.round] || {};
    const atkTeam = r.round <= 3 ? 0 : 1;
    const defTeam = 1 - atkTeam;
    const last = r.units;
    const aliveAtk = last.filter(u => u.team === atkTeam && u.alive).length;
    const aliveDef = last.filter(u => u.team === defTeam && u.alive).length;
    return {
      round: r.round, winner: r.winnerTeam, reason: r.reason, frames: r.frames,
      atkTeam, atkWon: r.winnerTeam === atkTeam,
      plant: i.plants && i.plants[0] ? i.plants[0] : null,
      bomb: r.bomb, aliveAtk, aliveDef,
      startAtkSite: (i.start || []).filter(u => u.team === atkTeam && u.site),
      startDefSites: (i.start || []).filter(u => u.team === defTeam).map(u => u.site),
      weapons: last.filter(u => u.team === atkTeam).map(u => u.weapon),
    };
  });
  return { seed, roundWins: g.roundWins, winner: g.winner, badA: agents[0].bad(), badB: agents[1].bad(), rounds };
}

(async () => {
  const args = process.argv.slice(2);
  let seeds = [1], verbose = false;
  const opts = { cmdA: 'python3 -u agent.py', cmdB: 'python3 -u tools/agent_r2.py', envA: {}, envB: {} };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seeds') seeds = parseSeeds(args[++i]);
    else if (args[i] === '--agentA') opts.cmdA = args[++i];
    else if (args[i] === '--agentB') opts.cmdB = args[++i];
    else if (args[i] === '--envA') opts.envA = parseEnv(args[++i]);
    else if (args[i] === '--envB') opts.envB = parseEnv(args[++i]);
    else if (args[i] === '--verbose') verbose = true;
  }
  const S = {
    games: 0, aWin: 0, bWin: 0, draw: 0,
    atkRounds: 0, atkWins: 0, defRounds: 0, defWins: 0,
    planted: 0, plantWon: 0, noPlant: 0, noPlantWon: 0,
    atkTimeout: 0, atkTimeoutsAlive: 0,
    postPlantDefuse: 0, postPlantExplode: 0, postPlantWipe: 0,
    plantFrames: [], lossFrames: [],
    firstDefGuess: [],
    roundRows: [],
    atkByRound: {},
  };
  for (const seed of seeds) {
    const r = await runGame(seed, opts);
    S.games++;
    if (r.winner === 0) S.aWin++; else if (r.winner === 1) S.bWin++; else S.draw++;
    if (verbose) console.log(JSON.stringify(r));
    for (const x of r.rounds) {
      const rb = S.atkByRound[x.round] || (S.atkByRound[x.round] = { n: 0, w: 0 });
      rb.n++; if (x.atkWon) rb.w++;
      // 只统计 A 队视角（先攻后守）
      if (x.atkTeam === 0) {
        S.atkRounds++;
        if (x.atkWon) S.atkWins++;
        if (x.plant) { S.planted++; S.plantFrames.push(x.plant.frame); if (x.atkWon) S.plantWon++; }
        else {
          S.noPlant++;
          if (x.atkWon) S.noPlantWon++;
          if (x.reason === '时间到') { S.atkTimeout++; if (x.aliveAtk > 0) S.atkTimeoutsAlive++; }
        }
        if (x.plant) {
          if (x.reason === '拆除炸弹') S.postPlantDefuse++;
          else if (x.reason === '炸弹爆炸') S.postPlantExplode++;
          else S.postPlantWipe++;
        }
      } else {
        S.defRounds++;
        if (x.atkWon === false) S.defWins++;
      }
      if (x.round === 1 && x.atkTeam === 1) S.firstDefGuess.push(x.startDefSites);
      S.roundRows.push({ seed, round: x.round, atkTeam: x.atkTeam, won: x.atkWon, reason: x.reason, frames: x.frames, plant: x.plant, aliveAtk: x.aliveAtk, aliveDef: x.aliveDef });
    }
  }
  const avg = a => a.length ? +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : null;
  S.plantFramesAvg = avg(S.plantFrames);
  S.atkRate = +(S.atkWins / Math.max(1, S.atkRounds)).toFixed(3);
  S.defRate = +(S.defWins / Math.max(1, S.defRounds)).toFixed(3);
  delete S.plantFrames; delete S.roundRows;
  console.log(JSON.stringify(S));
})();
