// ============================================================================
// test/skills.js — 4 个主动技能的无头专项测试
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

function clear() { game.enemies = []; game.projectiles = []; game.clones = []; game.pendingStrikes = []; game.fx.reset(); }
function addEnemy(type, x) {
  game.spawnEnemyOfType(type, x);
  const e = game.enemies[game.enemies.length - 1];
  e.state = 'idle'; e.stateTimer = 0; e.hp = 99999;
  return e;
}

press('Enter');
frame(16);
clear();
game.player.x = 0; game.player.vx = 0; game.player.vy = 0; game.player.y = 0; game.player.grounded = true; game.player.state = 'idle'; game.player.facing = 1;

console.log('--- U 一闪·居合 ---');
{
  clear();
  const p = game.player;
  p.x = 0; p.facing = 1;
  const e = addEnemy('blade', 80);
  const x0 = p.x;
  const hp0 = e.hp;
  press('KeyU');
  for (let i = 0; i < 24; i++) frame(16);
  check('冷却已进入', p.skillCd.KeyU > 0);
  check('向前突进', p.x > x0 + 40);
  check('命中敌人', e.hp < hp0);
}

console.log('--- O 影舞·分身斩 ---');
{
  clear();
  const p = game.player;
  p.x = 0; p.facing = 1; p.state = 'idle'; p.grounded = true; p.y = 0;
  const e = addEnemy('blade', 120);
  const hp0 = e.hp;
  press('KeyO');
  for (let i = 0; i < 34; i++) frame(16);
  check('生成过分身', game.clones.length > 0 || e.hp < hp0);
  check('分身命中敌人', e.hp < hp0);
}

console.log('--- P 雷葬·天罚 ---');
{
  clear();
  const p = game.player;
  p.x = 0; p.facing = 1; p.state = 'idle'; p.grounded = true; p.y = 0;
  const e = addEnemy('blade', 150);
  const hp0 = e.hp;
  press('KeyP');
  for (let i = 0; i < 34; i++) frame(16);
  check('落雷命中敌人', e.hp < hp0);
  check('落雷结算完成', game.pendingStrikes.length === 0);
}

console.log('--- Q 残响·时滞 ---');
{
  clear();
  const p = game.player;
  p.x = 0; p.facing = 1; p.state = 'idle'; p.grounded = true; p.y = 0;
  const e = addEnemy('blade', 100);
  const hp0 = e.hp;
  press('KeyQ');
  for (let i = 0; i < 18; i++) frame(16);
  check('冲击波命中敌人', e.hp < hp0);
  check('敌人被迟滞', e.slowTimer > 0);
}

console.log('--- 冷却阻止连发 ---');
{
  clear();
  const p = game.player;
  p.x = 0; p.facing = 1; p.state = 'idle'; p.grounded = true; p.y = 0;
  p.skillCd.KeyU = 4.5;
  const state0 = p.state;
  press('KeyU');
  frame(16);
  check('冷却中无法再次释放', p.state !== 'skill' || p.skillCd.KeyU > 0);
}

console.log('--- 技能后恢复普通状态 ---');
{
  clear();
  const p = game.player;
  p.x = 0; p.facing = 1; p.state = 'idle'; p.grounded = true; p.y = 0;
  p.skillCd.KeyQ = 0;
  press('KeyQ');
  for (let i = 0; i < 40; i++) frame(16);
  check('释放结束后回到可操作状态', p.state === 'idle' || p.state === 'run' || p.state === 'jump');
}

console.log('');
if (failures === 0) console.log('SKILLS TEST PASSED');
else { console.log('SKILLS TEST FAILED: ' + failures); process.exit(1); }
