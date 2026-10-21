#!/usr/bin/env node
/* 浸泡测试：300 秒模拟（死亡自动重开），确认长时运行无异常 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
const BUNDLE = html.match(/<script>([\s\S]*)<\/script>/)[1];
const listeners = { window: {}, document: {}, canvas: {}, button: {} };
let simTime = 0, rafCb = null;
function makeCtx(){
  return new Proxy({}, {
    get(t, k){ if (k === 'canvas') return { width: 1280, height: 720 }; return () => ({ addColorStop(){}, width: 42 }); },
    set(){ return true; },
  });
}
const canvasStub = { width: 1280, height: 720, style: {}, getContext: () => makeCtx(), addEventListener(t, f){ listeners.canvas[t] = f; } };
const buttonStub = { textContent: '', addEventListener(t, f){ listeners.button[t] = f; }, blur(){} };
const sandbox = {
  console, Math, JSON, Date, Promise, Set, Map, Object, Array, Number, String, Boolean, Error, Uint8ClampedArray, isFinite, isNaN, parseInt, parseFloat,
  performance: { now: () => simTime * 1000 },
  setTimeout: () => 0, clearTimeout: () => {},
  requestAnimationFrame: (cb) => { rafCb = cb; return 1; },
  document: { hidden: false, getElementById: (id) => (id === 'game' ? canvasStub : buttonStub), addEventListener(t, f){ listeners.document[t] = f; } },
};
sandbox.window = { innerWidth: 1280, innerHeight: 720, devicePixelRatio: 1, addEventListener(t, f){ listeners.window[t] = f; } };
sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext(BUNDLE, sandbox, { filename: 'game.js' });
const key = (c) => listeners.window.keydown({ code: c, repeat: false, cancelable: true, preventDefault(){} });
const keyUp = (c) => listeners.window.keyup && listeners.window.keyup({ code: c, cancelable: true, preventDefault(){} });
const bench = () => sandbox.window.combatBenchState();
const dbg = () => sandbox.window.combatDebugState();

key('Enter');
const held = {};
const hold = (code, on) => { if (!!held[code] === !!on) return; held[code] = on; on ? key(code) : keyUp(code); };
let jT = 0, dT = 0, iT = 0, kT = 0, sT = 0, deaths = 0, restarts = 0, maxWave = 1, errors = 0;
const N = 300 * 60;
for (let f = 0; f < N; f++){
  try {
    const d = dbg();
    maxWave = Math.max(maxWave, d.wave);
    if (d.dead){ key('KeyR'); restarts++; hold('KeyD', false); hold('KeyA', false); }
    else if (d.nearestDx !== null){
      hold('KeyD', d.nearestDx > 0); hold('KeyA', d.nearestDx < 0);
      const ad = Math.abs(d.nearestDx);
      jT -= 1 / 60; dT -= 1 / 60; iT -= 1 / 60; kT -= 1 / 60; sT -= 1 / 60;
      if (ad < 120 && jT <= 0){ key('KeyJ'); jT = 0.13; }
      if (ad < 170 && kT <= -1.0){ key('KeyK'); kT = 0.9; }
      if (kT > 0 && kT < 0.08){ keyUp('KeyK'); kT = -(0.3 + Math.random()); }
      if (ad < 140 && iT <= 0){ key('KeyI'); iT = 1.3; }
      if (d.nearestState === 'windup' && dT <= 0){ key('KeyL'); dT = 0.5; }
      if (ad > 240 && dT <= 0){ key('KeyL'); dT = 0.45; }
      if (sT <= 0 && Math.random() < 0.01){ key('Space'); sT = 1.1; }
      if (Math.random() < 0.002) key('KeyP');
    } else { hold('KeyD', false); hold('KeyA', false); }
    simTime += 1 / 60;
    rafCb && rafCb(simTime * 1000);
  } catch (e){
    errors++;
    console.error('t=' + (f / 60).toFixed(1) + 's 异常: ' + e.message);
    if (errors > 3) break;
  }
}
const b = bench();
console.log('浸泡 300s 完成: wave峰值=' + maxWave + ' 重开次数=' + restarts + ' 帧异常=' + errors);
console.log('最终: ' + JSON.stringify(b));
if (errors > 0) process.exit(1);
console.log('✔ 浸泡测试通过');
