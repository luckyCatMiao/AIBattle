'use strict';
/* 铁拳谱 回放审计。
 * 从初始状态重新执行全部双方输入，逐帧核对存档里的每一个快照，并校验引擎与冻结策略的哈希。
 * 用法：node fighting/arena/audit.js <run 目录>                                        */
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib'), crypto = require('node:crypto');
const { action } = require('./referee');

const ROOT = __dirname;
const run = path.resolve(process.argv[2] || JSON.parse(fs.readFileSync(path.join(ROOT, 'control', 'active-run.json'), 'utf8')).path);
const hashed = p => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const config = JSON.parse(fs.readFileSync(path.join(run, 'config.json'), 'utf8'));
const results = JSON.parse(fs.readFileSync(path.join(run, 'results.json'), 'utf8'));

const audit = { verified: false, sourceVerified: false, frozenStrategiesVerified: false, games: [] };

// 引擎没变才谈得上「同一套规则下重放」。
const sourceSha = hashed(path.join(ROOT, '..', 'simulation.js'));
const catalogSha = hashed(path.join(ROOT, '..', 'catalog.js'));
if (sourceSha !== config.source_sha256) throw Error('引擎自该系列以来已被修改，审计中止');
if (catalogSha !== config.catalog_sha256) throw Error('角色目录自该系列以来已被修改，审计中止');
audit.sourceVerified = true;

// 冻结策略：每个轮次的每名选手都有一份 manifest，逐文件核对。
for (const [who, dir] of Object.entries(config.frozen_paths || {})) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  const manifest = JSON.parse(fs.readFileSync(path.join(abs, 'manifest.json'), 'utf8'));
  for (const [name, hash] of Object.entries(manifest)) {
    if (hashed(path.join(abs, name)) !== hash) throw Error(`冻结策略被改动：${dir}/${name}`);
  }
}
audit.frozenStrategiesVerified = true;

for (const result of results) {
  const file = path.join(run, result.id + '.json.gz');
  if (!fs.existsSync(file)) throw Error('缺少回放文件：' + result.id);
  if (result.sha256 && hashed(file) !== result.sha256) throw Error('回放文件哈希不匹配：' + result.id);
  const record = JSON.parse(zlib.gunzipSync(fs.readFileSync(file)));

  // 重建并重放
  const created = action({ type: 'create', id: record.id, seed: record.seed, names: record.names, teams: record.teams });
  let state = created.state;
  const compare = (a, b, label) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`${record.id}: ${label} 不一致`); };
  compare(state, record.frames[0], '起始快照');

  let index = 1;
  for (const w of record.windows) {
    const out = action({ type: 'window', inputs: w.inputs });
    state = out.state;
    compare(state, record.frames[index], `第 ${index} 个快照`);
    index++;
  }
  if (result.technicalFailure) {
    // 技术负的最后一帧是判负后补记的，不参与重放比对
    compare({ winner: state.winner, status: state.status }, { winner: record.final.winner, status: record.final.status }, '终局');
  } else {
    compare(state, record.final, '终局');
  }

  audit.games.push({ id: result.id, winner: result.winner, frames: record.frames.length, windows: record.windows.length, errors: result.errors, sha256: result.sha256 });
}
audit.verified = true;
fs.writeFileSync(path.join(run, 'audit.json'), JSON.stringify(audit, null, 2));
console.log(JSON.stringify(audit, null, 2));
