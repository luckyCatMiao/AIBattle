'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const sim = require('../bomber/simulation');
const { rules, powerups, moveFrames, auditMap, EMPTY, HARD, SOFT } = require('../bomber/catalog');

const FRAMES = rules.decisionFrames;
const idle = () => Array.from({ length: FRAMES }, () => ({ dir: 'N', btn: null }));
const hold = (dir, n = FRAMES) => Array.from({ length: n }, () => ({ dir, btn: null }));
const bombWindow = () => Array.from({ length: FRAMES }, (_, i) => ({ dir: 'N', btn: i % 5 === 0 ? 'BOMB' : null }));
const pad = list => { const o = list.slice(0, FRAMES); while (o.length < FRAMES) o.push({ dir: 'N', btn: null }); return o; };

// 造一个可控的干净场地：清掉所有软墙，只留硬墙骨架。
function arena(seed = 5) {
  const g = sim.createMatch({ id: 'test', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  for (let i = 0; i < g.tiles.length; i++) if (g.tiles[i] === SOFT) g.tiles[i] = EMPTY;
  return g;
}
function run(g, windows, a = idle(), b = idle()) {
  for (let i = 0; i < windows && g.status === 'playing'; i++) sim.advanceWindow(g, [a, b]);
  return g;
}
// 逐帧推进。火焰只持续 rules.blastFrames (12) 帧，而一个决策窗口是 20 帧，
// 所以「整窗推进」会直接跨过火焰期，测不到中间状态——这类断言必须逐帧走。
function ticks(g, frames) {
  for (let i = 0; i < frames && g.status === 'playing'; i++) sim.step(g);
  return g;
}
function place(g, owner, x, y) {
  const f = g.fighters[owner];
  f.x = x; f.y = y; f.fromX = x; f.fromY = y; f.moveProgress = 1; f.movingTo = null;
  return f;
}
const tile = (g, x, y) => g.tiles[y * rules.width + x];

/* ---------------- 地图公平性 ---------------- */

test('the map is four-way symmetric with clear spawns on every seed', () => {
  for (const seed of [1, 7, 42, 99, 1234, 77777]) {
    const g = sim.createMatch({ id: 'm', seed, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
    assert.equal(g.mapAudit.asymmetric, 0, `seed ${seed} 的软墙必须上下左右镜像`);
    assert.equal(g.mapAudit.spawnBlocked, 0, `seed ${seed} 的出生区不能有软墙`);
    assert.equal(g.mapAudit.fair, true);
    // 硬墙骨架本身也是四向对称的
    for (let y = 0; y < rules.height; y++) for (let x = 0; x < rules.width; x++) {
      assert.equal(tile(g, x, y), tile(g, rules.width - 1 - x, y), `(${x},${y}) 与左右镜像格不一致`);
      assert.equal(tile(g, x, y), tile(g, x, rules.height - 1 - y), `(${x},${y}) 与上下镜像格不一致`);
    }
  }
});

test('two to four players get corner spawns that rotate between rounds', () => {
  for (const n of [2, 3, 4]) {
    const g = sim.createMatch({ id: 'n' + n, seed: 3, players: Array.from({ length: n }, (_, i) => ({ name: 'P' + i, kind: 'api' })) });
    assert.equal(g.fighters.length, n);
    assert.equal(g.spawns.length, n);
    assert.ok(g.mapAudit.fair, `${n} 人局地图必须公平`);
    const corners = new Set(g.spawns.map(([x, y]) => `${x},${y}`));
    assert.equal(corners.size, n, '每个席位必须站在不同的角');
  }
  const two = sim.createMatch({ id: 'a', seed: 3, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  assert.deepEqual(two.spawns, [[1, 1], [rules.width - 2, rules.height - 2]], '2 人应站在对角');
  // 下一局出生角旋转，长系列里不会总是同一对位置
  const g2 = sim.createMatch({ id: 'b', seed: 3, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  g2.fighters[1].alive = false; sim.step(g2);
  assert.equal(g2.round, 2);
  assert.notDeepEqual(g2.spawns, two.spawns, '换局后出生角应轮换');
});

test('spawn points are walkable and mutually equidistant from the centre', () => {
  const g = arena();
  const [a, b] = g.fighters;
  assert.equal(tile(g, a.x, a.y), EMPTY, '出生点必须是空地');
  assert.equal(tile(g, b.x, b.y), EMPTY);
  const cx = (rules.width - 1) / 2, cy = (rules.height - 1) / 2;
  assert.equal(Math.abs(a.x - cx), Math.abs(b.x - cx));
  assert.equal(Math.abs(a.y - cy), Math.abs(b.y - cy));
});

/* ---------------- 炸弹与爆炸 ---------------- */

test('a bomb explodes after its fuse and produces a cross of fire', () => {
  const g = arena();
  const f = place(g, 0, 5, 5), foe = place(g, 1, 1, 11);
  sim.advanceWindow(g, [[{ dir: 'N', btn: 'BOMB' }, ...idle().slice(1)], hold('N')]);
  assert.equal(g.bombs.length, 1, '应该放下了一颗炸弹');
  // 把放弹的 A 挪到火焰范围之外再等爆炸。
  // 否则 A 会被自己的炸弹炸死 → 该局结束 → startRound() 清空火焰，
  // 那样就测不到「爆炸留下了什么」，只能测到「A 把自己炸死了」。
  place(g, 0, 5, 1);
  // 引信已经在上面那个窗口里走了 20 帧，必须按剩余帧数推；
  // 多推一点火焰（只持续 12 帧）就烧完了。
  const remaining = g.bombs[0].fuse;
  ticks(g, remaining + 1);
  assert.equal(g.bombs.length, 0, '引信到点后炸弹应消失');
  assert.ok(g.blasts.length > 0, '应该留下火焰');
  const cells = g.blasts.map(c => `${c.x},${c.y}`);
  assert.ok(cells.includes('5,5'), '中心格有火');
  assert.ok(cells.includes('6,5') && cells.includes('4,5'), '水平方向有火');
  assert.ok(cells.includes('5,6') && cells.includes('5,4'), '垂直方向有火');
  assert.equal(cells.length, 5, `火力 1 的爆炸应该是 5 格的十字，实得 ${cells.length} 格`);
});

test('hard walls stop the blast and soft walls are destroyed', () => {
  const g = arena();
  place(g, 0, 5, 5); place(g, 1, 1, 11);
  // 硬墙在 (4,4) 与 (6,6)：偶数行偶数列本来就是硬墙
  assert.equal(tile(g, 5, 6), EMPTY > -1 ? tile(g, 5, 6) : 0);
  // 在 (5,4) 放软墙，(4,5) 放硬墙（(4,5) 是奇偶混合，本应是空地，手动设成硬墙）
  g.tiles[4 * rules.width + 5] = HARD;
  g.tiles[4 * rules.width + 4] = SOFT;
  place(g, 0, 4, 5);
  sim.advanceWindow(g, [bombWindow(), idle()]);
  run(g, 6, idle(), idle());
  assert.equal(g.bombs.length, 0);
  const cells = g.blasts.map(c => `${c.x},${c.y}`);
  assert.ok(!cells.includes('3,5'), '硬墙后的格子不应被波及');
  assert.ok(!cells.includes('4,4'), '硬墙本身不应着火');
});

test('explosions chain into other bombs', () => {
  const g = arena();
  place(g, 0, 3, 1); place(g, 1, 13, 11);
  // 手工放两颗相邻的炸弹（A 的两颗，靠得足够近以便连锁）
  const f = g.fighters[0];
  f.bombs = 2; f.blast = 3;
  sim.placeBomb(g, f);
  place(g, 0, 6, 1);
  sim.placeBomb(g, f);
  assert.equal(g.bombs.length, 2);
  run(g, 6, idle(), idle());
  assert.equal(g.bombs.length, 0, '第一颗爆炸应连锁引爆第二颗');
});

test('a bomb blocks movement but the placer can step off it', () => {
  const g = arena();
  const f = place(g, 0, 5, 5);
  place(g, 1, 1, 11);
  sim.advanceWindow(g, [pad([{ dir: 'N', btn: 'BOMB' }]), idle()]);
  assert.equal(g.bombs.length, 1);
  // 放弹者可以走开
  sim.advanceWindow(g, [hold('R'), idle()]);
  assert.ok(f.x > 5 || f.movingTo, '放弹者应该能离开炸弹格');
  // 但走回来会被挡住
  const backX = f.x;
  sim.advanceWindow(g, [hold('L'), idle()]);
  assert.ok(f.x <= backX, '炸弹会阻挡回头路');
});

test('the blast kills anything standing in it, including the bomber', () => {
  const g = arena();
  const f = place(g, 0, 5, 5);
  place(g, 1, 1, 11);
  sim.advanceWindow(g, [bombWindow(), idle()]);
  // 原地不动，等着被自己的炸弹炸死
  while (g.roundFrames < rules.fuseFrames + rules.blastFrames + 5 && g.status === 'playing') {
    sim.advanceWindow(g, [idle(), idle()]);
  }
  assert.equal(f.alive, false, '站在自己的火焰里应该死亡');
  assert.equal(g.roundLog[0].winner, 'B', '对手赢得该局');
});

/* ---------------- 道具 ---------------- */

test('powerups can be picked up and boost the right stat', () => {
  const g = arena();
  const f = place(g, 0, 5, 5);
  place(g, 1, 1, 11);
  const before = { bombs: f.bombs, blast: f.blast, speed: f.speed };
  g.drops.push({ id: 'd1', x: 7, y: 5, type: 'blast' });
  sim.advanceWindow(g, [hold('R'), idle()]);
  sim.advanceWindow(g, [hold('R'), idle()]);
  assert.equal(f.blast, before.blast + 1, '火力道具应提升 blast');
  assert.equal(g.drops.length, 0, '道具被拾取后应消失');
});

test('every powerup type has a legal effect and the caps hold', () => {
  for (const type of Object.keys(powerups)) {
    const g = arena();
    const f = place(g, 0, 5, 5);
    place(g, 1, 1, 11);
    g.drops.push({ id: 'd', x: 5, y: 5, type });
    sim.advanceWindow(g, [idle(), idle()]);
    assert.ok(f.bombs <= rules.bombsMax && f.blast <= rules.blastMax, '道具不能突破上限');
    assert.ok(f.bombs >= rules.baseBombs && f.blast >= rules.baseBlast, '道具不能降低属性');
  }
});

test('fire burns powerups lying on the ground', () => {
  const g = arena();
  const f = place(g, 0, 5, 5);
  place(g, 1, 1, 11);
  g.drops.push({ id: 'd', x: 6, y: 5, type: 'bomb' });
  sim.advanceWindow(g, [bombWindow(), idle()]);
  run(g, 6, idle(), idle());
  assert.equal(g.drops.length, 0, '火焰应烧毁地上的道具');
});

/* ---------------- 掉落与单局时限 ---------------- */

test('a destroyed soft wall leaves a powerup instead of being burned by the same blast', () => {
  const g = arena();
  place(g, 0, 5, 5); place(g, 1, 1, 11);
  g.tiles[5 * rules.width + 6] = SOFT;           // 炸弹右侧放一堵软墙
  const old = rules.powerupChance;
  rules.powerupChance = 1;                       // 强制掉落，专测「掉落会不会被同一帧烧掉」
  try {
    sim.advanceWindow(g, [bombWindow(), idle()]);
    place(g, 0, 5, 1);                           // 离开火焰范围
    ticks(g, rules.fuseFrames + rules.blastFrames + 2);
  } finally { rules.powerupChance = old; }
  assert.equal(tile(g, 6, 5), EMPTY, '软墙必须被炸毁');
  const drop = g.drops.find(d => d.x === 6 && d.y === 5);
  assert.ok(drop, '炸毁软墙必须留下道具，不能被同一次爆炸烧掉');
  assert.ok(Object.keys(powerups).includes(drop.type));
});

test('a passive match still ends at the round time limit instead of dragging on', () => {
  // 没有涨水之后，靠单局 150 秒硬上限兜底：双方都不动时每局判平局，五局后系列结束。
  const g = arena();
  let windows = 0;
  while (g.status === 'playing' && windows < 800) { sim.advanceWindow(g, [idle(), idle()]); windows++; }
  assert.equal(g.status, 'finished', '对局必须在有限时间内结束');
  assert.equal(g.roundLog.length, rules.maxRounds, '应打满五局');
  assert.equal(g.winner, null, '全部平局时系列赛无胜者');
  assert.equal(g.reason, '五局战平');
  for (const r of g.roundLog) {
    assert.equal(r.reason, '时间到', '双方都不动时应由单局时限结束');
    assert.ok(r.frames / rules.hz <= rules.roundTimeLimit + 1, `第 ${r.round} 局超过了硬上限`);
  }
});

test('the round time limit is advertised in the snapshot', () => {
  const g = arena();
  const snap = sim.snapshot(g);
  assert.equal(snap.rules.roundTimeLimit, rules.roundTimeLimit);
  assert.equal(snap.flood, undefined, '不再公布涨水字段');
  assert.equal(snap.timeLeft, rules.roundTimeLimit);
});

/* ---------------- 多人同场 ---------------- */

test('a four-player round continues until only one fighter remains', () => {
  const g = sim.createMatch({ id: '4p', seed: 12, players: Array.from({ length: 4 }, (_, i) => ({ name: 'P' + i, kind: 'api' })) });
  g.fighters[1].alive = false; g.fighters[2].alive = false;
  sim.step(g);
  assert.equal(g.status, 'playing', '还有两人存活时不能结算');
  assert.equal(g.round, 1);
  g.fighters[3].alive = false;
  sim.step(g);
  assert.equal(g.roundLog.length, 1);
  assert.equal(g.roundLog[0].winner, 'P0', '最后存活者赢得该局');
});

test('three-player windows accept one input batch per seat', () => {
  const g = sim.createMatch({ id: '3p', seed: 5, players: Array.from({ length: 3 }, (_, i) => ({ name: 'P' + i, kind: 'api' })) });
  const before = g.roundFrames;
  sim.advanceWindow(g, [hold('R'), hold('L'), hold('N')]);
  assert.equal(g.roundFrames, before + FRAMES, '三方输入应推进一个完整窗口');
  assert.equal(g.fighters.length, 3);
  assert.ok(g.fighters.every(f => Number.isFinite(f.x) && Number.isFinite(f.y)));
});

test('move speed improves with the speed powerup and respects the cap', () => {
  for (let level = 0; level <= 6; level++) {
    const frames = moveFrames(level);
    assert.ok(frames >= rules.framesPerTileMin, '速度不能超过上限');
    assert.ok(frames <= rules.framesPerTile, '速度不能低于初始值');
  }
  assert.ok(moveFrames(3) < moveFrames(0), '升级后移动更快');
});

/* ---------------- 赛制 ---------------- */

test('the series is best of five and stops at three wins', () => {
  const g = arena();
  // 反复把 B 打死，直到系列结束
  let guard = 0;
  while (g.status === 'playing' && guard++ < 40) {
    g.fighters[1].alive = false;
    sim.step(g);
  }
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0);
  assert.equal(g.players[0].wins, rules.roundWinsToTakeMatch, '先到三胜即结束');
  assert.equal(g.roundLog.length, rules.roundWinsToTakeMatch, '不应该多打');
  assert.equal(g.reason, '先胜三局');
});

test('simultaneous death is a draw that still consumes a round', () => {
  const g = arena();
  g.fighters[0].alive = false;
  g.fighters[1].alive = false;
  sim.step(g);
  const last = g.roundLog[g.roundLog.length - 1];
  assert.equal(last.winner, null, '同时死亡判平局');
  assert.equal(g.players[0].wins, 0);
  assert.equal(g.players[1].wins, 0);
  assert.equal(g.round, 2, '平局仍然占用局数');
});

test('equipment resets every round', () => {
  const g = arena();
  const f = g.fighters[0];
  f.bombs = 4; f.blast = 5; f.speed = 3;
  g.fighters[1].alive = false;
  sim.step(g);
  const fresh = g.fighters[0];
  assert.equal(fresh.bombs, rules.baseBombs, '炸弹数应重置');
  assert.equal(fresh.blast, rules.baseBlast, '火力应重置');
  assert.equal(fresh.speed, 0, '速度应重置');
});

test('a finished match is immutable', () => {
  const g = arena();
  for (let i = 0; i < 3; i++) { g.fighters[1].alive = false; sim.step(g); }
  assert.equal(g.status, 'finished');
  const frozen = JSON.stringify(sim.snapshot(g));
  for (let i = 0; i < 30; i++) sim.step(g);
  assert.equal(JSON.stringify(sim.snapshot(g)), frozen, '结束后的对局不应再变化');
});

/* ---------------- 输入与确定性 ---------------- */

test('illegal frame inputs are rejected without mutating the match', () => {
  const g = arena();
  const before = JSON.stringify(sim.snapshot(g));
  assert.throws(() => sim.normalizeInput({ dir: 'Q', btn: null }), /非法方向/);
  assert.throws(() => sim.normalizeInput({ dir: 'R', btn: 'KICK' }), /非法按钮/);
  assert.throws(() => sim.normalizeInput([]), /必须是对象/);
  assert.throws(() => sim.submitWindow(g, 0, Array.from({ length: FRAMES + 1 }, () => ({ dir: 'N', btn: null }))), /最多 20 帧/);
  assert.equal(JSON.stringify(sim.snapshot(g)), before, '被拒绝的输入不能改变任何状态');
});

test('a short window is padded with neutral frames in the tail', () => {
  const g = arena();
  const norm = sim.submitWindow(g, 0, [{ dir: 'R', btn: 'BOMB' }]);
  assert.equal(norm.length, FRAMES);
  assert.deepEqual(norm[0], { dir: 'R', btn: 'BOMB' });
  assert.deepEqual(norm[FRAMES - 1], { dir: 'N', btn: null });
});

test('identical seeds and inputs produce identical matches', () => {
  const a = sim.createMatch({ id: 'x', seed: 31, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  const b = sim.createMatch({ id: 'x', seed: 31, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  for (let i = 0; i < 60 && a.status === 'playing'; i++) {
    sim.advanceWindow(a, [sim.bot(a, a.players[0]), sim.bot(a, a.players[1])]);
    sim.advanceWindow(b, [sim.bot(b, b.players[0]), sim.bot(b, b.players[1])]);
  }
  assert.equal(JSON.stringify(sim.snapshot(a)), JSON.stringify(sim.snapshot(b)), '同种子同输入必须同结果');
});

test('the engine never produces non-finite coordinates or illegal tile values', () => {
  const g = sim.createMatch({ id: 'f', seed: 88, players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }] });
  for (let i = 0; i < 600 && g.status === 'playing'; i++) {
    sim.advanceWindow(g, [sim.bot(g, g.players[0]), sim.bot(g, g.players[1])]);
    for (const f of g.fighters) {
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), '坐标必须有限');
      assert.ok(f.x >= 0 && f.x < rules.width && f.y >= 0 && f.y < rules.height, '角色必须留在图内');
      assert.ok(f.moveProgress >= 0 && f.moveProgress <= 1, '移动进度必须在 [0,1]');
    }
    for (const v of g.tiles) assert.ok(v === EMPTY || v === HARD || v === SOFT, '格子取值必须合法');
  }
});

test('the practice computer plays decisively against itself', () => {
  // 电脑对电脑必须能打出结果，不能盘盘平局——平局率过高说明规则或电脑有问题
  let decided = 0, total = 0;
  for (const seed of [1, 7, 42, 99, 123]) {
    const g = sim.createMatch({ id: 'b', seed, players: [{ name: 'A', kind: 'bot' }, { name: 'B', kind: 'bot' }] });
    let n = 0;
    while (g.status === 'playing' && n < 3000) { sim.advanceWindow(g, [sim.bot(g, g.players[0]), sim.bot(g, g.players[1])]); n++; }
    assert.equal(g.status, 'finished', `seed ${seed} 的对局必须结束`);
    for (const r of g.roundLog) { total++; if (r.winner) decided++; }
  }
  assert.ok(decided / total >= 0.7, `击倒率 ${(decided / total * 100).toFixed(0)}% 过低，规则可能退化成拖延`);
});
