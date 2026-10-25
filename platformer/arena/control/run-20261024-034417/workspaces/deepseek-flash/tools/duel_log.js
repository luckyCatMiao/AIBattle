'use strict';
/* 完整对局日志：每窗口双方位置/速度/死亡，以及 push/respawn/round 事件。
   用法：node tools/duel_log.js <seed> <seatA> <agentA> <agentB> [outfile] */
const path = require('node:path');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const readline = require('node:readline');
const sim = require(path.resolve(__dirname, '../../../../../../simulation.js'));
const WS = path.resolve(__dirname, '..');

class PyAgent {
  constructor(s) {
    this.proc = spawn('python', ['-I', s], { cwd: WS, stdio: ['pipe', 'pipe', 'pipe'] });
    this.rl = readline.createInterface({ input: this.proc.stdout });
    this.waiters = []; this.lines = []; this.err = '';
    this.rl.on('line', l => { if (this.waiters.length) this.waiters.shift()(l); else this.lines.push(l); });
    this.proc.stderr.on('data', d => { this.err += d.toString(); if (this.err.length > 200000) this.err = this.err.slice(-100000); });
  }
  ask(o) {
    this.proc.stdin.write(JSON.stringify(o) + '\n');
    return new Promise((res, rej) => {
      const done = l => { try { res(JSON.parse(l)); } catch (e) { rej(e); } };
      if (this.lines.length) done(this.lines.shift()); else this.waiters.push(done);
    });
  }
  close() { try { this.proc.stdin.end(); } catch (e) {} try { this.proc.kill(); } catch (e) {} }
}
function norm(raw) {
  const o = [];
  for (let i = 0; i < 5; i++) {
    const f = Array.isArray(raw) ? raw[i] : null;
    if (Array.isArray(f)) o.push([{ move: Number(f[0] && f[0].move) || 0, jump: !!(f[0] && f[0].jump) }]);
    else if (f && typeof f === 'object') o.push([{ move: Number(f.move) || 0, jump: !!f.jump }]);
    else o.push([{ move: 0, jump: false }]);
  }
  return o;
}
(async () => {
  const seed = Number(process.argv[2]);
  const seatA = Number(process.argv[3] || 0);
  const scriptA = process.argv[4] || 'agent.py';
  const scriptB = process.argv[5] || 'agent.py';
  const outFile = process.argv[6];
  const g = sim.createMatch({ id: 'd', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  const A = new PyAgent(scriptA), B = new PyAgent(scriptB);
  const ctr = [seatA === 0 ? A : B, seatA === 0 ? B : A];
  const lines = [];
  const obsFd = process.env.DUMP_TEAM != null ? fs.openSync((outFile || 'tools/duel_log') + '.obs.jsonl', 'w') : null;
  let w = 0, evN = 0;
  while (g.status === 'playing' && w < 1600) {
    const ans = [];
    for (let s = 0; s < 2; s++) {
      const obs = Object.assign({}, sim.view(g, s)); obs.yourPlayer = s;
      if (obsFd != null && s === Number(process.env.DUMP_TEAM)) fs.writeSync(obsFd, JSON.stringify(obs) + '\n');
      ans[s] = norm((await ctr[s].ask(obs)).inputs);
    }
    sim.advanceWindow(g, [sim.submitWindow(g, 0, ans[0]), sim.submitWindow(g, 1, ans[1])]);
    const evs = g.events.slice(evN); evN = g.events.length;
    const evs2 = evs.filter(e => ['respawn', 'round', 'monster', 'finish', 'push'].includes(e.type));
    if (evs2.length) lines.push({ ev: evs2 });
    const r0 = g.runners[0], r1 = g.runners[1];
    lines.push({ t: g.time, r: g.round, ph: g.phase, d0: r0.deaths, d1: r1.deaths,
      x0: +r0.x.toFixed(2), y0: +r0.y.toFixed(2), vx0: +r0.vx.toFixed(2), og0: r0.onGround ? 1 : 0,
      x1: +r1.x.toFixed(2), y1: +r1.y.toFixed(2), vx1: +r1.vx.toFixed(2), og1: r1.onGround ? 1 : 0,
      i0: ans[0].map(f => (f[0].move > 0 ? '>' : f[0].move < 0 ? '<' : '.') + (f[0].jump ? 'J' : '')).join(''),
      mon: g.monsters.map(m => [+m.x.toFixed(2), m.dir]),
      i1: ans[1].map(f => (f[0].move > 0 ? '>' : f[0].move < 0 ? '<' : '.') + (f[0].jump ? 'J' : '')).join('') });
    w++;
  }
  lines.push({ final: { status: g.status, wins: [...g.wins], maxX: g.runners.map(r => +r.maxX.toFixed(2)), deaths: g.runners.map(r => r.deaths) } });
  const text = lines.map(l => JSON.stringify(l)).join('\n');
  if (obsFd != null) fs.closeSync(obsFd);
  if (outFile) fs.writeFileSync(outFile, text);
  else console.log(text);
  if (A.err || B.err) { fs.writeFileSync((outFile || 'tools/duel_log') + '.err', 'A:' + A.err + '\nB:' + B.err); }
  A.close(); B.close();
})();
