'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createServer } = require('../platformer/server');

async function serve(t) {
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = async (route, body, token) => {
    const res = await fetch(base + route, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  return { base, call };
}

const FRAMES = 5;
const input = { move: 0, jump: false };
const frames = () => Array.from({ length: FRAMES }, () => [input]);

async function apiMatch(call, seed = 11) {
  const created = await call('/api/matches', { mode: 'lockstep', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  assert.equal(created.status, 201);
  const [a, b] = created.data.seats;
  return { id: created.data.match, a, b, state: created.data.state };
}

test('健康检查与规则目录', async t => {
  const { call } = await serve(t);
  const health = await call('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.game, 'platformer');
  const cat = await call('/api/catalog');
  assert.equal(cat.data.rules.decisionFrames, 5);
  assert.equal(cat.data.rules.height, 16);
});

test('创建对局生成随机关卡与两名玩家', async t => {
  const { call } = await serve(t);
  const created = await call('/api/matches', { seed: 11, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  assert.equal(created.status, 201);
  const s = created.data.state;
  assert.equal(s.runners.length, 2);
  assert.equal(s.phase, 'freeze');
  assert.ok(s.level.width >= 150 && s.level.width <= 200);
  assert.equal(s.level.tiles.length, s.level.width * s.level.height);
  assert.ok(s.level.goalX < s.level.width);
});

test('lockstep 双方提交 5 帧后推进，并校验形状', async t => {
  const { call } = await serve(t);
  const { id, a, b } = await apiMatch(call);
  const first = await call(`/api/matches/${id}/decisions`, { inputs: frames() }, a.token);
  assert.equal(first.status, 200);
  assert.equal(first.data.frame, 0, '只收到一方时不应推进');
  const second = await call(`/api/matches/${id}/decisions`, { inputs: frames() }, b.token);
  assert.equal(second.status, 200);
  assert.equal(second.data.frame, FRAMES, '双方收齐后推进 5 帧');
  const bad = await call(`/api/matches/${id}/decisions`, { inputs: [[input]] }, a.token);
  assert.equal(bad.status, 400);
});

test('席位凭据与只读观战', async t => {
  const { call } = await serve(t);
  const { id, a } = await apiMatch(call);
  assert.equal((await call(`/api/matches/${id}`)).status, 200, '观战不需要凭据');
  const denied = await call(`/api/matches/${id}/decisions`, { inputs: frames() }, 'bad-token');
  assert.equal(denied.status, 401);
  const ok = await call(`/api/matches/${id}/decisions`, { inputs: frames() }, a.token);
  assert.equal(ok.status, 200);
});

test('重复提交同一窗口被拒绝', async t => {
  const { call } = await serve(t);
  const { id, a } = await apiMatch(call);
  await call(`/api/matches/${id}/decisions`, { inputs: frames() }, a.token);
  const again = await call(`/api/matches/${id}/decisions`, { inputs: frames() }, a.token);
  assert.equal(again.status, 409);
});

test('本地对局按真实时钟推进', async t => {
  const { call } = await serve(t);
  const created = await call('/api/matches', {
    mode: 'local', seed: 3,
    players: [{ name: '你', kind: 'human' }, { name: '电脑', kind: 'bot' }],
  });
  assert.equal(created.status, 201);
  const { match, seats, state } = created.data;
  assert.equal(seats.length, 1);
  assert.equal(state.runners.length, 2);
  const before = (await call(`/api/matches/${match}`)).data.frame;
  const step = await call(`/api/matches/${match}/step`, { input: { move: 1, jump: false } }, seats[0].token);
  assert.equal(step.status, 200);
  await new Promise(r => setTimeout(r, 220));
  const after = (await call(`/api/matches/${match}`)).data.frame;
  assert.ok(after > before, '本地时钟应推进物理帧');
});
