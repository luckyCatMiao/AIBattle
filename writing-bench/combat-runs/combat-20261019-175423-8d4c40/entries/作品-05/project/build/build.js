#!/usr/bin/env node
// Build: inline CSS, subset fonts and JS into a single self-contained /workspace/game.html
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const order = ['core.js', 'audio.js', 'effects.js', 'world.js', 'player.js', 'enemies.js', 'game.js'];

const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
let css = fs.readFileSync(path.join(src, 'style.css'), 'utf8');
const serif = fs.readFileSync(path.join(src, 'fonts', 'serif.woff2')).toString('base64');
const sans = fs.readFileSync(path.join(src, 'fonts', 'sans.woff2')).toString('base64');
css = css.replace('__SERIF__', () => serif).replace('__SANS__', () => sans);

const js = order.map(f => `\n/* ===== ${f} ===== */\n` + fs.readFileSync(path.join(src, 'js', f), 'utf8')).join('\n');

const out = html.replace('/*__CSS__*/', () => css).replace('/*__JS__*/', () => js);
const target = path.join(root, 'game.html');
fs.writeFileSync(target, out);
console.log('built', target, (out.length / 1024).toFixed(1) + ' KB', out.split('\n').length, 'lines');
