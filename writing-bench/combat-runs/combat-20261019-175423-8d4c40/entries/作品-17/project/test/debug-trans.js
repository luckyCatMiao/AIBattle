/* 调试：用 defineProperty 追踪敌人 state 转移 */
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
// 复现贴墙混战场景：3 敌人 + 玩家贴左墙乱打
g.player.x = 46; g.player.y = 600;
g.enemies.forEach((e, i) => { e.x = 60 + i * 40; e.y = 600; e.state = 'chase'; e.stateT = 0; e.vx = 0; e.attackCd = 0; });

const e0 = g.enemies[0];
let st = e0.state;
let transitions = [];
Object.defineProperty(e0, 'state', {
  get() { return st; },
  set(v) { if (v !== st) { transitions.push(`${st}->${v}@${(nowMs / 1000).toFixed(1)}s p.y=${g.player.y.toFixed(0)}`); } st = v; },
});

let iter = 0;
while (iter < 600 && g.state === 'playing') {
  const p = g.player;
  const alive = g.enemies.filter(e => !e.dead && e.state !== 'drop');
  if (alive.length) {
    let best = null, bd = 1e9;
    for (const e of alive) { const d = Math.abs(e.x - p.x); if (d < bd) { bd = d; best = e; } }
    const dir = best.x > p.x ? 'KeyD' : 'KeyA';
    if (bd > 70) key(dir, 'keydown');
    else { key('KeyA', 'keyup'); key('KeyD', 'keyup'); }
    if (bd <= 95) {
      const roll = Math.random();
      if (roll < 0.72) { key('KeyJ', 'keydown'); frames(3); key('KeyJ', 'keyup'); frames(2); }
      else if (roll < 0.93) { key('KeyI', 'keydown'); frames(3); key('KeyI', 'keyup'); frames(2); }
      else { key('KeyL', 'keydown'); frames(3); key('KeyL', 'keyup'); frames(2); }
    } else frames(5);
  } else frames(10);
  iter++;
}
console.log('transitions:', transitions.slice(0, 30).join('\n  '));
console.log('final e0:', st, 'x=', e0.x.toFixed(0), 'y=', e0.y.toFixed(0), 'cd=', e0.attackCd);
