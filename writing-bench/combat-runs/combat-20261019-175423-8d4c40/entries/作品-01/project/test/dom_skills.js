/* jsdom E2E: real keyboard events must trigger the four skills through the DOM layer. */
const fs = require('fs');
const { JSDOM } = require('/tmp/cv/node_modules/jsdom');
let html = fs.readFileSync('/workspace/game.html', 'utf8');
html = html.replace('  requestAnimationFrame(frame);\n})();',
  '  window.__debug = { world: world };\n  requestAnimationFrame(frame);\n})();');
const dom = new JSDOM(html, {
  runScripts: 'dangerously', pretendToBeVisual: true,
  beforeParse(win) {
    win.HTMLCanvasElement.prototype.getContext = function () {
      const grad = { addColorStop() {} }; const noop = () => {}; const c = {};
      for (const k of ['save','restore','translate','scale','rotate','beginPath','closePath','moveTo','lineTo','arc','arcTo','ellipse','rect','fill','stroke','fillRect','strokeRect','fillText','strokeText','clip','quadraticCurveTo','bezierCurveTo','setLineDash','clearRect','drawImage','setTransform','resetTransform']) c[k] = noop;
      c.createLinearGradient = () => grad; c.createRadialGradient = () => grad;
      c.measureText = (t) => ({ width: String(t).length * 7 });
      return c;
    };
  }
});
const w = dom.window, d = w.document;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const press = (code) => w.dispatchEvent(new w.KeyboardEvent('keydown', { code, bubbles: true, cancelable: true }));
const up = (code) => w.dispatchEvent(new w.KeyboardEvent('keyup', { code, bubbles: true, cancelable: true }));

(async () => {
  await sleep(250);
  press('Enter'); up('Enter');
  await sleep(300);
  const world = w.__debug.world;
  // spawn two enemies right next to the player so every skill has something to hit
  for (let i = 0; i < 2; i++) {
    const e = world.spawnEnemy('gnawer', 1); e.spawnT = 0; e.state = 'idle';
    e.x = world.player.x + (i === 0 ? 70 : -70); e.vx = 0;
  }
  await sleep(120);
  const results = [];
  for (let i = 1; i <= 4; i++) {
    // isolate each skill: clear the arena, reset the player, then place one fresh target
    const wp = world.player;
    wp.hp = wp.maxHp; wp.iframe = 1.0; wp.state = 'idle'; wp.attack = null;
    wp.charging = false; wp.skillT = 0;
    world.enemies.forEach(e => { e.dead = true; });
    world.orbs.length = 0;
    for (let k = 0; k < 3; k++) {
      const e = world.spawnEnemy('samurai', 1);
      e.spawnT = 0; e.state = 'idle';
      e.x = wp.x + (k === 0 ? 80 : (k === 1 ? 120 : -90));
      e.vx = 0;
    }
    world.player.x = Math.max(160, Math.min(1760, wp.x));
    await sleep(80);
    const hpBefore = world.enemies.filter(e => !e.dead).reduce((a, e) => a + e.hp, 0);
    press('Digit' + i); up('Digit' + i);
    await sleep(1500);
    const st = w.combatBenchState();
    const hpAfter = world.enemies.filter(e => !e.dead).reduce((a, e) => a + e.hp, 0);
    results.push({ key: i, dmg: Math.round(hpBefore - hpAfter), cd: +world.player.skillCd[i - 1].toFixed(2) });
  }
  console.log('DOM skill results:', JSON.stringify(results));
  for (const r of results) if (r.cd <= 0) throw new Error('skill ' + r.key + ' never entered cooldown');
  console.log('DOM SKILLS OK');
  process.exit(0);
})().catch(e => { console.error('FAIL', e); process.exit(1); });
