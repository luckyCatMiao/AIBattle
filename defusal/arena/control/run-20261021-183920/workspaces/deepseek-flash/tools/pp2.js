'use strict';
/* 下包后转化分析：逐物理帧推进，记录下包/拆包瞬间双方存活与武器、2 秒后站位。
 * 逐帧推进是为了在 endRound→startRound 重置双方存活之前取样。
 * 用法: node tools/pp2.js --seeds 1-20 [--agentA cmd] [--agentB cmd] [--envA ..] [--envB ..]
 */
const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const sim = require(path.join(__dirname, '..', 'simulation.js'));

function parseEnv(s) { const o = {}; if (!s) return o; for (const kv of String(s).split(',')) { if (!kv) continue; const i = kv.indexOf('='); if (i < 0) o[kv] = '1'; else o[kv.slice(0, i)] = kv.slice(i + 1); } return o; }
function parseSeeds(spec) { const o = []; for (const p of String(spec).split(',')) { const m = p.match(/^(\d+)-(\d+)$/); if (m) { for (let i = +m[1]; i <= +m[2]; i++) o.push(i); } else if (p.trim()) o.push(+p); } return o; }
function makeAgent(cmdline, env) {
  const cmd = String(cmdline).split(' ');
  const p = spawn(cmd[0], cmd.slice(1), { stdio: ['pipe', 'pipe', 'pipe'], env: { ...process.env, ...env } });
  const rl = readline.createInterface({ input: p.stdout });
  const q = [], w = [];
  p.stderr.on('data', () => {});
  rl.on('line', l => { let v = null; try { v = JSON.parse(l); } catch (e) {} if (w.length) w.shift()(v); else q.push(v); });
  p.on('exit', () => { while (w.length) w.shift()(null); });
  return { ask(o) { p.stdin.write(JSON.stringify(o) + '\n'); return new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 5000); const done = v => { clearTimeout(t); res(v); }; if (q.length) done(q.shift()); else w.push(done); }); }, close() { try { p.kill(); } catch (e) {} } };
}

const aliveCount = (g, team) => g.units.filter(u => u.team === team && u.alive).length;
const weaponsOf = (g, team) => g.units.filter(u => u.team === team && u.alive).map(u => u.weapon + (u.armor > 0 ? '+a' : ''));
const snapUnits = (g, team) => g.units.filter(u => u.team === team && u.alive).map(u => ({ team: u.team, idx: u.index, x: +u.x.toFixed(1), y: +u.y.toFixed(1), hp: +u.hp.toFixed(1), weapon: u.weapon }));

async function run(seed, envA, envB) {
  const g = sim.createMatch({ id: 'pp2' + seed + '_' + Math.random().toString(36).slice(2, 6), players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }], seed });
  const ag = [makeAgent(envA.cmd, envA.env), makeAgent(envB.cmd, envB.env)];
  let lastEvent = 0;
  const recs = [];
  let pending = null;
  try {
    while (g.status === 'playing') {
      if (g.phase === 'buy') {
        const v = [sim.view(g, 0), sim.view(g, 1)];
        const b = await Promise.all([ag[0].ask(v[0]), ag[1].ask(v[1])]);
        sim.submitBuys(g, 0, (b[0] && b[0].buys) || []); sim.submitBuys(g, 1, (b[1] && b[1].buys) || []);
      } else if (g.phase === 'live') {
        const v = [sim.view(g, 0), sim.view(g, 1)];
        const d = await Promise.all([ag[0].ask(v[0]), ag[1].ask(v[1])]);
        const w0 = sim.submitWindow(g, 0, (d[0] && d[0].inputs) || []);
        const w1 = sim.submitWindow(g, 1, (d[1] && d[1].inputs) || []);
        const wins = [w0, w1];
        for (let f = 0; f < 20 && g.phase === 'live' && g.status === 'playing'; f++) {
          // 帧前快照：若本帧触发拆包/爆炸并立即 startRound，单位已重置，故必须用帧前状态。
          const pre = {
            round: g.round, frame: g.roundFrames,
            alive: [aliveCount(g, 0), aliveCount(g, 1)],
            weapons: [weaponsOf(g, 0), weaponsOf(g, 1)],
            units: [...snapUnits(g, 0), ...snapUnits(g, 1)],
            bomb: { x: g.bomb.x, y: g.bomb.y, state: g.bomb.state },
          };
          for (let team = 0; team < 2; team++) {
            for (const u of g.units) {
              if (u.team !== team || !u.alive) continue;
              const fr = wins[team][f];
              const inp = fr && fr[u.index] ? fr[u.index] : { dir: 'N', aim: null };
              u.inputHistory.push(inp);
              if (u.inputHistory.length > 8) u.inputHistory.shift();
              u.held = inp;
            }
          }
          sim.step(g);
          for (const e of g.events) {
            if (e.id <= lastEvent) continue; lastEvent = e.id;
            if (e.type === 'plant') {
              const atkTeam = pre.round <= 3 ? 0 : 1;
              pending = {
                seed, round: pre.round, frame: e.frame, site: e.site, atkTeam,
                atkAlive: pre.alive[atkTeam], defAlive: pre.alive[1 - atkTeam],
                atkWeapons: pre.weapons[atkTeam], defWeapons: pre.weapons[1 - atkTeam],
                atkPos: pre.units.filter(p => p.team === atkTeam).map(p => [p.x, p.y, p.hp, p.weapon]),
                bombX: e.x, bombY: e.y,
              };
              recs.push(pending);
            }
            if (e.type === 'defuse' && pending && pending.round === pre.round && e.frame >= pending.frame) {
              pending.defuse = e.frame - pending.frame;
              pending.atkAliveAtDefuse = pre.alive[pending.atkTeam];
              pending.defAliveAtDefuse = pre.alive[1 - pending.atkTeam];
              pending.defuserDist = pre.units.filter(p => p.team !== pending.atkTeam)
                .map(p => +Math.hypot(p.x - pre.bomb.x, p.y - pre.bomb.y).toFixed(1)).sort((a, b) => a - b)[0];
            }
          }
          if (pending && pending.pos2s === undefined && g.roundFrames - pending.frame >= 40) {
            pending.pos2s = snapUnits(g, pending.atkTeam);
            pending.alive2s = pending.pos2s.length;
          }
          if (g.round !== pre.round) break;
        }
      } else break;
    }
  } finally { ag.forEach(a => a.close()); }
  for (const r of recs) {
    const rr = g.roundLog.find(x => x.round === r.round);
    if (rr) { r.won = rr.winnerTeam === r.atkTeam; r.reason = rr.reason; }
  }
  return recs;
}

(async () => {
  const args = process.argv.slice(2);
  let seeds = [1]; const envA = { cmd: 'python3 -u agent.py', env: {} }, envB = { cmd: 'python3 -u tools/agent_base.py', env: {} };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--seeds') seeds = parseSeeds(args[++i]);
    else if (args[i] === '--agentA') envA.cmd = args[++i];
    else if (args[i] === '--agentB') envB.cmd = args[++i];
    else if (args[i] === '--envA') envA.env = parseEnv(args[++i]);
    else if (args[i] === '--envB') envB.env = parseEnv(args[++i]);
  }
  const all = [];
  for (const s of seeds) all.push(...await run(s, envA, envB));
  const agg = {}, wagg = {}, defByAlive = {}, defByAtkAlive = {};
  for (const r of all) {
    const key = `atk${r.atkAlive}v${r.defAlive}`;
    const a = agg[key] || (agg[key] = { n: 0, w: 0 });
    a.n++; if (r.won) a.w++;
    const tier = ws => {
      const s = (ws || []).join(',');
      if (/rifle|sniper|lmg/.test(s)) return 'heavy';
      if (/smg|pdw/.test(s)) return 'smg';
      return 'pistol';
    };
    const wk = tier(r.atkWeapons) + 'v' + tier(r.defWeapons);
    const b = wagg[wk] || (wagg[wk] = { n: 0, w: 0 });
    b.n++; if (r.won) b.w++;
    if (r.reason === '拆除炸弹') {
      const k = 'a' + (r.atkAliveAtDefuse == null ? '?' : r.atkAliveAtDefuse);
      defByAlive[k] = (defByAlive[k] || 0) + 1;
    }
    if (r.reason) {
      const k = r.reason + '|' + tier(r.atkWeapons) + 'v' + tier(r.defWeapons);
      const c = defByAtkAlive[k] || (defByAtkAlive[k] = { n: 0, w: 0 });
      c.n++; if (r.won) c.w++;
    }
  }
  console.log(JSON.stringify({
    plants: all.length, won: all.filter(r => r.won).length,
    byAlive: agg, byWeapon: wagg, defuseByAtkAlive: defByAlive, byReasonTier: defByAtkAlive,
    atk2sAlive: +(all.reduce((s, r) => s + (r.alive2s || 0), 0) / Math.max(1, all.length)).toFixed(2),
    rows: process.env.VERBOSE ? all : undefined,
  }));
})();
