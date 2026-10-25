// 自测对战台：把两个「程序型」选手按 20Hz / 15 帧窗口协议跑完整场车轮战。
const path = require('path');
const { spawn } = require('child_process');
const sim = require('./simulation.patched.js');

function makeProc(cmd, args, cwd) {
  const p = spawn(cmd, args, { cwd, stdio: ['pipe', 'pipe', 'pipe'] });
  let buf = '';
  const waiters = [];
  p.stdout.on('data', (d) => {
    buf += d.toString();
    let idx;
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx);
      buf = buf.slice(idx + 1);
      const w = waiters.shift();
      if (w) w(line);
    }
  });
  p.stderr.on('data', () => {});
  return {
    send(line) {
      return new Promise((res, rej) => {
        const t = setTimeout(() => rej(new Error('timeout 5s')), 5000);
        waiters.push((l) => { clearTimeout(t); res(l); });
        p.stdin.write(line + '\n');
      });
    },
    kill() { try { p.kill(); } catch (e) {} },
    proc: p,
  };
}

function normalize(list) {
  // 用引擎自己的校验：非法输入直接抛出（等于技术负）
  const out = [];
  for (let i = 0; i < 15; i++) {
    out.push(list[i] === undefined ? { dir: 'N', btn: null } : sim.normalizeInput(list[i]));
  }
  return out;
}

async function playMatch(pyA, pyB, teamA, teamB, seed) {
  const g = sim.createMatch({
    id: 'm' + seed,
    players: [{ name: 'A', kind: 'api', team: teamA }, { name: 'B', kind: 'api', team: teamB }],
    seed,
  });
  const procs = [pyA, pyB];
  let windows = 0;
  let errors = 0;
  while (g.status === 'playing') {
    const reqs = [];
    for (let o = 0; o < 2; o++) {
      const snap = sim.snapshot(g, o);
      // 真实裁判的 catalog 是整个目录模块（含 rules/characters），对齐 example.json
      snap.catalog = { rules: require('./catalog.patched.js').rules, characters: snap.catalog };
      if (process.env.TRIM){ const ch=snap.catalog.characters; const keep={};
        for(const o of [0,1]) keep[g.fighters[o].char]=ch[g.fighters[o].char];
        snap.catalog.characters=keep; }
      reqs.push(procs[o].send(JSON.stringify(snap)));
    }
    let lines;
    try {
      lines = await Promise.all(reqs);
    } catch (e) {
      errors = 1;
      break;
    }
    const ins = [];
    for (let o = 0; o < 2; o++) {
      let obj;
      try { obj = JSON.parse(lines[o]); } catch (e) { errors = 1; break; }
      if (!obj || !Array.isArray(obj.inputs)) { errors = 1; break; }
      try { ins.push(normalize(obj.inputs)); } catch (e) { errors = 1; break; }
    }
    if (errors) break;
    sim.advanceWindow(g, ins);
    windows++;
    if (windows > 3000) break; // 安全阀
  }
  return { g, errors };
}

module.exports = { makeProc, playMatch, normalize };
