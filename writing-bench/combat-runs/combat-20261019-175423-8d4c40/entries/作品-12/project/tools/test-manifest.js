'use strict';

const fs = require('node:fs');
const assert = require('node:assert/strict');

const path = '/workspace/skill_manifest.json';
const manifest = JSON.parse(fs.readFileSync(path, 'utf8'));
const game = fs.readFileSync('/workspace/game.html', 'utf8');

assert.deepEqual(Object.keys(manifest), ['request_id', 'skills']);
assert.equal(manifest.request_id, 'user-four-skills-20261019');
assert(Array.isArray(manifest.skills));
assert.equal(manifest.skills.length, 4);
assert.equal(new Set(manifest.skills.map(skill => skill.name)).size, 4);
assert.equal(new Set(manifest.skills.map(skill => skill.controls)).size, 4);
for (let i = 0; i < manifest.skills.length; i++) {
  const skill = manifest.skills[i];
  assert.deepEqual(Object.keys(skill), ['name', 'controls', 'description']);
  assert.equal(typeof skill.name, 'string');
  assert.equal(typeof skill.controls, 'string');
  assert.equal(typeof skill.description, 'string');
  assert(skill.name.length > 3);
  assert(skill.controls.includes(String(i + 1)), `skill ${i + 1} manifest control is inaccurate`);
  assert(game.includes(skill.name), `skill ${skill.name} is not present in the built game`);
  assert(game.includes(skill.description.slice(0, 8)), `skill ${skill.name} description is not represented in game data`);
}

console.log(JSON.stringify({ ok: true, requestId: manifest.request_id, skillCount: manifest.skills.length }, null, 2));
