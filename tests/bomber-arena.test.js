'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib');
const crypto = require('node:crypto');
const { handleArena } = require('../bomber/arena/http');
const { action } = require('../bomber/arena/referee');

const RUN = 'run-20260101-120000';
const FRAMES = 20;
const NEUTRAL = () => Array.from({ length: FRAMES }, () => ({ dir: 'N', btn: null }));

function makeArchive() {
  const control = fs.mkdtempSync(path.join(os.tmpdir(), 'bomber-arena-'));
  const runDir = path.join(control, RUN);
  fs.mkdirSync(runDir, { recursive: true });

  const created = action({ type: 'create', id: 'r1-g1', seed: 4, names: ['A', 'B'] });
  let state = created.state;
  const frames = [state], windows = [];
  for (let i = 0; i < 3; i++) {
    const inputs = [NEUTRAL(), NEUTRAL()];
    state = action({ type: 'window', inputs }).state;
    frames.push(state);
    windows.push({ frame: state.frame, inputs, seconds: [0.01, 0.01] });
  }
  const record = {
    id: 'r1-g1', round: 1, game: 1, seats: ['opus', 'sol'], names: ['A', 'B'], seed: 4,
    frames, windows, final: state, winner: null, reason: state.reason, duration: 1.2,
    scores: { opus: 0, sol: 0 }, errors: { opus: 0, sol: 0 }, technicalFailure: null,
  };
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
  return { control, runDir };
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

test('the referee creates a match and refuses malformed windows atomically', () => {
  const created = action({ type: 'create', id: 'ref', seed: 2, names: ['A', 'B'] });
  assert.equal(created.state.status, 'playing');
  assert.equal(created.state.fighters.length, 2);
  assert.equal(created.state.catalog, undefined, '裁判的观察里不带规则目录（由控制器单独注入）');

  assert.throws(() => action({ type: 'window', inputs: [Array(FRAMES + 1).fill({ dir: 'N', btn: null }), NEUTRAL()] }), /20 帧/);
  assert.throws(() => action({ type: 'window', inputs: [[{ dir: 'X', btn: null }], NEUTRAL()] }), /非法方向/);
  assert.throws(() => action({ type: 'window', inputs: [[{ dir: 'N', btn: 'ZZ' }], NEUTRAL()] }), /非法按钮/);
  // 失败的 create 不能污染后续状态：事务性
  assert.throws(() => action({ type: 'create', id: 'bad', seed: 1, names: [1, 2] }), /名字/);
  const after = action({ type: 'window', inputs: [NEUTRAL(), NEUTRAL()] });
  assert.equal(after.state.id, 'ref', '失败的 create 不应替换掉原来的对局');
});

test('the archive lists series, serves a gzipped replay and pins a chosen series', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);

  const runs = await get('/api/arena/runs');
  assert.equal(runs.status, 200);
  assert.ok(JSON.parse(runs.text).runs.some(r => r.run === RUN));

  const meta = await get('/api/arena');
  assert.equal(JSON.parse(meta.text).run, RUN);

  const pinned = await get(`/api/arena?run=${RUN}`);
  assert.equal(pinned.status, 200);
  assert.equal(JSON.parse(pinned.text).run, RUN);

  const game = await get(`/api/arena/games/r1-g1?run=${RUN}`);
  assert.equal(game.status, 200);
  assert.equal(game.res.headers.get('content-encoding'), 'gzip');
  const decoded = JSON.parse(game.text);
  assert.equal(decoded.id, 'r1-g1');
  assert.ok(decoded.frames.length >= 2, '回放应带完整逐窗口快照');
  assert.ok(decoded.windows.length >= 1, '回放应带双方逐帧输入');
  assert.equal(decoded.frames[0].map.audit.fair, true, '回放里应能看到地图公平性自检');
});

test('the archive refuses unknown series, unlisted games and path traversal', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);

  assert.equal((await get('/api/arena?run=/etc')).status, 400);
  assert.equal((await get('/api/arena?run=..%2F..%2Fsecret')).status, 400);
  assert.equal((await get('/api/arena?run=run-20990101-000000')).status, 404);
  assert.equal((await get(`/api/arena/games/r9-g9?run=${RUN}`)).status, 404);
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

test('reviews concatenate per-round notes and the postmatch writeup', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);

  const review = await get(`/api/arena/reviews/opus?run=${RUN}`);
  assert.equal(review.status, 200);
  assert.match(review.text, /第 1 轮/);
  assert.match(review.text, /第一轮复盘/);
  assert.match(review.text, /赛后复盘/);
  assert.match(review.text, /不代表裁判认可全部判断/);
  assert.equal((await get(`/api/arena/reviews/someone?run=${RUN}`)).status, 404);
});

test('the replay surface is read-only', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { base } = await serveArena(t, archive.control);
  for (const method of ['POST', 'PUT', 'DELETE']) {
    assert.equal((await fetch(`${base}/api/arena`, { method })).status, 405, method + ' 必须被拒绝');
  }
});

test('the audit replays every input and verifies the archive hashes', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const runDir = archive.runDir;
  fs.writeFileSync(path.join(runDir, 'config.json'), JSON.stringify({
    source_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'bomber', 'simulation.js'))).digest('hex'),
    catalog_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'bomber', 'catalog.js'))).digest('hex'),
    frozen_paths: {},
  }), 'utf-8');
  const gz = fs.readFileSync(path.join(runDir, 'r1-g1.json.gz'));
  fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify([
    { id: 'r1-g1', winner: null, sha256: crypto.createHash('sha256').update(gz).digest('hex'), errors: { opus: 0, sol: 0 }, technicalFailure: null },
  ]), 'utf-8');

  const { execFileSync } = require('node:child_process');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'bomber', 'arena', 'audit.js'), runDir], { encoding: 'utf-8' });
  const audit = JSON.parse(fs.readFileSync(path.join(runDir, 'audit.json'), 'utf-8'));
  assert.equal(audit.verified, true, '重放必须与存档逐帧一致');
  assert.equal(audit.sourceVerified, true);
  assert.equal(audit.games.length, 1);

  // 篡改回放即应审计失败
  fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify([
    { id: 'r1-g1', winner: null, sha256: 'deadbeef'.repeat(8), errors: { opus: 0, sol: 0 }, technicalFailure: null },
  ]), 'utf-8');
  assert.throws(() => execFileSync(process.execPath, [path.join(__dirname, '..', 'bomber', 'arena', 'audit.js'), runDir], { encoding: 'utf-8', stdio: 'pipe' }), /哈希不匹配/);
});
