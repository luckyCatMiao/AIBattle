'use strict';
/* 离线对战台：用 simulation.js 当裁判，可以接入 JS 机器人或外部 python 进程。
 * 只用于自测，不参与正式提交。 */
const path = require('path');
const { spawn } = require('child_process');
const sim = require('../simulation.js');

const DIRV = {
  N: [0, 0], U: [0, -1], D: [0, 1], L: [-1, 0], R: [1, 0],
  UL: [-Math.SQRT1_2, -Math.SQRT1_2], UR: [Math.SQRT1_2, -Math.SQRT1_2],
  DL: [-Math.SQRT1_2, Math.SQRT1_2], DR: [Math.SQRT1_2, Math.SQRT1_2],
};
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

function dirFor(dx, dy) {
  if (!dx && !dy) return 'N';
  const l = Math.hypot(dx, dy) || 1; dx /= l; dy /= l;
  let best = 'N', bd = -2;
  for (const k in DIRV) { const v = DIRV[k]; const d = v[0] * dx + v[1] * dy; if (d > bd) { bd = d; best = k; } }
  return best;
}

/* 外部 python 选手 */
class PyAgent {
  constructor(pythonPath, script, cwd, tag) {
    this.tag = tag || script;
    this.proc = spawn(pythonPath, [script], { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
    this.buf = ''; this.pending = []; this.err = '';
    this.proc.stdout.on('data', d => {
      this.buf += d.toString('utf8');
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i); this.buf = this.buf.slice(i + 1);
        const r = this.pending.shift();
        if (r) r(line);
      }
    });
    this.proc.stderr.on('data', d => { this.err += d.toString('utf8'); if (this.err.length > 40000) this.err = this.err.slice(-20000); });
    this.proc.on('error', e => { this.err += 'SPAWN ERROR ' + e.message; });
  }
  ask(obs) {
    return new Promise((res, rej) => {
      if (this.proc.exitCode !== null) return rej(new Error('agent exited: ' + this.err.slice(-500)));
      const timer = setTimeout(() => rej(new Error('agent timeout (5s) tag=' + this.tag)), 5000);
      this.pending.push(line => { clearTimeout(timer); res(line); });
      this.proc.stdin.write(JSON.stringify(obs) + '\n');
    });
  }
  kill() { try { this.proc.stdin.end(); this.proc.kill(); } catch (e) {} }
}

/* 通用逐帧规划：decide(i, pos, frame, hasBall) -> {target, aim, kick, speed} */
function plan(view, decide) {
  const me = view.yourTeam, n = view.teamSize;
  const mine = view.units.filter(u => u.team === me).sort((a, b) => a.index - b.index);
  const pos = mine.map(u => ({ x: u.x, y: u.y }));
  const ownerIdx = mine.findIndex(u => u.id === view.ball.owner);
  const frames = [];
  for (let f = 0; f < 20; f++) {
    const fr = [];
    for (let i = 0; i < n; i++) {
      const d = decide(i, pos[i], f, i === ownerIdx);
      let dir = 'N';
      if (d && d.target) {
        const dx = d.target.x - pos[i].x, dy = d.target.y - pos[i].y;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.06) {
          const sp = (d.speed || 3.15) * (i === ownerIdx ? 0.58 : 1);
          const v = DIRV[dirFor(dx, dy)];
          if (v[0] || v[1]) {
            dir = dirFor(dx, dy);
            pos[i] = { x: clamp(pos[i].x + v[0] * sp * 0.05, 0.34, 43.66), y: clamp(pos[i].y + v[1] * sp * 0.05, 0.34, 25.66) };
          }
        }
      }
      fr.push({ dir, aim: (d && d.aim !== undefined) ? d.aim : null, kick: !!(d && d.kick) });
    }
    frames.push(fr);
  }
  return frames;
}

const angleTo = (a, b) => {
  let d = Math.atan2(b.y - a.y, b.x - a.x) * 180 / Math.PI;
  return ((d % 360) + 360) % 360;
};

/* 模拟球的直线飞行（含上下墙反弹），返回轨迹采样 */
function ballTraj(bx, by, vx, vy, frames) {
  const out = []; let x = bx, y = by, X = vx, Y = vy;
  for (let f = 0; f < frames; f++) {
    x += X * 0.05; y += Y * 0.05;
    if (y < 0.22) { y = 0.22; Y = -Y * 0.72; }
    if (y > 25.78) { y = 25.78; Y = -Y * 0.72; }
    X *= 0.978; Y *= 0.978;
    out.push({ x, y });
  }
  return out;
}

async function runMatch({ seed, teamSize, agentA, agentB, maxWindows = 220 }) {
  const players = [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }];
  const g = sim.createMatch({ id: 'm', players, seed, teamSize });
  let wi = 0;
  while (g.status === 'playing' && wi < maxWindows) {
    const v0 = sim.view(g, 0), v1 = sim.view(g, 1);
    let w0, w1;
    [w0, w1] = await Promise.all([agentA(v0), agentB(v1)]);
    if (typeof w0 === 'string') w0 = JSON.parse(w0);
    if (typeof w1 === 'string') w1 = JSON.parse(w1);
    w0 = sim.submitWindow(g, 0, w0.inputs || w0);
    w1 = sim.submitWindow(g, 1, w1.inputs || w1);
    sim.advanceWindow(g, [w0, w1]);
    wi++;
  }
  return g;
}

module.exports = { runMatch, PyAgent, plan, dirFor, DIRV, clamp, angleTo, ballTraj, sim };
