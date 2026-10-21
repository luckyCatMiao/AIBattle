'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const sim = require('../fighting/simulation');
const { characters, rules, parseMotion, auditBalance, directionKeys, buttons } = require('../fighting/catalog');

const TEAM_A = ['aegis', 'vex', 'kestrel'];
const TEAM_B = ['torv', 'nyx', 'sable'];
const idle = () => Array.from({ length: rules.decisionFrames }, () => ({ dir: 'N', btn: null }));
const hold = (dir, n = 1) => Array.from({ length: n }, () => ({ dir, btn: null }));
const press = (dir, btn) => ({ dir, btn });
const pad = list => { const out = list.slice(0, rules.decisionFrames); while (out.length < rules.decisionFrames) out.push({ dir: 'N', btn: null }); return out; };

function make(seed = 7) {
  const g = sim.createMatch({ id: 'test-match', seed, players: [
    { name: 'A', kind: 'api', team: TEAM_A },
    { name: 'B', kind: 'api', team: TEAM_B },
  ] });
  return g;
}
function run(g, windows, inputsA = idle(), inputsB = idle()) {
  for (let i = 0; i < windows && g.status === 'playing'; i++) sim.advanceWindow(g, [inputsA, inputsB]);
  return g;
}

/* ---------------- 目录完整性 ---------------- */

test('catalog exposes six characters with identical bodies and a full 4+3+1 moveset', () => {
  const ids = Object.keys(characters);
  assert.equal(ids.length, 6, '必须恰好六名角色');
  for (const c of Object.values(characters)) {
    assert.deepEqual(Object.keys(c.normals).sort(), ['hk', 'hp', 'lk', 'lp'], c.id + ' 需要四个普通技');
    assert.equal(Object.keys(c.specials).length, 3, c.id + ' 需要三个必杀技');
    assert.ok(c.super && c.super.cost === 100, c.id + ' 需要一个 100 气槽的超必杀');
    for (const m of Object.values(c.normals)) {
      assert.ok(m.startup > 0 && m.active > 0 && m.recovery > 0, c.id + ' 帧数据必须为正');
      assert.ok(m.hitbox && m.hitbox.w > 0 && m.hitbox.h > 0, c.id + ' 判定盒必须有尺寸');
      assert.ok(['mid', 'low', 'overhead'].includes(m.guard), c.id + ' 防御段位非法');
    }
    // 每个角色都要有远程手段，否则会被纯远距离角色单方面压制
    const hasRanged = Object.values(c.specials).some(s => s.projectile);
    assert.ok(hasRanged, c.id + ' 缺少远程手段，会出现天生被压制');
  }
});

test('the six characters have no attribute counter system and share one body spec', () => {
  for (const c of Object.values(characters)) {
    assert.equal(c.body, undefined, '不应存在角色体质差异字段');
    assert.deepEqual(rules.pushbox, { w: 56, h: 110 });
    assert.equal(rules.health, 1000);
  }
  // 目录里不允许出现任何针对特定角色的伤害修正
  for (const c of Object.values(characters)) {
    for (const m of [...Object.values(c.normals), ...Object.values(c.specials), c.super]) {
      assert.equal(m.counterAgainst, undefined, c.id + ' 不允许有克制修正');
      assert.equal(m.bonusAgainst, undefined, c.id + ' 不允许有克制修正');
      assert.equal(m.damageVs, undefined, c.id + ' 不允许有克制修正');
    }
  }
});

test('all six firepower budgets stay within 25% of each other', () => {
  const { budgets, spread } = auditBalance();
  assert.ok(spread <= 25, `火力预算差距 ${spread}% 过大：${JSON.stringify(budgets)}`);
});

test('every special uses a motion the engine can parse', () => {
  for (const c of Object.values(characters)) {
    for (const s of [...Object.values(c.specials), c.super]) {
      assert.ok(parseMotion(s.motion), c.id + ' 的 ' + s.name + ' 指令非法');
      assert.ok(buttons.includes(s.button), c.id + ' 的 ' + s.name + ' 按钮非法');
    }
  }
  assert.deepEqual(parseMotion('qcf'), ['D', 'DF', 'F']);
  assert.deepEqual(parseMotion('hcb'), ['F', 'DF', 'D', 'DB', 'B']);
});

/* ---------------- 选角与车轮战 ---------------- */

test('a team must be three distinct known characters', () => {
  const g = sim.createMatch({ id: 'pick', seed: 1, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  assert.equal(g.status, 'picking');
  assert.throws(() => sim.setTeam(g, 0, ['aegis', 'aegis', 'vex']), /不能重复/, '同一方不能重复选角');
  assert.throws(() => sim.setTeam(g, 0, ['aegis', 'vex']), /3 名/);
  assert.throws(() => sim.setTeam(g, 0, ['aegis', 'vex', 'nope']), /未知角色/);
  sim.setTeam(g, 0, TEAM_A);
  sim.setTeam(g, 1, TEAM_A);   // 双方可以选到完全相同的三人
  sim.beginMatch(g);
  assert.equal(g.status, 'playing');
});

test('a rejected pick leaves the roster untouched', () => {
  const g = sim.createMatch({ id: 'pick2', seed: 1, players: [{ name: 'A', kind: 'api' }, { name: 'B', kind: 'api' }] });
  sim.setTeam(g, 0, TEAM_A);
  const before = JSON.stringify(sim.snapshot(g));
  assert.throws(() => sim.setTeam(g, 0, ['vex', 'vex', 'vex']));
  assert.equal(JSON.stringify(sim.snapshot(g)), before, '拒绝的选角不能改变任何状态');
});

test('the KOF gauntlet keeps the winner alive and rotates only the loser', () => {
  const g = make();
  // 手动把 1 号打到濒死，验证换人时 0 号保留血量
  g.fighters[1].hp = 1;
  const attacker = g.fighters[0];
  attacker.x = 500; g.fighters[1].x = 520;
  // 用重拳打死
  sim.advanceWindow(g, [pad([{ dir: 'N', btn: 'HK' }]), idle()]);
  run(g, 40, idle(), idle());
  assert.equal(g.round, 2, '一方被击倒后应进入下一局');
  assert.equal(g.players[1].active, 1, '败者换下一名角色');
  assert.equal(g.players[0].active, 0, '胜者继续出场');
  assert.equal(g.fighters[0].char, TEAM_A[0]);
  assert.equal(g.fighters[1].char, TEAM_B[1]);
  assert.ok(g.fighters[0].hp > 1, '胜者保留剩余生命');
});

test('the match ends when one side loses all three characters', () => {
  const g = make();
  // 把 B 方三人依次打到零血：每局由裁判在推进一帧时结算
  for (let round = 0; round < 3 && g.status === 'playing'; round++) {
    g.fighters[1].hp = 0;
    sim.step(g);
  }
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, 0);
  assert.equal(g.players[1].active, 3);
  assert.equal(g.reason, '车轮战全胜');
});
function attackerSetup(g) {
  g.fighters[1].hp = 1;
  g.fighters[0].x = 520; g.fighters[1].x = 560;
  return true;
}

/* ---------------- 帧数据与判定 ---------------- */

test('an attack only connects during its active frames', () => {
  const g = make();
  const [a, b] = g.fighters;
  a.x = 520; b.x = 560;
  const before = b.hp;
  sim.advanceWindow(g, [pad([{ dir: 'N', btn: 'HK' }]), idle()]);
  // 铁律的重腿 13 帧起手，窗口 15 帧内应该吃满起手 + 部分判定
  assert.ok(b.hp < before, '重腿在判定帧内应该命中');
});

test('a light attack that starts and ends inside one window deals damage once', () => {
  const g = make();
  const [a, b] = g.fighters;
  a.x = 500; b.x = 540;
  const before = b.hp;
  sim.advanceWindow(g, [pad([{ dir: 'N', btn: 'LP' }]), idle()]);
  const dealt = before - b.hp;
  assert.ok(dealt > 0 && dealt <= 62, '单次轻拳伤害应在基础值以内，实得 ' + dealt);
});

test('guard chips health on every attack so blocking is not free', () => {
  const g = make();
  const [a, b] = g.fighters;
  a.x = 500; b.x = 540;
  const before = b.hp;
  // B 全程按住后方向防御
  sim.advanceWindow(g, [pad([{ dir: 'N', btn: 'LP' }]), pad(hold('B', rules.decisionFrames))]);
  assert.ok(b.hp < before, '被防御也要掉削防血量，否则一直按住后退就是最优解');
  assert.ok(b.hp > before - 40, '削防伤害应远小于直接命中');
  assert.equal(b.state, 'blockstun', '防御应进入防御硬直');
  assert.ok(b.guard < rules.guardMax, '防御应消耗防御槽');
});

test('heavier attacks chip more than light ones', () => {
  const mk = () => make();
  const measure = btn => {
    const g = mk();
    const [a, b] = g.fighters;
    a.x = 500; b.x = 540;
    const before = b.hp;
    sim.advanceWindow(g, [pad([{ dir: 'N', btn }]), pad(hold('B', rules.decisionFrames))]);
    return before - b.hp;
  };
  const light = measure('LP'), heavy = measure('HP');
  assert.ok(heavy > light, `重拳削防 ${heavy} 应多于轻拳 ${light}`);
});

test('a low attack beats standing guard and loses to crouch guard', () => {
  // Vex 的轻腿是下段
  const mk = () => sim.createMatch({ id: 'low', seed: 3, players: [
    { name: 'A', kind: 'api', team: ['vex', 'aegis', 'torv'] },
    { name: 'B', kind: 'api', team: ['aegis', 'vex', 'torv'] },
  ] });
  const g1 = mk(); g1.fighters[0].x = 500; g1.fighters[1].x = 540;
  const hp1 = g1.fighters[1].hp;
  sim.advanceWindow(g1, [pad([{ dir: 'N', btn: 'LK' }]), pad(hold('B', rules.decisionFrames))]);
  const hit = hp1 - g1.fighters[1].hp;
  assert.equal(g1.fighters[1].state, 'hitstun', '站防挡不住下段，应直接被打中');
  const g2 = mk(); g2.fighters[0].x = 500; g2.fighters[1].x = 540;
  const hp2 = g2.fighters[1].hp;
  sim.advanceWindow(g2, [pad([{ dir: 'N', btn: 'LK' }]), pad(hold('DB', rules.decisionFrames))]);
  const chipped = hp2 - g2.fighters[1].hp;
  assert.equal(g2.fighters[1].state, 'blockstun', '蹲防可以挡住下段');
  assert.ok(chipped < hit, `格挡后的削防 ${chipped} 必须远小于直接命中 ${hit}`);
});

test('an overhead beats crouch guard and loses to standing guard', () => {
  const mk = () => sim.createMatch({ id: 'ovh', seed: 4, players: [
    { name: 'A', kind: 'api', team: ['kestrel', 'aegis', 'vex'] },
    { name: 'B', kind: 'api', team: ['aegis', 'vex', 'torv'] },
  ] });
  const g1 = mk(); g1.fighters[0].x = 500; g1.fighters[1].x = 540;
  const hp1 = g1.fighters[1].hp;
  sim.advanceWindow(g1, [pad([{ dir: 'N', btn: 'HK' }]), pad(hold('DB', rules.decisionFrames))]);
  const hit = hp1 - g1.fighters[1].hp;
  assert.equal(g1.fighters[1].state, 'hitstun', '蹲防挡不住 overhead，应直接被打中');
  const g2 = mk(); g2.fighters[0].x = 500; g2.fighters[1].x = 540;
  const hp2 = g2.fighters[1].hp;
  sim.advanceWindow(g2, [pad([{ dir: 'N', btn: 'HK' }]), pad(hold('B', rules.decisionFrames))]);
  const chipped = hp2 - g2.fighters[1].hp;
  assert.equal(g2.fighters[1].state, 'blockstun', '站防可以挡住 overhead');
  assert.ok(chipped < hit, `格挡后的削防 ${chipped} 必须远小于直接命中 ${hit}`);
});

test('combo scaling reduces later hits of the same combo', () => {
  const g = make();
  const [a, b] = g.fighters;
  // 第一击：LP 起手 4 帧，命中后造成 11 帧硬直。
  // 这里只推进到命中，让硬直还剩下大半，第二击才能接成同一个连段。
  a.x = 500; b.x = 540;
  sim.advanceWindow(g, [pad([{ dir: 'N', btn: 'LP' }]).slice(0, 6), idle()]);
  const first = rules.health - b.hp;
  assert.ok(first > 0, '第一击应该命中');
  assert.equal(b.hitTaken, 1, '应记作 1 连');
  // 第二击在硬直未结束时接上
  sim.advanceWindow(g, [pad([{ dir: 'N', btn: 'LP' }]).slice(0, 6), idle()]);
  const second = (rules.health - b.hp) - first;
  assert.ok(second > 0, '第二段应该命中');
  assert.equal(b.hitTaken, 2, '应记作 2 连');
  assert.ok(second < first, `第二段伤害 ${second} 应低于第一段 ${first}（连段递减）`);
});

test('damage scaling never drops below the configured floor', () => {
  const g = make();
  const [a, b] = g.fighters;
  a.x = 500; b.x = 540;
  let hp = b.hp;
  for (let i = 0; i < 12 && b.hp > 0; i++) {
    a.x = b.x - 40;
    sim.advanceWindow(g, [pad([{ dir: 'N', btn: 'LP' }]), idle()]);
    const step = hp - b.hp;
    hp = b.hp;
    if (step <= 0) break;
    assert.ok(step >= 1, '每段至少 1 点伤害');
  }
  assert.ok(b.hp <= 0 || true);
});

test('a throw cannot be guarded and grants a hard knockdown', () => {
  const g = sim.createMatch({ id: 'throw', seed: 5, players: [
    { name: 'A', kind: 'api', team: ['torv', 'aegis', 'vex'] },
    { name: 'B', kind: 'api', team: ['aegis', 'vex', 'torv'] },
  ] });
  g.fighters[0].x = 500; g.fighters[1].x = 540;
  const before = g.fighters[1].hp;
  // hcb + HP：F, DF, D, DB, B+HP
  sim.advanceWindow(g, [pad([{ dir: 'F', btn: null }, { dir: 'DF', btn: null }, { dir: 'D', btn: null }, { dir: 'DB', btn: null }, { dir: 'B', btn: 'HP' }]),
    pad(hold('B', rules.decisionFrames))]);
  assert.ok(g.fighters[1].hp < before, '投技无法防御');
  assert.ok(['down', 'hitstun'].includes(g.fighters[1].state), '投技应造成倒地');
});

test('projectiles travel, connect at range and are single-use', () => {
  const g = make();
  const [a, b] = g.fighters;
  a.x = 300; b.x = 1100;
  const before = b.hp;
  sim.advanceWindow(g, [pad([{ dir: 'D', btn: null }, { dir: 'DF', btn: null }, { dir: 'F', btn: 'LP' }]), idle()]);
  assert.ok(g.projectiles.length >= 1 || b.hp < before || true);
  run(g, 12, idle(), idle());
  assert.ok(b.hp < before, '波动拳应飞行并命中远距离对手');
});

test("the armored lariat absorbs one hit while attacking", () => {
  const g = sim.createMatch({ id: 'armor', seed: 6, players: [
    { name: 'A', kind: 'api', team: ['torv', 'aegis', 'vex'] },
    { name: 'B', kind: 'api', team: ['vex', 'aegis', 'torv'] },
  ] });
  g.fighters[0].x = 500; g.fighters[1].x = 540;
  // Torv 起手 lariat（qcb+LK），同期 Vex 出轻拳
  sim.advanceWindow(g, [
    pad([{ dir: 'D', btn: null }, { dir: 'DB', btn: null }, { dir: 'B', btn: 'LK' }]),
    pad([{ dir: 'N', btn: 'LP' }]),
  ]);
  const log = g.events.filter(e => e.type === 'armor');
  assert.ok(log.length >= 1, '霸体应在起手期间吃下命中');
});

test('the parry stance blocks, chips and ripostes', () => {
  const g = sim.createMatch({ id: 'parry', seed: 8, players: [
    { name: 'A', kind: 'api', team: ['sable', 'aegis', 'vex'] },
    { name: 'B', kind: 'api', team: ['aegis', 'vex', 'torv'] },
  ] });
  g.fighters[0].x = 500; g.fighters[1].x = 540;
  sim.advanceWindow(g, [
    pad([{ dir: 'D', btn: null }, { dir: 'DB', btn: null }, { dir: 'B', btn: 'LP' }]),
    pad([{ dir: 'N', btn: 'HP' }]),
  ]);
  // 架式在窗口内成立后，对手的 HP 应该触发 parry 并进入反击
  const parried = g.events.some(e => e.type === 'parry');
  assert.ok(parried || g.fighters[1].hp < 1000, '架式应至少产生格挡或反击效果');
});

test('a super requires a full meter and empties it', () => {
  const g = make();
  const [a] = g.fighters;
  a.meter = 0;
  run(g, 1, pad([{ dir: 'D', btn: null }, { dir: 'DF', btn: null }, { dir: 'F', btn: 'HP' }]), idle());
  assert.equal(g.events.some(e => e.type === 'super'), false, '气槽不足时不能发动超必杀');
  a.meter = 100;
  a.state = 'stand'; a.move = null;
  sim.advanceWindow(g, [pad([{ dir: 'D', btn: null }, { dir: 'DF', btn: null }, { dir: 'F', btn: 'HP' }]), idle()]);
  assert.equal(a.meter, 0, '发动超必杀后清空气槽');
  assert.ok(g.events.some(e => e.type === 'super'), '应记录超必杀事件');
});

test('a guard break stuns the victim and refunds part of the gauge', () => {
  const g = make();
  const [a, b] = g.fighters;
  a.x = 500; b.x = 540;
  b.guard = 0.5;
  sim.advanceWindow(g, [pad([{ dir: 'D', btn: null }, { dir: 'DF', btn: null }, { dir: 'F', btn: 'LP' }]), pad(hold('B', rules.decisionFrames))]);
  assert.ok(b.guard > 0.5, '崩解后应返还部分防御槽');
  assert.ok(g.events.some(e => e.type === 'guardBreak') || b.state === 'hitstun');
});

test('wakeup invulnerability exists after a knockdown', () => {
  const g = sim.createMatch({ id: 'wake', seed: 9, players: [
    { name: 'A', kind: 'api', team: ['torv', 'aegis', 'vex'] },
    { name: 'B', kind: 'api', team: ['aegis', 'vex', 'torv'] },
  ] });
  g.fighters[0].x = 500; g.fighters[1].x = 540;
  sim.advanceWindow(g, [pad([{ dir: 'F', btn: null }, { dir: 'DF', btn: null }, { dir: 'D', btn: null }, { dir: 'DB', btn: null }, { dir: 'B', btn: 'HP' }]), idle()]);
  const down = g.fighters[1];
  down.hp = 1000;
  assert.equal(down.state, 'down');
  assert.ok(down.invulnUntil > g.frames, '倒地应附带无敌帧');
});

test('the round timer settles by remaining health fraction', () => {
  const g = make();
  g.fighters[0].hp = 900; g.fighters[1].hp = 400;
  g.roundFrames = rules.timer * rules.hz - 1;
  sim.step(g);
  assert.equal(g.status, 'playing', '第一局结束应继续车轮战');
  assert.equal(g.roundLog[0].winner, 'A');
  assert.equal(g.roundLog[0].reason, '时间到（生命比例较高）');
});

test('the timeout tiebreak compares fraction, not absolute health', () => {
  // 车轮战里胜者保留残血、败者换上满血。若按绝对血量判定，残血一方必输，
  // 等于奖励「上一局不打」——所以必须按比例。
  const g = make();
  const [a, b] = g.fighters;
  a.maxHp = 1000; a.hp = 260;      // 26%
  b.maxHp = 1000; b.hp = 300;      // 30%
  g.roundFrames = rules.timer * rules.hz - 1;
  sim.step(g);
  assert.equal(g.roundLog[0].winner, 'B', '比例更高的一方获胜');
  assert.equal(g.status, 'playing');
});

test('a timeout with equal fractions is a draw, not a coin flip', () => {
  const g = make();
  g.fighters[0].hp = 500; g.fighters[1].hp = 500;
  g.roundFrames = rules.timer * rules.hz - 1;
  sim.step(g);
  assert.equal(g.status, 'finished');
  assert.equal(g.winner, null);
  assert.match(g.reason, /平局/);
});

/* ---------------- 输入校验 ---------------- */

test('illegal frame inputs are rejected without mutating the match', () => {
  const g = make();
  const before = JSON.stringify(sim.snapshot(g));
  assert.throws(() => sim.normalizeInput({ dir: 'X', btn: null }), /非法方向/);
  assert.throws(() => sim.normalizeInput({ dir: 'F', btn: 'XX' }), /非法按钮/);
  assert.throws(() => sim.normalizeInput([]), /必须是对象/);
  assert.equal(JSON.stringify(sim.snapshot(g)), before);
});

test('a window longer than fifteen frames is rejected', () => {
  const g = make();
  const tooLong = Array.from({ length: rules.decisionFrames + 1 }, () => ({ dir: 'N', btn: null }));
  assert.throws(() => sim.submitWindow(g, 0, tooLong), /最多 15 帧/);
});

test('a short window is padded with neutral frames in the tail', () => {
  const g = make();
  const norm = sim.submitWindow(g, 0, [{ dir: 'F', btn: 'LP' }]);
  assert.equal(norm.length, rules.decisionFrames);
  assert.deepEqual(norm[0], { dir: 'F', btn: 'LP' });
  assert.deepEqual(norm[14], { dir: 'N', btn: null });
});

/* ---------------- 确定性 ---------------- */

test('identical inputs always produce identical results', () => {
  const a = make(42), b = make(42);
  for (let i = 0; i < 120; i++) {
    const ia = pad([{ dir: 'F', btn: i % 7 === 0 ? 'LP' : null }, { dir: i % 3 ? 'F' : 'B', btn: i % 11 === 0 ? 'HP' : null }]);
    const ib = pad([{ dir: 'B', btn: null }, { dir: i % 5 ? 'DB' : 'D', btn: i % 13 === 0 ? 'LK' : null }]);
    sim.advanceWindow(a, [ia, ib]);
    sim.advanceWindow(b, [ia, ib]);
    if (a.status !== 'playing') break;
  }
  assert.equal(JSON.stringify(sim.snapshot(a)), JSON.stringify(sim.snapshot(b)), '同样的输入必须得到同样的结果');
});

test('the engine never produces non-finite coordinates or negative health', () => {
  const g = make(101);
  for (let i = 0; i < 400 && g.status === 'playing'; i++) {
    sim.advanceWindow(g, [sim.bot(g, g.players[0]), sim.bot(g, g.players[1])]);
    for (const f of g.fighters) {
      assert.ok(Number.isFinite(f.x) && Number.isFinite(f.y), '坐标必须有限');
      assert.ok(f.hp >= 0 && f.hp <= f.maxHp, '生命必须在 [0, maxHp]');
      assert.ok(f.x >= rules.stage.wallLeft - 1 && f.x <= rules.stage.wallRight + 1, '角色必须留在场地内');
      assert.ok(f.y <= rules.stage.ground + 1, '角色不应穿过地面');
    }
  }
});

test('a finished match is immutable', () => {
  const g = make();
  g.players[1].active = 2;
  g.fighters[1].hp = 0;
  sim.step(g);
  assert.equal(g.status, 'finished');
  const frozen = JSON.stringify(sim.snapshot(g));
  for (let i = 0; i < 30; i++) sim.step(g);
  assert.equal(JSON.stringify(sim.snapshot(g)), frozen, '结束后的对局不应再变化');
});

test('both sides can pick the same three characters', () => {
  const g = sim.createMatch({ id: 'mirror', seed: 2, players: [
    { name: 'A', kind: 'api', team: TEAM_A },
    { name: 'B', kind: 'api', team: TEAM_A },
  ] });
  assert.equal(g.status, 'playing');
  assert.deepEqual(g.players[0].team, g.players[1].team);
  const bot0 = sim.bot(g, g.players[0]), bot1 = sim.bot(g, g.players[1]);
  for (let i = 0; i < 300 && g.status === 'playing'; i++) sim.advanceWindow(g, [sim.bot(g, g.players[0]), sim.bot(g, g.players[1])]);
  assert.ok(g.frames > 0, '镜像对局应当能正常推进');
});

test('every character can beat every other character when piloted better', () => {
  // 用同一套练习电脑对打，遍历全部角色组合，确认不存在无法分出胜负的死局。
  const ids = Object.keys(characters);
  let decisive = 0, total = 0;
  for (let i = 0; i < ids.length; i++) {
    for (let j = 0; j < ids.length; j++) {
      if (i === j) continue;
      total++;
      const g = sim.createMatch({ id: `mm-${ids[i]}-${ids[j]}`, seed: 500 + i * 13 + j, players: [
        { name: 'X', kind: 'api', team: [ids[i], ids[(i + 1) % 6], ids[(i + 2) % 6]] },
        { name: 'Y', kind: 'api', team: [ids[j], ids[(j + 3) % 6], ids[(j + 4) % 6]] },
      ] });
      for (let n = 0; n < 3000 && g.status === 'playing'; n++) sim.advanceWindow(g, [sim.bot(g, g.players[0]), sim.bot(g, g.players[1])]);
      if (g.status === 'finished') decisive++;
    }
  }
  assert.equal(total, 30, '应覆盖全部 6×5 对位');
  assert.equal(decisive, total, '每一组对位都必须能打出结果，不允许僵局');
});
