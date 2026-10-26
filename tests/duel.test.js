'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const sim = require('../duel/simulation');
const catalog = require('../duel/catalog');

const makeGame = (seed = 1) => sim.createMatch({ id: 't', seed, players: [{ name: 'A' }, { name: 'B' }] });

test('场地是 180° 旋转对称的，出生点无遮挡', () => {
  const audit = catalog.auditField();
  assert.equal(audit.ok, true, audit.problems.join('；'));
});

test('开局双方在出生点附近（seed 抖动 ±1.1），且都活着', () => {
  const g = makeGame();
  const s = sim.snapshot(g);
  assert.ok(Math.abs(s.players[0].x - 5) <= 1.2 && Math.abs(s.players[0].y - 14.5) <= 1.2);
  assert.ok(Math.abs(s.players[1].x - 34) <= 1.2 && Math.abs(s.players[1].y - 14.5) <= 1.2);
  assert.ok(s.players.every(p => p.alive));
});

test('不同 seed 生成不同的迷宫地图', () => {
  const a = sim.snapshot(makeGame(1)), b = sim.snapshot(makeGame(2));
  assert.notDeepEqual(a.map.tiles, b.map.tiles);
  const same = sim.snapshot(makeGame(1));
  assert.deepEqual(a.map.tiles, same.map.tiles, '同种子必须可复现');
});

test('玩家能移动，且不会穿墙', () => {
  const g = makeGame();
  for (let i = 0; i < 60; i++) sim.advanceWindow(g, [[{ dir: 'R', aim: null, fire: false }], [{ dir: 'L', aim: null, fire: false }]]);
  const s = sim.snapshot(g);
  assert.ok(s.players[0].x > 5, '应该向右移动了');
  assert.ok(s.players[0].x < 19.5, '不应该穿过中间的柱子');
});

test('子弹撞墙反弹且永不消失', () => {
  const g = makeGame();
  g.bullets.push({ id: 'b1', owner: 0, x: 10, y: 14.5, vx: -8.5, vy: 0, bounces: 0 });
  for (let i = 0; i < 40; i++) sim.step(g);
  assert.equal(g.bullets.length, 1, '子弹不会消失');
  assert.ok(g.bullets[0].bounces >= 1, '应该至少反弹过一次');
  assert.ok(Math.abs(Math.hypot(g.bullets[0].vx, g.bullets[0].vy) - 8.5) < 1e-6, '速度不衰减');
});

test('自己的子弹打不到自己', () => {
  const g = makeGame();
  const me = g.players[0];
  g.bullets.push({ id: 'b1', owner: 0, x: me.x, y: me.y, vx: 0, vy: 0, bounces: 0 });
  for (let i = 0; i < 10; i++) sim.step(g);
  assert.equal(g.status, 'playing');
  assert.ok(me.alive);
});

test('被对方子弹击中即判负', () => {
  const g = makeGame();
  const foe = g.players[1];
  g.bullets.push({ id: 'b1', owner: 0, x: foe.x, y: foe.y, vx: 0, vy: 0, bounces: 0 });
  sim.step(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0);
  assert.match(g.reason, /被击中/);
});

test('开火有冷却，不能连发', () => {
  const g = makeGame();
  sim.step(g);
  g.players[0].held = { dir: 'N', aim: 'R', fire: true };
  g.players[0].cooldown = 0;
  sim.step(g);
  const after1 = g.bullets.length;
  sim.step(g);
  sim.step(g);
  assert.equal(g.bullets.length, after1, '冷却期间不会再发射');
  for (let i = 0; i < 30; i++) { g.players[0].held = { dir: 'N', aim: 'R', fire: true }; sim.step(g); }
  assert.ok(g.bullets.length > after1, '冷却结束后可以再次开火');
});

test('决策窗口最多 3 帧，非法方向直接报错', () => {
  const g = makeGame();
  assert.throws(() => sim.submitWindow(g, 0, new Array(4).fill({ dir: 'N' })), /最多 3 帧/);
  assert.throws(() => sim.normalizeInput({ dir: 'X' }), /非法移动方向/);
  assert.throws(() => sim.normalizeInput({ dir: 'N', aim: 'Z' }), /非法瞄准方向/);
  const w = sim.submitWindow(g, 0, [{ dir: 'R', aim: 'R', fire: true }]);
  assert.equal(w.length, 3, '不足 3 帧要补齐');
  assert.deepEqual(w[1], { dir: 'N', aim: null, fire: false });
});

test('时间到双方都活着判平局', () => {
  const g = makeGame();
  g.now = sim.rules.matchSeconds - 0.001;
  sim.step(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, null);
});

test('练习电脑能正常决策并打完一局', () => {
  const g = makeGame(9);
  for (let i = 0; i < 4000 && g.status === 'playing'; i++) {
    const a = sim.bot(g, 0), b = sim.bot(g, 1);
    sim.advanceWindow(g, [[a, a, a], [b, b, b]]);
  }
  assert.equal(g.status, 'finished');
  assert.ok(g.winner === 0 || g.winner === 1 || g.winner === null);
});
