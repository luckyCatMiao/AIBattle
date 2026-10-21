// ============================================================================
// test/smoke.js — 无头冒烟测试：用 DOM/Canvas 桩驱动游戏逻辑，验证无运行时错误，
// 核心系统（开始、刷怪、命中、断肢、状态）可用。
// 用法：node test/smoke.js
// ============================================================================

const fs = require('fs');
const path = require('path');
const vm = require('vm');

// ---------- 1. 提取打包后的脚本 ----------
const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const m = html.match(/<script>([\s\S]*?)<\/script>/);
if (!m) { console.error('FAIL: no script in game.html'); process.exit(1); }
const script = m[1];

// ---------- 2. 构建浏览器桩 ----------
const listeners = {};
function on(type, fn) { (listeners[type] || (listeners[type] = [])).push(fn); }
function off(type, fn) { const a = listeners[type] || []; const i = a.indexOf(fn); if (i >= 0) a.splice(i, 1); }
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
  const el = {
    id,
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); },
      remove(c) { this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    addEventListener() {},
    style: {},
    textContent: '',
  };
  return el;
}

const canvasStub = {
  clientWidth: 1280,
  clientHeight: 720,
  width: 0,
  height: 0,
  getContext() { return makeCtx(); },
  addEventListener() {},
};

const elements = {};
['game', 'muteBtn', 'menuPanel', 'overPanel', 'overlay', 'startBtn', 'againBtn', 'statHits', 'statLimbs']
  .forEach((id) => { elements[id] = id === 'game' ? canvasStub : makeEl(id); });

const documentStub = {
  readyState: 'complete',
  getElementById(id) { return elements[id] || makeEl(id); },
  addEventListener() {},
};

let rafCb = null;

// 挂到全局（脚本里通过 window 引用这些）
global.window = global;
global.document = documentStub;
global.addEventListener = on;
global.removeEventListener = off;
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => {};
global.devicePixelRatio = 1;
global.innerWidth = 1280;
global.innerHeight = 720;
global.__TEST__ = true; // 暴露 __game 供测试

// ---------- 3. 执行打包脚本 ----------
vm.runInThisContext(script, { filename: 'game.js' });

const game = global.__game;
const state = global.combatBenchState;

let failures = 0;
function check(name, cond) {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.log('  FAIL ' + name); }
}

// ---------- 4. 驱动帧 ----------
let now = performance.now();
function frame(ms) {
  now += ms;
  const cb = rafCb;
  if (cb) cb(now);
}
function key(code, down) {
  dispatch(down ? 'keydown' : 'keyup', { code, preventDefault() {}, repeat: false });
}
function press(code) { key(code, true); key(code, false); }

console.log('--- 初始状态 ---');
check('ready = true', state().ready === true);
check('playing = false', state().playing === false);

console.log('--- 开始（Enter）---');
press('Enter');
frame(16);
check('playing = true', state().playing === true);
check('playerAlive = true', state().playerAlive === true);

// 跑一会儿，确认刷怪
for (let i = 0; i < 120; i++) frame(16);
check('enemyCount > 0', state().enemyCount > 0);

// 保存敌人初始血量
let enemy = game.enemies[0];
check('enemy exists', !!enemy);
if (enemy) {
  const hp0 = enemy.hp;
  // 把敌人挪到玩家正前方并取消出场前摇，便于测试命中
  enemy.x = game.player.x + 55;
  enemy.state = 'idle';
  enemy.stateTimer = 0;

  console.log('--- 轻斩命中 ---');
  const hit0 = game.hitCount;
  press('KeyJ');
  for (let i = 0; i < 20; i++) frame(16);
  check('hitCount 增加', game.hitCount > hit0);
  check('敌人掉血', enemy.hp < hp0);

  console.log('--- 重斩断肢 ---');
  enemy = game.enemies.find((e) => !e.dead);
  if (enemy) {
    enemy.x = game.player.x + 60;
    enemy.state = 'idle';
    enemy.stateTimer = 0;
    enemy.hp = 99999; // 先保证不会直接打死
    const limb0 = game.limbBreakCount;
    enemy.limbs.armR.hp = 5; // 低肢体耐久，重斩必断
    const armBefore = enemy.limbs.armR.broken;
    key('KeyK', true);
    frame(16); // 蓄力开始
    key('KeyK', false);
    for (let i = 0; i < 30; i++) frame(16);
    check('limbBreakCount 增加', game.limbBreakCount > limb0);
    check('armR 已断', enemy.limbs.armR.broken === true && !armBefore);
  }

  console.log('--- 断肢后行为受影响 ---');
  if (enemy && enemy.limbs.armR.broken) {
    check('断攻击臂后 canAttack=false', enemy.canAttack() === false);
  }
}

console.log('--- 长时间运行稳定性 ---');
for (let i = 0; i < 900; i++) frame(16);
check('长跑后未崩溃且状态可读', typeof state().hitCount === 'number' && typeof state().enemyCount === 'number');

console.log('--- 死亡与重开 ---');
game.startRun();
game.enemies = [];
game.fx.reset();
const dp = game.player;
dp.invuln = 0;
dp.state = 'idle';
dp.grounded = true;
dp.y = 0;
dp.hp = 1;
dp.takeDamage(50, dp.x - 10); // 直接调用验证死亡流程
game.fx.hitStop = 0;
for (let i = 0; i < 100; i++) frame(16);
check('玩家死亡后 playing 结束', state().playing === false);
check('playerAlive = false', state().playerAlive === false);
press('KeyR');
frame(16);
check('R 重开后 playing = true', state().playing === true);
check('R 重开后玩家存活', state().playerAlive === true);

console.log('');
if (failures === 0) console.log('SMOKE TEST PASSED');
else { console.log('SMOKE TEST FAILED: ' + failures + ' failures'); process.exit(1); }
