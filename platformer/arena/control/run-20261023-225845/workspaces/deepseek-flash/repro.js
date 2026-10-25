'use strict';
/* 复盘某个 seed：按秒打印我的位置/对手/怪物，定位"变慢"或死亡的原因。
 * 用法: node repro.js <seed> <myTeam> [round] [everyFrames]
 */
const sim = require('./simulation.js');
const { spawn } = require('child_process');
const path = require('path');
const PY = process.env.PYTHON || 'python';

const seed = Number(process.argv[2] || 9444);
const myTeam = Number(process.argv[3] || 1);
const wantRound = Number(process.argv[4] || 0);
const every = Number(process.argv[5] || 10);

class AgentProc {
  constructor() {
    this.p = spawn(PY, [path.join(__dirname, 'agent.py')], { stdio: ['pipe', 'pipe', 'pipe'], cwd: __dirname });
    this.buf = ''; this.waiters = [];
    this.p.stdout.on('data', d => {
      this.buf += d.toString(); let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        const w = this.waiters.shift(); if (w) w(line);
      }
    });
    this.p.stderr.on('data', () => {});
  }
  call(obs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 5000);
      this.waiters.push(line => { clearTimeout(timer); resolve(JSON.parse(line)); });
      this.p.stdin.write(JSON.stringify(obs) + '\n');
    });
  }
  kill() { try { this.p.kill(); } catch (e) {} }
}
function groundTop(g, x) {
  for (let y = 6; y >= 0; y--) if (sim.solidWorld(g, x, y + 0.5)) return y + 1;
  return null;
}
function bot(g, team) {
  const p = g.runners[team];
  if (!p.onGround) return { move: 1, jump: false };
  let jump = false;
  for (let d = 2.2; d >= 0.35; d -= 0.25) {
    const c = p.x + 0.36 + d;
    const top = groundTop(g, c);
    if (top === null || top > p.y + 0.5) { jump = true; break; }
  }
  if (!jump) for (const m of g.monsters) { const dd = m.x - p.x; if (dd > 0.6 && dd < 3.2) { jump = true; break; } }
  return { move: 1, jump };
}
function classify(g) {
  // 统计地形：坑/台阶
  return '';
}

(async () => {
  const g = sim.createMatch({
    id: 'r', seed,
    players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'bot' }],
  });
  const agent = new AgentProc();
  let guard = 0, roundStartFrame = 0, lastRound = 0;
  let stallFrames = 0, jumpCount = 0;
  const tl = [];
  while (g.status === 'playing' && guard++ < 20000) {
    if (g.round !== lastRound) { lastRound = g.round; roundStartFrame = g.frame; stallFrames = 0; jumpCount = 0; }
    const obs = sim.view(g, myTeam);
    const out = await agent.call(obs);
    const myWin = sim.submitWindow(g, myTeam, out.inputs);
    const oppFrames = [];
    for (let i = 0; i < 5; i++) oppFrames.push([bot(g, 1 - myTeam)]);
    const oppWin = sim.submitWindow(g, 1 - myTeam, oppFrames);
    const windows = [];
    windows[myTeam] = myWin;
    windows[1 - myTeam] = oppWin;
    const p0 = g.runners[myTeam];
    const before = { x: p0.x, deaths: p0.deaths };
    for (let i = 0; i < 5; i++) {
      for (const p of g.runners) {
        const frame = windows[p.team] && windows[p.team][i];
        p.held = (frame && frame[0]) || { move: 0, jump: false };
        p.inputHistory.push(p.held); if (p.inputHistory.length > 8) p.inputHistory.shift();
      }
      sim.step(g);
      const p = g.runners[myTeam];
      if (p.onGround && Math.abs(p.vx) < 1.0 && p.deaths === before.deaths) stallFrames++;
      if (p.held.jump) jumpCount++;
      if ((!wantRound || g.round === wantRound) && g.frame >= roundStartFrame && (g.frame - roundStartFrame) % every === 0) {
        const q = g.runners[1 - myTeam];
        tl.push(`  t=${((g.frame - roundStartFrame) / 20).toFixed(2)}s r${g.round} me x=${p.x.toFixed(2)} y=${p.y.toFixed(2)} vx=${p.vx.toFixed(1)} og=${p.onGround ? 1 : 0} d=${p.deaths} | op x=${q.x.toFixed(2)} og=${q.onGround ? 1 : 0} | mons ${g.monsters.map(m => m.x.toFixed(1) + '/' + m.dir).join(' ')}`);
      }
      if (g.status !== 'playing') break;
    }
    if ((!wantRound || g.round === wantRound) && g.events.length) {
      const ev = g.events[g.events.length - 1];
      if (ev.type === 'respawn') tl.push(`  *** respawn team=${ev.team} ${ev.reason} at f=${ev.frame}`);
    }
  }
  console.log(tl.join('\n'));
  console.log('rounds:', JSON.stringify(g.wins), 'status', g.status, g.reason);
  console.log('stallFrames(last round)=', stallFrames, 'jumpInputs=', jumpCount);
  agent.kill();
})();
