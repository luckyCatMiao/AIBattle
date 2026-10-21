/* 调试：玩家攻击命中判定 */
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
// 传送：玩家在敌人左侧 50px，面向右
g.player.x = e.x - 50; g.player.y = 600; g.player.vx = 0; g.player.vy = 0;
g.player.facing = 1;
e.vx = 0;

console.log('before: hitCount=', g.hitCount, 'enemyHp=', e.hp, 'pState=', g.player.state);
console.log('enemy hurtBox=', JSON.stringify(e.hurtBox()));

key('KeyJ', 'keydown'); frames(1); key('KeyJ', 'keyup');
// 逐帧观察攻击窗口
for (let i = 0; i < 22; i++) {
  frames(1);
  const p = g.player;
  const hit = p.activeHit();
  if (hit) console.log(`f${i} state=${p.state} t=${p.stateT.toFixed(3)} hitX=[${hit.x.toFixed(0)},${(hit.x + hit.w).toFixed(0)}] hitY=[${hit.y.toFixed(0)},${(hit.y + hit.h).toFixed(0)}] enemyX=${e.x.toFixed(0)} hitCount=${g.hitCount}`);
}
console.log('after: hitCount=', g.hitCount, 'enemyHp=', e.hp, 'enemyState=', e.state);
