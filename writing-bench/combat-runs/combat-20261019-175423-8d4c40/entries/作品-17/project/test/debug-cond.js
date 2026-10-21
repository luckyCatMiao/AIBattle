/* 调试：敌人 chase 不转 windup 的条件分解 */
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
g.player.x = 46; g.player.y = 600; g.player.vx = 0;
e.x = 74; e.y = 600; e.state = 'chase'; e.stateT = 0; e.vx = 0; e.attackCd = 0;

frames(1);
const p = g.player;
console.log('e.state=', e.state, 'e.y=', e.y, 'p.y=', p.y);
console.log('cd<=0:', e.attackCd <= 0);
console.log('adx<range:', Math.abs(p.x - e.x), '<', e.cfg.range, '=', Math.abs(p.x - e.x) < e.cfg.range);
console.log('ycheck:', Math.abs(p.y - e.y), '< 90 =', Math.abs(p.y - e.y) < 90);
console.log('type:', e.type, 'state now:', e.state);
frames(5);
console.log('after 5f: state=', e.state, 'stateT=', e.stateT.toFixed(3));
