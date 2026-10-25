'use strict';
/* 在指定帧导出完整观察 + agent 决策，便于离线深度搜索复盘。
 * 用法: node probe.js <seed> <myTeam> <frame> [frameEnd]
 */
const sim = require('./simulation.js');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const PY = process.env.PYTHON || 'python';

const seed = Number(process.argv[2] || 9111);
const myTeam = Number(process.argv[3] || 1);
const f0 = Number(process.argv[4] || 189);
const f1 = Number(process.argv[5] || f0 + 20);

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

(async () => {
  const g = sim.createMatch({
    id: 'p', seed,
    players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'bot' }],
  });
  const agent = new AgentProc();
  let guard = 0;
  while (g.status === 'playing' && guard++ < 20000) {
    const obs = sim.view(g, myTeam);
    if (g.frame >= f0 - 5 && g.frame <= f1) {
      const raw = g.runners[myTeam], ro = g.runners[1 - myTeam];

    }
    const out = await agent.call(obs);
    if (g.frame >= f0 - 5 && g.frame <= f1) {
      const p = g.runners[myTeam];
      console.log(`W f=${g.frame} act=${JSON.stringify(out.inputs.map(x => [x[0].move, x[0].jump]))} ` +
        `me raw(x=${p.x.toFixed(4)} y=${p.y.toFixed(4)} vx=${p.vx.toFixed(2)} vy=${p.vy.toFixed(2)} og=${p.onGround}) ` +
        `op x=${g.runners[1 - myTeam].x.toFixed(2)} mons=${JSON.stringify(g.monsters.map(m => [+m.x.toFixed(2), m.dir]))}`);
      if (g.frame === f0 || (g.frame >= f0 && g.frame - 5 < f0)) {
        const rec = { seed, myTeam, round: g.round, frame: g.frame, obs,
                      raw: { x: p.x, y: p.y, vx: p.vx, vy: p.vy, og: p.onGround },
                      action: out.inputs };
        fs.writeFileSync(`_t/probe_${seed}_${myTeam}_${g.round}_${g.frame}.json`, JSON.stringify(rec));
      }
    }
    const myWin = sim.submitWindow(g, myTeam, out.inputs);
    const oppFrames = [];
    for (let i = 0; i < 5; i++) oppFrames.push([bot(g, 1 - myTeam)]);
    const oppWin = sim.submitWindow(g, 1 - myTeam, oppFrames);
    const windows = [];
    windows[myTeam] = myWin;
    windows[1 - myTeam] = oppWin;
    sim.advanceWindow(g, windows);
  }
  console.log('done', g.status, g.reason, JSON.stringify(g.wins));
  agent.kill();
})();
