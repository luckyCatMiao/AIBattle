/* 调试：单傀儡 vs 玩家站桩，观察敌人 AI 状态与距离 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

function makeCtxStub() {
  const gradient = { addColorStop() {} };
  const target = { canvas: null, measureText: () => ({ width: 10 }),
    createLinearGradient: () => gradient, createRadialGradient: () => gradient };
  return new Proxy(target, {
    get(t, k) { if (k in t) return t[k]; return () => {}; },
    set(t, k, v) { t[k] = v; return true; },
  });
}
const listeners = { window: {}, canvas: {}, document: {}, muteBtn: {} };
const addL = s => (t, f) => { (s[t] = s[t] || []).push(f); };
const fire = (s, t, e) => (s[t] || []).forEach(f => f(e));
const canvasEl = { width: 1280, height: 720, style: {}, getContext: () => makeCtxStub(), addEventListener: addL(listeners.canvas) };
let rafCb = null, nowMs = 0;
const windowObj = { innerWidth: 1280, innerHeight: 720, addEventListener: addL(listeners.window) };
const sandbox = {
  window: windowObj,
  document: { getElementById: id => id === 'game' ? canvasEl : { addEventListener: addL(listeners.muteBtn) }, addEventListener: addL(listeners.document), hidden: false },
  performance: { now: () => nowMs },
  requestAnimationFrame: cb => { rafCb = cb; },
  console,
};
vm.createContext(sandbox);
const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
vm.runInContext(html.match(/<script>([\s\S]*)<\/script>/)[1], sandbox, { filename: 'bundle.js' });

const frames = n => { for (let i = 0; i < n; i++) { nowMs += 16.67; const cb = rafCb; rafCb = null; cb(nowMs); } };
const key = (c, t) => fire(listeners.window, t, { code: c, repeat: false, preventDefault() {} });

frames(5);
key('Enter', 'keydown'); frames(4); key('Enter', 'keyup');
frames(80);

const g = windowObj.__game;
console.log('enemies:', g.enemies.length, 'wave:', g.wave);

// 把玩家传送到第一个敌人旁边站桩
const e = g.enemies[0];
g.player.x = e.x - 60;
g.player.y = 600;

console.log('--- 站桩 12 秒，观察敌人行为 ---');
for (let s = 0; s < 24; s++) {
  frames(30);
  const ee = g.enemies[0];
  if (!ee) { console.log(`[${(s * 0.5).toFixed(1)}s] enemy gone. playerHp=${g.player.hp}`); continue; }
  console.log(`[${(s * 0.5).toFixed(1)}s] e.state=${ee.state} e.x=${ee.x.toFixed(0)} p.x=${g.player.x.toFixed(0)} adx=${Math.abs(ee.x - g.player.x).toFixed(0)} e.y=${ee.y.toFixed(0)} pHp=${g.player.hp} cd=${ee.attackCd.toFixed(2)}`);
}
