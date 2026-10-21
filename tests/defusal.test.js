'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const sim = require('../defusal/simulation');
const catalog = require('../defusal/catalog');
const { rules, weapons, SITES, SPAWNS, buildMap, auditMap, WALL, EMPTY } = catalog;

const FRAMES = rules.decisionFrames;
const W = rules.width, H = rules.height;
const tile = (g, x, y) => g.tiles[y * W + x];
const neutralFrame = () => Array.from({ length: rules.teamSize }, () => ({ dir: 'N', aim: null }));
const neutralWindow = () => Array.from({ length: FRAMES }, neutralFrame);

function make(seed = 5) {
  return sim.createMatch({ id: 't', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
}
function emptyBuys(g) {
  if (g.phase === 'buy') {
    if (!g.buyReady[0]) sim.submitBuys(g, 0, []);
    if (!g.buyReady[1]) sim.submitBuys(g, 1, []);
  }
}
function live(seed = 5) { const g = make(seed); emptyBuys(g); return g; }
function setHeld(u, dir = 'N', aim = null) { u.held = { dir, aim }; }
function allDead(g, team) { for (const u of g.units) if (u.team === team) { u.alive = false; u.hp = 0; } }
function disarm(g) { for (const u of g.units) { u.mag = 0; u.reserve = 0; } }
// 测试视野/弹道时清空内部掩体，完全控制场地。
function clearArena(g) {
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) g.tiles[y * W + x] = EMPTY;
}
function stepUntil(g, predicate, max = 200) {
  for (let i = 0; i < max && g.phase === 'live'; i++) { sim.step(g); if (predicate()) return true; }
  return false;
}

test('larger maps are random, symmetric, connected and fair across seeds', () => {
  assert.ok(rules.width >= 50 && rules.height >= 30, '地图要比旧版明显更大');
  const maps = new Map();
  for (const seed of [1, 2, 3, 7, 42, 99, 123, 777, 1234, 9999]) {
    const tiles = buildMap(seed);
    const a = auditMap(tiles);
    assert.equal(a.asymmetric, 0, `seed ${seed} 必须左右镜像`);
    assert.equal(a.spawnBlocked, 0);
    assert.equal(a.siteOpen, true);
    assert.equal(a.sitesReachable, true);
    assert.equal(a.defendReachable, true);
    assert.equal(a.fair, true);
    maps.set(seed, JSON.stringify(Array.from(tiles)));
  }
  assert.ok(new Set(maps.values()).size >= 8, '不同种子应产生不同的地图');
  const g = make(7);
  assert.equal(g.mapAudit.fair, true);
  assert.equal(g.tiles.length, W * H);
});

test('both teams start with five units, $800 each, pistols, and a buy phase', () => {
  const g = make();
  assert.equal(g.units.length, 10);
  assert.equal(g.units.filter(u => u.team === 0).length, 5);
  assert.equal(g.units.filter(u => u.team === 1).length, 5);
  assert.equal(g.phase, 'buy');
  for (const u of g.units) {
    assert.equal(u.money, rules.startingMoney);
    assert.equal(u.weapon, 'pistol');
    assert.equal(u.hp, rules.maxHp);
    assert.equal(u.alive, true);
  }
  assert.equal(g.sides[0], 'attack');
  assert.equal(g.sides[1], 'defend');
});

test('buying deducts per-unit money and only starts the round when both teams submit', () => {
  const g = make();
  g.units[0].money = 3000;
  sim.submitBuys(g, 0, [{ unit: 0, weapon: 'rifle', armor: true }]);
  assert.equal(g.units[0].weapon, 'rifle');
  assert.equal(g.units[0].money, 300, '步枪 2700 后只剩 300，装甲买不起');
  assert.equal(g.units[0].armor, 0);
  assert.equal(g.phase, 'buy');
  sim.submitBuys(g, 1, [{ unit: 0, weapon: 'pdw' }]);
  assert.equal(g.phase, 'live');
  assert.equal(g.buys.length, 2);
});

test('invalid purchases are ignored without breaking the buy phase', () => {
  const g = make();
  g.units[0].money = 100;
  sim.submitBuys(g, 0, [{ unit: 0, weapon: 'sniper' }, { unit: 99, weapon: 'rifle' }]);
  assert.equal(g.units[0].weapon, 'pistol');
  assert.equal(g.units[0].money, 100);
  assert.equal(g.buyReady[0], true);
});

test('a unit sees enemies in its facing cone, loses them behind, and walls block sight', () => {
  const g = live(3); clearArena(g);
  const a = g.units[0], e = g.units[5];
  for (const u of g.units) if (u !== a && u !== e) { u.alive = false; u.hp = 0; }
  disarm(g);
  a.x = 10.5; a.y = 10.5; a.facing = { x: 1, y: 0 };
  e.x = 14.5; e.y = 10.5; e.facing = { x: -1, y: 0 };
  assert.equal(sim.canSee(g, a, e), true, '正前方 4 格应可见');
  a.facing = { x: -1, y: 0 };
  assert.equal(sim.canSee(g, a, e), false, '背对且超出近身范围不可见');
  e.x = 12.0; e.y = 10.5;
  assert.equal(sim.canSee(g, a, e), true, '近身范围应 360° 感知');
  g.tiles[10 * W + 12] = WALL;
  a.x = 10.5; a.y = 10.5; a.facing = { x: 1, y: 0 }; e.x = 14.5; e.y = 10.5;
  assert.equal(sim.lineOfSight(g, a.x, a.y, e.x, e.y), false);
  assert.equal(sim.canSee(g, a, e), false);
});

test('the team view contains only own units and visible enemies, never the full enemy team', () => {
  const g = live(3); clearArena(g);
  const a = g.units[0], e = g.units[5];
  for (const u of g.units) if (u !== a && u !== e) { u.alive = false; u.hp = 0; }
  disarm(g);
  a.x = 10.5; a.y = 10.5; a.facing = { x: 1, y: 0 };
  e.x = 14.5; e.y = 10.5;
  const v = sim.view(g, 0);
  assert.equal(v.units.length, 5);
  const visible = Object.values(v.visibleEnemies).flat();
  assert.equal(visible.length, 1);
  assert.equal(visible[0].id, e.id);
  assert.equal('hp' in visible[0], false);
  assert.equal('money' in visible[0], false);
  assert.equal(sim.snapshot(g).units.length, 10);
});

test('every weapon fires visible projectiles that travel over time', () => {
  const g = live(5); clearArena(g);
  const a = g.units[0], e = g.units[5];
  for (const u of g.units) if (u !== a && u !== e) { u.alive = false; u.hp = 0; }
  disarm(g);
  a.x = 10.5; a.y = 10.5; a.facing = { x: 1, y: 0 };
  e.x = 24.5; e.y = 10.5; e.hp = 100; e.armor = 0;
  a.weapon = 'pistol'; a.mag = weapons.pistol.mag; a.reserve = 60; a.fireCd = 0;
  sim.step(g);
  assert.ok(g.bullets.length >= 1, '开火后应存在实体子弹');
  const b = g.bullets[0];
  assert.ok(b.vx > 0 && Math.abs(b.vy / b.vx) < 0.1, '子弹应朝瞄准方向飞行');
  assert.ok(Math.hypot(b.vx, b.vy) * rules.hz < rules.moveSpeed * 6, '子弹速度应保持可躲范围');
  const x0 = b.x;
  assert.equal(e.hp, 100, '子弹不会瞬移命中');
  sim.step(g);
  assert.ok(b.x > x0, '子弹逐帧移动');
  const firstHp = e.hp;
  assert.ok(stepUntil(g, () => e.hp < firstHp, 120), '子弹最终应命中静止目标');
});

test('projectiles deal armor-aware damage, consume ammo and award kills', () => {
  const g = live(5); clearArena(g);
  const a = g.units[0], e = g.units[5], spare = g.units[6];
  for (const u of g.units) if (u !== a && u !== e && u !== spare) { u.alive = false; u.hp = 0; }
  spare.x = 50; spare.y = 30; setHeld(spare);
  disarm(g);
  a.x = 10.5; a.y = 10.5; a.facing = { x: 1, y: 0 };
  e.x = 18.5; e.y = 10.5; e.facing = { x: -1, y: 0 }; e.armor = 100; e.hp = 100;
  a.weapon = 'rifle'; a.mag = 30; a.reserve = 90; a.fireCd = 0;
  sim.step(g);
  assert.equal(a.mag, 29, '开火消耗一发');
  assert.ok(stepUntil(g, () => e.hp < 100, 120));
  assert.equal(e.hp, 85, '30 点伤害中 15 被护甲吸收');
  assert.equal(e.armor, 85);
  // 直接击杀（spare 存活，回合不结束）
  e.hp = 10; e.armor = 0; a.fireCd = 0; a.mag = 10;
  const moneyBefore = a.money, killsBefore = a.kills;
  assert.ok(stepUntil(g, () => !e.alive, 120));
  assert.equal(a.kills, killsBefore + 1);
  assert.ok(a.money > moneyBefore, '击杀应有金钱奖励');
});

test('a projectile can be dodged by moving out of its line', () => {
  const g = live(5); clearArena(g);
  const a = g.units[0], e = g.units[5];
  for (const u of g.units) if (u !== a && u !== e) { u.alive = false; u.hp = 0; }
  disarm(g);
  a.x = 10.5; a.y = 10.5; a.facing = { x: 1, y: 0 };
  e.x = 18.5; e.y = 10.5; e.hp = 100;
  a.weapon = 'rifle'; a.mag = 1; a.reserve = 0; a.fireCd = 0;
  sim.step(g);
  sim.step(g);
  e.x = 18.5; e.y = 18.5; // 侧移 8 格
  stepUntil(g, () => g.bullets.length === 0, 100);
  assert.equal(e.hp, 100, '慢速子弹应能被侧移躲开');
});

test('walls stop projectiles', () => {
  const g = live(5); clearArena(g);
  const [a, e] = g.units;
  for (const u of g.units) if (u !== a && u !== e) { u.alive = false; u.hp = 0; }
  disarm(g);
  g.tiles[10 * W + 14] = WALL;
  a.x = 10.5; a.y = 10.5; e.x = 18.5; e.y = 10.5; e.hp = 100;
  g.bullets.push({ id: 'wall-test', unit: a.id, team: 0, weapon: 'rifle', x: 12.5, y: 10.5, vx: 0.5, vy: 0, r: 0.1, damage: 30, ttl: 50 });
  for (let i = 0; i < 20 && g.bullets.length; i++) sim.step(g);
  assert.equal(g.bullets.length, 0, '子弹撞墙应消失');
  assert.equal(e.hp, 100, '墙后不应被击中');
});

test('planting requires the carrier to stand still in a site', () => {
  const g = live(1); clearArena(g); disarm(g);
  const attacker = g.units.find(u => u.id === g.bomb.carrier);
  for (const u of g.units.filter(x => x.team === 1)) { u.x = 50; u.y = 30; setHeld(u); }
  attacker.x = SITES.A.x1 + 0.5; attacker.y = SITES.A.y1 + 0.5;
  setHeld(attacker, 'R');
  for (let i = 0; i < 30; i++) sim.step(g);
  assert.equal(g.bomb.state, 'carried', '移动时不能下包');
  setHeld(attacker, 'N');
  const money = attacker.money;
  for (let i = 0; i < Math.round(rules.plantTime * rules.hz) + 2; i++) sim.step(g);
  assert.equal(g.bomb.state, 'planted');
  assert.equal(g.bomb.site, 'A');
  assert.ok(attacker.money > money);
});

test('defusing requires a stationary defender near the planted bomb', () => {
  const g = live(1); clearArena(g); disarm(g);
  const carrier = g.units.find(u => u.id === g.bomb.carrier);
  const def = g.units.filter(u => u.team === 1);
  for (const u of def) { u.x = 50; u.y = 30; setHeld(u); }
  carrier.x = SITES.A.x1 + 0.5; carrier.y = SITES.A.y1 + 0.5; setHeld(carrier);
  for (let i = 0; i < Math.round(rules.plantTime * rules.hz) + 2; i++) sim.step(g);
  assert.equal(g.bomb.state, 'planted');
  for (const u of g.units.filter(x => x.team === 0)) { u.x = 50; u.y = 2; setHeld(u); u.mag = 0; }
  const d = def[0]; d.x = g.bomb.x; d.y = g.bomb.y; setHeld(d);
  for (let i = 0; i < Math.round(rules.defuseTime * rules.hz) + 4 && g.phase === 'live'; i++) sim.step(g);
  assert.equal(g.roundWins[1], 1);
  assert.equal(g.roundLog[0].reason, '拆除炸弹');
});

test('the bomb explodes after its timer', () => {
  const g = live(1); clearArena(g); disarm(g);
  const carrier = g.units.find(u => u.id === g.bomb.carrier);
  for (const u of g.units.filter(x => x.team === 1)) { u.x = 50; u.y = 30; setHeld(u); }
  carrier.x = SITES.A.x1 + 0.5; carrier.y = SITES.A.y1 + 0.5; setHeld(carrier);
  for (let i = 0; i < Math.round(rules.plantTime * rules.hz) + 2; i++) sim.step(g);
  for (let i = 0; i < Math.round(rules.bombTimer * rules.hz) + 10 && g.phase === 'live'; i++) sim.step(g);
  assert.equal(g.roundWins[0], 1);
  assert.equal(g.roundLog[0].reason, '炸弹爆炸');
});

test('a round ends on elimination and the time limit', () => {
  const g = live(2); allDead(g, 1); sim.step(g);
  assert.equal(g.roundWins[0], 1);
  assert.equal(g.roundLog[0].reason, '防守方全灭');
  const h = live(2); h.roundFrames = Math.round(rules.roundTimeLimit * rules.hz) - 1; sim.step(h);
  assert.equal(h.roundWins[1], 1);
  assert.equal(h.roundLog[0].reason, '时间到');
});

test('sides swap after three rounds and halftime resets economy', () => {
  const g = make(9);
  for (let round = 1; round <= 3; round++) {
    emptyBuys(g); allDead(g, 1); sim.step(g);
    assert.equal(g.phase, 'buy');
  }
  assert.equal(g.round, 4);
  assert.equal(g.sides[0], 'defend');
  assert.equal(g.sides[1], 'attack');
  for (const u of g.units) {
    assert.equal(u.money, rules.startingMoney);
    assert.equal(u.weapon, 'pistol');
    assert.equal(u.armor, 0);
  }
  emptyBuys(g); allDead(g, 1); sim.step(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0);
  assert.equal(g.roundWins[0], 4);
});

test('a 3:3 match is a draw', () => {
  const g = make(4);
  for (let round = 1; round <= 6; round++) {
    emptyBuys(g);
    if (round <= 3) allDead(g, 0); else allDead(g, 1);
    sim.step(g);
  }
  assert.equal(g.status, 'finished');
  assert.equal(g.roundWins[0], 3);
  assert.equal(g.roundWins[1], 3);
  assert.equal(g.winner, null);
});

test('window inputs are 20 frames of five unit inputs and reject malformed frames', () => {
  const g = live(6);
  const frames = Array.from({ length: FRAMES }, (_, f) => Array.from({ length: 5 }, () => ({ dir: f % 2 ? 'L' : 'R', aim: 'U' })));
  const w0 = sim.submitWindow(g, 0, frames);
  const w1 = sim.submitWindow(g, 1, frames);
  assert.equal(w0.length, FRAMES);
  assert.equal(w0[0].length, 5);
  assert.throws(() => sim.submitWindow(g, 0, [[{ dir: 'X' }]]), /非法移动方向/);
  assert.throws(() => sim.submitWindow(g, 0, [{ dir: 'X' }]), /5 个单位/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: FRAMES + 1 }, neutralFrame)), /最多 20 帧/);
  const before = g.tick;
  sim.advanceWindow(g, [w0, w1]);
  assert.equal(g.tick, before + FRAMES);
});

test('identical seeds and inputs produce identical matches', () => {
  const run = () => {
    const g = make(21);
    for (const t of [0, 1]) sim.submitBuys(g, t, sim.botBuy(g, t));
    for (let i = 0; i < 6000 && g.status === 'playing'; i++) {
      if (g.phase === 'buy') {
        for (const t of [0, 1]) if (!g.buyReady[t]) sim.submitBuys(g, t, sim.botBuy(g, t));
        continue;
      }
      for (const u of g.units) if (u.alive) u.held = sim.botUnitInput(g, u);
      sim.step(g);
    }
    return g;
  };
  const a = run(), b = run();
  assert.equal(JSON.stringify(sim.snapshot(a)), JSON.stringify(sim.snapshot(b)));
});

test('the practice computer finishes a full match on the larger map', () => {
  const g = make(7);
  let guard = 0;
  while (g.status === 'playing' && guard++ < 60000) {
    if (g.phase === 'buy') {
      for (const t of [0, 1]) if (!g.buyReady[t]) sim.submitBuys(g, t, sim.botBuy(g, t));
      continue;
    }
    for (const u of g.units) if (u.alive) u.held = sim.botUnitInput(g, u);
    sim.step(g);
  }
  assert.equal(g.status, 'finished');
  assert.ok(g.roundLog.length >= 4);
});
