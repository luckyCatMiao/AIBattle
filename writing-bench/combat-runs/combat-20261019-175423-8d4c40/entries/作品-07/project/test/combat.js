// ============================================================================
// test/combat.js — 战斗系统专项无头测试（挑空、空连、坠斩、炮击、受击、断肢后果、
// 顿帧、无敌帧、死亡清场）。复用与 smoke 相同的浏览器桩。
// ============================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const listeners = {};
function on(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); }
function dispatch(type, ev) { (listeners[type] || []).slice().forEach((fn) => fn(ev)); }

function makeCtx() {
  const grad = { addColorStop() {} };
  const target = {};
  return new Proxy(target, {
    get(t, prop) {
      if (prop === 'canvas') return canvasStub;
      if (prop === 'measureText') return () => ({ width: 10 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => grad;
      if (!(prop in t)) t[prop] = () => undefined;
      return t[prop];
    },
    set(t, prop, val) { t[prop] = val; return true; },
  });
}
function makeEl(id) {
  return {
    id,
    classList: { _s: new Set(), add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); }, contains(c) { return this._s.has(c); } },
    addEventListener() {}, style: {}, textContent: '',
  };
}
const canvasStub = { clientWidth: 1280, clientHeight: 720, width: 0, height: 0, getContext() { return makeCtx(); }, addEventListener() {} };
const elements = {};
['game', 'muteBtn', 'menuPanel', 'overPanel', 'overlay', 'startBtn', 'againBtn', 'statHits', 'statLimbs'].forEach((id) => { elements[id] = id === 'game' ? canvasStub : makeEl(id); });
const documentStub = { readyState: 'complete', getElementById(id) { return elements[id] || makeEl(id); }, addEventListener() {} };

let rafCb = null;
global.window = global;
global.document = documentStub;
global.addEventListener = on;
global.removeEventListener = () => {};
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => {};
global.devicePixelRatio = 1;
global.innerWidth = 1280;
global.innerHeight = 720;
global.__TEST__ = true;

vm.runInThisContext(script, { filename: 'game.js' });

const game = global.__game;
let failures = 0;
function check(name, cond) {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.log('  FAIL ' + name); }
}
let now = performance.now();
function frame(ms) { now += ms; if (rafCb) rafCb(now); }
function key(code, down) { dispatch(down ? 'keydown' : 'keyup', { code, preventDefault() {}, repeat: false }); }
function press(code) { key(code, true); key(code, false); }

function clearEnemies() { game.enemies = []; game.projectiles = []; }
function addEnemy(type, x, state = 'idle') {
  game.spawnEnemyOfType(type, x);
  const e = game.enemies[game.enemies.length - 1];
  e.state = state;
  e.stateTimer = 0;
  return e;
}

// 开局
press('Enter');
frame(16);
clearEnemies();
game.player.x = 0; game.player.vx = 0; game.player.vy = 0; game.player.y = 0; game.player.grounded = true; game.player.state = 'idle';

console.log('--- 挑空斩 (I) ---');
{
  game.player.facing = 1;
  const e = addEnemy('blade', 40);
  e.hp = 99999;
  press('KeyI');
  for (let i = 0; i < 10; i++) frame(16);
  check('敌人被挑空 (vy<0)', e.vy < 0);
}

console.log('--- 空中轻斩追击 ---');
{
  clearEnemies();
  const p = game.player;
  p.state = 'jump'; p.grounded = false; p.y = -60; p.vy = 0; p.airAttacks = 0; p.airStep = 0;
  const e = addEnemy('blade', 30);
  e.state = 'hit'; e.y = -50; e.vy = -60; e.grounded = false; e.hp = 99999;
  const hp0 = e.hp;
  press('KeyJ');
  for (let i = 0; i < 8; i++) frame(16);
  check('空斩命中浮空敌人', e.hp < hp0);
}

console.log('--- 坠斩 (空中 K) ---');
{
  clearEnemies();
  const p = game.player;
  p.state = 'jump'; p.grounded = false; p.y = -220; p.vy = 0; p.facing = 1;
  const e = addEnemy('blade', 0);
  e.hp = 99999;
  const hp0 = e.hp;
  key('KeyK', true); frame(16); key('KeyK', false);
  for (let i = 0; i < 20; i++) frame(16);
  check('坠斩命中敌人', e.hp < hp0);
  check('玩家坠斩后弹起', p.state === 'jump' || p.vy < 0);
}

console.log('--- 炮傀儡发射炮弹 ---');
{
  clearEnemies();
  const p = game.player;
  p.state = 'idle'; p.grounded = true; p.y = 0; p.x = 0; p.invuln = 0;
  const e = addEnemy('cannon', 300);
  for (let i = 0; i < 60; i++) frame(16);
  check('发射了炮弹', game.projectiles.length > 0);
}

console.log('--- 剑傀儡近战命中玩家 ---');
{
  clearEnemies();
  const p = game.player;
  p.state = 'idle'; p.grounded = true; p.y = 0; p.x = 0; p.invuln = 0; p.hp = 100;
  const e = addEnemy('blade', 40);
  const hp0 = p.hp;
  for (let i = 0; i < 70; i++) frame(16);
  check('玩家受到伤害', p.hp < hp0);
}

console.log('--- 断腿减速 / 断头眩晕 ---');
{
  clearEnemies();
  const e = addEnemy('blade', 200);
  const full = e.speedMul();
  e.breakLimb('legL');
  const oneLeg = e.speedMul();
  e.breakLimb('legR');
  const noLeg = e.speedMul();
  check('断一腿减速', oneLeg < full);
  check('断双腿几乎不能走', noLeg < 0.2);

  const e2 = addEnemy('blade', 300);
  e2.state = 'idle';
  e2.breakLimb('head');
  check('断头触发眩晕', e2.state === 'stun');
}

console.log('--- 命中顿帧冻结世界 ---');
{
  clearEnemies();
  const p = game.player;
  p.state = 'idle'; p.grounded = true; p.y = 0; p.x = 0; p.facing = 1; p.vx = 0;
  const e = addEnemy('blade', 50);
  e.hp = 99999;
  const hit0 = game.hitCount;
  // 用 8ms 小步进找到命中帧
  let hitFrame = -1;
  for (let i = 0; i < 30; i++) {
    press('KeyJ');
    frame(8);
    if (game.hitCount > hit0) { hitFrame = i; break; }
  }
  check('轻斩命中', hitFrame >= 0);
  const xAtHit = p.x;
  let frozen = 0;
  for (let i = 0; i < 3; i++) { frame(8); if (p.x === xAtHit) frozen++; }
  check('顿帧期间世界冻结', frozen >= 1 && game.fx.hitStop > 0);
}

console.log('--- 冲刺无敌帧 ---');
{
  clearEnemies();
  game.fx.reset();
  const p = game.player;
  p.state = 'idle'; p.grounded = true; p.y = 0; p.x = 0; p.dashCd = 0;
  press('KeyL');
  frame(16);
  check('冲刺后有无敌帧', p.invuln > 0 && p.state === 'dash');
}

console.log('--- 击杀清场 ---');
{
  clearEnemies();
  game.fx.reset();
  const e = addEnemy('blade', 40);
  e.hp = 1;
  const before = game.enemies.length;
  e.takeHit(50, 200, 0, 1);
  game.fx.hitStop = 0; // 让顿帧不影响本断言的清理帧
  frame(16);
  check('敌人死亡被移除', game.enemies.length === before - 1);
}

console.log('');
if (failures === 0) console.log('COMBAT TEST PASSED');
else { console.log('COMBAT TEST FAILED: ' + failures); process.exit(1); }
