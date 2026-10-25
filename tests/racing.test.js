'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const catalog = require('../racing/catalog');
const sim = require('../racing/simulation');

const { rules, W, H } = catalog;
const NEUTRAL = { throttle: 0, steer: 0, drift: false, boost: false };

function makeMatch(seed = 1) {
  return sim.createMatch({ id: 't', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
}

function toLive(g) {
  while (g.phase !== 'live') sim.step(g);
}

// 把车钉在中心线上按切线行驶，隔离出被测试的物理量。
function pin(g, car, s, speed) {
  const p = catalog.pointAtLength(g.track.points, g.track.cum, s);
  car.x = p.x; car.y = p.y; car.angle = p.angle;
  car.vx = Math.cos(p.angle) * speed;
  car.vy = Math.sin(p.angle) * speed;
}

test('随机赛道在大量种子下都通过自检', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const track = catalog.buildTrack(seed);
    assert.equal(track.audit.valid, true, `seed ${seed} 未通过自检`);
    assert.equal(track.audit.startOnRoad, true, `seed ${seed} 起点不在路面`);
    assert.equal(track.audit.gridOnRoad, true, `seed ${seed} 发车格不在路面`);
    assert.ok(track.audit.roadTiles > 100, `seed ${seed} 路面太少`);
    assert.ok(track.length >= rules.minTrackLength, `seed ${seed} 赛道太短：${track.length}`);
    assert.equal(track.points.length % 1, 0);
    assert.equal(W * H, track.tiles.length);
    assert.ok(track.checkpoints.length === rules.checkpointCount);
  }
});

test('同一种子复现同一条赛道，不同种子生成不同赛道', () => {
  const a = catalog.buildTrack(23), b = catalog.buildTrack(23), c = catalog.buildTrack(24);
  assert.deepEqual(a.points, b.points);
  assert.deepEqual(a.tiles, b.tiles);
  assert.notDeepEqual(a.points, c.points);
  const seal = new Set();
  for (let seed = 100; seed < 112; seed++) seal.add(catalog.buildTrack(seed).points.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(';'));
  assert.ok(seal.size >= 11, '随机赛道不应大量重复');
});

test('检查点按弧长顺序布置，起点位于路面上', () => {
  for (const seed of [1, 7, 42, 5032]) {
    const t = catalog.buildTrack(seed);
    const dists = t.checkpoints.map(c => {
      const near = catalog.nearestOnTrack(t, c.x, c.y);
      return near.s;
    });
    for (let i = 1; i < dists.length; i++) assert.ok(dists[i] > dists[i - 1], `seed ${seed} 检查点未按顺序`);
    assert.ok(dists[0] < 1e-6 || dists[0] < t.length * 0.01);
    const startDist = catalog.distanceToPolyline(t.points, t.start.x, t.start.y);
    assert.ok(startDist <= t.halfWidth, `seed ${seed} 起点离中心线太远`);
  }
});

test('漂移积蓄能量，松开漂移后转入喷火能量', () => {
  const g = makeMatch(1);
  toLive(g);
  const car = g.cars[0];
  let s = 2;
  for (let i = 0; i < 40; i++) {
    pin(g, car, s, 12);
    car.held = { throttle: 1, steer: 0.5, drift: true, boost: false };
    sim.step(g);
    s += 12 * sim.DT;
  }
  assert.ok(car.driftTime > 0.5, '应该处于漂移状态');
  const charged = car.driftCharge;
  assert.ok(charged > 0.05, `漂移应积蓄能量，实际 ${charged}`);

  pin(g, car, s, 12);
  car.held = { throttle: 1, steer: 0, drift: false, boost: false };
  sim.step(g);
  assert.equal(car.driftCharge, 0, '松开漂移后蓄能清零');
  assert.ok(Math.abs(car.boostEnergy - charged) < 1e-6, '蓄能应转入喷火能量');
});

test('喷火提高速度上限并消耗能量', () => {
  const g = makeMatch(1);
  toLive(g);
  const car = g.cars[0];
  car.boostEnergy = 1;
  let s = 2;
  let peak = 0;
  for (let i = 0; i < 30; i++) {
    pin(g, car, s, Math.hypot(car.vx, car.vy));
    car.held = { throttle: 1, steer: 0, drift: false, boost: true };
    sim.step(g);
    s += Math.hypot(car.vx, car.vy) * sim.DT;
    peak = Math.max(peak, Math.hypot(car.vx, car.vy));
  }
  assert.equal(car.boosting, true);
  assert.ok(car.boostEnergy < 1, '喷火应消耗能量');
  assert.ok(peak > rules.maxSpeed, `喷火应突破常规最高速 ${rules.maxSpeed}，实际 ${peak.toFixed(2)}`);
});

test('两车碰撞会互相弹开并记录事件', () => {
  const g = makeMatch(1);
  toLive(g);
  const [a, b] = g.cars;
  const p = catalog.pointAtLength(g.track.points, g.track.cum, 5);
  a.x = p.x; a.y = p.y; a.vx = 6; a.vy = 0;
  b.x = p.x + rules.carRadius * 1.6; b.y = p.y; b.vx = -6; b.vy = 0;
  sim.step(g);
  const events = g.events.filter(e => e.type === 'collision');
  assert.equal(events.length, 1, '应记录一次碰撞');
  assert.ok(b.x - a.x > rules.carRadius * 1.6, '两车应被推开');
  assert.ok(a.vx < 6 || b.vx > -6, '碰撞应改变速度');
});

test('练习电脑能跑完 3 圈并产生漂移与喷火', () => {
  for (const seed of [1, 42, 5032]) {
    const g = makeMatch(seed);
    let frames = 0;
    while (g.status === 'playing' && frames < 6200) {
      for (const car of g.cars) car.held = sim.botInput(g, car);
      sim.step(g);
      frames++;
    }
    assert.equal(g.status, 'finished');
    assert.equal(g.reason, '冲线');
    assert.equal(g.cars[g.winner].lap, rules.laps, `seed ${seed} 胜者应完成 3 圈`);
    assert.ok(g.cars.some(c => c.boosts > 0), `seed ${seed} 应出现喷火`);
    assert.ok(g.cars.some(c => c.driftTime > 1), `seed ${seed} 应出现漂移`);
  }
});

test('相同输入逐帧结果完全一致', () => {
  const run = () => {
    const g = makeMatch(7);
    let frames = 0;
    while (g.status === 'playing' && frames < 6200) {
      for (const car of g.cars) car.held = sim.botInput(g, car);
      sim.step(g);
      frames++;
    }
    return JSON.stringify(sim.snapshot(g));
  };
  assert.equal(run(), run());
});

test('窗口形状与输入字段校验', () => {
  const g = makeMatch(1);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: 19 }, () => [NEUTRAL])), /20 帧/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: 20 }, () => [{ throttle: 'fast' }])), /throttle/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: 20 }, () => [{ steer: NaN }])), /steer/);
  assert.throws(() => sim.submitWindow(g, 2, []), /team/);
  const ok = sim.submitWindow(g, 0, Array.from({ length: 20 }, () => [{ throttle: 5, steer: -5 }]));
  assert.equal(ok.length, 20);
  assert.equal(ok[0][0].throttle, 1);
  assert.equal(ok[0][0].steer, -1);
  assert.deepEqual(sim.normalizeUnitInput(null), NEUTRAL);
});

test('时间到时按进度判定胜负', () => {
  const g = makeMatch(3);
  toLive(g);
  g.cars[0].progress = 50;
  g.cars[1].progress = 10;
  g.frame = rules.matchSeconds * rules.hz;
  sim.step(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0);
  assert.equal(g.reason, '时间到');
});
