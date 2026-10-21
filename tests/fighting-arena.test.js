'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib');
const crypto = require('node:crypto');
const { handleArena } = require('../fighting/arena/http');
const { action } = require('../fighting/arena/referee');

const RUN = 'run-20260101-120000';
const MINUTE = () => Array.from({ length: 15 }, () => ({ dir: 'N', btn: null }));

// 造一个最小但结构完整的归档：两个系列，用来验证系列固定与路径守卫。
function makeArchive() {
  const control = fs.mkdtempSync(path.join(os.tmpdir(), 'fighting-arena-'));
  const runDir = path.join(control, RUN);
  fs.mkdirSync(runDir, { recursive: true });

  const created = action({ type: 'create', id: 'r1-g1', seed: 4, names: ['A', 'B'],
    teams: [['aegis', 'vex', 'kestrel'], ['torv', 'nyx', 'sable']] });
  let state = created.state;
  const frames = [state], windows = [];
  for (let i = 0; i < 3; i++) {
    const inputs = [MINUTE(), MINUTE()];
    state = action({ type: 'window', inputs }).state;
    frames.push(state);
    windows.push({ frame: state.frame, inputs, seconds: [0.01, 0.01] });
  }
  const record = { id: 'r1-g1', round: 1, game: 1, seats: ['opus', 'sol'], names: ['A', 'B'],
    teams: [['aegis', 'vex', 'kestrel'], ['torv', 'nyx', 'sable']], seed: 4,
    frames, windows, final: state, winner: null, reason: state.reason, duration: 1.2,
    scores: { opus: 10, sol: 20 }, errors: { opus: 0, sol: 0 }, technicalFailure: null };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(record), 'utf-8'));
  fs.writeFileSync(path.join(runDir, 'r1-g1.json.gz'), gz);

  fs.writeFileSync(path.join(runDir, 'status.json'), JSON.stringify({
    run: RUN, phase: '比赛完成', completed: true, models: { opus: 'claude-opus-5-5', sol: 'gpt-6.1-sol' },
    labels: { opus: 'Claude Opus 5.5', sol: 'GPT-6.1 Sol' }, reasoning_effort: 'medium',
    round: 1, rounds: 1, games: [{ id: 'r1-g1', winner: null }], results: [{ id: 'r1-g1', winner: null }],
    setup_note: '测试系列', updated: '2026-01-01T12:00:00',
  }, null, 2));
  // train.py 会把当前系列镜像到 control/status.json，回放页不指定 run 时读的就是它。
  fs.writeFileSync(path.join(control, 'status.json'), JSON.stringify({ run: RUN, phase: '比赛完成', completed: true }, null, 2));
  fs.writeFileSync(path.join(runDir, 'postmatch-opus.md'), '# 赛后复盘\n\n测试内容。', 'utf-8');
  fs.mkdirSync(path.join(runDir, 'round-1', 'opus'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'round-1', 'opus', 'review.md'), '第一轮复盘。', 'utf-8');
  // 私密文件：绝不能被回放接口读到
  fs.writeFileSync(path.join(runDir, 'entry.json'), '{"mode":"program"}', 'utf-8');
  fs.writeFileSync(path.join(runDir, 'secret.txt'), 'TOP SECRET', 'utf-8');
  return { control, runDir, sha256: crypto.createHash('sha256').update(gz).digest('hex') };
}

async function serveArena(t, control) {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (handleArena(req, res, url, control)) return;
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const get = async route => { const res = await fetch(base + route); return { status: res.status, res, text: await res.text() }; };
  return { base, get };
}

test('the referee creates a match with both teams and refuses malformed windows', () => {
  const created = action({ type: 'create', id: 'ref', seed: 2, names: ['A', 'B'],
    teams: [['aegis', 'vex', 'kestrel'], ['torv', 'nyx', 'sable']] });
  assert.equal(created.state.status, 'playing', '选角完成后立即开打');
  assert.equal(created.state.fighters.length, 2);
  assert.equal(created.state.fighters[0].char, 'aegis');
  assert.equal(created.state.catalog, undefined, '裁判的观察里不带角色目录（由控制器单独注入）');

  assert.throws(() => action({ type: 'create', id: 'x', seed: 1, names: ['A', 'B'], teams: [['aegis'], ['torv']] }), /3 名/);
  assert.throws(() => action({ type: 'create', id: 'x', seed: 1, names: ['A', 'B'], teams: [['aegis', 'aegis', 'vex'], ['torv', 'nyx', 'sable']] }), /不能重复/);
  assert.throws(() => action({ type: 'window', inputs: [Array(16).fill({ dir: 'N', btn: null }), MINUTE()] }), /15 帧/);
  assert.throws(() => action({ type: 'window', inputs: [[{ dir: 'Q', btn: null }], MINUTE()] }), /非法方向/);
  assert.throws(() => action({ type: 'window', inputs: [[{ dir: 'N', btn: 'ZZ' }], MINUTE()] }), /非法按钮/);
});

test('the replay archive lists series, serves a gzipped replay and pins a chosen series', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);

  const runs = await get('/api/arena/runs');
  assert.equal(runs.status, 200);
  const listing = JSON.parse(runs.text);
  assert.ok(listing.runs.some(r => r.run === RUN), '新建的系列应出现在列表里');

  const meta = await get('/api/arena');
  assert.equal(meta.status, 200);
  assert.equal(JSON.parse(meta.text).run, RUN);

  const pinned = await get(`/api/arena?run=${RUN}`);
  assert.equal(pinned.status, 200);
  assert.equal(JSON.parse(pinned.text).run, RUN, '指定系列后应返回该系列的 status');

  const game = await get(`/api/arena/games/r1-g1?run=${RUN}`);
  assert.equal(game.status, 200);
  assert.equal(game.res.headers.get('content-encoding'), 'gzip');
  const decoded = JSON.parse(game.text);
  assert.equal(decoded.id, 'r1-g1');
  assert.ok(decoded.frames.length >= 2, '回放应带完整逐窗口快照');
  assert.ok(decoded.windows.length >= 1, '回放应带双方逐帧输入');
});

test('the archive refuses unknown series, unlisted games and path traversal', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);

  assert.equal((await get('/api/arena?run=/etc')).status, 400, '非法系列名');
  assert.equal((await get('/api/arena?run=..%2F..%2Fsecret')).status, 400);
  assert.equal((await get('/api/arena?run=run-20990101-000000')).status, 404, '不存在的系列');
  assert.equal((await get(`/api/arena/games/r9-g9?run=${RUN}`)).status, 404, '未登记的对局');
  assert.equal((await get(`/api/arena/games/..%2Fsecret?run=${RUN}`)).status, 404);
  assert.equal((await get(`/api/arena/games/secret?run=${RUN}`)).status, 404);
});

test('private files are never reachable through the replay surface', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);

  for (const route of [
    `/api/arena/reviews/opus/entry.json?run=${RUN}`,
    `/api/arena/games/../secret.txt?run=${RUN}`,
    `/api/arena/%2e%2e%2fsecret.txt`,
    `/api/arena/reviews/nobody`,
  ]) {
    const res = await get(route);
    assert.ok(res.status === 404 || res.status === 400, route + ' 应被拒绝，实得 ' + res.status);
    assert.equal(res.text.includes('TOP SECRET'), false, '私密内容不得泄漏');
  }
});

test('reviews concatenate every round and then the postmatch writeup', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);

  const review = await get(`/api/arena/reviews/opus?run=${RUN}`);
  assert.equal(review.status, 200);
  assert.match(review.text, /第 1 轮/);
  assert.match(review.text, /第一轮复盘/);
  assert.match(review.text, /赛后复盘/);
  assert.match(review.text, /不代表裁判认可全部判断/, '必须标明这是模型自述');

  const unknown = await get(`/api/arena/reviews/someone?run=${RUN}`);
  assert.equal(unknown.status, 404, '未参赛的模型不应有复盘入口');
});

test('the replay surface is read-only', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { base } = await serveArena(t, archive.control);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    const res = await fetch(`${base}/api/arena`, { method });
    assert.equal(res.status, 405, method + ' 必须被拒绝');
  }
});

test('the audit replays every input and verifies the archive hashes', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const runDir = archive.runDir;
  // 造出 audit.js 需要的最小归档：config、results 与冻结目录
  fs.writeFileSync(path.join(runDir, 'config.json'), JSON.stringify({
    source_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'fighting', 'simulation.js'))).digest('hex'),
    catalog_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'fighting', 'catalog.js'))).digest('hex'),
    frozen_paths: {},
  }), 'utf-8');
  const gz = fs.readFileSync(path.join(runDir, 'r1-g1.json.gz'));
  fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify([
    { id: 'r1-g1', winner: null, sha256: crypto.createHash('sha256').update(gz).digest('hex'), errors: { opus: 0, sol: 0 }, technicalFailure: null },
  ]), 'utf-8');

  const { execFileSync } = require('node:child_process');
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'fighting', 'arena', 'audit.js'), runDir], { encoding: 'utf-8' });
  const audit = JSON.parse(fs.readFileSync(path.join(runDir, 'audit.json'), 'utf-8'));
  assert.equal(audit.verified, true, '重放必须与存档逐帧一致');
  assert.equal(audit.sourceVerified, true);
  assert.equal(audit.games.length, 1);
  assert.equal(audit.games[0].id, 'r1-g1');

  // 篡改回放即应审计失败
  fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify([
    { id: 'r1-g1', winner: null, sha256: 'deadbeef'.repeat(8), errors: { opus: 0, sol: 0 }, technicalFailure: null },
  ]), 'utf-8');
  assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, '..', 'fighting', 'arena', 'audit.js'), runDir], { encoding: 'utf-8', stdio: 'pipe' }), /哈希不匹配/);
});
