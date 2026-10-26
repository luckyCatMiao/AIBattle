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
  assert.ok(Math.abs(g.ball.x - W / 2) <= 1.3, '开球球位在中圈附近（有种子抖动）');
  assert.ok(Math.abs(g.ball.y - H / 2) <= 1.3);
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
  u.x = 32; u.y = 13; u.facing = { x: 1, y: 0 };
  giveBall(g, u);
  u.held = { dir: 'N', aim: 0, kick: true };
  stepN(g, 30);
  assert.deepEqual(g.score, [1, 0]);
  assert.ok(Math.abs(g.ball.x - W / 2) <= 1.3, '进球后球回中圈');
  assert.ok(g.freeze > 0, '重新开球有冻结');
  assert.ok(g.events.some(e => e.type === 'goal'));
});

test('左门进球记给队伍 1', () => {
  const g = make();
  const u = unit(g, 1, 0);
  parkAll(g, [u]);
  u.x = 12; u.y = 13; u.facing = { x: -1, y: 0 };
  giveBall(g, u);
  u.held = { dir: 'N', aim: 180, kick: true };
  stepN(g, 40);
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
  u.x = 32; u.y = 13; u.facing = { x: 1, y: 0 };
  giveBall(g, u);
  u.held = { dir: 'N', aim: 0, kick: true };
  stepN(g, 50);
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

test('持球移动明显慢于无球', () => {
  const moving = (withBall) => {
    const g = make(5, 3);
    const u = unit(g, 0, 1);
    parkAll(g, [u]);
    u.x = 22; u.y = 13;
    g.ball.x = 2; g.ball.y = 2; g.ball.owner = null;
    if (withBall) giveBall(g, u);
    u.held = { dir: 'R', aim: 0, kick: false };
    stepN(g, 20);
    return u.x;
  };
  const free = moving(false), carrying = moving(true);
  assert.ok(free - 22 > 2.5, '无球应该正常推进');
  assert.ok(carrying - 22 < (free - 22) * 0.7, `持球应明显降速：无球 ${(free - 22).toFixed(2)} vs 持球 ${(carrying - 22).toFixed(2)}`);
});

test('进入对方禁区直接红牌罚下，中圈重新开球', () => {
  const g = make(5, 3);
  const u = unit(g, 0, 1);
  parkAll(g, [u]);
  u.x = 32; u.y = 13; u.facing = { x: 1, y: 0 };
  u.held = { dir: 'R', aim: null, kick: false };
  stepN(g, 30);
  assert.ok(g.events.some(e => e.type === 'card'), '应该出示红牌');
  assert.ok(g.stats[0].fouls >= 1, '犯规计数');
  assert.equal(g.units.filter(x => x.team === 0).length, 2, '犯规者被罚下，本队少一人');
  assert.ok(!g.units.includes(u), '被罚下的球员不再在场上');
  assert.ok(Math.abs(g.ball.x - W / 2) <= 1.3, '判罚后回中圈开球');
});

test('守门员在本方禁区没收射门', () => {
  const g = make(5, 3);
  const shooter = unit(g, 0, 0), keeper = unit(g, 1, 0);
  parkAll(g, [shooter, keeper]);
  shooter.x = 32; shooter.y = 13; shooter.facing = { x: 1, y: 0 };
  keeper.x = 42; keeper.y = 13;
  giveBall(g, shooter);
  shooter.held = { dir: 'N', aim: 0, kick: true };
  stepN(g, 45);
  assert.ok(g.events.some(e => e.type === 'save'), '守门员应该扑救');
  assert.equal(g.score[0], 0, '射门不应进球');
  const owner = g.units.find(x => x.id === g.ball.owner);
  assert.ok(owner && owner.team === 1, '扑救后球在守门员手里');
});

test('守门员没有额外扑救半径，偏离线路就扑不到', () => {
  const g = make(5, 3);
  const shooter = unit(g, 0, 0), keeper = unit(g, 1, 0);
  parkAll(g, [shooter, keeper]);
  shooter.x = 32; shooter.y = 13; shooter.facing = { x: 1, y: 0 };
  keeper.x = 42; keeper.y = 14.5;
  giveBall(g, shooter);
  shooter.held = { dir: 'N', aim: 0, kick: true };
  stepN(g, 60);
  assert.equal(g.score[0], 1, '偏离 1.5 格的守门员不应该有额外扑救范围');
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
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: FRAMES }, () => [{ dir: 'R' }, { dir: 'N' }, { dir: 'N' }, { dir: 'N' }])), /最多 3 个单位/);
  // 不足 3 个单位（例如红牌罚下后人数变少）按中立输入补齐，不报错
  const short = sim.submitWindow(g, 0, Array.from({ length: FRAMES }, () => [{ dir: 'R' }]));
  assert.equal(short[0].length, 3);
  assert.deepEqual(short[0][1], { dir: 'N', aim: null, kick: false });
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
  assert.ok(s.map.penaltyBoxes && s.map.penaltyBoxes[0] && s.map.penaltyBoxes[1]);
  assert.equal(s.units.filter(u => u.keeper).length, 2, '每队 index 0 是守门员');
  assert.equal(typeof s.units[0].inOwnBox, 'boolean');
  for (const key of ['x', 'y', 'vx', 'vy', 'owner']) assert.ok(key in s.ball);
  assert.equal(typeof s.score[0], 'number');
  assert.ok('timeLeft' in s);
});
