'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createServer } = require('../soccer/server');

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

const FRAMES = 20;
const frames = (dir = 'N', n = 3) => Array.from({ length: FRAMES }, () =>
  Array.from({ length: n }, () => ({ dir, aim: null, kick: false })));

async function apiMatch(call, mode = 'lockstep') {
  const created = await call('/api/matches', { mode, seed: 11, teamSize: 3, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  assert.equal(created.status, 201);
  const [a, b] = created.data.seats;
  return { id: created.data.match, a, b, state: created.data.state };
}

test('健康检查与规则目录', async t => {
  const { call } = await serve(t);
  const health = await call('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.game, 'soccer');
  const cat = await call('/api/catalog');
  assert.equal(cat.status, 200);
  assert.equal(cat.data.rules.maxTeamSize, 6);
  assert.equal(cat.data.rules.minTeamSize, 1);
  assert.equal(cat.data.rules.width, 44);
});

test('创建本地对局，逐帧输入推进', async t => {
  const { call } = await serve(t);
  const created = await call('/api/matches', {
    mode: 'local', seed: 3, teamSize: 3,
    players: [{ name: '你', kind: 'human' }, { name: '电脑', kind: 'bot' }],
  });
  assert.equal(created.status, 201);
  const { match, seats, state } = created.data;
  assert.equal(seats.length, 1);
  assert.equal(state.units.length, 6);
  assert.ok(Math.abs(state.ball.x - 22) <= 1.3, '开球球位在中圈附近（有种子抖动）');

  const before = (await call(`/api/matches/${match}`)).data.units[0].x;
  const step = await call(`/api/matches/${match}/step`, { input: { dir: 'R', aim: 0, kick: false } }, seats[0].token);
  assert.equal(step.status, 200);
  // 本地模式由真实时钟推进；等待几帧后位置应发生变化
  await new Promise(r => setTimeout(r, 200));
  const after = (await call(`/api/matches/${match}`)).data.units[0].x;
  assert.ok(after > before, '人类单位应该向右移动');
});

test('lockstep 双方提交 20 帧后推进，并校验形状', async t => {
  const { call } = await serve(t);
  const { id, a, b } = await apiMatch(call, 'lockstep');
  const first = await call(`/api/matches/${id}/decisions`, { inputs: frames('R') }, a.token);
  assert.equal(first.status, 200);
  assert.equal(first.data.frame, 0, '只收到一方时不应推进');
  const second = await call(`/api/matches/${id}/decisions`, { inputs: frames('R') }, b.token);
  assert.equal(second.status, 200);
  assert.equal(second.data.frame, FRAMES, '双方收齐后推进 20 帧');

  const bad = await call(`/api/matches/${id}/decisions`, { inputs: [[{ dir: 'R' }]] }, a.token);
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

test('创建 1v1 与 6v6 对局时按 teamSize 生成球员', async t => {
  const { call } = await serve(t);
  for (const n of [1, 6]) {
    const created = await call('/api/matches', {
      mode: 'lockstep', seed: 5, teamSize: n,
      players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }],
    });
    assert.equal(created.status, 201);
    const st = created.data.state;
    assert.equal(st.teamSize, n);
    assert.equal(st.units.length, n * 2);
    const [a, b] = created.data.seats;
    await call(`/api/matches/${created.data.match}/decisions`, { inputs: frames('R', n) }, a.token);
    const second = await call(`/api/matches/${created.data.match}/decisions`, { inputs: frames('R', n) }, b.token);
    assert.equal(second.status, 200);
    assert.equal(second.data.frame, FRAMES);
  }
});
