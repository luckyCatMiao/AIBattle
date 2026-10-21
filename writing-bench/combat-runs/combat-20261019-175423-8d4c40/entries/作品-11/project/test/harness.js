'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const { FakeAudioContext, lastContext, audioErrors } = require('./harness-audio.js');

const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) throw new Error('no script block found');
const code = m[1];

// ---------- 桩 ----------
let nanErrors = [];

function makeCtxStub() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (typeof k === 'symbol') return undefined;
      if (k === 'drawImage') {
        return (img) => { // 模拟 Chrome：无效 CanvasImageSource 抛 TypeError
          if (!img || typeof img.getContext !== 'function') {
            throw new TypeError("Failed to execute 'drawImage' on 'CanvasRenderingContext2D': The provided value is not of type '(CSSImageValue or SVGImageElement or HTMLCanvasElement or ...)'");
          }
        };
      }
      return (...args) => {
        for (const v of args) {
          if (typeof v === 'number' && !Number.isFinite(v)) {
            nanErrors.push(new Error(`NaN/Inf passed to ctx.${String(k)}: ${args.join(',')}`));
          }
        }
      };
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}

function makeEl(id) {
  const listeners = {};
  return {
    id,
    style: {},
    classList: {
      _set: new Set(),
      add(c) { this._set.add(c); },
      remove(c) { this._set.delete(c); },
      toggle(c) { this._set.has(c) ? this._set.delete(c) : this._set.add(c); },
      contains(c) { return this._set.has(c); },
    },
    textContent: '',
    addEventListener(type, fn) { (listeners[type] = listeners[type] || []).push(fn); },
    removeEventListener() {},
    click() { (listeners.click || []).forEach(f => f({ preventDefault() {} })); },
    dispatch(type, ev) { (listeners[type] || []).forEach(f => f(ev)); },
  };
}

const winListeners = {};
const canvasEl = Object.assign(makeEl('game'), { width: 1280, height: 720, getContext: () => ctxStub });
const ctxStub = makeCtxStub();
const elRegistry = { game: canvasEl };

const documentStub = {
  readyState: 'complete',
  hidden: false,
  body: makeEl('body'),
  getElementById(id) { return elRegistry[id] || (elRegistry[id] = makeEl(id)); },
  createElement: (t) => t === 'canvas'
    ? Object.assign(makeEl('cv'), { width: 1, height: 1, getContext: () => makeCtxStub() })
    : makeEl('el'),
  addEventListener() {},
};

const sandbox = {
  console,
  performance: { now: () => simT },
  devicePixelRatio: 1,
  innerWidth: 1280, innerHeight: 720,
  addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
  removeEventListener() {},
};
sandbox.window = sandbox;
sandbox.document = documentStub;

const rafQ = [];
sandbox.requestAnimationFrame = f => { rafQ.push(f); return rafQ.length; };
sandbox.AudioContext = FakeAudioContext;      // 激活音频路径（真实参数校验）
sandbox.webkitAudioContext = FakeAudioContext;

let simT = 0;
function fireKey(type, code, repeat) {
  (winListeners[type] || []).forEach(f => f({
    code, repeat: !!repeat, preventDefault() {},
  }));
}
const keyDown = c => fireKey('keydown', c);
const keyUp = c => fireKey('keyup', c);

function step(n) {
  for (let i = 0; i < n; i++) {
    simT += 16.6667;
    const actx = lastContext();
    if (actx) actx.currentTime += 1 / 60;
    const q = rafQ.splice(0, rafQ.length);
    for (const f of q) f(simT);
    if (nanErrors.length) { console.error(nanErrors[0]); process.exit(2); }
  }
}

vm.createContext(sandbox);
try {
  vm.runInContext(code, sandbox, { filename: 'game-inline.js' });
} catch (e) {
  console.error('BOOT FAILED:', e);
  process.exit(1);
}

const S = () => sandbox.combatBenchState();
const G = () => sandbox.__G;
G().debugNoCatch = true; // 测试模式下 loop 不吞异常

let failures = 0;
function assert(cond, msg) {
  if (cond) console.log('  ok  -', msg);
  else { failures++; console.error('  FAIL-', msg); }
}

// ============ 测试开始 ============
console.log('== boot ==');
step(5);
assert(S().ready === true, 'ready=true after boot');
assert(S().playing === false, 'not playing before start');
assert(S().playerAlive === false, 'playerAlive false in menu');

console.log('== start ==');
keyDown('Enter'); keyUp('Enter'); step(3);
assert(S().playing === true, 'playing after Enter');
assert(S().playerAlive === true, 'playerAlive after start');

console.log('== movement & jump ==');
const x0 = G().player.x;
keyDown('KeyD');
step(40);
assert(G().player.x > x0 + 100, `moved right (x ${x0.toFixed(0)} -> ${G().player.x.toFixed(0)})`);
keyUp('KeyD');
let minY = 1e9;
const yBefore = G().player.y;
keyDown('Space'); step(8); keyUp('Space');
for (let i = 0; i < 40; i++) { step(1); minY = Math.min(minY, G().player.y); }
assert(minY < yBefore - 60, `jumped (peak rise ${(yBefore - minY).toFixed(0)}px)`);

console.log('== enemies spawn ==');
step(150);
assert(S().enemyCount > 0, `enemyCount=${S().enemyCount}`);
assert(G().wave === 1, `wave=${G().wave}`);

console.log('== combat mash (bot plays 90s) ==');
let sawHurt = false;
let sawCombo = false, sawKill = false;
let chargeFrames = 0;
// 累计统计（R 重开会把游戏内统计清零，这里自行累计）
let acc = { hits: 0, limbs: 0, kills: 0 }, prev = { hits: 0, limbs: 0, kills: 0 };
let maxWave = 0, maxComboSeen = 0;
function accumulate() {
  const s = S(), g2 = G();
  maxWave = Math.max(maxWave, g2.wave);
  maxComboSeen = Math.max(maxComboSeen, g2.stats.maxCombo, g2.combo);
  if (s.hitCount < prev.hits || s.limbBreakCount < prev.limbs || g2.stats.kills < prev.kills) {
    acc.hits += prev.hits; acc.limbs += prev.limbs; acc.kills += prev.kills;
    prev = { hits: 0, limbs: 0, kills: 0 };
  }
  prev.hits = Math.max(prev.hits, s.hitCount);
  prev.limbs = Math.max(prev.limbs, s.limbBreakCount);
  prev.kills = Math.max(prev.kills, g2.stats.kills);
}
for (let f = 0; f < 5400; f++) {
  const g = G(), p = g.player;
  if (p.hp <= 0) { // 死了就重开继续打
    keyDown('KeyR'); keyUp('KeyR'); step(10);
    keyUp('KeyA'); keyUp('KeyD'); keyUp('KeyK');
    accumulate();
    continue;
  }
  // 追向最近敌人（优先已落地的）
  const es = g.enemies.filter(e => e.alive);
  let tgt = null, bd = 1e18;
  for (const e of es) { if (e.state === 'descend') continue; const d = (e.x - p.x) ** 2; if (d < bd) { bd = d; tgt = e; } }
  if (!tgt) for (const e of es) { const d = (e.x - p.x) ** 2; if (d < bd) { bd = d; tgt = e; } }
  keyUp('KeyA'); keyUp('KeyD');
  if (tgt) {
    const dx = tgt.x - p.x;
    if (Math.abs(dx) > 60) keyDown(dx > 0 ? 'KeyD' : 'KeyA');
  }
  if (f === 5390 && chargeFrames > 0) { keyUp('KeyK'); chargeFrames = 0; }
  if (f % 7 === 0) {
    const r = Math.random();
    const close = tgt && Math.abs(tgt.x - p.x) < 130;
    if (close && r < 0.72) { keyDown('KeyJ'); keyUp('KeyJ'); }
    else if (r < 0.78) { keyDown('KeyK'); chargeFrames = 30 + (Math.random() * 30 | 0); }
    else if (r < 0.84) { keyDown('KeyI'); keyUp('KeyI'); }
    else if (r < 0.90) { keyDown('KeyL'); keyUp('KeyL'); }
    else if (r < 0.95) { keyDown('Space'); step(6); keyUp('Space'); keyDown('KeyJ'); keyUp('KeyJ'); }
  }
  if (chargeFrames > 0) { chargeFrames--; if (chargeFrames === 0) keyUp('KeyK'); }
  step(1);
  accumulate();
  if (G().player.hp < 100) sawHurt = true;
  if (G().combo >= 3) sawCombo = true;
  if (G().stats.kills > 0) sawKill = true;
}
accumulate();
const s1 = S();
const tot = { hits: acc.hits + s1.hitCount, limbs: acc.limbs + s1.limbBreakCount, kills: acc.kills + G().stats.kills };
console.log('   stats:', JSON.stringify({ ...tot, wave: maxWave, maxCombo: maxComboSeen, hp: Math.round(G().player.hp), enemies: s1.enemyCount }));
assert(tot.hits >= 30, `hitCount=${tot.hits} (>=30)`);
assert(tot.limbs >= 1, `limbBreakCount=${tot.limbs} (>=1)`);
assert(sawKill, 'killed at least one enemy');
assert(sawHurt, 'player took damage');
assert(maxWave >= 2, `wave advanced to ${maxWave}`);
assert(sawCombo, 'combo counter worked');

console.log('== limb loss affects behavior ==');
// 检查至少存在过断肢后无法挥砍的敌人（武器丢失 → tackle）
const weaponLostSeen = G().enemies.some(e => e.weaponLost) || G().stats.limbs > 0;
assert(weaponLostSeen, 'limb break state visible on enemies');

console.log('== four skills ==');
{
  const g = G();
  const waitIdle = (max) => { let n = 0; while (!g.player.canAct() && n++ < max) step(1); };
  g.energy = 100;
  waitIdle(120);
  // U 千丝乱舞
  const hits0 = S().hitCount;
  keyDown('KeyU'); keyUp('KeyU'); step(45);
  assert(g.stats.skillUses.strings === 1, `strings cast (${g.stats.skillUses.strings})`);
  assert(S().hitCount > hits0 || S().enemyCount < 6, 'strings ticked');
  // O 影缝
  waitIdle(120);
  const px0 = g.player.x;
  keyDown('KeyO'); keyUp('KeyO'); step(62);
  assert(g.stats.skillUses.blink === 1, `blink cast (${g.stats.skillUses.blink})`);
  assert(Math.abs(g.player.x - px0) > 20 || S().enemyCount === 0, 'blink moved player');
  // P 裂空
  waitIdle(120);
  g.energy = Math.max(g.energy, 60);
  keyDown('KeyP'); keyUp('KeyP'); step(10);
  assert(g.stats.skillUses.wave === 1, `wave cast (${g.stats.skillUses.wave})`);
  let guard2 = 0; while (g.crescents.length && guard2++ < 220) step(1);
  // H 谢幕
  waitIdle(120);
  g.energy = 100;
  const limbs0 = S().limbBreakCount, enemies0 = S().enemyCount;
  keyDown('KeyH'); keyUp('KeyH'); step(135);
  assert(g.stats.skillUses.ult === 1, `ult cast (${g.stats.skillUses.ult})`);
  assert(S().limbBreakCount > limbs0 || S().enemyCount < enemies0, `ult shattered limbs (${limbs0}->${S().limbBreakCount})`);
  // 能量不足拒绝
  g.energy = 0;
  const u0 = g.stats.skillUses.strings;
  waitIdle(180);
  keyDown('KeyU'); keyUp('KeyU'); step(6);
  assert(g.stats.skillUses.strings === u0, 'deny cast without energy');
  assert(g.energy === 0, 'no energy drained on deny');
}

console.log('== player death & restart ==');
// 走向最近敌人挨打，直到死亡
let died = false;
const deathLog = [];
for (let f = 0; f < 60 * 120 && G().player.hp > 0; f++) {
  const g2 = G(), p2 = g2.player;
  keyUp('KeyK');
  if (f % 1200 === 0) deathLog.push(`f${f} hp=${p2.hp.toFixed(0)} x=${p2.x.toFixed(0)} ${p2.state} wave=${g2.wave} es=[${g2.enemies.filter(e=>e.alive).map(e=>`${e.type}:${e.state}@d${Math.abs(e.x-p2.x).toFixed(0)}`).join(',')}] keys=${JSON.stringify(g2.keys)} ifr=${p2.iframes.toFixed(2)}`);
  keyUp('KeyA'); keyUp('KeyD');
  let tgt2 = null, bd2 = 1e18;
  for (const e of g2.enemies) { if (!e.alive) continue; const d = (e.x - p2.x) ** 2; if (d < bd2) { bd2 = d; tgt2 = e; } }
  if (tgt2 && Math.abs(tgt2.x - p2.x) > 30) keyDown(tgt2.x > p2.x ? 'KeyD' : 'KeyA');
  step(1);
}
died = G().player.hp <= 0;
keyUp('KeyA'); keyUp('KeyD');
if (!died) console.log('   [death trace]\n    ' + deathLog.join('\n    '));
assert(died, 'player can die');
assert(G().player.state === 'dead', 'player death state');
for (let f = 0; f < 120; f++) step(1);
assert(S().playerAlive === false, 'playerAlive=false after death');
const hitsBefore = S().hitCount;
keyDown('KeyR'); keyUp('KeyR'); step(5);
assert(S().playing === true, 'playing after R restart');
assert(S().playerAlive === true, 'alive after restart');
assert(S().hitCount === 0 && S().limbBreakCount === 0, 'stats reset on restart');
assert(G().wave <= 1, `wave reset (${G().wave})`);
assert(S().enemyCount >= 0, 'state readable');

console.log('== idle damage from enemies (2nd run) ==');
let hurtAgain = false;
let hp0 = G().player.hp;
step(240);
for (let f = 0; f < 60 * 60 && G().player.hp >= hp0; f++) step(1);
if (G().player.hp < hp0 || G().player.hp <= 0) hurtAgain = true;
assert(hurtAgain, 'enemies attack an idle player');

console.log('== mute button & keys ==');
elRegistry.muteBtn.click();
assert(G() !== null, 'mute click safe');
keyDown('KeyM'); keyUp('KeyM'); step(2);

console.log('== blur clears keys ==');
if (G().player.hp <= 0) { keyDown('KeyR'); keyUp('KeyR'); step(5); } // 确保存活
keyDown('KeyD'); step(3);
const xBlur = G().player.x;
keyUp('KeyD');
(winListeners.blur || []).forEach(f => f({}));
step(25);
const truthyKeys = Object.entries(G().keys).filter(([, v]) => v);
assert(truthyKeys.length === 0, 'keys cleared on blur');
assert(Math.abs(G().player.vx) < 5, `player stopped after blur (vx=${G().player.vx.toFixed(1)})`);

console.log('== fuzz (50s random input) ==');
let fuzzErr = null;
try {
  for (let f = 0; f < 3000; f++) {
    if (chance_h(0.3)) {
      const c = ['KeyJ', 'KeyK', 'KeyL', 'KeyI', 'Space', 'KeyA', 'KeyD', 'Enter', 'KeyR', 'KeyM', 'ArrowLeft', 'ArrowUp', 'KeyU', 'KeyO', 'KeyP', 'KeyH'][randi_h(0, 15)];
      if (chance_h(0.5)) keyDown(c); else keyUp(c);
    }
    step(1);
    const st = S();
    if (typeof st.ready !== 'boolean' || typeof st.hitCount !== 'number') throw new Error('bad state');
  }
} catch (e) { fuzzErr = e; }
assert(!fuzzErr, 'fuzz no exceptions' + (fuzzErr ? ': ' + fuzzErr.message : ''));
assert(S().ready === true, 'still ready after fuzz');

console.log('== NaN/Inf audio args ==');
assert(audioErrors.length === 0, `no non-finite AudioParam args (${audioErrors.length})${audioErrors.length ? ': ' + audioErrors[0] : ''}`);
console.log('== NaN/Inf canvas args ==');
assert(nanErrors.length === 0, `no NaN passed to canvas (${nanErrors.length})`);

console.log('== perf sanity ==');
{
  const t0 = Date.now();
  step(600);
  const dt = Date.now() - t0;
  console.log(`   600 frames in ${dt}ms (${(dt / 600).toFixed(2)}ms/frame)`);
  assert(dt < 6000, '600 frames < 6s in stub');
}

console.log(failures === 0 ? '\nALL TESTS PASSED' : `\n${failures} TESTS FAILED`);
process.exit(failures === 0 ? 0 : 1);

// helpers
function chance_h(p) { return Math.random() < p; }
function randi_h(a, b) { return a + Math.floor(Math.random() * (b - a + 1)); }
