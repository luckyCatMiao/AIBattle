// probe_hit.js — 贴身连打命中率探针（调试用）
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
  return {
    id, style: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    textContent: '',
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    click() { (listeners.click || []).forEach(f => f({})); },
  };
}
const winL = {};
const ctxStub = makeCtxStub();
const canvasEl = Object.assign(makeEl('game'), { width: 1280, height: 720, getContext: () => ctxStub });
const elReg = { game: canvasEl };
const doc = {
  readyState: 'complete', hidden: false, body: makeEl('body'),
  getElementById(id) { return elReg[id] || (elReg[id] = makeEl(id)); },
  createElement: (t) => t === 'canvas'
    ? Object.assign(makeEl('cv'), { width: 1, height: 1, getContext: () => makeCtxStub() })
    : makeEl('el'), addEventListener() {},
};
const sandbox = { console, performance: { now: () => simT }, devicePixelRatio: 1,
  addEventListener(t, f) { (winL[t] = winL[t] || []).push(f); }, removeEventListener() {} };
sandbox.window = sandbox; sandbox.document = doc;
const rafQ = [];
sandbox.requestAnimationFrame = f => { rafQ.push(f); };
let simT = 0;
const key = (t, c) => (winL[t] || []).forEach(f => f({ code: c, repeat: false, preventDefault() {} }));
function step(n) {
  for (let i = 0; i < n; i++) { simT += 16.6667; const q = rafQ.splice(0); for (const f of q) f(simT); }
}
vm.createContext(sandbox);
vm.runInContext(code, sandbox, { filename: 'g.js' });
const G = sandbox.__G;

key('keydown', 'Enter'); key('keyup', 'Enter');
step(200); // 等敌人落地接近
const p = G.player, e = G.enemies[0];
console.log('enemy:', e && e.type, e && e.state, 'dist', e ? Math.abs(e.x - p.x).toFixed(0) : '-');
// 玩家瞬移到敌人身边（只改坐标用于探针）
p.x = e.x - 50; p.facing = 1;
let swings = 0, hits0 = G.stats.hits, atkPrev = '';
let hp0 = e.hp;
for (let f = 0; f < 600; f++) {
  // 保持贴身
  p.x = e.x - 46; p.facing = 1; p.hp = 100;
  if (f % 24 === 0) { key('keydown', 'KeyJ'); key('keyup', 'KeyJ'); }
  step(1);
  if (p.state === 'atk' && atkPrev !== 'atk' && p.atkName) swings++;
  atkPrev = p.state;
}
console.log('swings~', swings, 'hits', G.stats.hits - hits0, 'enemy hp', hp0, '->', e.hp, e.dead ? '(dead)' : '');
console.log('enemy final state:', e.state, 'limbs:', G.stats.limbs, 'kills:', G.stats.kills);
