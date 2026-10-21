'use strict';
/* 集成/时延测试：跑完整一局，校验每行输出形状，记录买卖与决策响应时延。
 * 用法: node tools/latency.js [--seed 7] [--cmdA 'python3 -u agent.py'] [--cmdB ...]
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'simulation.js'));
const DIRS = new Set(['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR']);
const AIM = new Set(['N', 'U', 'D', 'L', 'R', 'UL', 'UR', 'DL', 'DR']);

function makeAgent(cmdline) {
  const cmd = String(cmdline).split(' ');
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
  const rl = readline.createInterface({ input: p.stdout });
  const q = [], w = [];
  let stderr = '';
  p.stderr.on('data', d => { stderr += String(d); if (stderr.length > 5000) stderr = stderr.slice(-5000); });
  rl.on('line', l => { let v = null; try { v = JSON.parse(l); } catch (e) { v = { __bad: l }; } if (w.length) w.shift()(v); else q.push(v); });
  p.on('exit', () => { while (w.length) w.shift()(null); });
  return {
    ask(o) {
      const t0 = process.hrtime.bigint();
      p.stdin.write(JSON.stringify(o) + '\n');
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout 5s')), 5000);
        const done = v => { clearTimeout(t); res({ v, ms: Number(process.hrtime.bigint() - t0) / 1e6 }); };
        if (q.length) done(q.shift()); else w.push(done);
      });
    },
    stderr: () => stderr, close() { try { p.kill(); } catch (e) {} },
  };
}

function checkWindow(v) {
  const errs = [];
  if (!v || typeof v !== 'object') return ['非对象输出'];
  const ins = v.inputs;
  if (!Array.isArray(ins)) return ['缺少 inputs 数组'];
  if (ins.length !== 20) errs.push('帧数=' + ins.length);
  for (let f = 0; f < Math.min(20, ins.length); f++) {
    const fr = ins[f];
    if (!Array.isArray(fr)) { errs.push(`第${f}帧不是数组`); continue; }
    if (fr.length !== 5) errs.push(`第${f}帧单位数=${fr.length}`);
    for (const u of fr) {
      if (!u || typeof u !== 'object') { errs.push(`第${f}帧含非对象`); continue; }
      if (!DIRS.has(u.dir)) errs.push(`非法dir ${u.dir}`);
      if (!(u.aim === null || u.aim === undefined || AIM.has(u.aim))) errs.push(`非法aim ${u.aim}`);
    }
  }
  return errs;
}
function checkBuys(v) {
  if (!v || !Array.isArray(v.buys)) return ['缺少 buys 数组'];
  for (const b of v.buys) {
    if (!b || typeof b.unit !== 'number') return ['buy.unit 非数字'];
    if (b.weapon && !(b.weapon in sim.weapons)) return ['非法武器 ' + b.weapon];
  }
  return [];
}

(async () => {
  const args = process.argv.slice(2);
  let seed = 7, cmdA = 'python3 -u agent.py', cmdB = 'python3 -u agent.py';
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seed') seed = +args[++i];
    else if (args[i] === '--cmdA') cmdA = args[++i];
    else if (args[i] === '--cmdB') cmdB = args[++i];
  }
  const g = sim.createMatch({ id: 'lat' + seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const ag = [makeAgent(cmdA), makeAgent(cmdB)];
  const times = { buy: [], live: [] };
  const errors = [];
  try {
    while (g.status === 'playing') {
      if (g.phase === 'buy') {
        const os = [sim.view(g, 0), sim.view(g, 1)];
        const rs = await Promise.all([ag[0].ask(os[0]), ag[1].ask(os[1])]);
        times.buy.push(rs[0].ms, rs[1].ms);
        for (let t = 0; t < 2; t++) {
          if (!rs[t].v) { errors.push(`buy t${t} 无输出`); continue; }
          const e = checkBuys(rs[t].v);
          if (e.length) errors.push(`buy t${t}: ` + e.join('; '));
          sim.submitBuys(g, t, (rs[t].v && rs[t].v.buys) || []);
        }
      } else if (g.phase === 'live') {
        const os = [sim.view(g, 0), sim.view(g, 1)];
        const rs = await Promise.all([ag[0].ask(os[0]), ag[1].ask(os[1])]);
        times.live.push(rs[0].ms, rs[1].ms);
        const wins = [];
        for (let t = 0; t < 2; t++) {
          if (!rs[t].v) { errors.push(`live t${t} 无输出`); wins.push(sim.submitWindow(g, t, [])); continue; }
          const e = checkWindow(rs[t].v);
          if (e.length) errors.push(`live r${g.round} f${g.roundFrames} t${t}: ` + e.join('; '));
          wins.push(sim.submitWindow(g, t, (rs[t].v && rs[t].v.inputs) || []));
        }
        sim.advanceWindow(g, { 0: wins[0], 1: wins[1] });
      } else break;
    }
  } finally { ag.forEach(a => a.close()); }
  const stat = a => {
    if (!a.length) return null;
    const s = [...a].sort((x, y) => x - y);
    return { n: a.length, p50: +s[Math.floor(s.length * 0.5)].toFixed(1), p95: +s[Math.floor(s.length * 0.95)].toFixed(1), max: +s[s.length - 1].toFixed(1) };
  };
  console.log(JSON.stringify({
    seed, status: g.status, rounds: g.roundWins, reason: g.reason,
    buyMs: stat(times.buy), liveMs: stat(times.live),
    errors: errors.slice(0, 10), errorCount: errors.length,
    stderrTailA: ag[0].stderr().slice(-300), stderrTailB: ag[1].stderr().slice(-300),
  }));
})();
