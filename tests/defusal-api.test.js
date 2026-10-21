'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createServer } = require('../defusal/server');

async function serve(t) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, body, token, extra = {}) => {
    const res = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  return { base, call };
}

const FRAMES = 20;
const frames = dir => Array.from({ length: FRAMES }, () => Array.from({ length: 5 }, () => ({ dir, aim: dir })));

async function match(call, mode = 'lockstep') {
  const created = await call('/api/matches', { mode, seed: 11, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  assert.equal(created.status, 201);
  const [a, b] = created.data.seats;
  return { id: created.data.match, a, b, state: created.data.state };
}

test('the defusal service exposes rules, weapons, sites and a fair map', async t => {
  const { call } = await serve(t);
  assert.equal((await call('/api/health')).data.game, 'defusal');
  const cat = await call('/api/catalog');
  assert.equal(cat.data.rules.teamSize, 5);
  assert.equal(cat.data.rules.roundsToWin, 4);
  assert.equal(cat.data.rules.visionRange, 8);
  assert.equal(Object.keys(cat.data.weapons).length, 7);
  assert.equal(cat.data.buyable.length, 6);
  assert.ok(cat.data.sites.A && cat.data.sites.B);
  const m = await match(call);
  assert.equal(m.state.units.length, 5, '有凭据的初始观察只包含自己的 5 个单位');
  assert.equal(m.state.phase, 'buy');
  // 无凭据是完整观战视角
  const full = await call(`/api/matches/${m.id}`);
  assert.equal(full.data.units.length, 10);
  assert.equal(full.data.map.audit.fair, true);
});

test('buy phase waits for both teams and then goes live', async t => {
  const { call } = await serve(t);
  const m = await match(call);
  const first = await call(`/api/matches/${m.id}/buy`, { buys: [{ unit: 0, weapon: 'pdw' }] }, m.a.token);
  assert.equal(first.status, 200);
  assert.equal(first.data.phase, 'buy');
  assert.deepEqual(first.data.waiting, [1]);
  const second = await call(`/api/matches/${m.id}/buy`, { buys: [] }, m.b.token);
  assert.equal(second.status, 200);
  assert.equal(second.data.phase, 'live');
  assert.deepEqual(second.data.waiting, []);
});

test('lockstep waits for both seats and advances one second of five-unit inputs', async t => {
  const { call } = await serve(t);
  const m = await match(call);
  await call(`/api/matches/${m.id}/buy`, { buys: [] }, m.a.token);
  await call(`/api/matches/${m.id}/buy`, { buys: [] }, m.b.token);
  const first = await call(`/api/matches/${m.id}/decisions`, { inputs: frames('R') }, m.a.token);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.waiting, [1]);
  assert.equal(first.data.frame, 0);
  const second = await call(`/api/matches/${m.id}/decisions`, { inputs: frames('L') }, m.b.token);
  assert.equal(second.status, 200);
  assert.equal(second.data.frame, FRAMES);
  const dup = await call(`/api/matches/${m.id}/decisions`, { inputs: frames('R') }, m.a.token);
  assert.equal(dup.status, 200);
  const dup2 = await call(`/api/matches/${m.id}/decisions`, { inputs: frames('R') }, m.a.token);
  assert.equal(dup2.status, 409);
});

test('illegal windows are rejected without consuming the submission', async t => {
  const { call } = await serve(t);
  const m = await match(call);
  await call(`/api/matches/${m.id}/buy`, { buys: [] }, m.a.token);
  await call(`/api/matches/${m.id}/buy`, { buys: [] }, m.b.token);
  const tooLong = Array.from({ length: FRAMES + 1 }, () => Array.from({ length: 5 }, () => ({ dir: 'N', aim: null })));
  assert.equal((await call(`/api/matches/${m.id}/decisions`, { inputs: tooLong }, m.a.token)).status, 400);
  const bad = await call(`/api/matches/${m.id}/decisions`, { inputs: [[{ dir: 'X' }]] }, m.a.token);
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /非法移动方向/);
  const good = await call(`/api/matches/${m.id}/decisions`, { inputs: frames('N') }, m.a.token);
  assert.equal(good.status, 200);
});

test('credentials are seat-scoped, views are fog-filtered and never leak tokens', async t => {
  const { call } = await serve(t);
  const one = await match(call);
  const two = await match(call);
  assert.equal((await call(`/api/matches/${one.id}/buy`, { buys: [] })).status, 401);
  assert.equal((await call(`/api/matches/${two.id}/buy`, { buys: [] }, one.a.token)).status, 401);
  const pub = await call(`/api/matches/${one.id}`);
  assert.equal(pub.data.yourPlayer, null);
  assert.equal(pub.data.units.length, 10);
  assert.equal(JSON.stringify(pub.data).includes(one.a.token), false);
  const own = await call(`/api/matches/${one.id}`, undefined, one.a.token);
  assert.equal(own.data.yourTeam, 0);
  assert.equal(own.data.units.length, 5);
  assert.ok(own.data.visibleEnemies && typeof own.data.visibleEnemies === 'object');
});

test('cross-site writes are refused and private files are not served', async t => {
  const { base, call } = await serve(t);
  const forged = await call('/api/matches', { players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] }, null, { Origin: 'http://evil.example' });
  assert.equal(forged.status, 403);
  for (const path of ['/simulation.js', '/catalog.js', '/../server.js', '/../arena/train.py', '/../arena/RULES.md']) {
    assert.equal((await fetch(base + path)).status, 404, path);
  }
});

test('a local seat buys, steps and sees only its own team', async t => {
  const { call } = await serve(t);
  const created = await call('/api/matches', { mode: 'local', players: [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }] });
  assert.equal(created.status, 201);
  const { match: id } = created.data;
  const token = created.data.seats[0].token;
  // 机器人队已在创建时自动购买
  const buy = await call(`/api/matches/${id}/buy`, { buys: [{ unit: 0, weapon: 'pdw' }] }, token);
  assert.equal(buy.status, 200);
  assert.equal(buy.data.phase, 'live');
  assert.equal((await call(`/api/matches/${id}/step`, { input: { dir: 'R', aim: 'U' } }, token)).status, 200);
  const before = (await call(`/api/matches/${id}`, undefined, token)).data.frame;
  await new Promise(r => setTimeout(r, 400));
  const after = (await call(`/api/matches/${id}`, undefined, token)).data;
  assert.ok(after.frame > before, `本地时钟应推进：${before} → ${after.frame}`);
  assert.equal(after.units.length, 5);
  assert.equal(after.yourTeam, 0);
});

test('a lockstep match refuses frame stepping', async t => {
  const { call } = await serve(t);
  const m = await match(call);
  const r = await call(`/api/matches/${m.id}/step`, { input: { dir: 'R' } }, m.a.token);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /练习/);
});
