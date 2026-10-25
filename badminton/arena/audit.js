'use strict';
/* 横版羽毛球 回放审计。
 * 从初始状态重新执行全部输入，逐物理帧核对存档，并校验引擎/冻结策略哈希。
 * 用法：node badminton/arena/audit.js <run 目录> */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const sim = require('../simulation');

const ROOT = __dirname;
const run = path.resolve(process.argv[2] || JSON.parse(fs.readFileSync(path.join(ROOT, 'control', 'active-run.json'), 'utf8')).path);
const hashed = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const config = JSON.parse(fs.readFileSync(path.join(run, 'config.json'), 'utf8'));
const results = JSON.parse(fs.readFileSync(path.join(run, 'results.json'), 'utf8'));

const audit = { verified: false, sourceVerified: false, frozenStrategiesVerified: false, games: [] };

const sourceSha = hashed(path.join(ROOT, '..', 'simulation.js'));
const catalogSha = hashed(path.join(ROOT, '..', 'catalog.js'));
if (sourceSha !== config.source_sha256) throw Error('引擎自该系列以来已被修改，审计中止');
if (catalogSha !== config.catalog_sha256) throw Error('规则目录自该系列以来已被修改，审计中止');
audit.sourceVerified = true;

for (const [who, dir] of Object.entries(config.frozen_paths || {})) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(abs, 'manifest.json'), 'utf8'));
  for (const [name, hash] of Object.entries(manifest)) {
    if (hashed(path.join(abs, name)) !== hash) throw Error(`冻结策略被改动：${dir}/${name}`);
  }
}
audit.frozenStrategiesVerified = true;

const canon = value => JSON.stringify(value);
// 场地与规则每帧都一样，事件单独归档；逐帧只比可变的比赛状态。
const compact = frame => {
  const out = { ...frame };
  for (const key of ['court', 'rules', 'events']) delete out[key];
  return out;
};

for (const result of results) {
  const file = path.join(run, result.id + '.json.gz');
  if (!fs.existsSync(file)) throw Error('缺少回放文件：' + result.id);
  if (result.sha256 && hashed(file) !== result.sha256) throw Error('回放文件哈希不匹配：' + result.id);
  const record = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));

  const game = sim.createMatch({
    id: record.id, seed: record.seed,
    players: record.names.map(name => ({ name, kind: 'api' })),
  });
  const compare = (actual, expected, label) => {
    if (canon(actual) !== canon(expected)) throw Error(`${record.id}: ${label} 不一致`);
  };
  compare(compact(structuredClone(sim.snapshot(game))), record.frames[0], '起始快照');

  let frameIndex = 1;
  for (const window of record.windows) {
    const inputs = window.inputs;
    for (let i = 0; i < sim.rules.decisionFrames && game.status === 'playing'; i++) {
      for (const b of game.batsmen) {
        const frame = inputs[b.team] && inputs[b.team][i];
        const input = frame && frame[0] ? frame[0] : { move: 0, jump: false, swing: 0, charge: false, sprint: false };
        b.inputHistory.push(input);
        if (b.inputHistory.length > 8) b.inputHistory.shift();
        b.held = input;
      }
      sim.step(game);
      if (!record.frames[frameIndex]) throw Error(`${record.id}: 存档缺少第 ${frameIndex} 帧`);
      compare(compact(structuredClone(sim.snapshot(game))), record.frames[frameIndex], `第 ${frameIndex} 帧`);
      frameIndex++;
    }
  }
  if (frameIndex !== record.frames.length) throw Error(`${record.id}: 存档帧数 ${record.frames.length}，重演得到 ${frameIndex}`);
  if (!result.technicalFailure) compare(structuredClone(sim.snapshot(game)), record.final, '终局');

  const final = record.final;
  audit.games.push({
    id: result.id, winner: result.winner, frames: record.frames.length, windows: record.windows.length,
    seed: record.seed, score: final.score, reason: final.reason,
    longestRally: final.longestRally,
    hits: final.batsmen.map(b => b.hits), smashes: final.batsmen.map(b => b.smashes),
    sha256: result.sha256,
  });
}
audit.verified = true;
fs.writeFileSync(path.join(run, 'audit.json'), JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
