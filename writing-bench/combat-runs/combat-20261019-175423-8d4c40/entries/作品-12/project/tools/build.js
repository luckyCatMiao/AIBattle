'use strict';

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'src/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src/style.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');

if (!template.includes('/*__STYLE__*/') || !template.includes('/*__SCRIPT__*/')) {
  throw new Error('Build placeholders are missing');
}

const html = template
  .replace('/*__STYLE__*/', css)
  .replace('/*__SCRIPT__*/', js.replace(/<\/script/gi, '<\\/script'));

fs.writeFileSync(path.join(root, 'game.html'), html);
console.log(`Built game.html (${(Buffer.byteLength(html) / 1024).toFixed(1)} KiB)`);
