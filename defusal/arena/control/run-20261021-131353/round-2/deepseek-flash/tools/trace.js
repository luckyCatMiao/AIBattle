'use strict';
/* 逐窗口追踪一局：输出指定回合的单位位置/血量/炸弹与事件。
 * 用法: node tools/trace.js --seed 1 --round 4 --agentA ... --agentB ... [--envA ..] [--envB ..] [--every 10]
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
  return { proc: p, ask(obs) { p.stdin.write(JSON.stringify(obs) + '\n'); return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 5000); const done = v => { clearTimeout(t); res(v); }; if (queue.length) done(queue.shift()); else waiters.push(done); }); }, close() { try { p.kill(); } catch (e) {} } };
}
const args = process.argv.slice(2);
let seed = 1, round = 1, every = 10, envA = {}, envB = {}, cmdA = 'python3 -u agent.py', cmdB = 'python3 -u tools/agent_r1.py';
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--seed') seed = +args[++i];
  else if (args[i] === '--round') round = +args[++i];
  else if (args[i] === '--every') every = +args[++i];
  else if (args[i] === '--envA') envA = parseEnv(args[++i]);
  else if (args[i] === '--envB') envB = parseEnv(args[++i]);
  else if (args[i] === '--agentA') cmdA = args[++i];
  else if (args[i] === '--agentB') cmdB = args[++i];
}
(async () => {
  const g = sim.createMatch({ id: 'trace' + seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const agents = [makeAgent(cmdA.split(' '), envA), makeAgent(cmdB.split(' '), envB)];
  let lastRound = 0;
  const log = [];
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
          if (g.roundFrames % every === 0 || g.bomb.state === 'planted') {
            if (g.roundFrames % every === 0) {
              const us = g.units.map(u => `${u.id}:${u.alive ? Math.round(u.hp) + '/' + Math.round(u.armor) : 'X'}@${u.x.toFixed(1)},${u.y.toFixed(1)}`).join(' ');
              console.log(`T${(g.roundFrames / 20).toFixed(1)}s bomb=${g.bomb.state}${g.bomb.site ? '@' + g.bomb.site : ''}${g.bomb.state === 'planted' ? ' t=' + g.bomb.timer.toFixed(1) : ''} | ${us}`);
            }
          }
          for (const e of g.events.slice(before)) {
            if (['plant', 'defuse', 'explode', 'bombDrop', 'bombPickup', 'death'].includes(e.type)) {
              console.log(`  EV T${(g.roundFrames / 20).toFixed(2)}s ${e.type} ${e.text}${e.x !== undefined ? ` @${e.x},${e.y}` : ''}`);
            }
          }
        }
        if (g.round !== lastRound) { lastRound = g.round; }
      } else break;
    }
  } finally { agents.forEach(a => a.close()); }
  for (const r of g.roundLog) console.log(`ROUND ${r.round} winner=T${r.winnerTeam} ${r.reason} frames=${r.frames} bomb=${r.bomb.state}${r.bomb.site ? '@' + r.bomb.site : ''} units=${JSON.stringify(r.units.map(u => `${u.team}u${u.index}:${u.alive ? 'A' : 'D'}:${u.weapon}:k${u.kills}:$${u.money}`))}`);
})();
