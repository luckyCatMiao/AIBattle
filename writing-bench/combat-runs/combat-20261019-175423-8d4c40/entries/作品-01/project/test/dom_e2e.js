/* Real DOM (jsdom) end-to-end: load game.html, drive it with real key events. */
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('/tmp/cv/node_modules/jsdom');

let html = fs.readFileSync('/workspace/game.html', 'utf8');
// test-only hook: expose world so death flow can be forced deterministically
html = html.replace('  requestAnimationFrame(frame);\n})();',
  '  window.__debug = { world: world, startGame: startGame, restartGame: restartGame };\n  requestAnimationFrame(frame);\n})();');
if (!html.includes('window.__debug')) throw new Error('test hook injection failed');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = function () {
      const grad = { addColorStop() {} };
      const noop = () => {};
      const c = {};
      for (const k of ['save','restore','translate','scale','rotate','beginPath','closePath','moveTo','lineTo','arc','arcTo','ellipse','rect','fill','stroke','fillRect','strokeRect','fillText','strokeText','clip','quadraticCurveTo','bezierCurveTo','setLineDash','clearRect','drawImage','setTransform','resetTransform']) c[k] = noop;
      c.createLinearGradient = () => grad;
      c.createRadialGradient = () => grad;
      c.measureText = (t) => ({ width: String(t).length * 7 });
      return c;
    };
  }
});
const w = dom.window;
const d = w.document;
let errors = [];
w.addEventListener('error', (e) => errors.push(String(e.error || e.message)));
function key(code, type) {
  const ev = new w.KeyboardEvent(type, { code, bubbles: true, cancelable: true });
  (type === 'keydown' ? d : w).dispatchEvent ? w.dispatchEvent(ev) : null;
  if (type === 'keyup') w.dispatchEvent(ev);
}
function down(code) { w.dispatchEvent(new w.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true })); }
function up(code) { w.dispatchEvent(new w.KeyboardEvent('keyup', { code, bubbles: true, cancelable: true })); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  await sleep(300);
  const title = d.getElementById('titlePanel');
  const death = d.getElementById('deathPanel');
  const mute = d.getElementById('muteBtn');
  if (!title || !death || !mute) throw new Error('missing DOM elements');
  console.log('title visible at boot:', !title.classList.contains('hidden'));

  down('Enter'); up('Enter');
  await sleep(350);
  console.log('title hidden after Enter:', title.classList.contains('hidden'));
  let st = w.combatBenchState();
  console.log('state after start:', JSON.stringify(st));
  if (!st.playing) throw new Error('not playing after Enter');

  // play a while: mash J, move
  for (let i = 0; i < 90; i++) {
    down('KeyJ'); await sleep(16); up('KeyJ');
    if (i % 10 === 0) { down('KeyD'); await sleep(16); up('KeyD'); }
    await sleep(16);
  }
  st = w.combatBenchState();
  console.log('state mid-play:', JSON.stringify(st));

  // mute toggle
  const before = mute.textContent;
  mute.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  console.log('mute text:', before, '->', mute.textContent);
  if (mute.textContent === before) throw new Error('mute did not change');

  // deterministic death: apply lethal damage through the test hook, then verify panel + Enter restart
  const world = w.__debug.world;
  world.player.iframe = 0;
  world.player.state = 'idle';
  world.player.takeHit(999, world.player.x - 5, {});
  await sleep(1400);
  const deathShown = !death.classList.contains('hidden');
  console.log('death panel logic: alive=' + w.combatBenchState().playerAlive + ' panelVisible=' + deathShown);
  if (w.combatBenchState().playerAlive) throw new Error('forced lethal damage did not kill player');
  if (!deathShown) throw new Error('death panel did not appear');
  down('Enter'); up('Enter');
  await sleep(500);
  console.log('after Enter restart: playerAlive=' + w.combatBenchState().playerAlive + ' panelHidden=' + death.classList.contains('hidden'));
  if (!w.combatBenchState().playerAlive) throw new Error('Enter did not restart after death');
  if (!death.classList.contains('hidden')) throw new Error('death panel did not hide after restart');

  // verify state object shape
  for (const k of ['ready','playerAlive','enemyCount','hitCount','limbBreakCount','playing']) {
    if (!(k in st)) throw new Error('missing ' + k);
  }
  console.log('errors:', errors.length ? errors.join(' | ') : 'none');
  console.log('DOM E2E OK');
  process.exit(0);
})().catch((e) => { console.error('E2E FAIL', e); console.log('errors', errors); process.exit(1); });
