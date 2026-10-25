'use strict';
/* 离线测试台：用真实 simulation.js 跑整场比赛，agent 以子进程协议通信。
 * 用法:
 *   node tools/race.js --seeds 1,2,3 --agent "python3 agent.py" --opponent self|idle|none [--verbose]
 */
const { spawn } = require('child_process');
const path = require('path');
const sim = require('../simulation');

class Agent {
  constructor(cmd, name) {
    this.showErr = false;
    this.name = name;
    this.queue = [];
    this.waiters = [];
    this.buf = '';
    this.err = '';
    this.child = spawn(cmd[0], cmd.slice(1), { cwd: path.join(__dirname, '..'), stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stdout.on('data', d => {
      this.buf += d.toString('utf8');
      let i;
      while ((i = this.buf.indexOf('\n')) >= 0) {
        const line = this.buf.slice(0, i).trim();
        this.buf = this.buf.slice(i + 1);
        if (!line) continue;
        const w = this.waiters.shift();
        if (w) w.resolve(line); else this.queue.push(line);
      }
    });
    this.child.stderr.on('data', d => { const s = d.toString(); this.err += s; if (this.showErr) process.stderr.write('[' + this.name + '] ' + s); });
    this.child.on('exit', (code) => {
      for (const w of this.waiters) w.reject(new Error(`${this.name} exited ${code}: ${this.err.slice(-500)}`));
      this.waiters = [];
    });
  }
  ask(line) {
    this.child.stdin.write(line + '\n');
    if (this.queue.length) return Promise.resolve(this.queue.shift());
    return new Promise((resolve, reject) => {
      this.waiters.push({ resolve, reject });
    });
  }
  send(line) { this.child.stdin.write(line + '\n'); }
  close() { try { this.child.stdin.end(); } catch (e) {} try { this.child.kill(); } catch (e) {} }
}

function parseWindow(text) {
  const obj = JSON.parse(text);
  if (!obj || !Array.isArray(obj.inputs) || obj.inputs.length !== 20) throw new Error('bad window: ' + text.slice(0, 120));
  return obj.inputs.map((f, i) => {
    if (Array.isArray(f)) {
      if (f.length !== 1) throw new Error('frame ' + i + ' must have 1 car');
      return [norm(f[0])];
    }
    return [norm(f)];
  });
}
function norm(o) {
  const out = { throttle: 0, steer: 0, drift: false, boost: false };
  if (o && typeof o === 'object') {
    if (o.throttle != null) { const v = Number(o.throttle); if (!Number.isFinite(v)) throw new Error('bad throttle'); out.throttle = Math.max(-1, Math.min(1, v)); }
    if (o.steer != null) { const v = Number(o.steer); if (!Number.isFinite(v)) throw new Error('bad steer'); out.steer = Math.max(-1, Math.min(1, v)); }
    out.drift = !!o.drift; out.boost = !!o.boost;
  }
  return out;
}

const NEUTRAL = Array.from({ length: 20 }, () => [{ throttle: 0, steer: 0, drift: false, boost: false }]);

async function runMatch({ seed, agents, verbose }) {
  const g = sim.createMatch({ id: 'test', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const laps = [[], []];
  const offroad = [0, 0];
  const speeds = [[], []];
  let windows = 0;
  while (g.status === 'playing' && windows < 200) {
    // 只让真正的 agent 参赛；没有 agent 的一方保持中立
    const win = [];
    for (let t = 0; t < 2; t++) {
      if (agents[t]) {
        const text = await agents[t].ask(JSON.stringify(sim.view(g, t)));
        win.push(sim.submitWindow(g, t, parseWindow(text)));
      } else win.push(NEUTRAL);
    }
    for (const car of g.cars) if (car.offRoad) offroad[car.team]++;
    sim.advanceWindow(g, win);
    windows++;
    for (const car of g.cars) speeds[car.team].push(Math.hypot(car.vx, car.vy));
    if (verbose && g.frame % 20 === 0) {
      process.stderr.write(`f=${g.frame} ` + g.cars.map(c => {
        const s = c.progress - c.lap * g.track.length;
        return `p${c.team} ${c.x.toFixed(1)},${c.y.toFixed(1)} s=${s.toFixed(1)} v=${Math.hypot(c.vx, c.vy).toFixed(1)} cp=${c.nextCp} off=${c.offRoad ? 1 : 0}`;
      }).join(' | ') + '\n');
    }
    for (const e of g.events) if (e.type === 'lap' && e._seen !== true) { e._seen = true; laps[e.team].push(e.time); }
  }
  return { g, laps, offroad, speeds, windows };
}

async function main() {
  const args = process.argv.slice(2);
  const opt = { seeds: '1,2,3', agent: 'python3 agent.py', opponent: 'none', verbose: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--seeds') opt.seeds = args[++i];
    else if (a === '--agent') opt.agent = args[++i];
    else if (a === '--opponent') opt.opponent = args[++i];
    else if (a === '--verbose') opt.verbose = true;
    else if (a === '--json') opt.json = true;
  }
  const seeds = opt.seeds.split(',').map(Number);
  const cmd = opt.agent.split(' ');
  const results = [];
  for (const seed of seeds) {
    const agents = [new Agent(cmd, 'A'), opt.opponent === 'self' ? new Agent(cmd, 'B') : opt.opponent === 'idle' ? new Agent(cmd, 'B') : null];
    agents.forEach(a => { if (a) a.showErr = opt.verbose; });
    let r;
    try {
      r = await runMatch({ seed, agents, verbose: opt.verbose });
    } finally {
      agents.forEach(a => a && a.close());
    }
    const { g, laps, offroad, speeds } = r;
    const avgSpeed = speeds.map(sp => sp.length ? +(sp.reduce((a, b) => a + b, 0) / sp.length).toFixed(2) : 0);
    const info = {
      seed,
      status: g.status,
      winner: g.winner,
      reason: g.reason,
      progress: g.cars.map(c => +c.progress.toFixed(1)),
      lap: g.cars.map(c => c.lap),
      finished: g.cars.map(c => c.finished),
      time: g.frame / 20,
      lapTimes: laps.map(x => x.map(v => +v.toFixed(2))),
      offroadWindows: offroad,
      avgSpeed,
      cars: g.cars.map(c => ({ team: c.team, boosts: c.boosts, driftTime: +c.driftTime.toFixed(1), collisions: c.collisions })),
      events: g.events.filter(e => e.type === 'finish' || e.type === 'lap').map(e => ({ t: +e.t.toFixed(1), type: e.type, team: e.team, text: e.text })),
    };
    results.push(info);
    if (!opt.json) {
      const lt = laps.map(l => l.length ? (l.reduce((a, b) => a + b, 0) / l.length).toFixed(2) : '-');
      console.log(`seed ${seed}: ${g.status} winner=${g.winner} t=${(g.frame / 20).toFixed(1)}s laps=[${laps.map(l => l.length)}] avgLap=[${lt}] prog=[${info.progress}] avgV=[${avgSpeed}] offroadWin=[${offroad}] boosts=[${info.cars.map(c => c.boosts)}] drift=[${info.cars.map(c => c.driftTime)}] coll=[${info.cars.map(c => c.collisions)}]`);
    }
  }
  if (opt.json) console.log(JSON.stringify(results, null, 1));
}
main().catch(e => { console.error(e); process.exit(1); });
