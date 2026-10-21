/* 无头测试桩：模拟 DOM + canvas + 键盘，驱动真实游戏循环验证玩法逻辑。
 * 用法: node test/headless.js
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

/* ---------- 画布上下文桩 ---------- */
function makeCtxStub() {
  const gradient = { addColorStop() {} };
  const target = {
    canvas: null,
    measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    getImageData: () => ({ data: [] }),
  };
  return new Proxy(target, {
    get(t, k) {
      if (k in t) return t[k];
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

/* ---------- DOM 桩 ---------- */
const listeners = { window: {}, canvas: {}, document: {}, muteBtn: {} };
function addL(store) {
  return (type, fn) => { (store[type] = store[type] || []).push(fn); };
}
function fire(store, type, ev) {
  (store[type] || []).forEach(fn => fn(ev));
}

const canvasEl = {
  width: 1280, height: 720,
  style: {},
  getContext: () => makeCtxStub(),
  addEventListener: addL(listeners.canvas),
};

const muteBtn = {
  textContent: '🔊',
  addEventListener: addL(listeners.muteBtn),
};

let rafCb = null;
let nowMs = 0;

const windowObj = {
  innerWidth: 1280, innerHeight: 720,
  addEventListener: addL(listeners.window),
  AudioContext: undefined, // 无音频环境：游戏必须照常运行
};
const documentObj = {
  getElementById: (id) => id === 'game' ? canvasEl : muteBtn,
  addEventListener: addL(listeners.document),
  hidden: false,
};

const sandbox = {
  window: windowObj,
  document: documentObj,
  performance: { now: () => nowMs },
  requestAnimationFrame: (cb) => { rafCb = cb; },
  console,
};
sandbox.globalThis = sandbox;
vm.createContext(sandbox);

/* ---------- 载入打包代码 ---------- */
const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('FAIL: script not found in game.html'); process.exit(1); }
vm.runInContext(m[1], sandbox, { filename: 'game-bundle.js' });

/* ---------- 驱动工具 ---------- */
function frames(n, msPerFrame = 16.67) {
  for (let i = 0; i < n; i++) {
    nowMs += msPerFrame;
    const cb = rafCb;
    rafCb = null;
    if (!cb) throw new Error('no rAF callback registered');
    cb(nowMs);
  }
}
function key(code, type = 'keydown') {
  fire(listeners.window, type, { code, repeat: false, preventDefault() {} });
}
function tap(code, holdFrames = 4) {
  key(code, 'keydown');
  frames(holdFrames);
  key(code, 'keyup');
  frames(2);
}
function bench() { return windowObj.combatBenchState(); }
const game = () => windowObj.__game;

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ✓ ${name}`);
  else { console.error(`  ✗ ${name} ${extra}`); failures++; }
}

/* ================= 测试流程 ================= */
console.log('== 启动与标题 ==');
frames(10);
let b = bench();
check('ready=true', b.ready === true);
check('标题页 playing=false', b.playing === false);
check('标题页无敌人', b.enemyCount === 0);

console.log('== 开始游戏 ==');
tap('Enter');
frames(70); // 等第一波落下
b = bench();
check('playing=true', b.playing === true);
check('玩家存活', b.playerAlive === true);
check('第一波有敌人', b.enemyCount >= 2, `enemyCount=${b.enemyCount}`);

console.log('== 移动与跳跃 ==');
const p0 = game().player.x;
key('KeyD', 'keydown'); frames(30); key('KeyD', 'keyup');
check('向右移动', game().player.x > p0 + 100, `dx=${game().player.x - p0}`);
const y0 = game().player.y;
tap('Space', 6);
let rose = false;
for (let i = 0; i < 20; i++) { frames(1); if (game().player.y < y0 - 60) { rose = true; break; } }
check('跳跃升空', rose);
frames(40);

console.log('== 战斗：追踪攻击 30 秒模拟 ==');
// 简单 AI：朝最近敌人移动，贴近就按 J，偶尔蓄力 K / 冲刺 L / 挑空 I
let simTime = 0;
const DT = 16.67;
let usedCharged = false;
while (simTime < 30000 && game().state === 'playing') {
  const g = game();
  const p = g.player;
  const alive = g.enemies.filter(e => !e.dead && e.state !== 'drop');
  if (alive.length) {
    // 找最近
    let best = null, bd = 1e9;
    for (const e of alive) { const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; best = e; } }
    const dir = best.x > p.x ? 'KeyD' : 'KeyA';
    if (bd > 70) key(dir, 'keydown');
    else { key('KeyA', 'keyup'); key('KeyD', 'keyup'); }
    if (bd <= 95) {
      const roll = Math.random();
      if (roll < 0.72) tap('KeyJ', 3);
      else if (roll < 0.84) { // 蓄力重斩
        key('KeyK', 'keydown'); frames(50); key('KeyK', 'keyup'); frames(6);
        usedCharged = true;
      }
      else if (roll < 0.93) tap('KeyI', 3);
      else tap('KeyL', 3);
    } else {
      frames(5);
    }
  } else {
    key('KeyA', 'keyup'); key('KeyD', 'keyup');
    frames(10);
  }
  simTime += DT;
}
key('KeyA', 'keyup'); key('KeyD', 'keyup');

b = bench();
const g = game();
check('命中计数 > 30', b.hitCount > 30, `hitCount=${b.hitCount}`);
check('发生断肢', b.limbBreakCount > 0, `limbBreakCount=${b.limbBreakCount}`);
check('使用了蓄力斩', usedCharged);
check('有击杀', g.killCount > 0, `kills=${g.killCount}`);
check('波次推进或持续战斗', g.wave >= 1, `wave=${g.wave}`);
console.log(`  状态: wave=${g.wave} score=${g.score} combo(max)=${g.maxCombo} hp=${g.player.hp} hits=${b.hitCount} limbs=${b.limbBreakCount}`);

console.log('== 玩家受击与死亡流程 ==');
// 站桩挨打直到死亡（hp 不够则多等几波）
let guard = 0;
while (game().state === 'playing' && guard < 120000) {
  // 站着不动，只保证游戏继续；敌人会打玩家
  frames(10);
  guard += 10;
  if (game().player.dead) break;
}
b = bench();
check('站桩后玩家死亡', game().player.dead === true, `state=${game().state} hp=${game().player.hp}`);
check('死亡后 playing=false', b.playing === false);
check('playerAlive=false', b.playerAlive === false);

console.log('== R 重开 ==');
tap('KeyR');
frames(5);
b = bench();
check('重开后 playing=true', b.playing === true);
check('重开后玩家满血存活', b.playerAlive === true && game().player.hp === game().player.maxHp);
check('重开后计数清零', b.hitCount === 0 && b.limbBreakCount === 0);

console.log('== 失焦清空按键 ==');
key('KeyD', 'keydown');
frames(3);
fire(listeners.window, 'blur', {});
frames(3);
const px = game().player.x;
frames(20);
check('blur 后按键清空（仅惯性衰减）', Math.abs(game().player.x - px) < 30, `moved=${Math.abs(game().player.x - px)}`);

console.log('== 冲刺无敌帧 & 完美闪避窗口存在 ==');
{
  const g2 = game();
  // 直接验证机制字段
  g2.player.doDash(g2);
  check('冲刺后 dashIFrames>0', g2.player.dashIFrames > 0);
  frames(30);
}

console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
