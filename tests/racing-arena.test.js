'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib');
const crypto = require('node:crypto');
const { handleArena } = require('../racing/arena/http');
const { action } = require('../racing/arena/referee');

const RUN = 'run-20260101-120000';
const FRAMES = 20;
const neutral = () => [{ throttle: 0, steer: 0, drift: false, boost: false }];
const frames = () => Array.from({ length: FRAMES }, neutral);

function compact(state) {
  const out = { ...state };
  for (const key of ['track', 'rules', 'events']) delete out[key];
  return out;
}

function makeArchive() {
  const control = fs.mkdtempSync(path.join(os.tmpdir(), 'racing-arena-'));
  const runDir = path.join(control, RUN);
  fs.mkdirSync(runDir, { recursive: true });

  const created = action({ type: 'create', id: 'r1-g1', seed: 4, names: ['A', 'B'] });
  let state = created.state;
  const allFrames = [compact(state)], windows = [];
  const events = new Map();
  for (const e of state.events || []) events.set(e.id, e);
  for (let i = 0; i < 3 && state.status === 'playing'; i++) {
    const inputs = [frames(), frames()];
    const r = action({ type: 'window', inputs, capture: true });
    state = r.state;
    for (const f of r.frames || []) for (const e of f.events || []) events.set(e.id, e);
    allFrames.push(...(r.frames || []).map(compact));
    windows.push({ frame: state.frame, inputs, seconds: [0, 0] });
  }
  const record = {
    id: 'r1-g1', round: 1, game: 1, seats: ['sol', 'deepseek-flash'], names: ['A', 'B'], seed: 4,
    frames: allFrames, windows, frameMs: 50,
    track: state.track, rules: state.rules, events: [...events.values()],
    final: state, winner: null, reason: state.reason, duration: 1.2,
    errors: {}, technicalFailure: null,
  };
  const gz = zlib.gzipSync(Buffer.from(JSON.stringify(record), 'utf-8'));
  fs.writeFileSync(path.join(runDir, 'r1-g1.json.gz'), gz);

  fs.writeFileSync(path.join(runDir, 'status.json'), JSON.stringify({
    run: RUN, phase: '比赛完成', completed: true,
    models: { sol: 'gpt-6.1-sol', 'deepseek-flash': 'deepseek-v4.1-flash' },
    labels: { sol: 'GPT-6.1 Sol', 'deepseek-flash': 'DeepSeek V4.1 Flash' },
    round: 1, rounds: 1, games: [{ id: 'r1-g1', winner: null }], results: [{ id: 'r1-g1', winner: null }],
    setup_note: '测试系列', updated: '2026-01-01T12:00:00',
  }, null, 2));
  fs.writeFileSync(path.join(control, 'status.json'), JSON.stringify({ run: RUN, phase: '比赛完成', completed: true }, null, 2));
  fs.writeFileSync(path.join(runDir, 'postmatch-sol.md'), '# 赛后复盘\n\n测试内容。', 'utf-8');
  fs.mkdirSync(path.join(runDir, 'round-1', 'sol'), { recursive: true });
  fs.writeFileSync(path.join(runDir, 'round-1', 'sol', 'review.md'), '第一轮复盘。', 'utf-8');
  fs.writeFileSync(path.join(runDir, 'secret.txt'), 'TOP SECRET', 'utf-8');
  return { control, runDir, record };
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

test('裁判创建随机赛道并捕获逐物理帧', () => {
  const created = action({ type: 'create', id: 'ref', seed: 2, names: ['A', 'B'] });
  assert.equal(created.state.status, 'playing');
  assert.equal(created.state.cars.length, 2, '完整裁判状态含两辆车');
  assert.equal(created.state.track.audit.valid, true);
  assert.equal(created.views.length, 2);
  assert.equal(created.views[0].cars.length, 2, '赛车无战争迷雾');
  assert.equal(created.views[1].yourPlayer, 1);
  const result = action({ type: 'window', inputs: [frames(), frames()], capture: true });
  assert.equal(result.frames.length, FRAMES);
  assert.deepEqual(result.frames[result.frames.length - 1], compact(result.state));
  const bad = frames().map(f => [{ ...f[0], throttle: 'ludicrous' }]);
  assert.throws(() => action({ type: 'window', inputs: [frames(), bad] }), /throttle/);
  const short = frames().slice(0, 5);
  assert.throws(() => action({ type: 'window', inputs: [frames(), short] }), /20 帧/);
});

test('裁判按种子生成不同赛道', () => {
  const a = action({ type: 'create', id: 'a', seed: 10, names: ['A', 'B'] });
  const b = action({ type: 'create', id: 'b', seed: 11, names: ['A', 'B'] });
  assert.notDeepEqual(a.state.track.points, b.state.track.points);
  const again = action({ type: 'create', id: 'a', seed: 10, names: ['A', 'B'] });
  assert.deepEqual(a.state.track.points, again.state.track.points);
  const catalog = action({ type: 'catalog' });
  assert.equal(catalog.rules.laps, 3);
  assert.equal(catalog.width, 128);
});

test('归档列出系列、返回 gzip 逐帧回放并可固定 run', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);
  const runs = await get('/api/arena/runs');
  assert.equal(runs.status, 200);
  assert.ok(JSON.parse(runs.text).runs.some(r => r.run === RUN));
  const pinned = await get(`/api/arena?run=${RUN}`);
  assert.equal(pinned.status, 200);
  assert.ok(JSON.parse(pinned.text).games.some(g => g.id === 'r1-g1'));
  const game = await get(`/api/arena/games/r1-g1?run=${RUN}`);
  assert.equal(game.status, 200);
  assert.equal(game.res.headers.get('content-encoding'), 'gzip');
  const decoded = JSON.parse(game.text);
  assert.equal(decoded.frameMs, 50);
  assert.equal(decoded.frames.length, archive.record.frames.length);
  assert.equal(decoded.track.audit.valid, true);
});

test('回放接口拒绝路径穿越与私有文件', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { get } = await serveArena(t, archive.control);
  assert.equal((await get('/api/arena?run=/etc')).status, 400);
  assert.equal((await get('/api/arena?run=..%2F..%2Fsecret')).status, 400);
  assert.equal((await get(`/api/arena/games/r9-g9?run=${RUN}`)).status, 404);
  for (const route of [`/api/arena/reviews/opus/entry.json?run=${RUN}`, `/api/arena/games/../secret.txt?run=${RUN}`]) {
    const res = await get(route);
    assert.ok(res.status === 404 || res.status === 400, route);
    assert.equal(res.text.includes('TOP SECRET'), false);
  }
});

test('回放接口只读', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const { base } = await serveArena(t, archive.control);
  for (const method of ['POST', 'PUT', 'DELETE']) assert.equal((await fetch(`${base}/api/arena`, { method })).status, 405);
});

test('审计重演全部输入与逐帧快照', async t => {
  const archive = makeArchive();
  t.after(() => fs.rmSync(archive.control, { recursive: true, force: true }));
  const runDir = archive.runDir;
  fs.writeFileSync(path.join(runDir, 'config.json'), JSON.stringify({
    source_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'racing', 'simulation.js'))).digest('hex'),
    catalog_sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname, '..', 'racing', 'catalog.js'))).digest('hex'),
    frozen_paths: {},
  }), 'utf-8');
  const gz = fs.readFileSync(path.join(runDir, 'r1-g1.json.gz'));
  fs.writeFileSync(path.join(runDir, 'results.json'), JSON.stringify([
    { id: 'r1-g1', winner: null, sha256: crypto.createHash('sha256').update(gz).digest('hex'), errors: {}, technicalFailure: null },
  ]), 'utf-8');
  const { execFileSync } = require('node:child_process');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'racing', 'arena', 'audit.js'), runDir], { encoding: 'utf-8' });
  const audit = JSON.parse(fs.readFileSync(path.join(runDir, 'audit.json'), 'utf-8'));
  assert.equal(audit.verified, true);
  assert.equal(audit.games.length, 1);
});
