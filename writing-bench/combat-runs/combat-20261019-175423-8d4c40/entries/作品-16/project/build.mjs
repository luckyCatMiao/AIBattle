// build.mjs — concatenate src/*.js into the single-file deliverable game.html
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const root = dirname(fileURLToPath(import.meta.url));
const files = ['util.js', 'audio.js', 'input.js', 'particles.js', 'rig.js', 'player.js', 'enemy.js', 'game.js', 'main.js'];
const parts = files.map(f => `// ===== ${f} =====\n` + readFileSync(join(root, 'src', f), 'utf8'));
const js = parts.join('\n');
const html = readFileSync(join(root, 'src', 'template.html'), 'utf8').replace('/*__GAME_JS__*/', () => js);
writeFileSync(join(root, 'game.html'), html);
console.log(`built game.html (${(html.length / 1024).toFixed(1)} KB)`);
