#!/usr/bin/env node
/**
 * Build: concatenate all src/js modules in order into the single-file game.html.
 * No minification so the delivered file stays inspectable.
 */
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const JS = path.join(SRC, 'js');

const files = fs.readdirSync(JS)
  .filter(f => f.endsWith('.js'))
  .sort();

const chunks = files.map(f => {
  const body = fs.readFileSync(path.join(JS, f), 'utf8');
  return `\n/* ===================== ${f} ===================== */\n${body}`;
});

const js = chunks.join('\n');
const tpl = fs.readFileSync(path.join(SRC, 'template.html'), 'utf8');
// Avoid '</script>' inside JS breaking the HTML parser.
const safeJs = js.replace(/<\/script/gi, '<\\/script');
// Embed the subset Chinese fonts so text renders identically with no network
const fontsCssPath = path.join(ROOT, 'build', 'fonts.css');
const fontsCss = fs.existsSync(fontsCssPath) ? fs.readFileSync(fontsCssPath, 'utf8') : '';
let out = tpl.replace('/*__FONTS_CSS__*/', () => fontsCss);
out = out.replace('/*__GAME_JS__*/', () => safeJs);

const dest = path.join(ROOT, 'game.html');
fs.writeFileSync(dest, out);
const kb = (fs.statSync(dest).size / 1024).toFixed(1);
console.log(`Built game.html  (${files.length} modules, ${kb} KB)`);
files.forEach(f => console.log('  + ' + f));
