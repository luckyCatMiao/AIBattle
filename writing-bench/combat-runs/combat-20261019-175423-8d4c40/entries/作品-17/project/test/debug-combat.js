/* 调试：复现 30 秒混战模拟并周期性打印状态 */
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
const tap = (c, h = 4) => { key(c, 'keydown'); frames(h); key(c, 'keyup'); frames(2); };

frames(5);
tap('Enter');
frames(70);

const g = windowObj.__game;
let iter = 0;
const maxIter = 2200;
while (iter < maxIter && g.state === 'playing') {
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
      if (roll < 0.72) tap('KeyJ', 3);
      else if (roll < 0.84) { key('KeyK', 'keydown'); frames(50); key('KeyK', 'keyup'); frames(6); }
      else if (roll < 0.93) tap('KeyI', 3);
      else tap('KeyL', 3);
    } else {
      frames(5);
    }
    if (iter % 120 === 0) {
      console.log(`it${iter} p.x=${p.x.toFixed(0)} p.state=${p.state} p.hp=${p.hp} bd=${bd.toFixed(0)} eStates=${g.enemies.map(e => e.state + '@' + e.x.toFixed(0)).join(',')} hits=${g.hitCount} kills=${g.killCount}`);
    }
    if (iter >= 1300 && iter <= 1420 && iter % 10 === 0) {
      console.log(`  [fine it${iter}] p=(${p.x.toFixed(0)},${p.y.toFixed(0)}) p.state=${p.state} p.face=${p.facing} hitActive=${!!p.activeHit()} | ` +
        g.enemies.filter(e => !e.dead).map(e => `${e.type}(${e.state},x=${e.x.toFixed(0)},cd=${e.attackCd.toFixed(2)},st=${e.stateT.toFixed(2)},hp=${e.hp})`).join(' | '));
    }
  } else {
    key('KeyA', 'keyup'); key('KeyD', 'keyup');
    frames(10);
    if (iter % 120 === 0) console.log(`it${iter} NO ALIVE (queue=${g.spawnQueue.length} waveState=${g.waveState} wave=${g.wave})`);
  }
  iter++;
}
console.log(`END: hits=${g.hitCount} kills=${g.killCount} limbs=${g.limbBreaks} hp=${g.player.hp} wave=${g.wave} score=${g.score}`);
