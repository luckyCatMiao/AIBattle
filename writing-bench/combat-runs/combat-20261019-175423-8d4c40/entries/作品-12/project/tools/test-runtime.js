'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const listeners = new Map();
const rafQueue = [];
const timers = [];
let now = 0;
let drawCalls = 0;
let randomSeed = 0x5eed1234;
const seededMath = Object.create(Math);
seededMath.random = () => {
  randomSeed = (randomSeed * 1664525 + 1013904223) >>> 0;
  return randomSeed / 0x100000000;
};

class ClassList {
  constructor() { this.values = new Set(); }
  add(v) { this.values.add(v); }
  remove(v) { this.values.delete(v); }
  toggle(v, force) {
    if (force === undefined ? !this.values.has(v) : force) this.values.add(v);
    else this.values.delete(v);
  }
  contains(v) { return this.values.has(v); }
}

function element(id) {
  return {
    id,
    classList: new ClassList(),
    textContent: '',
    attrs: {},
    handlers: {},
    addEventListener(type, fn) { this.handlers[type] = fn; },
    setAttribute(k, v) { this.attrs[k] = v; },
    focus() {},
    click() { if (this.handlers.click) this.handlers.click({}); }
  };
}

const gradient = { addColorStop() {} };
const context2d = new Proxy({
  createLinearGradient() { return gradient; },
  createRadialGradient() { return gradient; },
  measureText(text) { return { width: String(text).length * 10 }; }
}, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === 'symbol') return target[prop];
    return (...args) => { drawCalls++; return args[0]; };
  },
  set(target, prop, value) { target[prop] = value; return true; }
});

const elements = new Map();
for (const id of ['game', 'startScreen', 'deathScreen', 'deathStats', 'startButton', 'restartButton', 'muteButton', 'focusNotice']) elements.set(id, element(id));
const canvas = elements.get('game');
canvas.width = 1600;
canvas.height = 900;
canvas.getBoundingClientRect = () => ({ width: 1600, height: 900 });
canvas.getContext = type => {
  assert.equal(type, '2d');
  return context2d;
};

const windowObject = {
  devicePixelRatio: 1,
  addEventListener(type, fn) {
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  setTimeout(fn, delay) { timers.push({ fn, at: now + delay }); },
  clearTimeout() {}
};

const sandbox = {
  console,
  Math: seededMath,
  Object,
  Set,
  Map,
  Array,
  JSON,
  performance: { now: () => now },
  document: { getElementById: id => elements.get(id) },
  window: windowObject,
  requestAnimationFrame(fn) { rafQueue.push(fn); },
  setTimeout: windowObject.setTimeout,
  clearTimeout: windowObject.clearTimeout
};
windowObject.window = windowObject;
windowObject.document = sandbox.document;
windowObject.performance = sandbox.performance;
windowObject.requestAnimationFrame = sandbox.requestAnimationFrame;

function dispatch(type, code) {
  const event = { code, prevented: false, preventDefault() { this.prevented = true; } };
  for (const fn of listeners.get(type) || []) fn(event);
  return event;
}

function step(frames = 1, ms = 1000 / 60) {
  for (let i = 0; i < frames; i++) {
    now += ms;
    for (let j = timers.length - 1; j >= 0; j--) {
      if (timers[j].at <= now) timers.splice(j, 1)[0].fn();
    }
    const fn = rafQueue.shift();
    assert(fn, `missing animation callback at frame ${i}`);
    fn(now);
    assert(rafQueue.length <= 1, 'game queued duplicate animation frames');
  }
}

function tap(code, wait = 2) {
  dispatch('keydown', code);
  step(1);
  dispatch('keyup', code);
  step(wait);
}

const source = fs.readFileSync('/workspace/src/main.js', 'utf8');
new vm.Script(source, { filename: 'main.js' }).runInNewContext(sandbox);

assert.equal(typeof windowObject.combatBenchState, 'function');
assert.deepEqual(JSON.parse(JSON.stringify(windowObject.combatBenchState())), {
  ready: true,
  playerAlive: true,
  enemyCount: 0,
  hitCount: 0,
  limbBreakCount: 0,
  skillUseCount: 0,
  skillCooldowns: [0, 0, 0, 0],
  activeSkill: 0,
  playing: false
});
assert.equal(Object.getOwnPropertyDescriptor(windowObject, 'combatBenchState').writable, false);
step(3);

const enter = dispatch('keydown', 'Enter');
assert.equal(enter.prevented, true, 'game keys should prevent page scrolling');
step(1);
dispatch('keyup', 'Enter');
assert.equal(windowObject.combatBenchState().playing, true);
assert.equal(windowObject.combatBenchState().enemyCount, 2);

// Each skill must independently enter its own state, start only its cooldown,
// and deal real combat damage against a fresh wave.
const skillSnapshots = [];
for (let skill = 0; skill < 4; skill++) {
  tap('KeyR', 2);
  const before = windowObject.combatBenchState();
  const event = dispatch('keydown', `Digit${skill + 1}`);
  assert.equal(event.prevented, true, `skill ${skill + 1} should prevent browser shortcuts`);
  step(1);
  dispatch('keyup', `Digit${skill + 1}`);
  const started = windowObject.combatBenchState();
  assert.equal(started.activeSkill, skill + 1, `skill ${skill + 1} did not enter its unique state`);
  assert.equal(started.skillUseCount, 1, `skill ${skill + 1} use was not recorded`);
  assert(started.skillCooldowns[skill] > 0, `skill ${skill + 1} cooldown did not start`);
  tap(`Digit${skill + 1}`, 1);
  assert.equal(windowObject.combatBenchState().skillUseCount, 1, `skill ${skill + 1} retriggered during its active state`);
  for (let other = 0; other < 4; other++) {
    if (other !== skill) assert.equal(started.skillCooldowns[other], 0, `skill ${skill + 1} changed another cooldown`);
  }
  step(skill === 3 ? 148 : 98);
  const result = windowObject.combatBenchState();
  assert(result.hitCount > before.hitCount, `skill ${skill + 1} never hit an enemy`);
  if (skill === 3) {
    assert(result.hitCount >= 5, 'skill 4 never reached its meteor finisher');
    assert(result.limbBreakCount > 0, 'skill 4 meteor finisher did not damage a limb');
  }
  assert.equal(result.activeSkill, 0, `skill ${skill + 1} never completed`);
  skillSnapshots.push(JSON.parse(JSON.stringify(result)));
}

// Restart once more before exercising the original movement and combo kit.
tap('KeyR', 3);

// Exercise movement, jump, air attack, air dash, dive and landing.
dispatch('keydown', 'KeyD');
step(55);
tap('Space', 8);
tap('KeyJ', 5);
tap('KeyL', 6);
tap('KeyK', 45);
dispatch('keyup', 'KeyD');
step(20);

// Exercise a full three-hit chain repeatedly while enemies approach.
for (let chain = 0; chain < 7; chain++) {
  tap('KeyJ', 10);
  tap('KeyJ', 12);
  tap('KeyJ', 24);
  if (chain % 2 === 0) tap('KeyI', 8);
}

// Exercise both charge levels and attack cancellation.
dispatch('keydown', 'KeyK');
step(35);
dispatch('keyup', 'KeyK');
step(45);
dispatch('keydown', 'KeyK');
step(72);
dispatch('keyup', 'KeyK');
step(55);
tap('KeyL', 18);

// Run sustained mixed combat from both directions for runtime coverage.
for (let cycle = 0; cycle < 12; cycle++) {
  const direction = cycle % 2 ? 'KeyA' : 'KeyD';
  dispatch('keydown', direction);
  step(24);
  dispatch('keyup', direction);
  tap('KeyJ', 10); tap('KeyJ', 12); tap('KeyJ', 22);
  if (cycle % 3 === 0) tap('KeyI', 12);
}

const active = windowObject.combatBenchState();
assert.equal(active.ready, true);
assert.equal(typeof active.playerAlive, 'boolean');
assert.equal(typeof active.enemyCount, 'number');
assert.equal(typeof active.hitCount, 'number');
assert.equal(typeof active.limbBreakCount, 'number');
assert(active.hitCount > 0, 'scripted combat never connected an attack');
assert(active.limbBreakCount > 0, 'scripted combat never broke an enemy limb');
assert(drawCalls > 10000, 'render path did not execute extensively');
const combatSnapshot = JSON.parse(JSON.stringify(active));

// Blur must not crash and a restart must reset all counters and restore a wave.
for (const fn of listeners.get('blur') || []) fn();
step(2);
tap('KeyR', 3);
const restarted = windowObject.combatBenchState();
assert.deepEqual(JSON.parse(JSON.stringify(restarted)), {
  ready: true,
  playerAlive: true,
  enemyCount: 2,
  hitCount: 0,
  limbBreakCount: 0,
  skillUseCount: 0,
  skillCooldowns: [0, 0, 0, 0],
  activeSkill: 0,
  playing: true
});

// Mouse UI paths and mute toggle.
elements.get('muteButton').click();
assert(elements.get('muteButton').classList.contains('muted'));
elements.get('muteButton').click();
elements.get('restartButton').click();
step(3);

console.log(JSON.stringify({
  ok: true,
  simulatedFrames: Math.round(now / (1000 / 60)),
  drawCalls,
  skillSnapshots,
  combatSnapshot,
  restartedState: windowObject.combatBenchState()
}, null, 2));
