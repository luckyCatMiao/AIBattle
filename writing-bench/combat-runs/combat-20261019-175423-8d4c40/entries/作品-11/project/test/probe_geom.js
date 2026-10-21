// probe_geom.js — 几何/姿态数值探针：检查骨架、刀光弧线、镜像是否合理
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
  const listeners = {};
  return { id, style: {}, classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    textContent: '', addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); }, click() {} };
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

let bad = 0;
function check(cond, msg) { if (!cond) { bad++; console.error('  BAD -', msg); } else console.log('  ok  -', msg); }

key('keydown', 'Enter'); key('keyup', 'Enter');
step(30);
G.waveActive = true; G.pending.length = 0; G.enemies.length = 0; G.spawnT = 9999; G.maxAlive = 99;
const p = G.player;
function freshEnemy(type, x) {
  G.enemies.length = 0;
  p.hp = 1000; p.maxhp = 1000; p.iframes = 0; p.state = 'idle'; p.atkName = null; p.vx = 0; p.vy = 0;
  p.x = 1120; p.y = 596 - 38; p.facing = 1; p.onGround = true;
  G.keys = {}; G.press = {};
  G.pending.length = 0;
  G.pending.push({ type }); G.spawnT = 0;
  step(1);
  const e = G.enemies[G.enemies.length - 1];
  e.x = x; e.y = 596 - 38 * e.scale; e.state = 'chase'; e.onGround = true; e.airborne = false; e.cool = 99;
  return e;
}

// ---- 站立 ----
G.enemies.length = 0; G.keys = {}; G.press = {};
p.hp = 1000; p.iframes = 0; p.state = 'idle'; p.vx = 0; p.vy = 0; p.x = 1120; p.y = 596 - 38; p.facing = 1; p.onGround = true;
step(3);
{
  const sk = p.sk;
  const footY = Math.max(p._footF ? p._footF[1] : 0, p._footB ? p._footB[1] : 0);
  check(Math.abs(footY - (GROUND_Y_G())) < 12, `idle feet on ground (footY=${footY.toFixed(1)}, ground=${GROUND_Y_G()})`);
    check(sk.head.y < sk.chest[1], 'head above chest');
  check(sk.head.y < p.y, 'head above root');
}
function GROUND_Y_G() { return sandbox.__G ? 596 : 596; }

// ---- 跑步 ----
key('keydown', 'KeyD');
step(20);
keyUpSafe('KeyD');
{
  const sk = p.sk;
  check(sk.bones.length >= 8, `run skeleton bones=${sk.bones.length}`);
}
function keyUpSafe(c) { key('keyup', c); }

// ---- atk1 刀尖扫掠弧线 ----
function sweep(atkName, frames) {
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  const pts = [];
  for (let i = 0; i < frames; i++) {
    step(1);
    if (p.state === 'atk' && p.sk && p.sk.blade) {
      const b = p.sk.blade;
      pts.push([b.tx - p.x, b.ty - p.y, (p.atkT / p.atkDef().dur).toFixed(2)]);
    }
  }
  return pts;
}
{
  p.x = 1200; p.y = 596 - 38; p.vy = 0; p.state = 'idle'; p.atkName = null;
  const pts = sweep('atk1', 40);
  const xs = pts.map(q => q[0]);
  const maxX = Math.max(...xs), maxT = Math.max(...pts.map(q => Math.abs(q[1])));
  check(maxX > 55, `atk1 blade reaches forward (maxX=${maxX.toFixed(0)})`);
  check(maxX < 130, `atk1 not absurdly long (maxX=${maxX.toFixed(0)})`);
  check(maxT > 40, `atk1 blade sweeps vertically too (maxDy=${maxT.toFixed(0)})`);
  console.log('   atk1 tip trace:', pts.filter((_, i) => i % 3 === 0).map(q => `t${q[2]}:(${q[0].toFixed(0)},${q[1].toFixed(0)})`).join(' '));
}
// ---- atk3 旋转 ----
{
  p.x = 1200; p.state = 'idle'; p.atkName = null; p.hitIds = new Set();
  // 连段：每段攻击中段续按（缓冲窗口内）
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  for (let i = 0; i < 16; i++) step(1);
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  for (let i = 0; i < 16; i++) step(1);
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  let sawSpin = false, backHit = false;
  for (let i = 0; i < 45; i++) {
    step(1);
    if (p.sk && p.sk.blade) {
      const rel = (p.sk.blade.tx - p.x) * p.facing;
      if (rel < -20) backHit = true;
    }
    if (p.atkName === 'atk3' && p.pose && p.pose.spin > 2) sawSpin = true;
  }
  check(sawSpin || p.atkName === 'atk3', 'reached atk3 spin');
  check(backHit, 'atk3 blade covers behind (360 sweep)');
}
// ---- 蓄力斩 ----
{
  G.enemies.length = 0;
  p.state = 'idle'; p.atkName = null; p.x = 1200; p.hitIds = new Set(); p.hp = 1000; p.iframes = 0;
  key('keydown', 'KeyK');
  step(35); // 0.58s 蓄满
  const glowBefore = p.weaponGlow;
  key('keyup', 'KeyK');
  let maxReach = 0;
  for (let i = 0; i < 50; i++) {
    step(1);
    if (p.sk && p.sk.blade && p.state === 'atk') maxReach = Math.max(maxReach, (p.sk.blade.tx - p.x) * p.facing);
  }
  check(glowBefore > 0.9, `charge glow full (${glowBefore.toFixed(2)})`);
  check(maxReach > 70, `heavyRel reach (${maxReach.toFixed(0)})`);
}
// ---- 挑空 ----
{
  G.enemies.length = 0;
  p.state = 'idle'; p.atkName = null; p.x = 1200; p.vy = 0; p.hitIds = new Set(); p.hp = 1000; p.iframes = 0;
  key('keydown', 'KeyI'); key('keyup', 'KeyI');
  let rose = false;
  for (let i = 0; i < 30; i++) { step(1); if (p.vy < -300) rose = true; }
  check(rose, 'launcher lifts the player');
}
// ---- 镜像（面向左） ----
{
  G.enemies.length = 0;
  p.state = 'idle'; p.atkName = null; p.facing = -1; p.x = 1200; p.hp = 1000; p.iframes = 0;
  step(2);
  const sk = p.sk;
  check(sk.head.x < p.x + 1, `mirror: head leans left when facing=-1 (${(sk.head.x - p.x).toFixed(1)})`);
  p.facing = 1;
}
// ---- 敌人骨架 ----
{
  const e = freshEnemy('grunt', p.x + 200);
  step(3);
  if (e && e.sk) {
    check(e.sk.head.y < e.sk.chest[1], 'enemy head above chest');
    check(e.sk.bones.length >= 8, `enemy bones=${e.sk.bones.length}`);
    check(e.sk.circles.length >= 5, `enemy hit circles=${e.sk.circles.length}`);
  } else console.log('   (no enemy skeleton to check)');
}
// ---- 重锤傀儡 scale ----
{
  const h = freshEnemy('heavy', p.x + 300);
  step(2);
  console.log('   [dbg] last enemy:', G.enemies.map(e => e.type + ':' + e.scale).join(','), 'pending:', G.pending.length, 'spawnT:', G.spawnT.toFixed(2), 'waveActive:', G.waveActive);
  check(h.scale > 1.2, `heavy is bigger (scale=${h.scale})`);
}
console.log(bad === 0 ? 'GEOMETRY OK' : `${bad} GEOMETRY PROBLEMS`);
process.exit(bad ? 1 : 0);
