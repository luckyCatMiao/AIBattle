#!/usr/bin/env node
'use strict';
// Simple, dependency-free build script: inlines all game JS into src/index.html
// and writes a single self-contained /workspace/game.html.
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const FILES = [
  'js/util.js',
  'js/input.js',
  'js/audio.js',
  'js/particles.js',
  'js/player.js',
  'js/enemy.js',
  'js/game.js',
  'js/hud.js',
  'js/main.js',
];

const tpl = fs.readFileSync(path.join(SRC, 'index.html'), 'utf8');
const parts = FILES.map((f) => {
  const p = path.join(SRC, f);
  const code = fs.readFileSync(p, 'utf8');
  return `/* ===== ${f} ===== */\n${code}`;
});
const bundle = `(function(){\n"use strict";\n${parts.join('\n')}\n})();`;

// inline subsetted fonts as base64 @font-face
const ASSETS = ['assets/serif.woff2', 'assets/sans.woff2'];
const fontCss = ASSETS.map((f) => {
  const fam = f.includes('serif') ? 'KirSerif' : 'KirSans';
  const b64 = fs.readFileSync(path.join(SRC, f)).toString('base64');
  return `@font-face{font-family:'${fam}';font-style:normal;font-weight:100 900;font-display:block;src:url(data:font/woff2;base64,${b64}) format('woff2');}`;
}).join('\n');

if (tpl.indexOf('// __SCRIPTS__') < 0) throw new Error('template marker missing');
let out = tpl.replace('/* __FONT_CSS__ */', () => fontCss);
out = out.replace('// __SCRIPTS__', () => bundle);
// guard: the bundle must not contain a closing script tag
if (/<\/script/i.test(bundle)) throw new Error('bundle contains </script>');
fs.writeFileSync(path.join(ROOT, 'game.html'), out);
const kb = (Buffer.byteLength(out) / 1024).toFixed(1);
console.log(`built game.html  ${kb} KB  (${FILES.length} modules)`);
