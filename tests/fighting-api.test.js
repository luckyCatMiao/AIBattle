'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createServer } = require('../fighting/server');

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

async function twoSeatMatch(call, mode = 'lockstep') {
  const created = await call('/api/matches', { mode, seed: 11, players: [{ name: 'Agent A', kind: 'api' }, { name: 'Agent B', kind: 'api' }] });
  assert.equal(created.status, 201);
  const [a, b] = created.data.seats;
  assert.notEqual(a.token, b.token, '两个席位必须拿到不同凭据');
  await call(`/api/matches/${created.data.match}/team`, { team: ['aegis', 'vex', 'kestrel'] }, a.token);
  const started = await call(`/api/matches/${created.data.match}/team`, { team: ['torv', 'nyx', 'sable'] }, b.token);
  assert.equal(started.data.status, 'playing');
  return { match: created.data.match, a, b };
}

const window = dir => Array.from({ length: 15 }, () => ({ dir, btn: null }));

test('the fighting service serves its catalog with the balance audit', async t => {
  const { call } = await serve(t);
  const health = await call('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.game, 'fighting');
  const cat = await call('/api/catalog');
  assert.equal(cat.status, 200);
  assert.equal(Object.keys(cat.data.characters).length, 6);
  assert.ok(cat.data.balance.spread <= 25, '目录自检应报告一个可接受的火力差距');
});

test('a match needs exactly two seats and both must pick three characters', async t => {
  const { call } = await serve(t);
  const bad = await call('/api/matches', { players: [{ name: 'solo', kind: 'api' }] });
  assert.equal(bad.status, 400);
  const bot = await call('/api/matches', { players: [{ name: 'bot', kind: 'bot' }, { name: 'x', kind: 'api' }] });
  assert.equal(bot.status, 400, '房主不能是电脑');

  const created = await call('/api/matches', { mode: 'lockstep', seed: 2, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  const { match, seats } = { match: created.data.match, seats: created.data.seats };
  assert.equal(created.data.state.status, 'picking');

  const dup = await call(`/api/matches/${match}/team`, { team: ['aegis', 'aegis', 'vex'] }, seats[0].token);
  assert.equal(dup.status, 400);
  assert.match(dup.data.error, /不能重复/);

  await call(`/api/matches/${match}/team`, { team: ['aegis', 'vex', 'kestrel'] }, seats[0].token);
  const stillPicking = await call(`/api/matches/${match}`, undefined, seats[0].token);
  assert.equal(stillPicking.data.status, 'picking', '只有一方选完还不能开打');
});

test('lockstep waits for both seats and only then advances the window', async t => {
  const { call } = await serve(t);
  const { match, a, b } = await twoSeatMatch(call);

  const first = await call(`/api/matches/${match}/decisions`, { inputs: window('F') }, a.token);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.waiting, [1], '应等待另一个席位');
  assert.equal(first.data.frame, 0, '双方到齐前游戏时间不推进');

  const peer = await call(`/api/matches/${match}`, undefined, b.token);
  assert.equal(peer.data.frame, 0, '对方看到的仍是同一个窗口');

  const second = await call(`/api/matches/${match}/decisions`, { inputs: window('B') }, b.token);
  assert.equal(second.status, 200);
  assert.deepEqual(second.data.waiting, []);
  assert.equal(second.data.frame, 15, '双方到齐后推进整整一个窗口');

  // 同一窗口内重复提交应被拒绝
  const again = await call(`/api/matches/${match}/decisions`, { inputs: window('F') }, a.token);
  assert.equal(again.status, 200, '新窗口的第一方提交是合法的');

  const dup = await call(`/api/matches/${match}/decisions`, { inputs: window('F') }, a.token);
  assert.equal(dup.status, 409, '同一窗口不能重复提交');
});

test('over-length windows are rejected without consuming the decision', async t => {
  const { call } = await serve(t);
  const { match, a, b } = await twoSeatMatch(call);
  const tooLong = Array.from({ length: 16 }, () => ({ dir: 'N', btn: null }));
  const rejected = await call(`/api/matches/${match}/decisions`, { inputs: tooLong }, a.token);
  assert.equal(rejected.status, 400);
  const good = await call(`/api/matches/${match}/decisions`, { inputs: window('F') }, a.token);
  assert.equal(good.status, 200, '被拒绝的超长输入不应占掉本窗口的提交机会');
  assert.deepEqual(good.data.waiting, [1]);
  await call(`/api/matches/${match}/decisions`, { inputs: window('N') }, b.token);
});

test('illegal directions and buttons are refused by the referee', async t => {
  const { call } = await serve(t);
  const { match, a } = await twoSeatMatch(call);
  const bad = await call(`/api/matches/${match}/decisions`, { inputs: [{ dir: 'Z', btn: null }] }, a.token);
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /非法方向/);
  const badBtn = await call(`/api/matches/${match}/decisions`, { inputs: [{ dir: 'N', btn: 'XX' }] }, a.token);
  assert.equal(badBtn.status, 400);
});

test('seats are isolated: a token cannot act on another match or without credentials', async t => {
  const { call } = await serve(t);
  const one = await twoSeatMatch(call);
  const two = await twoSeatMatch(call);

  const noToken = await call(`/api/matches/${one.match}/decisions`, { inputs: window('F') });
  assert.equal(noToken.status, 401);
  const garbage = await call(`/api/matches/${one.match}/decisions`, { inputs: window('F') }, 'not-a-token');
  assert.equal(garbage.status, 401);
  const crossed = await call(`/api/matches/${two.match}/decisions`, { inputs: window('F') }, one.a.token);
  assert.equal(crossed.status, 401, '另一个房间的凭据必须无效');
});

test('public observations never leak seat credentials', async t => {
  const { call } = await serve(t);
  const { match, a } = await twoSeatMatch(call);
  const pub = await call(`/api/matches/${match}`);
  assert.equal(pub.status, 200);
  assert.equal(pub.data.yourPlayer, null);
  assert.equal(JSON.stringify(pub.data).includes(a.token), false, '公开状态不得包含任何席位凭据');
  const authed = await call(`/api/matches/${match}`, undefined, a.token);
  assert.equal(authed.data.yourPlayer, 0, '持凭据的观察应标出自己的席位');
});

test('the observation reports enough to pilot a fighter frame by frame', async t => {
  const { call } = await serve(t);
  const { match, a } = await twoSeatMatch(call);
  const obs = await call(`/api/matches/${match}`, undefined, a.token);
  const d = obs.data;
  assert.equal(d.decisionWindows === undefined, true, 'HTTP 观察里不需要冗余字段');
  assert.ok(Array.isArray(d.fighters) && d.fighters.length === 2);
  for (const f of d.fighters) {
    for (const k of ['x', 'y', 'hp', 'meter', 'guard', 'state', 'facing', 'char']) assert.ok(k in f, '缺少字段 ' + k);
  }
  assert.ok(d.rules.decisionFrames === 15 && d.rules.hz === 20);
  assert.ok(d.catalog && Object.keys(d.catalog).length === 6, '观察必须带完整帧数据');
  assert.ok(d.stage && typeof d.stage.ground === 'number');
});

test('cross-site writes are refused and private files are not served', async t => {
  const { call, base } = await serve(t);
  const forged = await call('/api/matches', { players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] }, null, { Origin: 'http://evil.example' });
  assert.equal(forged.status, 403);
  for (const path of ['/simulation.js', '/catalog.js', '/../server.js', '/../arena/train.py']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 404, path + ' 不应被静态服务暴露');
  }
  const home = await fetch(base + '/');
  assert.equal(home.status, 200);
});

test('a lobby seat can practise against the built-in computer on a real-time clock', async t => {
  const { call } = await serve(t);
  const created = await call('/api/matches', { mode: 'local', players: [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }] });
  assert.equal(created.status, 201);
  assert.equal(created.data.seats.length, 1, '电脑不占凭据');
  const { match } = created.data;
  const token = created.data.seats[0].token;
  await call(`/api/matches/${match}/team`, { team: ['aegis', 'vex', 'kestrel'] }, token);
  const state = await call(`/api/matches/${match}`, undefined, token);
  assert.equal(state.data.status, 'playing', '练习局在玩家选角后立即开始');

  // 真人练习由服务端时钟以 20 Hz 推进，客户端只负责提交「当前这一帧」的输入。
  // 提交是即时的，不应等待任何「攒满窗口」的结算。
  const submitted = await call(`/api/matches/${match}/step`, { input: { dir: 'F', btn: null } }, token);
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.accepted, true);
  assert.equal(submitted.data.advanced, undefined, '实时推进下不再有「攒满才推进」的返回字段');

  // 时钟在走：等一小会儿，帧号必须自己往前走。
  const before = (await call(`/api/matches/${match}`, undefined, token)).data.frame;
  await new Promise(r => setTimeout(r, 400));
  const after = (await call(`/api/matches/${match}`, undefined, token)).data;
  assert.ok(after.frame > before, `服务端时钟应自行推进：${before} → ${after.frame}`);
  assert.ok(after.fighters[1].hp <= 1000, '电脑席位应当在场');

  // 逐帧提交必须被接受（客户端 60 fps 渲染时会以 20 Hz 调用它）。
  for (let i = 0; i < 10; i++) {
    const r = await call(`/api/matches/${match}/step`, { input: { dir: 'F', btn: 'LP' } }, token);
    assert.equal(r.status, 200, '第 ' + i + ' 次逐帧提交应被接受');
  }
});

test('a lockstep match rejects frame stepping', async t => {
  const { call } = await serve(t);
  const { match, a } = await twoSeatMatch(call);
  const r = await call(`/api/matches/${match}/step`, { input: { dir: 'F', btn: null } }, a.token);
  assert.equal(r.status, 400, '同步决策模式不应接受逐帧输入');
  assert.match(r.data.error, /练习/);
});
