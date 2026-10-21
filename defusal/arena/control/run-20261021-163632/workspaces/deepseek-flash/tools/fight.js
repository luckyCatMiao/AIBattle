'use strict';
/* 单回合战斗日志：每 0.5s 打印各单位位置/HP，并汇总每个单位的开火数/命中数。
 * 用法: node tools/fight.js --seed 1 --round 1 --agentA '...' --agentB '...' [--envA ..] [--envB ..]
 */
const { spawn } = require('child_process');
const readline = require('readline');
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
  p.stderr.on('data', d => process.stderr.write('[agent] ' + d));
  rl.on('line', (line) => { let v = null; try { v = JSON.parse(line); } catch (e) {} if (waiters.length) waiters.shift()(v); else queue.push(v); });
  p.on('exit', () => { while (waiters.length) waiters.shift()(null); });
  return { ask(obs) { p.stdin.write(JSON.stringify(obs) + '\n'); return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 5000); const done = v => { clearTimeout(t); res(v); }; if (queue.length) done(queue.shift()); else waiters.push(done); }); }, close() { try { p.kill(); } catch (e) {} } };
}
const args = process.argv.slice(2);
let seed = 1, round = 1, envA = {}, envB = {}, cmdA = 'python3 -u agent.py', cmdB = 'python3 -u agent.py';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed') seed = +args[++i];
  else if (args[i] === '--round') round = +args[++i];
  else if (args[i] === '--envA') envA = parseEnv(args[++i]);
  else if (args[i] === '--envB') envB = parseEnv(args[++i]);
  else if (args[i] === '--agentA') cmdA = args[++i];
  else if (args[i] === '--agentB') cmdB = args[++i];
}
const shots = {}, hits = {}, dmg = {};
const key = u => u.id;
function note(map, id, v) { map[id] = (map[id] || 0) + v; }
(async () => {
  const g = sim.createMatch({ id: 'fight' + seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [makeAgent(cmdA.split(' '), envA), makeAgent(cmdB.split(' '), envB)];
  let lastRound = 0, nextLog = 0;
  try {
    while (g.status === 'playing') {
      if (g.phase === 'buy') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const buys = await Promise.all([agents[0].ask(views[0]), agents[1].ask(views[1])]);
        if (g.round === round) console.log(`BUY r${g.round} sides=${JSON.stringify(g.sides)} A=${JSON.stringify(buys[0] && buys[0].buys)} B=${JSON.stringify(buys[1] && buys[1].buys)}`);
        sim.submitBuys(g, 0, (buys[0] && buys[0].buys) || []);
        sim.submitBuys(g, 1, (buys[1] && buys[1].buys) || []);
      } else if (g.phase === 'live') {
        const views = [sim.view(g, 0), sim.view(g, 1)];
        const dec = await Promise.all([agents[0].ask(views[0]), agents[1].ask(views[1])]);
        const w0 = sim.submitWindow(g, 0, (dec[0] && dec[0].inputs) || []);
        const w1 = sim.submitWindow(g, 1, (dec[1] && dec[1].inputs) || []);
        const before = g.events.length;
        sim.advanceWindow(g, { 0: w0, 1: w1 });
        if (g.round === round) {
          const evs = g.events.slice(before);
          for (const e of evs) {
            if (e.type === 'shot') note(shots, e.unit, 1);
            else if (e.type === 'hit') note(hits, e.target, 1), note(dmg, e.target, e.damage || 0);
          }
          if (g.roundFrames >= nextLog) {
            nextLog += 10;
            const us = g.units.map(u => `${u.id}:${u.alive ? Math.round(u.hp) : 'X'}@${u.x.toFixed(1)},${u.y.toFixed(1)} f${Math.round(u.facing.x * 100) / 100},${Math.round(u.facing.y * 100) / 100} m${u.mag}/${u.reserve}`).join(' | ');
            console.log(`T${(g.roundFrames / 20).toFixed(1)} b=${g.bomb.state}${g.bomb.site ? '@' + g.bomb.site : ''} ${g.bomb.state === 'planted' ? 't=' + g.bomb.timer.toFixed(0) : ''} :: ${us}`);
          }
          if (g.roundFrames === 0 || g.bomb.state === 'planted' && !g._plantedSeen) {
            console.log(`-- PLANT/EARLY at frame ${g.roundFrames} bomb=${JSON.stringify(g.bomb)}`);
            g._plantedSeen = true;
          }
          for (const e of evs) if (['plant', 'defuse', 'explode', 'bombDrop', 'bombPickup', 'death'].includes(e.type)) console.log(`  EV T${(g.roundFrames / 20).toFixed(2)} ${e.type} ${e.text}${e.x !== undefined ? ' @' + e.x + ',' + e.y : ''}`);
        }
        if (g.round !== lastRound) lastRound = g.round;
      } else break;
    }
  } finally { agents.forEach(a => a.close()); }
  const log = g.roundLog.find(r => r.round === round);
  console.log('ROUND', JSON.stringify(log && { winnerTeam: log.winnerTeam, reason: log.reason, frames: log.frames, bomb: log.bomb }));
  for (const u of g.units) {
    console.log(`STAT ${u.id} ${u.weapon} shots=${shots[key(u)] || 0} hits_taken=${hits[key(u)] || 0} dmg_taken=${dmg[key(u)] || 0} k=${u.kills} d=${u.deaths} alive=${u.alive} money=${u.money}`);
  }
})();
