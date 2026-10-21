#!/usr/bin/env node
/* 逐秒状态探针：定位机器人低命中的原因 */
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

const key = (code) => listeners.window.keydown({ code, repeat: false, cancelable: true, preventDefault(){} });
const keyUp = (code) => listeners.window.keyup && listeners.window.keyup({ code, cancelable: true, preventDefault(){} });
const bench = () => sandbox.window.combatBenchState();
const dbg = () => sandbox.window.combatDebugState();
function step(n){
  for (let i = 0; i < n; i++){
    simTime += 1 / 60;
    try { rafCb && rafCb(simTime * 1000); }
    catch (e){ console.error('帧异常: ' + e.stack); process.exit(1); }
  }
}

key('Enter');
step(60);

const held = {};
const hold = (code, on) => { if (!!held[code] === !!on) return; held[code] = on; on ? key(code) : keyUp(code); };
let jT = 0, dT = 0, iT = 0, kT = 0, sT = 0;
let statTally = {};
for (let f = 0; f < 60 * 150; f++){
  const d = dbg();
  const st = d.pstate + (d.pmove ? '/' + d.pmove : '') + (d.pcharging ? '/chg' : '');
  statTally[st] = (statTally[st] || 0) + 1;
  if (d.dead){ hold('KeyD', false); hold('KeyA', false); }
  else if (d.nearestDx !== null){
    hold('KeyD', d.nearestDx > 0);
    hold('KeyA', d.nearestDx < 0);
    const ad = Math.abs(d.nearestDx);
    jT -= 1 / 60; dT -= 1 / 60; iT -= 1 / 60; kT -= 1 / 60; sT -= 1 / 60;
    if (ad < 120 && jT <= 0){ key('KeyJ'); jT = 0.13; }
    if (ad < 170 && kT <= -1.2){ key('KeyK'); kT = 1.0; }
    if (kT > 0 && kT < 0.08){ keyUp('KeyK'); kT = -(0.4 + Math.random()); }
    if (ad < 140 && iT <= 0){ key('KeyI'); iT = 1.4; }
    if (d.nearestState === 'windup' && dT <= 0){ key('KeyL'); dT = 0.55; }
    if (ad > 240 && dT <= 0){ key('KeyL'); dT = 0.5; }
    if (sT <= 0 && Math.random() < 0.008){ key('Space'); sT = 1.2; }
  } else { hold('KeyD', false); hold('KeyA', false); }
  step(1);
  if (f % 60 === 0){
    const dd = dbg(), b = bench();
    console.log(`t=${(f/60).toFixed(0)}s ${st.padEnd(16)} px=${dd.px} dx=${dd.nearestDx} air=${dd.pair} hp=${dd.hp} hits=${b.hitCount} lb=${b.limbBreakCount} en=${dd.enemies.length}(${dd.enemies.map(e=>e.type[0]).join('')}) wave=${dd.wave}/${dd.waveState} pend=${dd.pending}`);
  }
}
console.log('\n状态分布:', JSON.stringify(statTally));
console.log('最终:', JSON.stringify(bench()));
