/* Headless harness: stub DOM/canvas, run bundle, simulate play, assert state. */
const fs = require('fs');
const path = require('path');
const html = fs.readFileSync(path.join(__dirname, '..', 'game.html'), 'utf8');
let js = html.match(/<script>([\s\S]*)<\/script>/)[1];
// expose internals for testing only (not shipped)
js = js.replace('  requestAnimationFrame(frame);\n})();',
  '  window.__debug = { world: world, input: input, startGame: startGame, restartGame: restartGame };\n  requestAnimationFrame(frame);\n})();');
if (!js.includes('window.__debug')) throw new Error('debug hook injection failed');

let drawCalls = 0;
function makeCtx() {
  const grad = { addColorStop() {} };
  const noop = () => {};
  const ctx = {};
  for (const k of ['save','restore','translate','scale','rotate','beginPath','closePath','moveTo','lineTo','arc','arcTo','ellipse','rect','fill','stroke','fillRect','strokeRect','fillText','strokeText','clip','quadraticCurveTo','bezierCurveTo','setLineDash','clearRect','drawImage','setTransform']) ctx[k] = noop;
  ctx.createLinearGradient = () => grad;
  ctx.createRadialGradient = () => grad;
  ctx.measureText = (t) => ({ width: String(t).length * 7 });
  ctx.createPattern = () => null;
  return new Proxy(ctx, {
    get(t, k) {
      if (k in t) return t[k];
      if (k === 'canvas') return null;
      return undefined;
    },
    set(t, k, v) { t[k] = v; return true; }
  });
}
function makeEl(extra) {
  const listeners = {};
  return Object.assign({
    style: {}, textContent: '',
    classList: { add() {}, remove() {}, contains() { return false; }, toggle() {} },
    addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
    removeEventListener() {},
    getBoundingClientRect() { return { left: 0, top: 0, width: 1280, height: 720 }; },
    getContext() { return makeCtx(); },
    focus() {}, blur() {},
    _listeners: listeners
  }, extra || {});
}

const stage = makeEl({ width: 960, height: 540 });
const appEl = makeEl();
const muteBtn = makeEl();
const deathPanel = makeEl();
const titlePanel = makeEl();
const els = { stage, app: appEl, muteBtn, deathPanel, titlePanel };

const winListeners = {};
const docListeners = {};
let rafCb = null;
let pending = [];
let TIME = 0;

global.window = {
  addEventListener(t, f) { (winListeners[t] = winListeners[t] || []).push(f); },
  removeEventListener() {},
  devicePixelRatio: 1,
  AudioContext: undefined,
  webkitAudioContext: undefined,
  innerWidth: 1280, innerHeight: 720
};
global.document = {
  getElementById(id) { return els[id] || makeEl(); },
  addEventListener(t, f) { (docListeners[t] = docListeners[t] || []).push(f); },
  hidden: false,
  documentElement: makeEl()
};
global.performance = { now: () => TIME };
global.requestAnimationFrame = (cb) => { rafCb = cb; return 1; };
global.cancelAnimationFrame = () => {};

function fireWin(type, ev) {
  for (const f of (winListeners[type] || [])) f(Object.assign({ preventDefault() {}, repeat: false }, ev));
}
function key(code, down) {
  fireWin(down ? 'keydown' : 'keyup', { code });
}
function frame(dtMs) {
  TIME += dtMs;
  const cb = rafCb; rafCb = null;
  if (cb) cb(TIME);
}

global.window.__DEBUG_TARGET = true;
require('vm').runInThisContext(js, { filename: 'bundle.js' });

const D = global.window.__debug;
const S = () => global.window.combatBenchState();
const log = (...a) => console.log(...a);

// ---- boot render a few frames on title ----
frame(16); frame(16);
log('title state', JSON.stringify(S()));
if (S().ready !== true) throw new Error('ready must be true');

// start
key('Enter', true); key('Enter', false);
frame(16);
log('after start', JSON.stringify(S()));

// simulate 12 seconds of aggressive play: approach nearest enemy, mash J, occasional K/L/I/Space
const world = D.world;
let maxEnemies = 0, minHp = 100;
let err = null;
for (let i = 0; i < 1200; i++) {
  // 16ms frames => ~19s
  const p = world.player;
  const alive = world.enemies.filter((e) => !e.dead);
  maxEnemies = Math.max(maxEnemies, alive.length);
  if (alive.length) {
    let e = alive[0], best = 1e9;
    for (const cand of alive) { const d = Math.abs(cand.x - p.x); if (d < best) { best = d; e = cand; } }
    const dx = e.x - p.x;
    key('KeyD', dx > 30);
    key('KeyA', dx < -30);
    if (best < 110) { key('KeyJ', i % 3 === 0); key('KeyJ', false); }
    if (i % 37 === 0) { key('KeyJ', true); }
    if (i % 53 === 0) { key('KeyJ', false); }
    if (i % 211 === 0) { key('KeyK', true); }
    if (i % 211 === 40) { key('KeyK', false); }
    if (i % 173 === 0) { key('KeyL', true); key('KeyL', false); }
    if (i % 307 === 0) { key('KeyI', true); key('KeyI', false); }
    if (i % 97 === 0) { key('Space', true); key('Space', false); }
    // dodge telegraphs roughly
    for (const cand of alive) {
      if (cand.state === 'attack' && cand.attackT < (cand.tellTotal || 0.4) && Math.abs(cand.x - p.x) < 150 && i % 4 === 0) {
        key('KeyL', true); key('KeyL', false);
      }
    }
  } else {
    key('KeyD', false); key('KeyA', false);
  }
  minHp = Math.min(minHp, p.hp);
  try { frame(16); } catch (e) { err = e; break; }
}
if (err) throw err;
const st = S();
log('after 19s play', JSON.stringify(st));
log('wave', world.stats.wave, 'kills', world.stats.killCount, 'parries', world.stats.parryCount, 'severed', world.severed.length, 'hp', world.player.hp);
log('max simultaneous enemies', maxEnemies, 'min player hp', minHp);
log('paused/state', world.player.state, 'waveState', world.waveState);

if (st.hitCount <= 0) throw new Error('no hits registered');
if (!Number.isFinite(world.player.x)) throw new Error('non-finite player x');
if (!Number.isFinite(world.player.hp)) throw new Error('non-finite hp');

// restart check
key('KeyR', true); key('KeyR', false);
frame(16);
const rs = S();
log('after restart', JSON.stringify(rs));
if (rs.hitCount !== 0) throw new Error('restart did not reset stats');
if (rs.playerAlive !== true) throw new Error('restart did not revive player');

// let wave spawn and verify enemyCount
for (let i = 0; i < 300; i++) frame(16);
log('post-restart 4.8s', JSON.stringify(S()));

// kill player artificially via damage to verify death state + restart availability
const p = world.player;
p.takeHit(999, p.x - 10, { trueHit: true });
for (let i = 0; i < 120; i++) frame(16);
log('death state', JSON.stringify(S()), 'playing', world.playing);
key('Enter', true); key('Enter', false);
for (let i = 0; i < 20; i++) frame(16);
log('revived via Enter', JSON.stringify(S()));

// focus check: force player next to an enemy and verify limb severing with heavy hits
key('KeyR', true); key('KeyR', false); frame(16);
for (let i = 0; i < 400; i++) frame(16);
const e2 = world.enemies.find((e) => !e.dead);
log('enemy present for sever test', !!e2);
if (e2) {
  for (let n = 0; n < 40 && !e2.dead; n++) {
    world.player.x = e2.x - 70;
    world.player.facing = 1;
    world.player.tryAttack('H3', true);
    for (let i = 0; i < 40; i++) frame(16);
  }
  log('limbBreak after heavy barrage', S().limbBreakCount, 'severed pieces', world.severed.length);
}
if (S().limbBreakCount < 1) throw new Error('limb break never occurred');

log('ALL CHECKS PASSED');
