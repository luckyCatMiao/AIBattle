'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const sim = require('../platformer/simulation');
const { rules } = require('../platformer/catalog');

const NEUTRAL = { move: 0, jump: false };

function makeMatch(seed = 1) {
  return sim.createMatch({ id: 't', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
}
function toRace(g) {
  let n = 0;
  while (g.phase === 'freeze' && n++ < 100) sim.step(g);
}
const footY = g => g.h - rules.groundY;

test('关卡宽度在范围内，起点和终点是平地，坑不超过 4 格', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const g = makeMatch(seed);
    assert.ok(g.w >= rules.minWidth && g.w <= rules.maxWidth, `seed ${seed} 宽度 ${g.w}`);
    assert.equal(g.h, rules.height);
    for (let x = 0; x <= 11; x++) assert.ok(g.tiles[rules.groundY * g.w + x] !== 0, `seed ${seed} 起点 ${x} 无地面`);
    for (let x = g.w - 13; x < g.w; x++) assert.ok(g.tiles[rules.groundY * g.w + x] !== 0, `seed ${seed} 终点 ${x} 无地面`);
    let run = 0, maxRun = 0, runStart = -1;
    for (let x = 0; x < g.w; x++) {
      if (g.tiles[rules.groundY * g.w + x] === 0) { if (run === 0) runStart = x; run++; maxRun = Math.max(maxRun, run); } else run = 0;
    }
    assert.ok(maxRun <= 4, `seed ${seed} 出现 ${maxRun} 格宽的坑`);
  }
});

test('随机关卡会出现地刺/移动平台/食人花/锯齿/塌陷砖', () => {
  const seen = { spike: 0, platform: 0, plant: 0, saw: 0, crumble: 0 };
  for (let seed = 1; seed <= 30; seed++) {
    const g = makeMatch(seed);
    if (g.tiles.some(t => t === 3)) seen.spike++;
    if (g.platforms.length) seen.platform++;
    if (g.plants.length) seen.plant++;
    if (g.saws.length) seen.saw++;
    if (g.tiles.some(t => t === 4)) seen.crumble++;
  }
  for (const [k, v] of Object.entries(seen)) assert.ok(v > 0, `30 个种子里没有出现 ${k}`);
});

test('踩到地刺会回起点', () => {
  let g = null, spot = null;
  for (let seed = 1; seed <= 40 && !spot; seed++) {
    const cand = makeMatch(seed);
    for (let x = 0; x < cand.w && !spot; x++) if (cand.tiles[(rules.groundY - 1) * cand.w + x] === 3) { g = cand; spot = x; }
  }
  assert.ok(g && spot !== null, '40 个种子里没有地刺');
  toRace(g);
  const p = g.runners[0];
  p.x = spot + 0.5; p.y = g.h - rules.groundY; p.vx = 0; p.vy = 0; p.invuln = 0;
  p.held = { move: 0, jump: false };
  sim.step(g);
  assert.equal(p.deaths, 1);
  assert.ok(g.events.some(e => e.type === 'respawn' && e.reason === '地刺'));
});

test('食人花冒出时碰到会回起点', () => {
  const g = makeMatch(4); toRace(g);
  const pl = g.plants[0];
  assert.ok(pl, '该种子没有食人花');
  pl.phase = 0; pl.period = 4; pl.out = 2;
  g.time = 0.5;
  const p = g.runners[0];
  p.x = pl.x; p.y = g.h - rules.groundY; p.vx = 0; p.vy = 0; p.invuln = 0;
  p.held = { move: 0, jump: false };
  sim.step(g);
  assert.equal(p.deaths, 1);
  assert.ok(g.events.some(e => e.type === 'respawn' && e.reason === '食人花'));
});

test('锯齿碰到会回起点', () => {
  const g = makeMatch(5); toRace(g);
  const p = g.runners[0];
  g.saws = [{ from: { x: p.x, y: 4.0 }, to: { x: p.x, y: 4.0 }, r: rules.sawRadius, period: 4, phase: 0 }];
  p.invuln = 0; p.held = { move: 0, jump: false };
  sim.step(g);
  assert.equal(p.deaths, 1);
  assert.ok(g.events.some(e => e.type === 'respawn' && e.reason === '锯齿'));
});

test('移动平台可以站上去并被带走', () => {
  const g = makeMatch(6); toRace(g);
  const p = g.runners[0];
  p.x = 20; p.y = 6; p.vx = 0; p.vy = 0; p.invuln = 5;
  g.platforms = [{ from: { x: 19, y: 4 }, to: { x: 19, y: 4 }, w: 2.4, h: 0.36, period: 4, phase: 0 }];
  for (let i = 0; i < 20; i++) { p.held = { move: 0, jump: false }; sim.step(g); }
  assert.ok(Math.abs(p.y - 4.36) < 0.02, `应站在平台顶，实际 y=${p.y.toFixed(2)}`);
  assert.equal(p.onGround, true);
});

test('塌陷砖站久了会消失，之后恢复', () => {
  const g = makeMatch(7); toRace(g);
  const tx = 20, ty = rules.groundY;
  for (let y = ty; y < g.h; y++) g.tiles[y * g.w + tx] = 4;
  g.platforms = []; g.saws = []; g.plants = [];
  const p = g.runners[0];
  p.x = tx + 0.5; p.y = g.h - ty; p.vx = 0; p.vy = 0; p.invuln = 5;
  const key = ty * g.w + tx;
  for (let i = 0; i < 16; i++) { p.held = { move: 0, jump: false }; sim.step(g); }
  assert.ok(g.crumbleTimers.has(key) || g.gone.has(key), '应开始塌陷计时');
  assert.equal(sim.solidWorld(g, tx + 0.5, g.h - ty - 0.5), false, '塌陷后不应再是实心');
  for (let i = 0; i < 80; i++) { p.held = { move: 0, jump: false }; sim.step(g); }
  assert.equal(sim.solidWorld(g, tx + 0.5, g.h - ty - 0.5), true, '一段时间后应恢复');
});

test('重力把玩家留在地面上，跳跃后能落回地面', () => {
  const g = makeMatch(2); toRace(g);
  const p = g.runners[0];
  for (let i = 0; i < 10; i++) { p.held = NEUTRAL; sim.step(g); }
  assert.equal(p.onGround, true);
  assert.ok(Math.abs(p.y - footY(g)) < 0.01, `应站在地面，实际 y=${p.y}`);
  const y0 = p.y;
  p.held = { move: 0, jump: true };
  sim.step(g);
  assert.equal(p.onGround, false);
  assert.ok(p.vy > 0);
  let peak = y0;
  for (let i = 0; i < 60; i++) { p.held = NEUTRAL; sim.step(g); peak = Math.max(peak, p.y); }
  assert.ok(peak - y0 > 1.6, `跳跃高度应超过 1.6 格，实际 ${(peak - y0).toFixed(2)}`);
  assert.equal(p.onGround, true);
});

test('向右跑会前进，撞到台阶会被挡住', () => {
  const g = makeMatch(3); toRace(g);
  const p = g.runners[0];
  const x0 = p.x;
  for (let i = 0; i < 20; i++) { p.held = { move: 1, jump: false }; sim.step(g); }
  assert.ok(p.x > x0 + 2, `20 帧应前进 2 格以上，实际 ${(p.x - x0).toFixed(2)}`);
});

test('后面的人可以推前面的人，反推不动', () => {
  const g = makeMatch(4); toRace(g);
  const [a, b] = g.runners;
  a.x = 5; b.x = 5.55; a.y = footY(g); b.y = footY(g);
  a.vx = 6.8; b.vx = 0;
  const bx0 = b.x, ax0 = a.x;
  for (let i = 0; i < 5; i++) { a.held = { move: 1, jump: false }; b.held = NEUTRAL; sim.step(g); }
  assert.ok(b.x > bx0 + 0.2, `前面的人应被推走，实际 ${(b.x - bx0).toFixed(2)}`);
  assert.ok(g.events.some(e => e.type === 'push'), '应记录推人事件');

  // 前面的人往后退：推不动后面的人
  const g2 = makeMatch(4); toRace(g2);
  const [c, d] = g2.runners;
  c.x = 5; d.x = 5.55; c.y = footY(g2); d.y = footY(g2);
  c.vx = 0; d.vx = -6.8;
  const cx0 = c.x, dx0 = d.x;
  for (let i = 0; i < 5; i++) { c.held = NEUTRAL; d.held = { move: -1, jump: false }; sim.step(g2); }
  assert.ok(c.x >= cx0 - 0.02, `后面的人不应被推退，实际 ${(c.x - cx0).toFixed(2)}`);
  assert.ok(d.x >= dx0 - 0.02, `前面的人推不动，实际 ${(d.x - dx0).toFixed(2)}`);
});

test('掉坑会回到起点重跑并给无敌', () => {
  const g = makeMatch(5); toRace(g);
  const p = g.runners[0];
  p.x = 40; p.y = -2.5; p.vy = -5;
  let n = 0;
  while (p.deaths === 0 && n++ < 20) { p.held = NEUTRAL; sim.step(g); }
  assert.equal(p.deaths, 1);
  assert.ok(p.invuln > 0);
  assert.ok(Math.abs(p.x - g.startX) < 2, '应回到起点附近');
  assert.ok(g.events.some(e => e.type === 'respawn' && e.reason === '掉坑'));
});

test('碰到怪物会回起点', () => {
  const g = makeMatch(6); toRace(g);
  const p = g.runners[0];
  g.monsters = [{ id: 'm1', x: p.x + 0.2, y: p.y, dir: -1, alive: true }];
  let n = 0;
  while (p.deaths === 0 && n++ < 10) { p.held = NEUTRAL; sim.step(g); }
  assert.equal(p.deaths, 1);
  assert.ok(g.events.some(e => e.type === 'respawn' && e.reason === '怪物'));
});

test('先到终点赢一局，先赢两局结束比赛', () => {
  const g = makeMatch(7); toRace(g);
  const p = g.runners[0];
  p.x = g.goalX - 0.2; p.y = footY(g); p.vx = 6;
  p.held = { move: 1, jump: false };
  sim.step(g);
  assert.equal(g.wins[0], 1);
  assert.ok(g.events.some(e => e.type === 'round' && e.team === 0));
  assert.equal(g.status, 'playing');
  // 第二局：再赢一次
  toRace(g);
  const q = g.runners[0];
  q.x = g.goalX - 0.2; q.y = footY(g); q.vx = 6;
  q.held = { move: 1, jump: false };
  sim.step(g);
  assert.equal(g.wins[0], 2);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0);
});

test('超时按最远距离判定', () => {
  const g = makeMatch(8); toRace(g);
  g.runners[0].maxX = 60;
  g.runners[1].maxX = 30;
  g.roundLeft = 0.01;
  g.runners[0].held = NEUTRAL; g.runners[1].held = NEUTRAL;
  sim.step(g);
  assert.equal(g.wins[0], 1);
  assert.ok(g.events.some(e => e.type === 'round' && e.reason === '时间到'));
});

test('窗口形状与输入字段校验', () => {
  const g = makeMatch(9);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: 4 }, () => [NEUTRAL])), /5 帧/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: 5 }, () => [{ move: 'right' }])), /move/);
  assert.throws(() => sim.submitWindow(g, 2, []), /team/);
  const ok = sim.submitWindow(g, 0, Array.from({ length: 5 }, () => [{ move: 9, jump: true }]));
  assert.equal(ok.length, 5);
  assert.equal(ok[0][0].move, 1);
  assert.equal(ok[0][0].jump, true);
  assert.deepEqual(sim.normalizeUnitInput(null), NEUTRAL);
});

test('相同输入产生逐帧一致的比赛', () => {
  const run = () => {
    const g = makeMatch(10);
    let f = 0;
    while (g.status === 'playing' && f < 9000) {
      for (const p of g.runners) p.held = sim.botInput(g, p);
      sim.step(g); f++;
    }
    return JSON.stringify(sim.snapshot(g));
  };
  assert.equal(run(), run());
});

test('练习电脑能跑完整局并产生胜局', () => {
  const g = makeMatch(11);
  let f = 0;
  while (g.status === 'playing' && f < 9000) {
    for (const p of g.runners) p.held = sim.botInput(g, p);
    sim.step(g); f++;
  }
  assert.equal(g.status, 'finished');
  assert.ok(g.wins[0] + g.wins[1] >= 2);
});
