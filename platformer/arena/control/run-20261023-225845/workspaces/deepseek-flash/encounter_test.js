'use strict';
/* 对抗性遭遇测试：把玩家和怪物摆到各种相对位置，检验避怪能力。
 * 用法: node encounter_test.js <trials>
 */
const sim = require('./simulation.js');
const { spawn } = require('child_process');
const path = require('path');
const PY = process.env.PYTHON || 'python';

class AgentProc {
  constructor() {
    this.p = spawn(PY, [path.join(__dirname, 'agent.py')], { stdio: ['pipe', 'pipe', 'pipe'], cwd: __dirname });
    this.buf = ''; this.waiters = [];
    this.p.stdout.on('data', d => {
      this.buf += d.toString();
      let i;
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
      this.waiters.push(line => {
        clearTimeout(timer);
        try { resolve(JSON.parse(line)); } catch (e) { reject(e); }
      });
      this.p.stdin.write(JSON.stringify(obs) + '\n');
    });
  }
  kill() { try { this.p.kill(); } catch (e) {} }
}

function flatStretch(g, x0, len) {
  for (let x = x0; x < x0 + len; x++) {
    if (!sim.solidWorld(g, x + 0.5, 2.5)) return false;
    if (sim.solidWorld(g, x + 0.5, 3.5)) return false; // 不要台阶，纯平地
  }
  return true;
}

(async () => {
  const trials = Number(process.argv[2] || 60);
  const agent = new AgentProc();
  let deaths = 0, fails = 0, done = 0, maxMs = 0;
  const details = [];
  try {
    for (let t = 0; t < trials; t++) {
      const seed = 20000 + t * 13;
      const g = sim.createMatch({
        id: 'e', seed,
        players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'bot' }],
      });
      while (g.phase === 'freeze') { g.runners[0].held = { move: 0, jump: false }; sim.step(g); }
      g.runners[1].x = -1000; g.runners[1].y = 3;
      // 找一段空地
      const w = g.w;
      let x0 = null;
      for (let attempt = 0; attempt < 200; attempt++) {
        const cand = 14 + Math.floor(Math.random() * (w - 60));
        if (flatStretch(g, cand, 26)) { x0 = cand; break; }
      }
      if (x0 === null) continue;
      // 摆放玩家
      const p = g.runners[0];
      p.x = x0 + 0.5; p.y = 3.0001; p.vx = 6.8; p.vy = 0; p.onGround = true; p.maxX = p.x;
      // 摆放怪物
      const d = 3 + Math.random() * 13;            // 3~16 格
      const dir = Math.random() < 0.5 ? 1 : -1;
      const mx = x0 + 0.5 + d;
      g.monsters = [{ id: 'mm', x: mx, y: 3, dir, alive: true }];
      g.monsterTimer = 1e9;  // 关掉自然刷新
      const monStart = mx;
      const startX = p.x;
      let frames = 0, dead = 0;
      while (g.phase === 'race' && g.status === 'playing' && frames < 90 && g.runners[0].deaths === 0) {
        const obs = sim.view(g, 0);
        const t0 = Date.now();
        const out = await agent.call(obs);
        maxMs = Math.max(maxMs, Date.now() - t0);
        sim.advanceWindow(g, [sim.submitWindow(g, 0, out.inputs), sim.submitWindow(g, 1, [[{ move: 0 }], [{ move: 0 }], [{ move: 0 }], [{ move: 0 }], [{ move: 0 }]])]);
        frames += 5;
        // 保持怪物计时器
        g.monsterTimer = 1e9;
      }
      done++;
      const died = g.runners[0].deaths > 0;
      const passed = g.runners[0].maxX > monStart + 1.0 || g.runners[0].x > monStart + 1.0;
      if (died) deaths++;
      if (!passed) fails++;
      if (died || !passed) details.push({ seed, x0, d: +d.toFixed(2), dir, died, passed, finalX: +g.runners[0].x.toFixed(2), maxX: +g.runners[0].maxX.toFixed(2), monStart: +monStart.toFixed(2), frames });
    }
  } finally { agent.kill(); }
  console.log(`trials=${done} deaths=${deaths} notPassed=${fails} maxMs=${maxMs}`);
  for (const d of details.slice(0, 25)) console.log(JSON.stringify(d));
})();
