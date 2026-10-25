// 并发批量跑 duel_clone.js。用法:
// node batch_duel.js <agentFile> <out.jsonl> <seedStart> <seedEnd> <variantsJSON> [conc]
// variantsJSON: [[name, optsObj], ...]；座位自动 0/1。
const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

const agentFile = process.argv[2] || 'agent.py';
const outFile = process.argv[3] || 'batch.jsonl';
const s0 = Number(process.argv[4] || 4000), s1 = Number(process.argv[5] || 4019);
const variants = JSON.parse(process.argv[6] || '[["base",{}]]');
const CONC = Number(process.argv[7] || 8);
const DUEL = process.env.DUEL || 'duel_clone.js';
const myTeam = process.env.MY_TEAM || 'vex,kestrel,aegis', oppTeam = process.env.OPP_TEAM || 'kestrel,aegis,vex';

const jobs = [];
for (const [vname, opts] of variants) for (const seat of [0, 1]) for (let seed = s0; seed <= s1; seed++) jobs.push({ vname, opts, seat, seed });

function one(j) {
  return new Promise(res => {
    execFile('node', [DUEL, String(j.seat), String(j.seed), myTeam, oppTeam, JSON.stringify(j.opts), agentFile],
      { cwd: __dirname, encoding: 'utf8', timeout: 120000, maxBuffer: 4 << 20 },
      (err, stdout) => {
        if (err) { res({ vname: j.vname, seat: j.seat, seed: j.seed, error: String(err).slice(0, 200) }); return; }
        try { const g = JSON.parse(stdout.trim().split('\n').pop()); g.vname = j.vname; res(g); }
        catch (e) { res({ vname: j.vname, seat: j.seat, seed: j.seed, error: 'parse' }); }
      });
  });
}

(async () => {
  const out = new Array(jobs.length); let idx = 0;
  async function worker() { while (idx < jobs.length) { const i = idx++; out[i] = await one(jobs[i]); } }
  await Promise.all(Array.from({ length: CONC }, worker));
  fs.writeFileSync(path.join(__dirname, outFile), out.map(x => JSON.stringify(x)).join('\n') + '\n');
  // 汇总
  const by = {};
  for (const g of out) {
    const v = by[g.vname] = by[g.vname] || { n: 0, w: 0, err: 0, rw: 0, rl: 0, dmg: 0, taken: 0 };
    if (g.error) { v.err++; continue; }
    v.n++; if (g.winner === 'ME') v.w++;
    v.rw += (g.rounds.match(/W/g) || []).length; v.rl += (g.rounds.match(/L/g) || []).length;
    v.dmg += g.myDmg; v.taken += g.oppDmg;
  }
  for (const k of Object.keys(by)) {
    const v = by[k];
    console.log(k, `match ${v.w}/${v.n} ${(100 * v.w / Math.max(1, v.n)).toFixed(1)}%  round ${v.rw}/${v.rw + v.rl} ${(100 * v.rw / Math.max(1, v.rw + v.rl)).toFixed(1)}%  dmg ${Math.round(v.dmg / Math.max(1, v.n))}/${Math.round(v.taken / Math.max(1, v.n))} err ${v.err}`);
  }
})();
