// probe_behavior.js — 行为机制探针（隔离版）：断肢影响 / 无敌帧 / 浮空 / 韧性 / 冲击波
'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const code = html.match(/<script>([\s\S]*)<\/script>/)[1];

function makeCtxStub() {
  const grad = { addColorStop() {} };
  return new Proxy({}, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'drawImage') return (img) => {
        if (!img || typeof img.getContext !== 'function') throw new TypeError('drawImage: invalid CanvasImageSource');
      };
      if (k === 'measureText') return () => ({ width: 10 });
      if (k === 'createLinearGradient' || k === 'createRadialGradient') return () => grad;
      if (typeof k === 'symbol') return undefined;
      return () => {};
    },
    set(t, k, v) { t[k] = v; return true; },
  });
}
function makeEl(id) {
  const L = {};
  return { id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    textContent: '', addEventListener(t, f) { (L[t] = L[t] || []).push(f); }, click() {} };
}
const winL = {};
const ctxStub = makeCtxStub();
const canvasEl = Object.assign(makeEl('game'), { width: 1280, height: 720, getContext: () => ctxStub });
const elReg = { game: canvasEl };
const doc = { readyState: 'complete', hidden: false, body: makeEl('body'),
  getElementById(id) { return elReg[id] || (elReg[id] = makeEl(id)); },
  createElement: (t) => t === 'canvas'
    ? Object.assign(makeEl('cv'), { width: 1, height: 1, getContext: () => makeCtxStub() })
    : makeEl('el'), addEventListener() {} };
const sandbox = { console, performance: { now: () => simT }, devicePixelRatio: 1,
  addEventListener(t, f) { (winL[t] = winL[t] || []).push(f); }, removeEventListener() {} };
sandbox.window = sandbox; sandbox.document = doc;
const rafQ = [];
sandbox.requestAnimationFrame = f => { rafQ.push(f); };
let simT = 0;
const key = (t, c) => (winL[t] || []).forEach(f => f({ code: c, repeat: false, preventDefault() {} }));
function step(n) { for (let i = 0; i < n; i++) { simT += 16.6667; const q = rafQ.splice(0); for (const f of q) f(simT); } }
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'g.js' });
const G = sandbox.__G;
key('keydown', 'Enter'); key('keyup', 'Enter');
step(80);

let bad = 0;
function check(cond, msg) { if (!cond) { bad++; console.error('  BAD -', msg); } else console.log('  ok  -', msg); }

const p = G.player;
// 关闭波次刷新，完全手动控制敌人
G.waveActive = true; G.pending.length = 0;

function isolated(type, x) {
  G.enemies.length = 0;
  G.needles.length = 0; G.shocks.length = 0;
  G.wave = 99; G.maxAlive = 99; G.spawnT = 9999;
  p.hp = 1000; p.maxhp = 1000; p.iframes = 0; p.state = 'idle'; p.st = 0; p.atkName = null;
  p.vx = 0; p.vy = 0; p.x = 1120; p.y = 596 - 38; p.facing = 1; p.onGround = true;
  G.keys = {}; G.press = {};
  const e = newEnemy(type, x);
  return e;
}
let newEnemy = null;
{
  G.enemies.length = 0;
  newEnemy = (type, x) => {
    G.pending.push({ type });
    G.spawnT = 0;
    step(1);
    const e = G.enemies[G.enemies.length - 1];
    e.x = x; e.y = 596 - 38 * e.scale; e.state = 'chase'; e.onGround = true; e.airborne = false;
    e.cool = 5; // 默认不主动攻击
    return e;
  };
}

// ============ 1. 断武器臂 → 无法挥砍，改撞击 ============
{
  const e = isolated('grunt', p.x + 120);
  step(2);
  e.breakPart('armF', 1);
  check(e.weaponLost === true && !e.parts.armF.on, 'armF break → weapon lost');
  let sawTackle = false, sawSlash = false;
  e.cool = 0; e.x = p.x + 50;
  for (let i = 0; i < 240; i++) { step(1); if (e.atkKind === 'tackle') sawTackle = true; if (e.atkKind === 'slash') sawSlash = true; }
  check(sawTackle, 'armless grunt uses tackle');
  check(!sawSlash, 'armless grunt never slashes');
  check(!e.dead, 'armless grunt still fights');
}
// ============ 2. 断腿 → 爬行减速 ============
{
  const e = isolated('grunt', p.x + 400);
  step(2);
  e.breakPart('legF', 1);
  check(e.crawl === true, 'crawl after leg break');
  e.x = p.x + 400; e.facing = -1; e.state = 'chase';
  const x0 = e.x;
  for (let i = 0; i < 120; i++) step(1);
  const moved = Math.abs(e.x - x0);
  check(moved < 120, `crawl slow (moved ${moved.toFixed(0)}px in 2s)`);
}
// ============ 3. 断头 → 重锤狂暴 / 小怪恐慌 ============
{
  let e = isolated('heavy', p.x + 500);
  step(2);
  e.breakPart('head', 1);
  check(e.berserk === true && !e.dead, 'heavy berserks, survives decapitation');
  e = isolated('grunt', p.x - 500);
  step(2);
  e.breakPart('head', 1);
  check(e.state === 'panic', 'grunt panics after head break');
}
// ============ 4. 瞬步无敌 ============
{
  const e = isolated('grunt', p.x + 60);
  step(2);
  e.state = 'windup'; e.atkKind = 'slash'; e.windupT = 0.12; e.st = 0; e.facing = -1;
  const hp0 = p.hp;
  key('keydown', 'KeyL'); key('keyup', 'KeyL');
  for (let i = 0; i < 50; i++) step(1);
  check(p.hp === hp0, `dash i-frames avoid slash (hp ${hp0}->${p.hp})`);
  // 对照：不闪避会被砍
  e.cool = 0; e.state = 'chase'; e.x = p.x + 55;
  let hit = false;
  for (let i = 0; i < 240 && !hit; i++) { step(1); if (p.hp < hp0) hit = true; }
  check(hit, 'without dash the slash lands');
}
// ============ 5. 挑空 → 浮空 → 空中追击 ============
{
  const e = isolated('grunt', p.x + 46);
  step(2);
  e.cool = 99; e.state = 'chase'; e.x = p.x + 46;
  key('keydown', 'KeyI'); key('keyup', 'KeyI');
  let sawAir = false;
  for (let i = 0; i < 40; i++) { step(1); if (e.airborne && e.vy < -200) { sawAir = true; break; } }
  check(sawAir, 'launcher pops enemy airborne');
  if (sawAir && !e.dead) {
    const hp0 = e.hp;
    key('keydown', 'Space'); step(7); key('keyup', 'Space'); key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
    for (let i = 0; i < 16; i++) step(1);
    const dmg = hp0 - e.hp;
    check(dmg > 0 || e.dead, `air juggle connects (${dmg.toFixed(0)} dmg)`);
  }
}
// ============ 6. 铁锤韧性 ============
{
  const e = isolated('heavy', p.x + 46);
  step(2);
  e.state = 'chase'; e.y = 596 - 50 * e.scale; e.onGround = true; e.airborne = false;
  e.hitReact({ dir: 1, def: { dmg: 12, kb: 150, kup: 0, ks: 0.05, shake: 0, punch: 0, part: 0.6, w: 1 }, dmg: 12 });
  check(e.state === 'flinch', `light hit → flinch only (${e.state})`);
  e.state = 'chase'; e.onGround = true; e.airborne = false;
  e.hitReact({ dir: 1, def: { dmg: 46, kb: 580, kup: 170, ks: 0.15, shake: 0, punch: 0, part: 2.2, w: 3, poise: true, kdown: true, forceBreak: true }, dmg: 46 });
  check(e.state === 'down', `heavy hit → knockdown (${e.state})`);
}
// ============ 7. 冲击波：地面命中，跳跃可避 ============
{
  let e = isolated('heavy', p.x + 130);
  step(2);
  e.state = 'strike'; e.atkKind = 'smash'; e.st = 0; e.swingDone = false; e.cool = 99;
  p.x = e.x - 130; p.y = 596 - 38; p.onGround = true; p.iframes = 0;
  let shockSeen = false;
  for (let i = 0; i < 30 && !shockSeen; i++) { step(1); if (G.shocks.length) shockSeen = true; }
  check(shockSeen, 'smash spawns shockwave');
  for (let i = 0; i < 60; i++) step(1);
  check(p.hp < 1000, 'shockwave hits grounded player');
  // 再来一次，跳过去
  e = isolated('heavy', p.x + 130);
  step(2);
  e.state = 'strike'; e.atkKind = 'smash'; e.st = 0; e.swingDone = false; e.cool = 99;
  p.x = e.x - 130; p.y = 596 - 38; p.onGround = true; p.iframes = 0;
  let jumped = false;
  for (let i = 0; i < 120; i++) {
    step(1);
    if (G.shocks.length && !jumped) {
      jumped = true;
      key('keydown', 'Space'); step(7); key('keyup', 'Space');
    }
  }
  for (let i = 0; i < 40; i++) step(1);
  check(jumped && p.hp === 1000, `jump avoids shockwave (hp=${p.hp})`);
}
// ============ 8. 前兆时长 ============
{
  const e = isolated('grunt', p.x + 55);
  step(2);
  e.cool = 0; e.state = 'chase';
  let windupFrames = 0;
  for (let i = 0; i < 200; i++) {
    step(1);
    if (e.state === 'windup') windupFrames++;
    if (e.state === 'strike') break;
  }
  check(windupFrames >= 15, `telegraph lasts ${windupFrames} frames`);
}

console.log(bad === 0 ? 'BEHAVIOR OK' : `${bad} BEHAVIOR PROBLEMS`);
process.exit(bad ? 1 : 0);
