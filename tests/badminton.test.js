'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const sim = require('../badminton/simulation');
const { rules } = require('../badminton/catalog');

const NEUTRAL = { move: 0, jump: false, swing: 0, charge: false, sprint: false };

function makeMatch(seed = 1) {
  return sim.createMatch({ id: 't', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
}
function toRally(g) {
  let n = 0;
  while (g.phase === 'serve' && n++ < 100) sim.step(g);
}
function placeShuttle(g, x, y, vx = 0, vy = 0, lastTeam = 1) {
  Object.assign(g.shuttle, { x, y, vx, vy, alive: true, lastTeam, owner: null, trail: [] });
  g.pendingLanding = null;
}

test('每局网高随种子变化且在 1.35–1.95 之间', () => {
  const seen = new Set();
  for (let seed = 1; seed <= 60; seed++) {
    const g = makeMatch(seed);
    assert.ok(g.netHeight >= rules.netMin && g.netHeight <= rules.netMax, `seed ${seed} 网高 ${g.netHeight}`);
    seen.add(g.netHeight);
  }
  assert.ok(seen.size > 15, '网高应该有明显变化');
});

test('任意网高下自动发球都能过网并落在对方半场', () => {
  for (let seed = 1; seed <= 60; seed++) {
    const g = makeMatch(seed);
    let n = 0;
    while (g.score[0] + g.score[1] === 0 && n++ < 600) sim.step(g);
    assert.equal(g.events.some(e => e.type === 'net'), false, `seed ${seed} 网高 ${g.netHeight} 发球挂网`);
    assert.deepEqual(g.score, [1, 0], `seed ${seed} 网高 ${g.netHeight} 发球未得分`);
  }
});

test('开局是发球状态，发球后球飞向对方半场', () => {
  const g = makeMatch(1);
  assert.equal(g.phase, 'serve');
  assert.equal(g.score[0], 0);
  const s0 = { ...g.shuttle };
  toRally(g);
  assert.equal(g.phase, 'rally');
  assert.ok(g.shuttle.vx > 0, '左方发球应向右飞');
  assert.equal(g.shuttle.lastTeam, 0);
  assert.ok(s0.x < rules.netX);
});

test('无人接发球时球落在对方半场，发球方得分', () => {
  const g = makeMatch(2);
  let n = 0;
  while (g.score[0] === 0 && n++ < 400) sim.step(g);
  assert.deepEqual(g.score, [1, 0]);
  const pt = g.events.find(e => e.type === 'point');
  assert.equal(pt.team, 0);
  assert.match(pt.reason, /对方半场/);
});

test('上手挥拍能击球，并把球打回对方半场', () => {
  const g = makeMatch(3);
  toRally(g);
  const p = g.batsmen[0];
  p.x = 4; p.y = 0; p.vx = 0; p.onGround = true;
  placeShuttle(g, p.x + 0.55, p.y + 1.9, 0, -1, 1);
  p.held = { move: 0, jump: false, swing: 1 };
  let hit = null;
  for (let i = 0; i < 6 && !hit; i++) { sim.step(g); hit = g.events.find(e => e.type === 'hit' && e.team === 0); }
  assert.ok(hit, '应该命中');
  assert.equal(hit.kind === 'smash' || hit.kind === 'clear' || hit.kind === 'drop', true);
  assert.ok(g.shuttle.vx > 0, '回球方向应朝右');
});

test('下手挥拍打出高球，上手高点打出平/下压球', () => {
  const low = makeMatch(4); toRally(low);
  const a = low.batsmen[0]; a.x = 3; a.y = 0;
  placeShuttle(low, a.x + 0.55, 0.8, 0, -0.5, 1);
  a.held = { move: 0, jump: false, swing: -1 };
  for (let i = 0; i < 6 && !low.events.some(e => e.type === 'hit'); i++) sim.step(low);
  const lift = low.events.find(e => e.type === 'hit');
  assert.equal(lift.kind, 'lift');
  assert.ok(low.shuttle.vy > 4, `挑球应有明显向上的速度，实际 ${low.shuttle.vy}`);

  const high = makeMatch(5); toRally(high);
  const b = high.batsmen[0]; b.x = 5.2; b.y = 0;
  placeShuttle(high, b.x + 0.55, 2.15, 0, -0.5, 1);
  b.held = { move: 1, jump: false, swing: 1 };
  for (let i = 0; i < 6 && !high.events.some(e => e.type === 'hit'); i++) sim.step(high);
  const hit = high.events.find(e => e.type === 'hit');
  assert.ok(hit, '高点上手应命中');
  assert.ok(high.shuttle.vx > 0);
  assert.ok(high.shuttle.vy < low.shuttle.vy - 3, '上手击球的出球角应明显低于挑球');
});

test('起跳后离地并消耗体力，落地恢复', () => {
  const g = makeMatch(6); toRally(g);
  const p = g.batsmen[0];
  p.held = { move: 0, jump: true, swing: 0 };
  sim.step(g);
  assert.equal(p.onGround, false);
  assert.ok(p.vy > 0);
  assert.ok(p.stamina < 100);
  for (let i = 0; i < 40; i++) { p.held = NEUTRAL; sim.step(g); }
  assert.equal(p.onGround, true);
  assert.ok(p.y === 0);
});

test('跑动消耗体力，站着恢复', () => {
  const g = makeMatch(7); toRally(g);
  const p = g.batsmen[0];
  for (let i = 0; i < 40; i++) { p.held = { move: 1, jump: false, swing: 0 }; sim.step(g); }
  const drained = p.stamina;
  assert.ok(drained < 100, `跑动应消耗体力，实际 ${drained}`);
  for (let i = 0; i < 60; i++) { p.held = NEUTRAL; sim.step(g); }
  assert.ok(p.stamina > drained, '站定应恢复体力');
});

test('球撞网会掉回击球方一侧', () => {
  const g = makeMatch(8); toRally(g);
  placeShuttle(g, rules.netX - 1.2, 0.9, 9, -0.5, 0);
  let net = null;
  for (let i = 0; i < 10 && !net; i++) { sim.step(g); net = g.events.find(e => e.type === 'net'); }
  assert.ok(net, '应该记录挂网事件');
  assert.ok(g.shuttle.x < rules.netX, '球应留在击球方一侧');
});

test('球飞出端线判出界，击球方失分', () => {
  const g = makeMatch(9); toRally(g);
  g.score = [5, 5];
  placeShuttle(g, rules.courtLength - 0.3, 1.2, 9, 0.5, 0);
  let n = 0;
  while (g.score[0] === 5 && n++ < 20) sim.step(g);
  assert.deepEqual(g.score, [5, 6], '左方击球出界，右方得分');
  const pt = g.events.find(e => e.type === 'point');
  assert.equal(pt.reason, '出界');
});

test('先到 11 分且领先 2 分结束比赛', () => {
  const g = makeMatch(10); toRally(g);
  g.score = [10, 9];
  placeShuttle(g, 12.5, 1.0, 5, -1, 1);
  let n = 0;
  while (g.status === 'playing' && n++ < 20) sim.step(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0, '右方击球出界，左方以 11:9 胜');
  assert.deepEqual(g.score, [11, 9]);
  // 10:10 时不会结束
  const h = makeMatch(11); toRally(h);
  h.score = [10, 10];
  placeShuttle(h, 12.5, 1.0, 5, -1, 1);
  n = 0;
  while (h.status === 'playing' && n++ < 20) sim.step(h);
  assert.deepEqual(h.score, [11, 10]);
  assert.equal(h.status, 'playing', '11:10 未领先 2 分，比赛继续');
});

test('蓄力时移动变慢，蓄满后松开衰减', () => {
  const plain = makeMatch(20); toRally(plain);
  const charged = makeMatch(20); toRally(charged);
  const ax0 = plain.batsmen[0].x, bx0 = charged.batsmen[0].x;
  for (let i = 0; i < 40; i++) {
    plain.batsmen[0].held = { move: 1, jump: false, swing: 0, charge: false };
    charged.batsmen[0].held = { move: 1, jump: false, swing: 0, charge: true };
    sim.step(plain); sim.step(charged);
  }
  const dPlain = plain.batsmen[0].x - ax0, dCharged = charged.batsmen[0].x - bx0;
  assert.ok(dPlain > dCharged * 1.25,
    `蓄力应明显减速：普通 ${dPlain.toFixed(2)} vs 蓄力 ${dCharged.toFixed(2)}`);
  assert.ok(charged.batsmen[0].charge > 0.9, '应蓄满');
  const p = charged.batsmen[0];
  for (let i = 0; i < 20; i++) { p.held = { move: 0, jump: false, swing: 0, charge: false }; sim.step(charged); }
  assert.ok(p.charge < 0.05, '松开后应衰减');
});

test('蓄力击球的出球速度更高，命中后清空蓄力', () => {
  const hit = (charge) => {
    const g = makeMatch(21); toRally(g);
    const p = g.batsmen[0];
    p.x = 4; p.y = 0; p.charge = charge ? 1 : 0;
    placeShuttle(g, p.x + 0.55, 1.9, 0, -1, 1);
    p.held = { move: 0, jump: false, swing: 1, charge: !!charge };
    for (let i = 0; i < 6 && !g.events.some(e => e.type === 'hit'); i++) sim.step(g);
    const ev = g.events.find(e => e.type === 'hit');
    return { ev, p };
  };
  const a = hit(false), b = hit(true);
  assert.ok(a.ev && b.ev);
  assert.ok(b.ev.speed > a.ev.speed * 1.3, `蓄力应提高球速：${a.ev.speed} → ${b.ev.speed}`);
  assert.equal(b.p.charge, 0, '命中后蓄力清空');
});

test('冲刺跑得更快但更耗体力', () => {
  const plain = makeMatch(22); toRally(plain);
  const fast = makeMatch(22); toRally(fast);
  for (let i = 0; i < 12; i++) {
    plain.batsmen[0].held = { move: -1, jump: false, swing: 0, charge: false, sprint: false };
    fast.batsmen[0].held = { move: -1, jump: false, swing: 0, charge: false, sprint: true };
    sim.step(plain); sim.step(fast);
  }
  const vPlain = Math.abs(plain.batsmen[0].vx), vFast = Math.abs(fast.batsmen[0].vx);
  assert.ok(vFast > vPlain * 1.15, `冲刺应更快：普通 ${vPlain.toFixed(2)} vs 冲刺 ${vFast.toFixed(2)}`);
  assert.ok(fast.batsmen[0].stamina < plain.batsmen[0].stamina - 4,
    `冲刺应更耗体力：${plain.batsmen[0].stamina.toFixed(1)} vs ${fast.batsmen[0].stamina.toFixed(1)}`);
});

test('蓄力和挥拍都消耗体力，站定恢复', () => {
  const g = makeMatch(23); toRally(g);
  const p = g.batsmen[0];
  const start = p.stamina;
  for (let i = 0; i < 20; i++) { p.held = { move: 0, jump: false, swing: 0, charge: true, sprint: false }; sim.step(g); }
  const afterCharge = p.stamina;
  assert.ok(afterCharge < start - 5, `蓄力应耗体力：${start} → ${afterCharge}`);
  const beforeSwing = p.stamina;
  p.held = { move: 0, jump: false, swing: 1, charge: false, sprint: false };
  sim.step(g);
  assert.ok(p.stamina <= beforeSwing - 5, '挥拍应扣体力');
  for (let i = 0; i < 40; i++) { p.held = NEUTRAL; sim.step(g); }
  assert.ok(p.stamina > beforeSwing - 6, '站定应恢复体力');
});

test('窗口形状与输入字段校验', () => {
  const g = makeMatch(12);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: 9 }, () => [NEUTRAL])), /10 帧/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: 10 }, () => [{ move: 'fast' }])), /move/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: 10 }, () => [{ swing: 'up' }])), /swing/);
  assert.throws(() => sim.submitWindow(g, 2, []), /team/);
  const ok = sim.submitWindow(g, 0, Array.from({ length: 10 }, () => [{ move: 3, swing: true }]));
  assert.equal(ok.length, 10);
  assert.equal(ok[0][0].move, 1);
  assert.equal(ok[0][0].swing, 1);
  assert.equal(sim.normalizeUnitInput({ swing: -1 }).swing, -1);
  assert.deepEqual(sim.normalizeUnitInput(null), NEUTRAL);
});

test('相同输入产生逐帧一致的比赛', () => {
  const run = () => {
    const g = makeMatch(13);
    let f = 0;
    const held = [null, null];
    while (g.status === 'playing' && f < 5200) {
      if (g.frame % rules.decisionFrames === 0) for (const p of g.batsmen) held[p.team] = sim.botInput(g, p);
      for (const p of g.batsmen) p.held = held[p.team] || NEUTRAL;
      sim.step(g); f++;
    }
    return JSON.stringify(sim.snapshot(g));
  };
  assert.equal(run(), run());
});

test('练习电脑能打完一整局并产生得分', () => {
  const g = makeMatch(14);
  let f = 0;
  const held = [null, null];
  while (g.status === 'playing' && f < 5200) {
    if (g.frame % rules.decisionFrames === 0) for (const p of g.batsmen) held[p.team] = sim.botInput(g, p);
    for (const p of g.batsmen) p.held = held[p.team] || NEUTRAL;
    sim.step(g); f++;
  }
  assert.equal(g.status, 'finished');
  assert.ok(g.score[0] + g.score[1] >= rules.matchPoints);
  assert.ok(g.events.filter(e => e.type === 'point').length >= 11);
});
