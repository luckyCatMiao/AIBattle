// probe_thrower.js — 针偶（远程敌人）行为探针
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
const p = G.player;
G.waveActive = true; G.pending.length = 0; G.enemies.length = 0; G.spawnT = 9999;
p.hp = 1000; p.maxhp = 1000; p.iframes = 0; p.state = 'idle'; p.x = 1120; p.y = 596 - 38; p.facing = 1; p.onGround = true; p.vx = 0; p.vy = 0;

let bad = 0;
function check(cond, msg) { if (!cond) { bad++; console.error('  BAD -', msg); } else console.log('  ok  -', msg); }
function isolated(type, x) {
  G.enemies.length = 0; G.needles.length = 0; G.shocks.length = 0;
  p.hp = 1000; p.iframes = 0; p.state = 'idle'; p.vx = 0; p.vy = 0; p.x = 1120; p.y = 596 - 38; p.facing = 1; p.onGround = true;
  G.keys = {}; G.press = {};
  G.pending.push({ type }); G.spawnT = 0; G.maxAlive = 99;
  step(1);
  const e = G.enemies[G.enemies.length - 1];
  e.x = x; e.y = 596 - 38 * e.scale; e.state = 'chase'; e.onGround = true; e.airborne = false; e.cool = 0.3;
  return e;
}

// 1. 远距离投针
{
  const e = isolated('thrower', p.x + 320);
  let fired = false;
  for (let i = 0; i < 300 && !fired; i++) { step(1); if (G.needles.length) fired = true; }
  check(fired, 'thrower fires needles from range');
  // 针飞向玩家并命中
  let hit = false;
  for (let i = 0; i < 120 && !hit; i++) { step(1); if (p.hp < 1000) hit = true; }
  check(hit, 'needle hits idle player');
}
// 2. 挥刀可以斩落飞针
{
  const e = isolated('thrower', p.x + 300);
  e.cool = 0;
  let fired = false;
  for (let i = 0; i < 300 && !fired; i++) { step(1); if (G.needles.length) fired = true; }
  check(fired, 'second volley fired');
  const n = G.needles[0];
  // 玩家瞬移到针前方出刀
  p.x = n.x - 40; p.facing = 1; p.state = 'idle'; p.iframes = 0;
  const cnt0 = G.needles.length;
  key('keydown', 'KeyJ'); key('keyup', 'KeyJ');
  let slashed = false;
  for (let i = 0; i < 30 && !slashed; i++) { step(1); if (G.needles.length < cnt0) slashed = true; }
  check(slashed, 'slash destroys needle');
}
// 3. 断臂 → 逃窜不投针
{
  const e = isolated('thrower', p.x + 300);
  step(2);
  e.breakPart('armF', 1);
  check(e.state === 'flee' || e.weaponLost, 'armless thrower flees');
  let fired = false;
  for (let i = 0; i < 240; i++) { step(1); if (G.needles.length) fired = true; }
  check(!fired, 'armless thrower never throws');
}
// 4. 玩家靠近时针偶后跳拉开距离
{
  const e = isolated('thrower', p.x + 180);
  let hopped = false, maxDist = 0;
  for (let i = 0; i < 420 && !hopped; i++) {
    step(1);
    if (e.x - p.x > 120) { p.x = e.x - 120; p.y = 596 - 38; p.onGround = true; p.vy = 0; } // 持续贴身施压
    maxDist = Math.max(maxDist, e.x - p.x);
    if (e.airborne && e.vy < -50 && e.hopCd > 0.4) hopped = true; // hopCd 在后跳瞬间置 0.9
  }
  check(hopped, `thrower hops back when pressured (maxDist=${maxDist.toFixed(0)})`);
}

console.log(bad === 0 ? 'THROWER OK' : `${bad} THROWER PROBLEMS`);
process.exit(bad ? 1 : 0);
