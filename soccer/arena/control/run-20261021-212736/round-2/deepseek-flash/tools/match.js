'use strict';
// 自测对战工具：用官方 simulation.js 驱动两个子进程 agent，协议与比赛一致。
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const sim = require('/workspace/simulation.js');
const { teamSizeForSeed } = require('/workspace/catalog.js');

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i += 2) a[argv[i].replace(/^--/, '')] = argv[i + 1];
  return a;
}
const args = parseArgs(process.argv);
const seed = Number(args.seed || 1);
const teamSize = args.teamSize ? Number(args.teamSize) : teamSizeForSeed(seed);
const aCmd = (args.a || 'python3 /workspace/agent.py').split(' ');
const bCmd = (args.b || 'python3 /workspace/agents/baseline.py').split(' ');
const logDir = args.logdir || '/tmp/matchlogs';
fs.mkdirSync(logDir, { recursive: true });

function startAgent(cmd, tag) {
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'] });
  const err = fs.createWriteStream(path.join(logDir, tag + '.err'));
  p.stderr.pipe(err);
  let buf = '';
  const waiters = [];
  p.stdout.on('data', d => {
    buf += d.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i); buf = buf.slice(i + 1);
      if (waiters.length) waiters.shift()(line);
    }
  });
  p.on('exit', () => { while (waiters.length) waiters.shift()(null); });
  return {
    p,
    ask(line, timeoutMs = 5000) {
      return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve({ timeout: true }); } }, timeoutMs);
        waiters.push((l) => { if (!done) { done = true; clearTimeout(timer); resolve(l == null ? { eof: true } : { line: l }); } });
        p.stdin.write(line + '\n');
      });
    },
    kill() { try { p.kill('SIGKILL'); } catch (e) {} }
  };
}

function validateWindow(obj, n) {
  if (!obj || typeof obj !== 'object' || !Array.isArray(obj.inputs)) return 'no inputs';
  if (obj.inputs.length !== 20) return 'bad frames ' + obj.inputs.length;
  for (const f of obj.inputs) {
    if (!Array.isArray(f) || f.length !== n) return 'bad unit count';
    for (const u of f) {
      if (!u || typeof u !== 'object') return 'bad unit';
      // 交给官方校验
    }
  }
  return null;
}

async function main() {
  const g = sim.createMatch({ id: 'test', players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed, teamSize });
  const A = startAgent(aCmd, 'a');
  const B = startAgent(bCmd, 'b');
  const errors = { a: [], b: [] };
  let windows = 0;
  const maxWindows = 200;
  try {
    while (g.status === 'playing' && windows < maxWindows) {
      const views = [sim.view(g, 0), sim.view(g, 1)];
      const agents = [A, B];
      const resps = await Promise.all(agents.map((ag, i) => ag.ask(JSON.stringify(views[i]))));
      const frames = [];
      for (let t = 0; t < 2; t++) {
        const r = resps[t];
        const tag = t === 0 ? 'a' : 'b';
        if (!r || r.timeout || r.eof) { errors[tag].push(r && r.timeout ? 'timeout' : 'eof'); frames.push(null); continue; }
        let obj;
        try { obj = JSON.parse(r.line); } catch (e) { errors[tag].push('json: ' + e.message); frames.push(null); continue; }
        const bad = validateWindow(obj, g.teamSize);
        if (bad) { errors[tag].push(bad); frames.push(null); continue; }
        try { frames.push(sim.submitWindow(g, t, obj.inputs)); }
        catch (e) { errors[tag].push('submit: ' + e.message); frames.push(null); }
      }
      // 任何一方非法/超时 → 视为技术负，直接结束
      if (!frames[0] || !frames[1]) {
        g.status = 'finished';
        g.winner = frames[0] ? 1 : 0;
        g.reason = 'technical';
        break;
      }
      sim.advanceWindow(g, frames);
      windows++;
    }
  } finally {
    A.kill(); B.kill();
  }
  const out = {
    seed, teamSize, status: g.status, winner: g.winner, reason: g.reason,
    score: g.score, frame: g.frame, half: g.half, windows,
    errors, stats: g.stats,
    goals: g.events.filter(e => e.type === 'goal').map(e => ({ t: e.t, team: e.team, own: !!e.ownGoal })),
  };
  console.log(JSON.stringify(out));
}
main().catch(e => { console.error(e); process.exit(1); });
