'use strict';
/* 修复闯关竞速回放：旧存档只保留了最后一局的关卡，逐窗口重演补出「轮次→关卡」，
 * 并同步 results.json 里的 sha256。可重复运行：已有 levels 的记录只做哈希同步。
 * 用法：node platformer/arena/repair_levels.js <run 目录> */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const sim = require('../simulation');

const ROOT = __dirname;
const run = path.resolve(process.argv[2] || JSON.parse(fs.readFileSync(path.join(ROOT, 'control', 'active-run.json'), 'utf8')).path);
const resultsFile = path.join(run, 'results.json');
if (!fs.existsSync(resultsFile)) { console.log('没有 results.json，跳过'); process.exit(0); }
const results = JSON.parse(fs.readFileSync(resultsFile, 'utf8'));
let fixed = 0, synced = 0;

for (const r of results) {
  const file = path.join(run, r.id + '.json.gz');
  if (!fs.existsSync(file)) continue;
  let rec = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));
  const hasLevels = rec.levels && Object.keys(rec.levels).length > 0;
  if (!hasLevels) {
    const game = sim.createMatch({
      id: rec.id, seed: rec.seed,
      players: rec.names.map(name => ({ name, kind: 'api' })),
    });
    const levels = {};
    const remember = st => {
      if (st.round != null && st.level) levels[String(st.round)] = st.level;
    };
    remember(sim.snapshot(game));
    for (const w of rec.windows || []) {
      const inputs = w.inputs;
      for (let i = 0; i < sim.rules.decisionFrames && game.status === 'playing'; i++) {
        for (const p of game.runners) {
          const frame = inputs[p.team] && inputs[p.team][i];
          p.held = (frame && frame[0]) || { move: 0, jump: false };
        }
        sim.step(game);
      }
      remember(sim.snapshot(game));
    }
    rec.levels = levels;
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(rec), 'utf-8'));
    fs.writeFileSync(file, gz);
    fixed++;
    console.log(`${r.id}: 补出 ${Object.keys(levels).length} 张关卡`);
  }
  const sha = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  if (r.sha256 !== sha) { r.sha256 = sha; synced++; }
}
fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
console.log(`完成：补关卡 ${fixed} 局，同步哈希 ${synced} 局`);
