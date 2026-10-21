'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const sim = require('../soccer/simulation');
const catalog = require('../soccer/catalog');
const { rules, W, H, WALL, EMPTY } = catalog;

const FRAMES = rules.decisionFrames;
const neutralFrame = n => Array.from({ length: n }, () => ({ dir: 'N', aim: null, kick: false }));
const neutralWindow = n => Array.from({ length: FRAMES }, () => neutralFrame(n));

function make(seed = 5, teamSize = 3) {
  return sim.createMatch({ id: 't', seed, teamSize, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
}
function unit(g, team, index) { return g.units.find(u => u.team === team && u.index === index); }
function parkAll(g, except = []) {
  for (const u of g.units) {
    if (except.includes(u)) continue;
    u.x = 3 + u.team * 34; u.y = 2 + u.index * 3;
  }
}
function giveBall(g, u) {
  g.ball.owner = u.id; g.ball.x = u.x; g.ball.y = u.y; g.ball.vx = 0; g.ball.vy = 0;
}
function stepN(g, n) { for (let i = 0; i < n && g.status === 'playing'; i++) sim.step(g); }

test('场地、球门与初始站位', () => {
  const g = make();
  assert.equal(W, 44); assert.equal(H, 26);
  assert.equal(g.units.length, 6);
  assert.deepEqual(g.score, [0, 0]);
  assert.equal(g.status, 'playing');
  assert.ok(g.mapAudit.goalMouthsOpen);
  assert.equal(g.tiles[13 * W], EMPTY, '左球门开口');
  assert.equal(g.tiles[13 * W + W - 1], EMPTY, '右球门开口');
  assert.equal(g.tiles[4 * W], WALL, '球门以外的边墙');
  assert.equal(g.ball.x, W / 2);
  assert.equal(g.ball.y, H / 2);
  assert.equal(g.ball.owner, null);
});

test('每局人数在 1–6 之间随机，双方相同', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 120; seed++) {
    const n = catalog.teamSizeForSeed(seed);
    assert.ok(n >= 1 && n <= 6, `seed ${seed} -> ${n}`);
    seen.add(n);
    const g = make(seed, n);
    assert.equal(g.teamSize, n);
    assert.equal(g.units.length, n * 2);
    assert.equal(g.units.filter(u => u.team === 0).length, n);
    assert.equal(g.units.filter(u => u.team === 1).length, n);
    assert.equal(g.spawns[0].length, n);
    assert.equal(g.spawns[1].length, n);
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3, 4, 5, 6], '1–6 都应能出现');
  const solo = make(7, 1);
  assert.equal(solo.units.length, 2, '1v1 solo');
  const full = make(7, 6);
  assert.equal(full.units.length, 12, '6v6');
});

test('八方向移动与墙体阻挡', () => {
  const g = make();
  const u = unit(g, 0, 0);
  parkAll(g, [u]);
  u.x = 5; u.y = 13;
  u.held = { dir: 'R', aim: null, kick: false };
  sim.step(g);
  assert.ok(u.x > 5.05, '应该向右移动');
  u.x = W - 1.0; u.y = 8;
  for (let i = 0; i < 10; i++) { u.held = { dir: 'R', aim: null, kick: false }; sim.step(g); }
  assert.ok(u.x <= W - rules.unitRadius, '不能穿出右边墙');
});

test('靠近球自动控球，踢球后球获得速度', () => {
  const g = make();
  const u = unit(g, 0, 0);
  parkAll(g, [u]);
  u.x = 22; u.y = 13; u.facing = { x: 1, y: 0 };
  g.ball.x = 22.5; g.ball.y = 13; g.ball.owner = null;
  sim.step(g);
  assert.equal(g.ball.owner, u.id, '应该拿到球');
  u.held = { dir: 'N', aim: 0, kick: true };
  sim.step(g);
  assert.equal(g.ball.owner, null);
  assert.ok(g.ball.vx > 5, '球应该有向前的速度');
  assert.ok(u.kickCd > 0, '踢球后进入冷却');
});

test('右门进球记给队伍 0，并重新开球', () => {
  const g = make();
  const u = unit(g, 0, 0);
  parkAll(g, [u]);
  u.x = 40; u.y = 13; u.facing = { x: 1, y: 0 };
  giveBall(g, u);
  u.held = { dir: 'N', aim: 0, kick: true };
  stepN(g, 15);
  assert.deepEqual(g.score, [1, 0]);
  assert.equal(g.ball.x, W / 2, '进球后球回中圈');
  assert.ok(g.freeze > 0, '重新开球有冻结');
  assert.ok(g.events.some(e => e.type === 'goal'));
});

test('左门进球记给队伍 1', () => {
  const g = make();
  const u = unit(g, 1, 0);
  parkAll(g, [u]);
  u.x = 4; u.y = 13; u.facing = { x: -1, y: 0 };
  giveBall(g, u);
  u.held = { dir: 'N', aim: 180, kick: true };
  stepN(g, 15);
  assert.deepEqual(g.score, [0, 1]);
});

test('球门以外的边墙会挡住球', () => {
  const g = make();
  const u = unit(g, 0, 0);
  parkAll(g, [u]);
  u.x = 40; u.y = 5; u.facing = { x: 1, y: 0 };
  giveBall(g, u);
  u.held = { dir: 'N', aim: 0, kick: true };
  stepN(g, 20);
  assert.deepEqual(g.score, [0, 0], '打在边墙上不应该进球');
  assert.ok(g.ball.x < W - 1, '球应留在场内或球门口');
});

test('下半场在 60 秒触发', () => {
  const g = make();
  g.frame = Math.round(rules.halfSeconds * rules.hz) - 1;
  sim.step(g);
  assert.equal(g.half, 2);
  assert.ok(g.freeze > 0);
  assert.ok(g.events.some(e => e.type === 'half'));
});

test('常规时间结束按比分判胜', () => {
  const g = make();
  g.score = [2, 1];
  g.frame = Math.round(rules.matchSeconds * rules.hz) - 1;
  sim.step(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0);
  assert.match(g.reason, /常规时间/);
});

test('常规时间战平进入金球，金球进球立即结束', () => {
  const g = make();
  g.score = [1, 1];
  g.frame = Math.round(rules.matchSeconds * rules.hz) - 1;
  sim.step(g);
  assert.equal(g.golden, true);
  assert.equal(g.status, 'playing');
  const u = unit(g, 0, 0);
  parkAll(g, [u]);
  u.x = 40; u.y = 13; u.facing = { x: 1, y: 0 };
  giveBall(g, u);
  u.held = { dir: 'N', aim: 0, kick: true };
  stepN(g, 30);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0);
  assert.match(g.reason, /金球/);
});

test('金球时间耗尽判平局', () => {
  const g = make();
  g.score = [0, 0];
  g.frame = Math.round(rules.matchSeconds * rules.hz) - 1;
  sim.step(g);
  assert.equal(g.golden, true);
  g.frame = g.goldenEnd - 1;
  sim.step(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, null);
  assert.match(g.reason, /平局/);
});

test('抢断：更近的对手可以夺走球', () => {
  const g = make();
  const a = unit(g, 0, 0), b = unit(g, 1, 0);
  parkAll(g, [a, b]);
  a.x = 22; a.y = 13; a.facing = { x: 1, y: 0 }; b.x = 22.9; b.y = 13;
  giveBall(g, a);
  b.stealLock = 0;
  a.stealLock = 0;
  sim.step(g);
  assert.equal(g.ball.owner, b.id, '更近的对手应该抢到球');
});

test('相同输入产生逐帧一致的比赛', () => {
  const run = () => {
    const g = make(7);
    const snaps = [];
    for (let w = 0; w < 20; w++) {
      sim.advanceWindow(g, [neutralWindow(g.teamSize), neutralWindow(g.teamSize)]);
      snaps.push(JSON.stringify(sim.snapshot(g)));
    }
    return snaps;
  };
  assert.deepEqual(run(), run());
});

test('窗口格式校验', () => {
  const g = make();
  assert.throws(() => sim.submitWindow(g, 0, neutralWindow(g.teamSize).slice(0, 19)), /20 帧/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: FRAMES }, () => [{ dir: 'R' }])), /3 个单位/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: FRAMES }, () => [{ dir: 'Z', aim: null }, { dir: 'N' }, { dir: 'N' }])), /非法方向/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: FRAMES }, () => [{ dir: 'R', aim: 'X' }, { dir: 'N' }, { dir: 'N' }])), /aim/);
  const ok = sim.submitWindow(g, 0, Array.from({ length: FRAMES }, () => [{ dir: 'R', aim: 45.5, kick: true }, { dir: 'N', aim: 'U' }, { dir: 'N' }]));
  assert.equal(ok[0][0].aim, 45.5);
  assert.equal(ok[0][0].kick, true);
});

test('练习电脑能完成整场比赛', () => {
  const g = make(11);
  const win = team => {
    const frames = [];
    for (let i = 0; i < FRAMES; i++) {
      const f = [];
      for (const u of g.units.filter(x => x.team === team)) f.push(sim.botUnitInput(g, u));
      frames.push(f);
    }
    return frames;
  };
  let windows = 0;
  while (g.status === 'playing' && windows < 200) {
    sim.advanceWindow(g, [sim.submitWindow(g, 0, win(0)), sim.submitWindow(g, 1, win(1))]);
    windows++;
  }
  assert.equal(g.status, 'finished');
  assert.ok(g.frame >= rules.matchSeconds * rules.hz);
  assert.ok(g.stats[0].kicks + g.stats[1].kicks > 0, '电脑应该踢过球');
  assert.ok(g.score[0] + g.score[1] > 0, '电脑应该进过球');
});

test('观察包含完整球场与球的运动状态', () => {
  const g = make();
  const s = sim.snapshot(g), v = sim.view(g, 1);
  assert.equal(s.units.length, 6);
  assert.equal(v.yourTeam, 1);
  assert.equal(v.units.length, 6);
  assert.ok(Array.isArray(s.map.tiles) && s.map.tiles.length === W * H);
  for (const key of ['x', 'y', 'vx', 'vy', 'owner']) assert.ok(key in s.ball);
  assert.equal(typeof s.score[0], 'number');
  assert.ok('timeLeft' in s);
});
