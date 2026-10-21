/* 调试：贴右墙近战 */
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
const e = g.enemies[0];
// 贴右墙
g.player.x = 2258; g.player.y = 600; g.player.vx = 0;
e.x = 2252; e.y = 600; e.state = 'chase'; e.vx = 0; e.attackCd = 0;

for (let i = 0; i < 300; i++) {
  frames(1);
  if (i % 12 === 0) {
    console.log(`f${i} e.state=${e.state} e.x=${e.x.toFixed(1)} e.face=${e.facing} e.cd=${e.attackCd.toFixed(2)} p.x=${g.player.x.toFixed(1)} p.face=${g.player.facing} p.hp=${g.player.hp} p.y=${g.player.y.toFixed(0)}`);
  }
}
