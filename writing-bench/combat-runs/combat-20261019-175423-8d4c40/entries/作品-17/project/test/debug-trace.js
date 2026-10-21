/* 调试：追踪 resolvePlayerAttack 与 hurt 的调用 */
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

// 打补丁追踪
const origResolve = g.resolvePlayerAttack.bind(g);
let resolveCalls = 0, activeNull = 0, skippedSet = 0, overlaps = 0, hurtCalls = 0;
g.resolvePlayerAttack = function () {
  resolveCalls++;
  const hit = g.player.activeHit();
  if (!hit) { activeNull++; return; }
  for (const e of g.enemies) {
    if (e.dead || e.state === 'drop') continue;
    if (g.player.hitSet.has(e.uid)) { skippedSet++; continue; }
    const hb = e.hurtBox();
    const R = (ax, ay, aw, ah, bx, by, bw, bh) => ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
    if (R(hit.x, hit.y, hit.w, hit.h, hb.x, hb.y, hb.w, hb.h)) {
      overlaps++;
      hurtCalls++;
    }
  }
  origResolve();
};

// 复现混战
let iter = 0;
while (iter < 1400 && g.state === 'playing') {
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
  } else { key('KeyA', 'keyup'); key('KeyD', 'keyup'); frames(10); }
  iter++;
}
console.log(`resolveCalls=${resolveCalls} activeNull=${activeNull} skippedByHitSet=${skippedSet} overlaps=${overlaps} hits=${g.hitCount}`);
console.log(`p.state=${g.player.state} face=${g.player.facing} swingId=${g.player.swingId} hitSetSize=${g.player.hitSet.size}`);
console.log(`enemies: ${g.enemies.filter(e=>!e.dead).map(e => `${e.state}@${e.x.toFixed(0)}`).join(', ')}`);
