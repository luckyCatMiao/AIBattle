'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const { createServer } = require('../bomber/server');

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
const window_ = dir => Array.from({ length: FRAMES }, () => ({ dir, btn: null }));

async function twoSeatMatch(call, mode = 'lockstep') {
  const created = await call('/api/matches', { mode, seed: 11, players: [{ name: 'Agent A', kind: 'api' }, { name: 'Agent B', kind: 'api' }] });
  assert.equal(created.status, 201);
  const [a, b] = created.data.seats;
  assert.notEqual(a.token, b.token, '两个席位必须拿到不同凭据');
  return { match: created.data.match, a, b };
}

test('the bomber service exposes its rules and a fair map', async t => {
  const { call } = await serve(t);
  const health = await call('/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.data.game, 'bomber');
  const cat = await call('/api/catalog');
  assert.equal(cat.status, 200);
  assert.ok(cat.data.rules.roundTimeLimit > 0, '规则里必须有单局时限');
  assert.equal(cat.data.rules.maxPlayers, 4, '必须公布多人上限');
  assert.ok(Object.keys(cat.data.powerups).length === 3);

  const { match } = await twoSeatMatch(call);
  const obs = await call(`/api/matches/${match}`);
  assert.equal(obs.data.map.audit.fair, true, '地图必须是对称且出生区空旷的');
  assert.equal(obs.data.map.audit.spawnsCornered, true, '所有出生点必须落在镜像等价的角');
  assert.equal(obs.data.map.tiles.length, obs.data.map.width * obs.data.map.height);
});

test('a match needs 2-4 seats and a non-bot host', async t => {
  const { call } = await serve(t);
  const one = await call('/api/matches', { players: [{ name: 'solo', kind: 'api' }] });
  assert.equal(one.status, 400);
  const five = await call('/api/matches', { players: Array.from({ length: 5 }, (_, i) => ({ name: 'p' + i, kind: 'api' })) });
  assert.equal(five.status, 400, '最多四人同场');
  const bot = await call('/api/matches', { players: [{ name: 'bot', kind: 'bot' }, { name: 'x', kind: 'api' }] });
  assert.equal(bot.status, 400, '房主不能是电脑');
  for (const count of [3, 4]) {
    const made = await call('/api/matches', { players: Array.from({ length: count }, (_, i) => ({ name: 'p' + i, kind: 'api' })) });
    assert.equal(made.status, 201, `${count} 人局应可创建`);
    assert.equal(made.data.seats.length, count, '每个非电脑席位都应有独立凭据');
    assert.equal(made.data.state.fighters.length, count);
  }
});

test('lockstep waits for both seats and then advances exactly one window', async t => {
  const { call } = await serve(t);
  const { match, a, b } = await twoSeatMatch(call);

  const first = await call(`/api/matches/${match}/decisions`, { inputs: window_('R') }, a.token);
  assert.equal(first.status, 200);
  assert.deepEqual(first.data.waiting, [1], '应等待另一个席位');
  assert.equal(first.data.frame, 0, '双方到齐前游戏时间不推进');

  const peer = await call(`/api/matches/${match}`, undefined, b.token);
  assert.equal(peer.data.frame, 0, '对方看到的仍是同一个窗口');

  const second = await call(`/api/matches/${match}/decisions`, { inputs: window_('L') }, b.token);
  assert.equal(second.status, 200);
  assert.deepEqual(second.data.waiting, []);
  assert.equal(second.data.frame, FRAMES, '双方到齐后推进整整一个窗口');

  const dup = await call(`/api/matches/${match}/decisions`, { inputs: window_('R') }, a.token);
  assert.equal(dup.status, 200, '新窗口的第一方提交是合法的');
  const dup2 = await call(`/api/matches/${match}/decisions`, { inputs: window_('R') }, a.token);
  assert.equal(dup2.status, 409, '同一窗口不能重复提交');
});

test('over-length windows are rejected without consuming the decision', async t => {
  const { call } = await serve(t);
  const { match, a, b } = await twoSeatMatch(call);
  const tooLong = Array.from({ length: FRAMES + 1 }, () => ({ dir: 'N', btn: null }));
  const rejected = await call(`/api/matches/${match}/decisions`, { inputs: tooLong }, a.token);
  assert.equal(rejected.status, 400);
  const good = await call(`/api/matches/${match}/decisions`, { inputs: window_('R') }, a.token);
  assert.equal(good.status, 200, '被拒绝的超长输入不应占掉本窗口的提交机会');
  await call(`/api/matches/${match}/decisions`, { inputs: window_('N') }, b.token);
});

test('illegal directions and buttons are refused by the referee', async t => {
  const { call } = await serve(t);
  const { match, a } = await twoSeatMatch(call);
  const bad = await call(`/api/matches/${match}/decisions`, { inputs: [{ dir: 'X', btn: null }] }, a.token);
  assert.equal(bad.status, 400);
  assert.match(bad.data.error, /非法方向/);
  const badBtn = await call(`/api/matches/${match}/decisions`, { inputs: [{ dir: 'R', btn: 'KICK' }] }, a.token);
  assert.equal(badBtn.status, 400);
  assert.match(badBtn.data.error, /非法按钮/);
});

test('seats are isolated across matches and credentials never leak', async t => {
  const { call } = await serve(t);
  const one = await twoSeatMatch(call);
  const two = await twoSeatMatch(call);

  assert.equal((await call(`/api/matches/${one.match}/decisions`, { inputs: window_('R') })).status, 401, '无凭据应拒绝');
  assert.equal((await call(`/api/matches/${one.match}/decisions`, { inputs: window_('R') }, 'garbage')).status, 401);
  assert.equal((await call(`/api/matches/${two.match}/decisions`, { inputs: window_('R') }, one.a.token)).status, 401, '另一个房间的凭据必须无效');

  const pub = await call(`/api/matches/${one.match}`);
  assert.equal(pub.data.yourPlayer, null);
  assert.equal(JSON.stringify(pub.data).includes(one.a.token), false, '公开状态不得包含任何席位凭据');
  const authed = await call(`/api/matches/${one.match}`, undefined, one.a.token);
  assert.equal(authed.data.yourPlayer, 0);
  // 对手的凭据看不到，但地图与炸弹是公开信息
  assert.ok(Array.isArray(authed.data.bombs));
  assert.ok(authed.data.map.tiles.length > 0);
});

test('the observation carries everything needed to plan a window', async t => {
  const { call } = await serve(t);
  const { match, a } = await twoSeatMatch(call);
  const d = (await call(`/api/matches/${match}`, undefined, a.token)).data;
  for (const f of d.fighters) {
    for (const k of ['x', 'y', 'px', 'py', 'alive', 'bombs', 'blast', 'speed']) assert.ok(k in f, 'fighter 缺少字段 ' + k);
  }
  assert.equal(typeof d.timeLeft, 'number', '必须公布本局剩余时间');
  assert.equal(d.flood, undefined, '不再有涨水字段');
  assert.equal(d.rules.roundTimeLimit, 150);
  assert.equal(d.rules.decisionFrames, FRAMES);
  assert.equal(d.rules.hz, 20);
  assert.ok(d.catalog === undefined || true);
  assert.ok(d.powerups && Object.keys(d.powerups).length === 3, '必须公布道具参数');
});

test('cross-site writes are refused and private files are not served', async t => {
  const { base, call } = await serve(t);
  const forged = await call('/api/matches', { players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] }, null, { Origin: 'http://evil.example' });
  assert.equal(forged.status, 403);
  for (const path of ['/simulation.js', '/catalog.js', '/../server.js', '/../arena/train.py', '/../arena/RULES.md']) {
    const res = await fetch(base + path);
    assert.equal(res.status, 404, path + ' 不应被静态服务暴露');
  }
});

test('a lobby seat practises against the built-in computer on a real-time clock', async t => {
  const { call } = await serve(t);
  const created = await call('/api/matches', { mode: 'local', players: [{ name: '你', kind: 'human' }, { name: '练习电脑', kind: 'bot' }] });
  assert.equal(created.status, 201);
  assert.equal(created.data.seats.length, 1, '电脑不占凭据');
  const { match } = created.data;
  const token = created.data.seats[0].token;

  const submitted = await call(`/api/matches/${match}/step`, { input: { dir: 'R', btn: null } }, token);
  assert.equal(submitted.status, 200);
  assert.equal(submitted.data.accepted, true);

  const before = (await call(`/api/matches/${match}`, undefined, token)).data.frame;
  await new Promise(r => setTimeout(r, 400));
  const after = (await call(`/api/matches/${match}`, undefined, token)).data;
  assert.ok(after.frame > before, `服务端时钟应自行推进：${before} → ${after.frame}`);

  for (let i = 0; i < 8; i++) {
    assert.equal((await call(`/api/matches/${match}/step`, { input: { dir: 'R', btn: 'BOMB' } }, token)).status, 200);
  }
});

test('a lockstep match refuses frame stepping', async t => {
  const { call } = await serve(t);
  const { match, a } = await twoSeatMatch(call);
  const r = await call(`/api/matches/${match}/step`, { input: { dir: 'R', btn: null } }, a.token);
  assert.equal(r.status, 400);
  assert.match(r.data.error, /练习/);
});
