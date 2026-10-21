import fs from 'node:fs';
import path from 'node:path';
const dir = path.resolve('.');
const src = path.join(dir, 'src');
const shell = fs.readFileSync(path.join(src, 'shell.html'), 'utf8');
const files = fs.readdirSync(src).filter(f => f.endsWith('.js')).sort();
const js = files.map(f => `/* ==== ${f} ==== */\n` + fs.readFileSync(path.join(src, f), 'utf8')).join('\n');
const fonts = ['Bold','Black'].map(w => {
  const b64 = fs.readFileSync(path.join(dir, 'assets', `NotoSansSC-${w}.woff2`)).toString('base64');
  return `@font-face{font-family:"Crimson SC";font-style:normal;font-weight:${w==='Bold'?700:900};font-display:block;src:url(data:font/woff2;base64,${b64}) format("woff2");}`;
}).join('\n');
let out = shell.replace('/*__FONTS__*/', () => fonts);
out = out.replace('/*__GAME_JS__*/', () => js);
fs.writeFileSync(path.join(dir, 'game.html'), out);
console.log('built game.html', (out.length / 1024).toFixed(1) + ' KB from', files.length, 'modules');
