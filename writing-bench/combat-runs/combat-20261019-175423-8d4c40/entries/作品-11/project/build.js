// build.js — 将 src/ 打包为单文件 /workspace/game.html
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const FILES = ['utils', 'audio', 'anim', 'fx', 'player', 'enemies', 'game'];

const js = FILES.map(f => fs.readFileSync(path.join(ROOT, 'src', f + '.js'), 'utf8')).join('\n');
const css = fs.readFileSync(path.join(ROOT, 'src', 'style.css'), 'utf8');
const tpl = fs.readFileSync(path.join(ROOT, 'src', 'template.html'), 'utf8');
if (js.includes('</' + 'script>')) throw new Error('source contains </' + 'script>');
const out = tpl.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
fs.writeFileSync(path.join(ROOT, 'game.html'), out);
console.log('built game.html:', out.length, 'bytes,', js.split('\n').length, 'js lines');
