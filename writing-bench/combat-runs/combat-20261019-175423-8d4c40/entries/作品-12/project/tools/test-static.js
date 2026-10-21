'use strict';

const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const html = fs.readFileSync('/workspace/game.html', 'utf8');
const source = fs.readFileSync('/workspace/src/main.js', 'utf8');
const css = fs.readFileSync('/workspace/src/style.css', 'utf8');

assert(html.startsWith('<!doctype html>'));
assert(html.includes(source), 'built HTML does not contain current JavaScript source');
assert(html.includes(css), 'built HTML does not contain current CSS source');
assert(!html.includes('/*__STYLE__*/'));
assert(!html.includes('/*__SCRIPT__*/'));
assert(!/(?:https?:)?\/\//i.test(html.replace(/\/\/[^\n]*/g, '')), 'unexpected network URL');
assert(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/.test(source), 'forbidden external/runtime dependency');
assert(/Object\.defineProperty\(window,'combatBenchState'/.test(source));

const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/gi)];
assert.equal(scripts.length, 1, 'output must have one inline script');
new vm.Script(scripts[0][1], { filename: 'game-inline.js' });

const expectedKeys = ['KeyA', 'KeyD', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyJ', 'KeyK', 'KeyL', 'KeyI', 'Digit1', 'Digit2', 'Digit3', 'Digit4', 'KeyR', 'Enter'];
for (const key of expectedKeys) assert(source.includes(`'${key}'`), `missing keyboard control ${key}`);
for (const field of ['ready', 'playerAlive', 'enemyCount', 'hitCount', 'limbBreakCount', 'skillUseCount', 'skillCooldowns', 'activeSkill', 'playing']) {
  assert(source.includes(field), `missing combat state field ${field}`);
}
for (const feature of ['light1', 'light2', 'light3', 'heavy1', 'heavy2', 'airlight', 'dive', 'parry', 'dash', 'skill1', 'skill2', 'skill3', 'skill4']) {
  assert(source.includes(feature), `missing combat feature ${feature}`);
}
for (const enemy of ["'blade'", "'gunner'"]) assert(source.includes(enemy), `missing enemy ${enemy}`);

console.log(JSON.stringify({
  ok: true,
  bytes: Buffer.byteLength(html),
  inlineScripts: scripts.length,
  externalRequests: 0,
  controls: expectedKeys.length,
  stateFields: 9
}, null, 2));
