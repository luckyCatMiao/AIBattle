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


module.exports = { frame, key, fireWin, S: () => global.window.combatBenchState(), D: () => global.window.__debug, world: () => global.window.__debug.world };
